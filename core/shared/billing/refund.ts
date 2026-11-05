// What a `charge.refunded` webhook should do to a booked payment. Pure, in cents.
//
// Stripe's charge carries CUMULATIVE `amount_refunded`, and the same event can
// be delivered more than once. So the refund to apply is a DELTA: what the
// transaction still holds (`net_amount`, or its full amount before any refund)
// minus what the charge says is left. A replay computes a delta of 0 and does
// nothing; a second partial refund applies only the new part.
//
// (The webhook used to mark every refund "refunded" and reverse the payment's
// FULL amount on every delivery — so a replay reversed it twice and a $20
// partial refund on a $250 payment reversed $250.)

export interface RefundTxn {
  /** Dollars booked by payment_intent.succeeded. */
  amount: number | null | undefined;
  /** Dollars still held after earlier refunds (null until the first refund / charge.succeeded). */
  net_amount: number | null | undefined;
  status: string | null | undefined;
}

export interface RefundCharge {
  /** Cents. */
  amount_captured: number;
  /** Cents, cumulative across every refund on the charge. */
  amount_refunded: number;
  /** Stripe sets this when the charge is refunded in full. */
  refunded: boolean;
}

export interface RefundPlan {
  /** Dollars to take back off the linked charge(s) now. 0 = a replay; do nothing. */
  delta: number;
  /** Dollars the transaction still holds after this refund. */
  netAfter: number;
  /** The transaction's status after this refund. */
  status: "refunded" | "succeeded";
  fullyRefunded: boolean;
}

const cents = (dollars: number | null | undefined) => Math.round((Number(dollars) || 0) * 100);

export function planChargeRefund(txn: RefundTxn, charge: RefundCharge): RefundPlan {
  const capturedCents = charge.amount_captured > 0 ? charge.amount_captured : cents(txn.amount);
  const netAfterCents = Math.max(0, capturedCents - Math.max(0, charge.amount_refunded));

  // What the transaction held before this event. A transaction already marked
  // refunded with no net recorded holds nothing.
  const heldCents =
    txn.net_amount != null ? cents(txn.net_amount) : txn.status === "refunded" ? 0 : cents(txn.amount);

  const deltaCents = Math.max(0, heldCents - netAfterCents);
  const fullyRefunded = charge.refunded || netAfterCents === 0;
  return {
    delta: deltaCents / 100,
    netAfter: netAfterCents / 100,
    status: fullyRefunded ? "refunded" : "succeeded",
    fullyRefunded,
  };
}

/**
 * The status a payment request takes after `amount_paid` moves (by a payment,
 * or by a refund's negative delta). A refund that empties a paid charge sends
 * it back to `active` — or `overdue` if its due date has passed — never leaves
 * it `partially_paid` at $0.
 */
export function requestStatusAfter(
  req: { amount: number | null | undefined; due_date?: string | null },
  newPaid: number,
  nowIso: string
): "paid" | "partially_paid" | "active" | "overdue" {
  const remaining = (Number(req.amount) || 0) - newPaid;
  if (remaining <= 0) return "paid";
  if (newPaid > 0) return "partially_paid";
  const due = req.due_date ? Date.parse(req.due_date) : NaN;
  return Number.isFinite(due) && due < Date.parse(nowIso) ? "overdue" : "active";
}

// The operator console's actions (docs/plan-operator-console.md §5, Phase 2).
//
// Shared so the dialog and the server refuse the same things: a missing reason,
// a refund over what's left, a refund above $500 without its amount typed out.
// The server checks every rule again; the dialog only says so sooner.

export type OpsAction =
  | "refund"
  | "cancel_now"
  | "cancel_at_period_end"
  | "resume"
  | "extend_trial"
  | "comp_on"
  | "comp_off"
  | "code_create"
  | "code_deactivate"
  | "portal_open"
  | "reband"
  | "resend_welcome"
  | "send_receipt"
  | "billing_contact"
  | "view_as";

export const OPS_ACTION_LABEL: Readonly<Record<OpsAction, string>> = {
  refund: "Refund",
  cancel_now: "Cancel now",
  cancel_at_period_end: "Cancel at period end",
  resume: "Resume",
  extend_trial: "Extend trial",
  comp_on: "Mark free",
  comp_off: "Remove free",
  code_create: "Create discount code",
  code_deactivate: "Deactivate discount code",
  portal_open: "Open billing portal",
  reband: "Change band",
  resend_welcome: "Re-send welcome email",
  send_receipt: "Email a receipt",
  billing_contact: "Change billing contact",
  view_as: "View as a role",
};

export const REASON_MIN = 5;
export const REASON_MAX = 500;

/** Refunds above this many cents need the amount typed out as well (§9). */
export const TYPED_AMOUNT_ABOVE_CENTS = 50_000;

/** How far ahead a trial can be extended, counted from today. */
export const TRIAL_MAX_DAYS = 90;

/** A promotion code as Stripe accepts it: letters, digits, dash and underscore. */
export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

export function reasonProblem(reason: unknown): string | null {
  const r = typeof reason === "string" ? reason.trim() : "";
  if (r.length < REASON_MIN) return `Give a reason (at least ${REASON_MIN} characters).`;
  if (r.length > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters.`;
  return null;
}

/**
 * Dollars as typed ("612.50", "$1,200", "75") to cents, or null. Two decimals
 * at most; no negatives, no exponents, nothing that only looks like a number.
 */
export function parseDollars(input: unknown): number | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const s = String(input).trim().replace(/^\$/, "").replace(/,(?=\d{3}(\D|$))/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function needsTypedAmount(amountCents: number): boolean {
  return amountCents > TYPED_AMOUNT_ABOVE_CENTS;
}

/** What's wrong with this refund, or null. `remainingCents` is what the charge has left to refund. */
export function refundProblem(input: {
  amountCents: number;
  remainingCents: number;
  typedAmount?: unknown;
}): string | null {
  const { amountCents, remainingCents } = input;
  if (!Number.isSafeInteger(amountCents) || amountCents < 1) return "Enter an amount to refund.";
  if (remainingCents < 1) return "Nothing is left to refund on this charge.";
  if (amountCents > remainingCents) return `That's more than is left to refund (${dollars(remainingCents)}).`;
  if (needsTypedAmount(amountCents) && parseDollars(input.typedAmount) !== amountCents) {
    return `Type the amount, ${dollars(amountCents)}, to confirm a refund over ${dollars(TYPED_AMOUNT_ABOVE_CENTS)}.`;
  }
  return null;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The Stripe idempotency key for one submit of one action on one thing. */
export function opsIdempotencyKey(action: OpsAction, targetId: string, requestId: string): string {
  return `ops:${action}:${targetId}:${requestId}`;
}

/** The signup link that fills in a discount code (`/setup` reads `?code=`). */
export function signupLinkFor(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/setup?code=${encodeURIComponent(code)}`;
}

// What the owner and tenant homes draw (docs/plan-unified-experience.md §5):
// pure shaping of rows the page already reads, so the marks have data and the
// tests need no network.

export interface HomeCharge {
  amount?: number | string | null;
  amount_paid?: number | string | null;
  amount_remaining?: number | string | null;
  status?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
}

export interface HomeRequest {
  id: string;
  title?: string | null;
  status?: string | null;
}

const num = (v: unknown) => Number(v) || 0;

/** Charges that are not drafts or cancelled: the ones that count toward a year. */
const counted = (c: HomeCharge) => c.status !== "draft" && c.status !== "canceled";

/** Dollars paid and dollars charged with a due date in `year`; the Ring's value and max. */
export function paidThisYear(charges: readonly HomeCharge[], year: number) {
  let paid = 0;
  let charged = 0;
  for (const c of charges) {
    if (!counted(c) || !c.due_date || new Date(c.due_date).getUTCFullYear() !== year) continue;
    charged += num(c.amount);
    paid += num(c.amount_paid);
  }
  return { paid, charged };
}

/**
 * Month-end balance owed for the last `months` months, oldest first: the
 * Sparkline's values. A charge is owed from its due month until it is paid in full.
 */
export function balanceSeries(charges: readonly HomeCharge[], asOf: Date, months = 12): number[] {
  const out: number[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const end = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - i + 1, 1);
    let owed = 0;
    for (const c of charges) {
      if (!counted(c) || !c.due_date) continue;
      const due = Date.parse(c.due_date);
      if (!(due < end)) continue;
      const paidAt = c.paid_at && c.status === "paid" ? Date.parse(c.paid_at) : NaN;
      if (Number.isFinite(paidAt) && paidAt < end) continue;
      owed += c.status === "paid" ? num(c.amount) : num(c.amount_remaining);
    }
    out.push(owed);
  }
  return out;
}

export const REQUEST_STEPS = [
  { key: "open", label: "Received" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
] as const;

/** Where a request sits on the three-step track. Waiting reads as in progress. */
export function requestTrackKey(status: string | null | undefined): string | null {
  if (status === "open") return "open";
  if (status === "in_progress" || status === "waiting") return "in_progress";
  if (status === "resolved" || status === "closed") return "resolved";
  return null;
}

/** Requests still being worked: what "my open requests" lists. */
export function openRequests<T extends HomeRequest>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.status === "open" || r.status === "in_progress" || r.status === "waiting");
}

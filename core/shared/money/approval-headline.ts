/**
 * The Approvals page's headline for each approval (docs/spec-money-approvals.md,
 * docs/spec-charge-corrections.md): what is being asked, in a line. Pure, so
 * the sentences are tested rather than read off a page.
 *
 *   "Waive $300.00 owed by Bob Diaz for March dues"
 *   "Waive $50.00 of $300.00 owed by Bob Diaz for March dues"
 *   "Waive $300.00 owed by Bob Diaz for March dues, and its late fees ($25.00)"
 *   "Move $300.00 for March dues from Bob Diaz to Carol Eve"
 *   "Void $2,400.00 to Acme Roofing for gutter repair"
 */
export type ApprovalSubject =
  | {
      type: "expense";
      title: string;
      vendor: string | null;
      amount: number | null;
    }
  | {
      type: "charge";
      title: string;
      amount: number | null;
      amount_remaining: number | null;
      household: string | null;
      waive_amount?: number | null;
      late_fees?: number | null;
      move?: { from: string | null; to: string | null } | null;
    };

const currency = (v?: number | null) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);

export function approvalHeadline(kind: string, s: ApprovalSubject | null): string {
  if (!s) return kind === "move" ? "Move a charge" : kind === "waive" ? "Waive a charge" : "An expense";
  if (s.type === "charge") {
    const title = s.title || "an unnamed charge";
    if (kind === "move") {
      const from = s.move?.from ?? s.household;
      return `Move ${currency(s.amount)} for ${title}${from ? ` from ${from}` : ""}${s.move?.to ? ` to ${s.move.to}` : ""}`;
    }
    const owedBy = s.household ? ` owed by ${s.household}` : "";
    if (s.waive_amount != null) return `Waive ${currency(s.waive_amount)} of ${currency(s.amount)}${owedBy} for ${title}`;
    // A waiver gives up what is still owed: the remainder when part was paid.
    const owed = s.amount_remaining != null && s.amount != null && s.amount_remaining < s.amount ? ` (${currency(s.amount_remaining)} still owed)` : "";
    const fees = s.late_fees ? `, and its late fees (${currency(s.late_fees)})` : "";
    return `Waive ${currency(s.amount)}${owedBy} for ${title}${owed}${fees}`;
  }
  const what = `${currency(s.amount)}${s.vendor ? ` to ${s.vendor}` : ""} for ${s.title || "an unnamed expense"}`;
  return kind === "void" ? `Void ${what}` : what;
}

/** A waiver or move closes without a new round: its charge was settled first. */
export const closedOnCharge = (kind: string, state: string) => (kind === "waive" || kind === "move") && state === "superseded";

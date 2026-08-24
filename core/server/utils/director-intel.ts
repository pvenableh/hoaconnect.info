// Money intel for the Board Room (Round 2, Phase 6).
//
// `collectDirectorAgenda()` tells the planner what is WRONG — this invoice is
// 41 days late, that member owes $1,200. It cannot tell it how the association
// is doing, because a list of exceptions is not a financial position. So money
// mode grounds on this as well: real totals, a real trend, and a real aging
// breakdown, computed BEFORE the model is called.
//
// That ordering is the whole point. A planner handed the numbers can be told
// "never invent a figure — if it is not below, say it is not on record", and
// the instruction means something. A planner handed only exceptions would have
// to guess at a balance to say anything about one, and would.
//
// The arithmetic itself is not reimplemented here: `shared/reporting/ledger.ts`
// is the same pure module the Finances tab renders from, so the briefing and
// the report a board member opens next cannot disagree. This module's job is
// fetching the rows, and turning the result into a block of plain text a model
// reads well.
//
// getTypedDirectus is auto-imported from server/utils/directus.ts.

import { readItems } from "@directus/sdk";
import {
  byCategory,
  delinquencyAging,
  expenseEntriesFromExpenses,
  incomeEntriesFromRequests,
  monthlySeries,
  openingBalanceFromOrg,
  summarize,
  type DelinquencyReport,
  type LedgerSummary,
  type MonthlyBucket,
} from "#core/shared/reporting/ledger";

/**
 * `directus` arrives here as `any` (the notices engine passes its own client
 * through), which leaves the typed `readItems` generic with nothing to infer a
 * collection from. Same aliasing the notices engine uses, for the same reason.
 */
const ri = readItems as any;

export interface MoneyIntel {
  /** The block handed to the model. Plain text, real numbers, no markdown. */
  text: string;
  summary: LedgerSummary;
  /** Most recent months first is how people read them; oldest-first internally. */
  months: MonthlyBucket[];
  aging: DelinquencyReport["totals"];
  /** The few members carrying the most, for a grounded "chase this one" step. */
  topDebtors: Array<{ memberId: string; memberName: string; outstanding: number; oldestDueDate: string | null }>;
  topExpenseCategories: Array<{ category: string; total: number }>;
  /** What the community has NOT recorded — named, so the model says so instead of guessing. */
  gaps: string[];
}

const usd = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** How many months of history the trend line reads. */
const TREND_MONTHS = 6;

/**
 * Build the money block for one community as of `now`.
 *
 * Never throws: money mode degrades to "no financial records available" rather
 * than failing a briefing the person already asked for. A null return means the
 * planner runs without a money block and is told the figures are not on record.
 */
export async function buildMoneyIntel(
  directus: any,
  organizationId: string,
  now: Date
): Promise<MoneyIntel | null> {
  try {
    const [orgRows, requests, expenses, members] = await Promise.all([
      directus
        .request(
          ri("hoa_organizations", {
            filter: { id: { _eq: organizationId } },
            fields: ["opening_balance", "opening_balance_date"],
            limit: 1,
          })
        )
        .catch(() => []),
      directus
        .request(
          ri("payment_requests", {
            filter: { organization: { _eq: organizationId } },
            fields: [
              "id",
              "title",
              "status",
              "request_type",
              "amount",
              "amount_paid",
              "amount_remaining",
              "due_date",
              "paid_at",
              "member",
            ],
            limit: 500,
            sort: ["-date_created"],
          })
        )
        .catch(() => []),
      directus
        .request(
          ri("payment_expenses", {
            filter: { organization: { _eq: organizationId } },
            fields: ["id", "title", "category", "amount", "expense_date", "date_created"],
            limit: 500,
            sort: ["-expense_date"],
          })
        )
        .catch(() => []),
      directus
        .request(
          ri("hoa_members", {
            filter: { organization: { _eq: organizationId } },
            fields: ["id", "first_name", "last_name", "email"],
            limit: 500,
          })
        )
        .catch(() => []),
    ]);

    const opening = openingBalanceFromOrg((orgRows as any[])?.[0]);
    const entries = [
      ...incomeEntriesFromRequests(requests as any[]),
      ...expenseEntriesFromExpenses(expenses as any[]),
    ];

    // Nothing recorded at all is a real answer, not an error — and it is the
    // one case where inventing a figure would be most tempting.
    if (!entries.length && !(requests as any[]).length) return null;

    const summary = summarize(entries, opening);
    const allMonths = monthlySeries(entries, opening);
    const months = allMonths.slice(-TREND_MONTHS);

    const memberName = (m: any) =>
      [m?.first_name, m?.last_name].filter(Boolean).join(" ").trim() || m?.email || "A member";
    const byId = new Map<string, any>();
    for (const m of members as any[]) byId.set(String(m.id), m);

    const aging = delinquencyAging(requests as any[], now.toISOString(), (member) => {
      const id = member && typeof member === "object" ? String((member as any).id) : String(member ?? "");
      return { id, name: memberName(byId.get(id) ?? member) };
    });

    const topDebtors = aging.rows.slice(0, 5).map((r) => ({
      memberId: r.memberId,
      memberName: r.memberName,
      outstanding: r.outstanding,
      oldestDueDate: r.oldestDueDate,
    }));
    const topExpenseCategories = byCategory(entries, "out")
      .slice(0, 5)
      .map((c) => ({ category: c.category, total: c.total }));

    const gaps: string[] = [];
    if (!(expenses as any[]).length) gaps.push("no expenses have been recorded");
    if (summary.totalIncome <= 0) gaps.push("no payments have been collected yet");
    if (!opening.openingBalance) gaps.push("no opening balance is set in Settings → Payments");

    const trendLine = months.length
      ? months
          .map((m) => `${m.month}: in ${usd(m.income)}, out ${usd(m.expense)}, net ${usd(m.net)}`)
          .join("\n  ")
      : "(no month has any recorded activity)";

    const text = [
      "FINANCIAL POSITION ON RECORD (every figure below is real; nothing else is):",
      `  Opening balance: ${usd(summary.openingBalance)}${opening.openingBalanceAsOf ? ` (struck ${String(opening.openingBalanceAsOf).slice(0, 10)})` : ""}`,
      `  Collected to date: ${usd(summary.totalIncome)} · Spent: ${usd(summary.totalExpense)} · Net: ${usd(summary.net)}`,
      `  Balance now: ${usd(summary.closingBalance)}`,
      `  Last ${months.length} month(s):`,
      `  ${trendLine}`,
      `  Outstanding from members: ${usd(aging.totals.outstanding)} — not yet due ${usd(aging.totals.current)}, 1-30 days late ${usd(aging.totals.d1_30)}, 31-60 ${usd(aging.totals.d31_60)}, 61-90 ${usd(aging.totals.d61_90)}, over 90 ${usd(aging.totals.d90_plus)}`,
      topDebtors.length
        ? `  Largest balances: ${topDebtors
            .map((d) => `${d.memberName} ${usd(d.outstanding)}${d.oldestDueDate ? ` (oldest due ${String(d.oldestDueDate).slice(0, 10)})` : ""} [target: hoa_members id=${d.memberId}]`)
            .join("; ")}`
        : "  Largest balances: nobody is carrying an unpaid balance.",
      topExpenseCategories.length
        ? `  Biggest spending categories: ${topExpenseCategories.map((c) => `${c.category} ${usd(c.total)}`).join("; ")}`
        : "  Biggest spending categories: none recorded.",
      gaps.length
        ? `  NOT ON RECORD — say so plainly rather than estimating: ${gaps.join("; ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { text, summary, months, aging: aging.totals, topDebtors, topExpenseCategories, gaps };
  } catch (err: any) {
    console.warn("[director-intel] money intel failed (briefing continues without it):", err?.message);
    return null;
  }
}

// Financial reporting — pure, framework-agnostic aggregation over the org's
// money-in (paid payment_requests) and money-out (payment_expenses) records.
// No Directus, no Vue, no `new Date()` without an argument — every time-relative
// calculation takes an explicit `asOf`, so the whole module is deterministic and
// trivially unit-testable. The Finances admin page feeds real rows through the
// adapters below and renders the results.

export type FlowDirection = "in" | "out";

/** A normalized money movement. Income and expense both reduce to this shape. */
export interface LedgerEntry {
  /** ISO date/datetime string. */
  date: string;
  direction: FlowDirection;
  /** Positive dollar amount. */
  amount: number;
  /** Income category (request_type) or expense category. */
  category: string;
  label?: string;
}

export interface MonthlyBucket {
  /** "YYYY-MM" (UTC). */
  month: string;
  income: number;
  expense: number;
  net: number;
  /** Opening balance + cumulative net through the end of this month. */
  runningBalance: number;
}

export interface CategoryTotal {
  category: string;
  total: number;
  /** Share of the direction's total, 0–1. */
  share: number;
}

export interface LedgerSummary {
  totalIncome: number;
  totalExpense: number;
  net: number;
  entryCount: number;
  /** The org's opening balance (0 when unset). */
  openingBalance: number;
  /** openingBalance + net — the balance the running series ends on. */
  closingBalance: number;
}

/**
 * Where the running balance starts. A community migrating in from a bank
 * statement or a previous system strikes a balance on a date; everything the
 * app knows about from before that date is already inside `openingBalance`, so
 * it must be excluded from the series or it would be counted twice.
 */
export interface OpeningBalanceOpts {
  openingBalance?: number;
  /** ISO date the balance was struck. Entries strictly before it are dropped. */
  openingBalanceAsOf?: string | null;
}

/**
 * Coerce a money value to a number. **Directus serializes `decimal` columns as
 * strings** ("600.75"), and every amount reaching this module comes from one:
 * `payment_expenses.amount`, `payment_requests.amount*`, and the org's
 * `opening_balance`. Left as a string, `total += amount` concatenates and
 * `round2` then yields NaN — which the UI renders as a silent $0.00.
 */
const toAmount = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export interface DelinquencyRow {
  memberId: string;
  memberName: string;
  /** Not yet past due (or no due date). */
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  outstanding: number;
  /** ISO date of the oldest unpaid due date, or null. */
  oldestDueDate: string | null;
}

export interface DelinquencyReport {
  rows: DelinquencyRow[];
  totals: {
    current: number;
    d1_30: number;
    d31_60: number;
    d61_90: number;
    d90_plus: number;
    outstanding: number;
  };
}

const MS_PER_DAY = 86_400_000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** "YYYY-MM" bucket key in UTC. Returns "" for unparseable input. */
export function monthKey(dateISO: string | null | undefined): string {
  if (!dateISO) return "";
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Whole days from `dueISO` to `asOfISO` (positive = overdue). Null if unparseable. */
export function daysOverdue(
  dueISO: string | null | undefined,
  asOfISO: string
): number | null {
  if (!dueISO) return null;
  const due = new Date(dueISO);
  const asOf = new Date(asOfISO);
  if (Number.isNaN(due.getTime()) || Number.isNaN(asOf.getTime())) return null;
  return Math.floor((asOf.getTime() - due.getTime()) / MS_PER_DAY);
}

/**
 * Drop entries that predate the opening balance's as-of date — they are
 * already baked into that number. No as-of date means "the opening balance
 * covers everything before the first record we have", so nothing is dropped.
 * Entries dated exactly on the as-of date are kept (the balance is struck at
 * the start of that day).
 */
export function entriesSinceOpening(
  entries: LedgerEntry[],
  opts: OpeningBalanceOpts = {}
): LedgerEntry[] {
  const asOf = opts.openingBalanceAsOf ? new Date(opts.openingBalanceAsOf) : null;
  if (!asOf || Number.isNaN(asOf.getTime())) return entries;
  return entries.filter((e) => {
    const d = new Date(e.date);
    // Unparseable dates are left in place; the month bucketers skip them.
    return Number.isNaN(d.getTime()) || d.getTime() >= asOf.getTime();
  });
}

export function summarize(
  entries: LedgerEntry[],
  opts: OpeningBalanceOpts = {}
): LedgerSummary {
  const scoped = entriesSinceOpening(entries, opts);
  let totalIncome = 0;
  let totalExpense = 0;
  for (const e of scoped) {
    if (e.direction === "in") totalIncome += e.amount;
    else totalExpense += e.amount;
  }
  const opening = toAmount(opts.openingBalance);
  const net = totalIncome - totalExpense;
  return {
    totalIncome: round2(totalIncome),
    totalExpense: round2(totalExpense),
    net: round2(net),
    entryCount: scoped.length,
    openingBalance: round2(opening),
    closingBalance: round2(opening + net),
  };
}

/**
 * Month-by-month income / expense / net with a cumulative running balance.
 * Only months that have at least one entry are emitted, sorted ascending.
 */
export function monthlySeries(
  entries: LedgerEntry[],
  opts: OpeningBalanceOpts = {}
): MonthlyBucket[] {
  const map = new Map<string, { income: number; expense: number }>();
  for (const e of entriesSinceOpening(entries, opts)) {
    const key = monthKey(e.date);
    if (!key) continue;
    const bucket = map.get(key) || { income: 0, expense: 0 };
    if (e.direction === "in") bucket.income += e.amount;
    else bucket.expense += e.amount;
    map.set(key, bucket);
  }

  let running = toAmount(opts.openingBalance);
  return [...map.keys()]
    .sort()
    .map((month) => {
      const { income, expense } = map.get(month)!;
      const net = income - expense;
      running += net;
      return {
        month,
        income: round2(income),
        expense: round2(expense),
        net: round2(net),
        runningBalance: round2(running),
      };
    });
}

/** Totals per category for one direction, sorted by total descending. */
export function byCategory(
  entries: LedgerEntry[],
  direction: FlowDirection
): CategoryTotal[] {
  const map = new Map<string, number>();
  let grand = 0;
  for (const e of entries) {
    if (e.direction !== direction) continue;
    const cat = e.category || "other";
    map.set(cat, (map.get(cat) || 0) + e.amount);
    grand += e.amount;
  }
  return [...map.entries()]
    .map(([category, total]) => ({
      category,
      total: round2(total),
      share: grand > 0 ? total / grand : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// ── Adapters: real rows → LedgerEntry[] ────────────────────────────────────
// Kept structural (not tied to the full Directus interfaces) so they stay easy
// to test and don't drag the type graph into a pure module.

export interface OrgOpeningBalanceLike {
  opening_balance?: Money;
  opening_balance_date?: string | null;
}

/**
 * Read an org's configured opening balance (Settings → Payments) into the opts
 * every aggregator takes. A missing/blank balance is 0 — the pre-existing
 * behaviour, where every report starts at $0.
 */
export function openingBalanceFromOrg(
  org: OrgOpeningBalanceLike | null | undefined
): Required<OpeningBalanceOpts> {
  return {
    openingBalance: toAmount(org?.opening_balance),
    openingBalanceAsOf: org?.opening_balance_date || null,
  };
}

/** Money fields are `number | string` because Directus decimals arrive as strings. */
export type Money = number | string | null | undefined;

export interface RequestLike {
  request_type?: string | null;
  title?: string | null;
  amount_paid?: Money;
  paid_at?: string | null;
  status?: string | null;
}

export interface ExpenseLike {
  category?: string | null;
  title?: string | null;
  amount?: Money;
  expense_date?: string | null;
  date_created?: string | null;
}

/** Income entries from paid/partially-paid requests (money actually collected). */
export function incomeEntriesFromRequests(requests: RequestLike[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const r of requests) {
    const amount = toAmount(r.amount_paid);
    if (amount <= 0 || !r.paid_at) continue;
    out.push({
      date: r.paid_at,
      direction: "in",
      amount,
      category: r.request_type || "other",
      label: r.title || undefined,
    });
  }
  return out;
}

/** Expense entries — every recorded expense is money out, dated by expense_date. */
export function expenseEntriesFromExpenses(expenses: ExpenseLike[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const e of expenses) {
    const amount = toAmount(e.amount);
    if (amount <= 0) continue;
    const date = e.expense_date || e.date_created;
    if (!date) continue;
    out.push({
      date,
      direction: "out",
      amount,
      category: e.category || "other",
      label: e.title || undefined,
    });
  }
  return out;
}

// ── Delinquency aging ──────────────────────────────────────────────────────

export interface OutstandingRequestLike {
  member?: unknown;
  amount?: Money;
  amount_paid?: Money;
  amount_remaining?: Money;
  due_date?: string | null;
  status?: string | null;
}

const PAID_OR_CLOSED = new Set(["paid", "canceled", "draft"]);

const emptyBuckets = () => ({
  current: 0,
  d1_30: 0,
  d31_60: 0,
  d61_90: 0,
  d90_plus: 0,
  outstanding: 0,
});

/**
 * Aging report over outstanding requests, bucketed by how far past due each is
 * as of `asOf`. `resolveMember` maps a request's member field to a stable id +
 * display name (the caller knows whether member is an id or an expanded object).
 */
export function delinquencyAging(
  requests: OutstandingRequestLike[],
  asOf: string,
  resolveMember: (member: unknown) => { id: string; name: string }
): DelinquencyReport {
  const rows = new Map<string, DelinquencyRow>();
  const totals = emptyBuckets();

  for (const r of requests) {
    if (PAID_OR_CLOSED.has((r.status as string) || "")) continue;
    const remaining =
      r.amount_remaining != null
        ? toAmount(r.amount_remaining)
        : toAmount(r.amount) - toAmount(r.amount_paid);
    if (remaining <= 0) continue;

    const { id, name } = resolveMember(r.member);
    const row =
      rows.get(id) || ({ memberId: id, memberName: name, ...emptyBuckets(), oldestDueDate: null } as DelinquencyRow);

    const overdue = daysOverdue(r.due_date, asOf);
    let bucket: keyof ReturnType<typeof emptyBuckets>;
    if (overdue == null || overdue <= 0) bucket = "current";
    else if (overdue <= 30) bucket = "d1_30";
    else if (overdue <= 60) bucket = "d31_60";
    else if (overdue <= 90) bucket = "d61_90";
    else bucket = "d90_plus";

    row[bucket] = round2(row[bucket] + remaining);
    row.outstanding = round2(row.outstanding + remaining);
    totals[bucket] = round2(totals[bucket] + remaining);
    totals.outstanding = round2(totals.outstanding + remaining);

    // Track the oldest actual due date among this member's overdue items.
    if (r.due_date && overdue != null && overdue > 0) {
      if (!row.oldestDueDate || new Date(r.due_date) < new Date(row.oldestDueDate)) {
        row.oldestDueDate = r.due_date;
      }
    }

    rows.set(id, row);
  }

  return {
    rows: [...rows.values()].sort((a, b) => b.outstanding - a.outstanding),
    totals,
  };
}

// ── CSV export ─────────────────────────────────────────────────────────────

/**
 * Moved to `shared/export/csv.ts` when the Data Trust export needed the same
 * writer. Re-exported here so the Finances tab's imports keep working.
 */
export { toCsv } from "../export/csv";

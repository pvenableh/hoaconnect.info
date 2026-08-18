import { describe, it, expect } from "vitest";
import {
  monthKey,
  daysOverdue,
  summarize,
  monthlySeries,
  byCategory,
  incomeEntriesFromRequests,
  expenseEntriesFromExpenses,
  delinquencyAging,
  entriesSinceOpening,
  openingBalanceFromOrg,
  toCsv,
  type LedgerEntry,
} from "#core/shared/reporting/ledger";

describe("monthKey", () => {
  it("buckets by UTC year-month", () => {
    expect(monthKey("2026-03-14T10:00:00Z")).toBe("2026-03");
    expect(monthKey("2026-12-01")).toBe("2026-12");
  });
  it("returns empty for null/invalid", () => {
    expect(monthKey(null)).toBe("");
    expect(monthKey("not-a-date")).toBe("");
  });
});

describe("daysOverdue", () => {
  it("is positive when past due, negative when future", () => {
    expect(daysOverdue("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysOverdue("2026-02-01", "2026-01-31")).toBe(-1);
  });
  it("is null when no due date", () => {
    expect(daysOverdue(null, "2026-01-31")).toBeNull();
  });
});

describe("summarize", () => {
  it("totals income, expense, and net", () => {
    const entries: LedgerEntry[] = [
      { date: "2026-01-10", direction: "in", amount: 100, category: "monthly_dues" },
      { date: "2026-01-15", direction: "in", amount: 50.5, category: "assessment" },
      { date: "2026-01-20", direction: "out", amount: 40.25, category: "utilities" },
    ];
    expect(summarize(entries)).toEqual({
      totalIncome: 150.5,
      totalExpense: 40.25,
      net: 110.25,
      entryCount: 3,
      openingBalance: 0,
      closingBalance: 110.25,
    });
  });
  it("handles an empty set", () => {
    expect(summarize([])).toEqual({
      totalIncome: 0,
      totalExpense: 0,
      net: 0,
      entryCount: 0,
      openingBalance: 0,
      closingBalance: 0,
    });
  });
  it("closes on opening balance + net", () => {
    const entries: LedgerEntry[] = [
      { date: "2026-01-10", direction: "in", amount: 100, category: "monthly_dues" },
      { date: "2026-01-20", direction: "out", amount: 30, category: "utilities" },
    ];
    expect(summarize(entries, { openingBalance: 5000 })).toMatchObject({
      net: 70,
      openingBalance: 5000,
      closingBalance: 5070,
    });
  });
  it("ignores entries already baked into the opening balance", () => {
    const entries: LedgerEntry[] = [
      { date: "2025-12-31", direction: "in", amount: 999, category: "monthly_dues" },
      { date: "2026-01-10", direction: "in", amount: 100, category: "monthly_dues" },
    ];
    expect(
      summarize(entries, { openingBalance: 5000, openingBalanceAsOf: "2026-01-01" })
    ).toMatchObject({ totalIncome: 100, entryCount: 1, closingBalance: 5100 });
  });
});

describe("entriesSinceOpening", () => {
  const entries: LedgerEntry[] = [
    { date: "2025-11-30", direction: "in", amount: 10, category: "x" },
    { date: "2026-01-01", direction: "in", amount: 20, category: "x" },
    { date: "2026-01-01T18:00:00Z", direction: "in", amount: 30, category: "x" },
    { date: "2026-02-15", direction: "in", amount: 40, category: "x" },
  ];

  it("keeps entries on or after the as-of date", () => {
    expect(
      entriesSinceOpening(entries, { openingBalanceAsOf: "2026-01-01" }).map((e) => e.amount)
    ).toEqual([20, 30, 40]);
  });
  it("keeps everything when no as-of date is set", () => {
    expect(entriesSinceOpening(entries, { openingBalance: 500 })).toHaveLength(4);
    expect(entriesSinceOpening(entries)).toHaveLength(4);
  });
  it("keeps everything when the as-of date is unparseable", () => {
    expect(entriesSinceOpening(entries, { openingBalanceAsOf: "whenever" })).toHaveLength(4);
  });
  it("leaves unparseable entry dates alone (the month bucketer drops them)", () => {
    const withBogus: LedgerEntry[] = [{ date: "bogus", direction: "in", amount: 1, category: "x" }];
    expect(entriesSinceOpening(withBogus, { openingBalanceAsOf: "2026-01-01" })).toHaveLength(1);
  });
});

describe("openingBalanceFromOrg", () => {
  it("reads the org's configured balance + date", () => {
    expect(
      openingBalanceFromOrg({ opening_balance: 12500.75, opening_balance_date: "2026-01-01" })
    ).toEqual({ openingBalance: 12500.75, openingBalanceAsOf: "2026-01-01" });
  });
  it("defaults to a $0 start for an unconfigured org", () => {
    expect(openingBalanceFromOrg(null)).toEqual({ openingBalance: 0, openingBalanceAsOf: null });
    expect(openingBalanceFromOrg({})).toEqual({ openingBalance: 0, openingBalanceAsOf: null });
  });
  it("coerces Directus decimals, which arrive as strings", () => {
    // hoa_organizations.opening_balance is a `decimal` — the API returns "0.00".
    expect(openingBalanceFromOrg({ opening_balance: "12500.75" as any })).toEqual({
      openingBalance: 12500.75,
      openingBalanceAsOf: null,
    });
    expect(openingBalanceFromOrg({ opening_balance: "" as any }).openingBalance).toBe(0);
  });
});

// Regression: Directus serializes `decimal` as a string, so every real amount
// reaching this module is "600.75", not 600.75. Left uncoerced, `total += amount`
// concatenates and round2 yields NaN, which the Reports tab rendered as $0.00.
describe("Directus string amounts", () => {
  it("incomeEntriesFromRequests coerces amount_paid", () => {
    const [entry] = incomeEntriesFromRequests([
      { request_type: "monthly_dues", amount_paid: "250.50" as any, paid_at: "2026-01-31" },
    ]);
    expect(entry!.amount).toBe(250.5);
  });
  it("expenseEntriesFromExpenses coerces amount, still dropping zeros", () => {
    const entries = expenseEntriesFromExpenses([
      { category: "utilities", amount: "600.75" as any, expense_date: "2026-02-10" },
      { category: "other", amount: "0.00" as any, expense_date: "2026-02-11" },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amount).toBe(600.75);
  });
  it("totals and the running balance stay numbers end to end", () => {
    const entries = [
      ...incomeEntriesFromRequests([
        { request_type: "monthly_dues", amount_paid: "1000.00" as any, paid_at: "2026-02-01" },
      ]),
      ...expenseEntriesFromExpenses([
        { category: "utilities", amount: "600.75" as any, expense_date: "2026-02-10" },
      ]),
    ];
    expect(summarize(entries, { openingBalance: "12600.75" as any })).toMatchObject({
      totalIncome: 1000,
      totalExpense: 600.75,
      net: 399.25,
      closingBalance: 13000,
    });
    expect(monthlySeries(entries, { openingBalance: "12600.75" as any })[0]).toMatchObject({
      expense: 600.75,
      runningBalance: 13000,
    });
    expect(byCategory(entries, "out")[0]).toMatchObject({ total: 600.75, share: 1 });
  });
  it("delinquencyAging coerces amount / amount_paid / amount_remaining", () => {
    const resolve = () => ({ id: "a", name: "A" });
    const report = delinquencyAging(
      [
        { member: {}, amount_remaining: "100.25" as any, due_date: "2026-02-25", status: "active" },
        { member: {}, amount: "300.00" as any, amount_paid: "100.00" as any, due_date: "2026-02-25", status: "partially_paid" },
      ],
      "2026-03-01",
      resolve
    );
    expect(report.totals.outstanding).toBe(300.25);
    expect(report.rows[0]!.d1_30).toBe(300.25);
  });
});

describe("string opening balances never corrupt the arithmetic", () => {
  const entries: LedgerEntry[] = [
    { date: "2026-01-10", direction: "in", amount: 100, category: "monthly_dues" },
  ];
  it("monthlySeries adds, never concatenates", () => {
    expect(monthlySeries(entries, { openingBalance: "1000.00" as any })[0]!.runningBalance).toBe(
      1100
    );
  });
  it("summarize closes on a number", () => {
    expect(summarize(entries, { openingBalance: "1000.00" as any }).closingBalance).toBe(1100);
  });
});

describe("monthlySeries", () => {
  it("accumulates a running balance across months in order", () => {
    const entries: LedgerEntry[] = [
      { date: "2026-02-05", direction: "in", amount: 200, category: "monthly_dues" },
      { date: "2026-01-10", direction: "in", amount: 300, category: "monthly_dues" },
      { date: "2026-01-12", direction: "out", amount: 100, category: "utilities" },
      { date: "2026-02-20", direction: "out", amount: 50, category: "admin" },
    ];
    const series = monthlySeries(entries);
    expect(series.map((m) => m.month)).toEqual(["2026-01", "2026-02"]);
    expect(series[0]).toMatchObject({ income: 300, expense: 100, net: 200, runningBalance: 200 });
    expect(series[1]).toMatchObject({ income: 200, expense: 50, net: 150, runningBalance: 350 });
  });
  it("respects an opening balance", () => {
    const entries: LedgerEntry[] = [
      { date: "2026-01-10", direction: "in", amount: 100, category: "monthly_dues" },
    ];
    expect(monthlySeries(entries, { openingBalance: 1000 })[0].runningBalance).toBe(1100);
  });
  it("starts the running balance at the opening balance and carries it forward", () => {
    const entries: LedgerEntry[] = [
      { date: "2026-01-10", direction: "in", amount: 100, category: "monthly_dues" },
      { date: "2026-02-10", direction: "out", amount: 250, category: "utilities" },
    ];
    const series = monthlySeries(entries, { openingBalance: 1000 });
    expect(series.map((m) => m.runningBalance)).toEqual([1100, 850]);
  });
  it("drops months already covered by the opening balance's as-of date", () => {
    const entries: LedgerEntry[] = [
      { date: "2025-11-10", direction: "in", amount: 900, category: "monthly_dues" },
      { date: "2025-12-31", direction: "in", amount: 900, category: "monthly_dues" },
      { date: "2026-01-10", direction: "in", amount: 100, category: "monthly_dues" },
    ];
    const series = monthlySeries(entries, {
      openingBalance: 1000,
      openingBalanceAsOf: "2026-01-01",
    });
    expect(series.map((m) => m.month)).toEqual(["2026-01"]);
    expect(series[0]!.runningBalance).toBe(1100);
  });
  it("supports a negative opening balance (a community starting in the red)", () => {
    const entries: LedgerEntry[] = [
      { date: "2026-01-10", direction: "in", amount: 100, category: "monthly_dues" },
    ];
    expect(monthlySeries(entries, { openingBalance: -500 })[0]!.runningBalance).toBe(-400);
  });
  it("skips entries with unparseable dates", () => {
    const entries: LedgerEntry[] = [
      { date: "bogus", direction: "in", amount: 100, category: "x" },
      { date: "2026-01-10", direction: "in", amount: 10, category: "x" },
    ];
    const series = monthlySeries(entries);
    expect(series).toHaveLength(1);
    expect(series[0].income).toBe(10);
  });
});

describe("byCategory", () => {
  it("groups one direction, sorts by total desc, computes share", () => {
    const entries: LedgerEntry[] = [
      { date: "2026-01-01", direction: "in", amount: 100, category: "monthly_dues" },
      { date: "2026-01-02", direction: "in", amount: 300, category: "assessment" },
      { date: "2026-01-03", direction: "in", amount: 100, category: "monthly_dues" },
      { date: "2026-01-04", direction: "out", amount: 999, category: "utilities" },
    ];
    const income = byCategory(entries, "in");
    expect(income.map((c) => c.category)).toEqual(["assessment", "monthly_dues"]);
    expect(income[0]).toMatchObject({ total: 300, share: 0.6 });
    expect(income[1]).toMatchObject({ total: 200, share: 0.4 });
  });
  it("returns empty when no entries match the direction", () => {
    expect(byCategory([{ date: "2026-01-01", direction: "in", amount: 10, category: "x" }], "out")).toEqual([]);
  });
});

describe("adapters", () => {
  it("incomeEntriesFromRequests keeps only collected, dated rows", () => {
    const entries = incomeEntriesFromRequests([
      { request_type: "monthly_dues", title: "Jan Dues", amount_paid: 100, paid_at: "2026-01-31", status: "paid" },
      { request_type: "assessment", title: "Unpaid", amount_paid: 0, paid_at: null, status: "active" },
      { request_type: "other", title: "No date", amount_paid: 50, paid_at: null, status: "paid" },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ direction: "in", amount: 100, category: "monthly_dues", date: "2026-01-31" });
  });
  it("expenseEntriesFromExpenses falls back to date_created and drops zero/undated", () => {
    const entries = expenseEntriesFromExpenses([
      { category: "utilities", title: "Water", amount: 40, expense_date: "2026-01-10" },
      { category: "admin", title: "Fallback", amount: 25, expense_date: null, date_created: "2026-01-05" },
      { category: "other", title: "Zero", amount: 0, expense_date: "2026-01-01" },
      { category: "other", title: "Undated", amount: 10, expense_date: null, date_created: null },
    ]);
    expect(entries.map((e) => e.label)).toEqual(["Water", "Fallback"]);
    expect(entries.every((e) => e.direction === "out")).toBe(true);
  });
});

describe("delinquencyAging", () => {
  const resolve = (m: unknown) => {
    const mm = m as { id: string; name: string };
    return { id: mm.id, name: mm.name };
  };
  const asOf = "2026-03-01";

  it("buckets outstanding requests by age and groups by member", () => {
    const alice = { id: "a", name: "Alice" };
    const bob = { id: "b", name: "Bob" };
    const report = delinquencyAging(
      [
        { member: alice, amount: 100, amount_remaining: 100, due_date: "2026-02-25", status: "active" }, // 4 days → 1-30
        { member: alice, amount: 200, amount_remaining: 200, due_date: "2025-11-15", status: "overdue" }, // 106 days → 90+
        { member: bob, amount: 50, amount_remaining: 50, due_date: "2026-04-01", status: "active" }, // future → current
        { member: bob, amount: 500, amount_remaining: 500, due_date: "2026-01-15", status: "paid" }, // excluded
      ],
      asOf,
      resolve
    );
    expect(report.rows).toHaveLength(2);
    // Alice has the larger outstanding, so she sorts first.
    const [first, second] = report.rows;
    expect(first.memberId).toBe("a");
    expect(first.d1_30).toBe(100);
    expect(first.d90_plus).toBe(200);
    expect(first.outstanding).toBe(300);
    expect(first.oldestDueDate).toBe("2025-11-15");
    expect(second.memberId).toBe("b");
    expect(second.current).toBe(50);
    expect(report.totals.outstanding).toBe(350);
  });

  it("derives remaining from amount - amount_paid when amount_remaining is absent", () => {
    const report = delinquencyAging(
      [{ member: { id: "a", name: "A" }, amount: 100, amount_paid: 30, due_date: "2026-02-01", status: "partially_paid" }],
      asOf,
      resolve
    );
    expect(report.rows[0].outstanding).toBe(70);
  });

  it("treats a missing due date as current, not overdue", () => {
    const report = delinquencyAging(
      [{ member: { id: "a", name: "A" }, amount: 80, amount_remaining: 80, due_date: null, status: "active" }],
      asOf,
      resolve
    );
    expect(report.rows[0].current).toBe(80);
    expect(report.rows[0].oldestDueDate).toBeNull();
  });
});

describe("toCsv", () => {
  it("joins headers and rows", () => {
    expect(toCsv(["Month", "Net"], [["2026-01", 200], ["2026-02", -50]])).toBe(
      "Month,Net\n2026-01,200\n2026-02,-50"
    );
  });
  it("quotes cells containing commas, quotes, or newlines", () => {
    expect(toCsv(["Name"], [['Smith, Jr'], ['She said "hi"']])).toBe(
      'Name\n"Smith, Jr"\n"She said ""hi"""'
    );
  });
});

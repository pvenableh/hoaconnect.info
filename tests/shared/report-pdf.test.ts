// The Reports PDF document model: the same numbers the screen and CSVs show,
// in the order a board reads them, with an opening balance and totals rows.
import { describe, it, expect } from "vitest";
import { buildFinancialReportDoc, reportSlug } from "#core/shared/reporting/report-pdf";

const currency = (v?: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);

const input = (over: Record<string, any> = {}) => ({
  orgName: "Oak Court HOA",
  rangeLabel: "Last 12 months",
  generatedAt: "2026-11-05T15:00:00.000Z",
  summary: { totalIncome: 900, totalExpense: 300, net: 600, entryCount: 4, openingBalance: 1000, closingBalance: 1600 },
  hasOpening: true,
  series: [
    { month: "2026-10", income: 400, expense: 100, net: 300, runningBalance: 1300 },
    { month: "2026-11", income: 500, expense: 200, net: 300, runningBalance: 1600 },
  ],
  incomeCats: [{ category: "monthly_dues", total: 900, share: 1 }],
  expenseCats: [],
  aging: {
    rows: [{ memberId: "m1", memberName: "Dana Reyes", current: 0, d1_30: 50, d31_60: 0, d61_90: 0, d90_plus: 0, outstanding: 50, oldestDueDate: "2026-10-01" }],
    totals: { current: 0, d1_30: 50, d31_60: 0, d61_90: 0, d90_plus: 0, outstanding: 50 },
  },
  currency,
  monthLabel: (k: string) => k,
  catLabel: (c: string) => (c === "monthly_dues" ? "Monthly Dues" : c),
  fdate: (d?: string | null) => (d ? d.slice(0, 10) : "—"),
  ...over,
});

describe("buildFinancialReportDoc", () => {
  it("titles, KPIs (with Balance when an opening balance is set) and a dated filename", () => {
    const doc = buildFinancialReportDoc(input());
    expect(doc.title).toBe("Oak Court HOA — Financial report");
    expect(doc.subtitle).toBe("Last 12 months · generated 2026-11-05");
    expect(doc.kpis.map((k) => k.label)).toEqual(["Income", "Expenses", "Net", "Balance", "Outstanding"]);
    expect(doc.kpis.find((k) => k.label === "Balance")!.value).toBe("$1,600.00");
    expect(doc.filename).toBe("oak-court-hoa-financial-report-2026-11-05.pdf");
  });

  it("the monthly table leads with the opening balance and ends on a totals row that reconciles", () => {
    const [monthly] = buildFinancialReportDoc(input()).tables;
    expect(monthly!.body[0]).toEqual(["Opening balance", "", "", "", "$1,000.00"]);
    expect(monthly!.body).toHaveLength(3);
    expect(monthly!.foot).toEqual(["Total", "$900.00", "$300.00", "$600.00", "$1,600.00"]);
    expect(monthly!.numeric).toEqual([1, 2, 3, 4]);
  });

  it("no opening balance: no Balance KPI and no opening row", () => {
    const doc = buildFinancialReportDoc(input({ hasOpening: false }));
    expect(doc.kpis.map((k) => k.label)).not.toContain("Balance");
    expect(doc.tables[0]!.body[0]![0]).toBe("2026-10");
  });

  it("categories carry a share; an empty table keeps its empty text and has no foot", () => {
    const [, income, expense] = buildFinancialReportDoc(input()).tables;
    expect(income!.body).toEqual([["Monthly Dues", "$900.00", "100%"]]);
    expect(expense!.body).toEqual([]);
    expect(expense!.emptyText).toBe("No expenses recorded.");
    expect(expense!.foot).toBeUndefined();
  });

  it("aging rows and totals, with the oldest due date formatted", () => {
    const aging = buildFinancialReportDoc(input()).tables[3]!;
    expect(aging.body[0]).toEqual(["Dana Reyes", "$0.00", "$50.00", "$0.00", "$0.00", "$0.00", "$50.00", "2026-10-01"]);
    expect(aging.foot![6]).toBe("$50.00");
  });

  it("an empty range: no monthly foot (nothing to total)", () => {
    expect(buildFinancialReportDoc(input({ series: [], hasOpening: false })).tables[0]!.foot).toBeUndefined();
  });
});

describe("reportSlug", () => {
  it.each([
    ["Oak Court HOA", "oak-court-hoa"],
    ["  1033 Lenox / Condo #2 ", "1033-lenox-condo-2"],
    ["", "community"],
    [null, "community"],
  ])("%s → %s", (name, want) => expect(reportSlug(name)).toBe(want));
});

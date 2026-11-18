/**
 * The Approvals page's headline: what each approval asks, in a line
 * (docs/spec-money-approvals.md, docs/spec-charge-corrections.md).
 */
import { describe, it, expect } from "vitest";
import { approvalHeadline, closedOnCharge, type ApprovalSubject } from "#core/shared/money/approval-headline";

const charge = (over: Partial<Extract<ApprovalSubject, { type: "charge" }>> = {}): ApprovalSubject => ({
  type: "charge",
  title: "March dues",
  amount: 300,
  amount_remaining: 300,
  household: "Bob Diaz",
  ...over,
});

describe("approvalHeadline", () => {
  it("names a full waiver, what is still owed, and the late fees it takes", () => {
    expect(approvalHeadline("waive", charge())).toBe("Waive $300.00 owed by Bob Diaz for March dues");
    expect(approvalHeadline("waive", charge({ amount_remaining: 200 }))).toBe("Waive $300.00 owed by Bob Diaz for March dues ($200.00 still owed)");
    expect(approvalHeadline("waive", charge({ late_fees: 25 }))).toBe("Waive $300.00 owed by Bob Diaz for March dues, and its late fees ($25.00)");
  });

  it("names a partial waiver's cut", () => {
    expect(approvalHeadline("waive", charge({ waive_amount: 50 }))).toBe("Waive $50.00 of $300.00 owed by Bob Diaz for March dues");
  });

  it("names a move's two households, falling back to the charge's own", () => {
    expect(approvalHeadline("move", charge({ move: { from: "Bob Diaz", to: "Carol Eve" } }))).toBe("Move $300.00 for March dues from Bob Diaz to Carol Eve");
    expect(approvalHeadline("move", charge({ move: { from: null, to: "Carol Eve" } }))).toBe("Move $300.00 for March dues from Bob Diaz to Carol Eve");
  });

  it("names spending and voids as before", () => {
    const e: ApprovalSubject = { type: "expense", title: "gutter repair", vendor: "Acme Roofing", amount: 2400 };
    expect(approvalHeadline("spend", e)).toBe("$2,400.00 to Acme Roofing for gutter repair");
    expect(approvalHeadline("void", e)).toBe("Void $2,400.00 to Acme Roofing for gutter repair");
    expect(approvalHeadline("move", null)).toBe("Move a charge");
  });

  it("a waiver or move superseded closed on its charge", () => {
    expect(closedOnCharge("move", "superseded")).toBe(true);
    expect(closedOnCharge("waive", "superseded")).toBe(true);
    expect(closedOnCharge("spend", "superseded")).toBe(false);
  });
});

/**
 * Correcting a charge (docs/spec-charge-corrections.md): the pure rules the
 * routes decide with and the Charges page shows.
 */
import { describe, it, expect } from "vitest";
import {
  amountRefusal,
  applyCut,
  dueDateLock,
  dueDateRefusal,
  moveRefusal,
  openLateFeesTotal,
  ownerHearsOf,
  raisedAmount,
  waiveRefusal,
  withdrawRefusal,
  WITHDRAW_WINDOW_MS,
  type ChargeFacts,
} from "#core/shared/money/charge-corrections";

const NOW = new Date("2026-11-18T12:00:00Z");
const TODAY = "2026-11-18";

const charge = (over: Partial<ChargeFacts> = {}): ChargeFacts => ({
  status: "active",
  source: null,
  request_type: "assessment",
  date_created: "2026-11-18T09:00:00Z",
  amount: "300.00",
  amount_paid: "0.00",
  amount_remaining: "300.00",
  due_date: "2026-12-01",
  reminder_sent: false,
  metadata: null,
  hasTransactions: false,
  lateFees: [],
  approvalOpen: false,
  ...over,
});
const fee = (over: Record<string, unknown> = {}) => ({
  id: "fee1",
  status: "active",
  amount: "25.00",
  amount_paid: "0.00",
  amount_remaining: "25.00",
  ...over,
});

describe("withdraw", () => {
  it("allows a fresh hand-entered charge, with no source or `manual`", () => {
    expect(withdrawRefusal(charge(), NOW)).toBeNull();
    expect(withdrawRefusal(charge({ source: "manual" }), NOW)).toBeNull();
  });

  it("holds to the 24-hour edge", () => {
    const at = (ms: number) => new Date(Date.parse("2026-11-18T09:00:00Z") + ms);
    expect(withdrawRefusal(charge(), at(WITHDRAW_WINDOW_MS))).toBeNull();
    expect(withdrawRefusal(charge(), at(WITHDRAW_WINDOW_MS + 1))).toMatch(/more than 24 hours/);
    expect(withdrawRefusal(charge({ date_created: null }), NOW)).toMatch(/more than 24 hours/);
  });

  it("never withdraws a schedule's charge or a late fee", () => {
    expect(withdrawRefusal(charge({ source: "schedule" }), NOW)).toMatch(/entered by hand/);
    expect(withdrawRefusal(charge({ source: "late_fee", request_type: "late_fee" }), NOW)).toMatch(/entered by hand/);
    expect(withdrawRefusal(charge({ request_type: "late_fee" }), NOW)).toMatch(/entered by hand/);
  });

  it("refuses once anything was paid, reminded or charged late", () => {
    expect(withdrawRefusal(charge({ amount_paid: "10.00", status: "partially_paid" }), NOW)).toMatch(/payment/);
    expect(withdrawRefusal(charge({ hasTransactions: true }), NOW)).toMatch(/payment/);
    expect(withdrawRefusal(charge({ reminder_sent: true }), NOW)).toMatch(/reminder/);
    expect(withdrawRefusal(charge({ metadata: { reminders: { due_soon: "2026-11-18" } } }), NOW)).toMatch(/reminder/);
    expect(withdrawRefusal(charge({ lateFees: [fee()] }), NOW)).toMatch(/late fee/);
  });

  it("does not count a canceled late fee, or empty reminder metadata", () => {
    expect(withdrawRefusal(charge({ lateFees: [fee({ status: "canceled" })], metadata: { reminders: {} } }), NOW)).toBeNull();
  });

  it("refuses a settled charge, and one with an approval open", () => {
    expect(withdrawRefusal(charge({ status: "paid" }), NOW)).toMatch(/still owed/);
    expect(withdrawRefusal(charge({ status: "canceled" }), NOW)).toMatch(/still owed/);
    expect(withdrawRefusal(charge({ approvalOpen: true }), NOW)).toMatch(/awaiting approval/);
  });
});

describe("due date", () => {
  it("changes freely before it is due, to today or later", () => {
    expect(dueDateLock(charge(), TODAY)).toBeNull();
    expect(dueDateRefusal(charge(), "2026-12-15", TODAY)).toBeNull();
    expect(dueDateRefusal(charge(), TODAY, TODAY)).toBeNull();
    expect(dueDateRefusal(charge({ due_date: TODAY }), "2026-11-30", TODAY)).toBeNull();
  });

  it("a charge with no due date can be given one", () => {
    expect(dueDateRefusal(charge({ due_date: null }), "2026-12-01", TODAY)).toBeNull();
  });

  it("never to a past date, and never empty", () => {
    expect(dueDateRefusal(charge(), "2026-11-17", TODAY)).toMatch(/past/);
    expect(dueDateRefusal(charge(), null, TODAY)).toMatch(/Choose/);
    expect(dueDateRefusal(charge(), "next week", TODAY)).toMatch(/valid/);
  });

  it("locks once past due, overdue, or charged a late fee", () => {
    expect(dueDateLock(charge({ due_date: "2026-11-17" }), TODAY)).toMatch(/past due/);
    expect(dueDateLock(charge({ status: "overdue", due_date: "2026-12-01" }), TODAY)).toMatch(/overdue/);
    expect(dueDateLock(charge({ lateFees: [fee()] }), TODAY)).toMatch(/late fee/);
    expect(dueDateLock(charge({ approvalOpen: true }), TODAY)).toMatch(/awaiting approval/);
  });
});

describe("amount", () => {
  it("goes up only; what is owed rises by the difference", () => {
    expect(amountRefusal(charge(), "350")).toBeNull();
    expect(amountRefusal(charge(), "300.00")).toBeNull();
    expect(amountRefusal(charge(), "299.99")).toMatch(/Ask to Waive part/);
    expect(amountRefusal(charge(), 0)).toMatch(/more than zero/);
    const partly = charge({ status: "partially_paid", amount_paid: "100.00", amount_remaining: "200.00" });
    expect(raisedAmount(partly, 350)).toEqual({ amount: 350, amount_remaining: 250 });
  });

  it("is locked while an approval is open, or once settled", () => {
    expect(amountRefusal(charge({ approvalOpen: true }), 400)).toMatch(/awaiting approval/);
    expect(amountRefusal(charge({ status: "paid" }), 400)).toMatch(/still owed/);
  });
});

describe("partial waiver", () => {
  it("asks for a cut less than what remains; all of it is the full waiver", () => {
    expect(waiveRefusal(charge())).toBeNull();
    expect(waiveRefusal(charge(), 50)).toBeNull();
    expect(waiveRefusal(charge(), 300)).toMatch(/all of it/);
    expect(waiveRefusal(charge(), 0)).toMatch(/more than zero/);
    expect(waiveRefusal(charge({ approvalOpen: true }), 50)).toMatch(/awaiting approval/);
    expect(waiveRefusal(charge({ status: "paid" }))).toMatch(/already paid/);
  });

  it("drops the amount and what remains by the cut", () => {
    expect(applyCut(charge(), 50)).toEqual({ waived: 50, amount: 250, amount_remaining: 250, status: "active" });
  });

  it("waives only what remains when payments since left less, and the charge is paid", () => {
    const paidSince = charge({ status: "partially_paid", amount_paid: "270.00", amount_remaining: "30.00" });
    expect(applyCut(paidSince, 50)).toEqual({ waived: 30, amount: 270, amount_remaining: 0, status: "paid" });
  });
});

describe("move", () => {
  it("only while nothing is paid on it or its late fees", () => {
    expect(moveRefusal(charge())).toBeNull();
    expect(moveRefusal(charge({ lateFees: [fee()] }))).toBeNull();
    expect(moveRefusal(charge({ amount_paid: "1.00" }))).toMatch(/payment/);
    expect(moveRefusal(charge({ hasTransactions: true }))).toMatch(/payment/);
    expect(moveRefusal(charge({ lateFees: [fee({ amount_paid: "25.00", status: "paid" })] }))).toMatch(/late fee/);
    expect(moveRefusal(charge({ request_type: "late_fee" }))).toMatch(/follows its charge/);
    expect(moveRefusal(charge({ approvalOpen: true }))).toMatch(/awaiting approval/);
  });
});

describe("late fees and notices", () => {
  it("sums only the open late fees", () => {
    const fees = [fee(), fee({ id: "f2", amount_remaining: "10.50" }), fee({ id: "f3", status: "canceled" }), fee({ id: "f4", status: "paid", amount_remaining: "0" })];
    expect(openLateFeesTotal({ lateFees: fees })).toBe(35.5);
  });

  it("the owner hears of the amount and the due date, not the words", () => {
    const changes = [
      { field: "title" as const, from: "Mar", to: "March dues" },
      { field: "amount" as const, from: 300, to: 350 },
      { field: "due_date" as const, from: "2026-12-01", to: "2026-12-15" },
    ];
    expect(ownerHearsOf(changes).map((c) => c.field)).toEqual(["amount", "due_date"]);
  });
});

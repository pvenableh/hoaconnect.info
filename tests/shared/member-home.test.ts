import { describe, expect, it } from "vitest";
import {
  balanceSeries,
  openRequests,
  paidThisYear,
  requestTrackKey,
} from "../../core/shared/home/member-home";

describe("member home shaping", () => {
  const charges = [
    { amount: 100, amount_paid: 100, amount_remaining: 0, status: "paid", due_date: "2026-02-01", paid_at: "2026-02-10" },
    { amount: 100, amount_paid: 40, amount_remaining: 60, status: "partially_paid", due_date: "2026-05-01" },
    { amount: 100, amount_paid: 0, amount_remaining: 100, status: "draft", due_date: "2026-06-01" },
    { amount: 100, amount_paid: 100, amount_remaining: 0, status: "paid", due_date: "2025-12-01", paid_at: "2025-12-02" },
  ];

  it("sums paid and charged for one year, ignoring drafts", () => {
    expect(paidThisYear(charges, 2026)).toEqual({ paid: 140, charged: 200 });
  });

  it("builds a month-end balance series, oldest first", () => {
    const s = balanceSeries(charges, new Date("2026-06-15T00:00:00Z"), 6);
    expect(s).toHaveLength(6);
    // Jan: nothing owed; Feb: paid in the month it was due, so cleared by month end;
    // May and June: 60 still owed.
    expect(s[0]).toBe(0);
    expect(s[4]).toBe(60);
    expect(s[5]).toBe(60);
  });

  it("maps request statuses onto the three steps", () => {
    expect(requestTrackKey("open")).toBe("open");
    expect(requestTrackKey("waiting")).toBe("in_progress");
    expect(requestTrackKey("closed")).toBe("resolved");
    expect(requestTrackKey(null)).toBeNull();
  });

  it("keeps only requests still being worked", () => {
    const rows = [
      { id: "a", status: "open" },
      { id: "b", status: "resolved" },
      { id: "c", status: "waiting" },
    ];
    expect(openRequests(rows).map((r) => r.id)).toEqual(["a", "c"]);
  });
});

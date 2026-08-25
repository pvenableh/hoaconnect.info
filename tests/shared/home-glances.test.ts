import { describe, it, expect } from "vitest";
import {
  num,
  money,
  moneyShort,
  owed,
  outstandingCharges,
  daysOverdue,
  ageingBuckets,
  pastDue,
  collectionMonths,
  requestBuckets,
  requestAgeDays,
  staleRequests,
  summariseOccupancy,
  MS_DAY,
} from "../../core/shared/home/glances";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const nowMs = NOW.getTime();
const daysAgo = (n: number) => new Date(nowMs - n * MS_DAY).toISOString();

describe("num", () => {
  // Directus returns decimals as STRINGS. `+` on two of those concatenates,
  // and the surface silently reports $0.00 — this codebase has shipped that bug.
  it("parses the strings Directus returns for decimal columns", () => {
    expect(num("600.75")).toBe(600.75);
    expect(num(600.75)).toBe(600.75);
  });

  it("treats null, undefined and junk as zero rather than NaN", () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("not a number")).toBe(0);
  });
});

describe("money formatting", () => {
  it("writes whole dollars", () => {
    expect(money(1234.56)).toBe("$1,235");
  });

  it("compacts to k only past five figures, where a tile would wrap", () => {
    expect(moneyShort(9999)).toBe("$9,999");
    expect(moneyShort(12400)).toBe("$12k");
  });
});

describe("owed", () => {
  it("prefers amount_remaining, which is authoritative when set", () => {
    expect(owed({ amount: "500", amount_paid: "200", amount_remaining: "300" })).toBe(300);
  });

  it("falls back to amount minus paid when remaining is absent", () => {
    expect(owed({ amount: "500", amount_paid: "200" })).toBe(300);
  });

  it("never returns a negative — an overpayment is not a debt", () => {
    expect(owed({ amount: "100", amount_paid: "150" })).toBe(0);
  });
});

describe("outstandingCharges", () => {
  it("drops paid and canceled rows and anything with nothing left owing", () => {
    const rows = outstandingCharges([
      { id: "paid", status: "paid", amount: "100" },
      { id: "canceled", status: "canceled", amount: "100" },
      { id: "settled", status: "open", amount: "100", amount_paid: "100" },
      { id: "owing", status: "open", amount: "100" },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["owing"]);
  });
});

describe("daysOverdue", () => {
  it("is zero when no due date was ever set", () => {
    expect(daysOverdue({ amount: "1" }, nowMs)).toBe(0);
  });

  it("is negative before the due date and positive after", () => {
    expect(daysOverdue({ due_date: daysAgo(-10) }, nowMs)).toBeCloseTo(-10, 5);
    expect(daysOverdue({ due_date: daysAgo(10) }, nowMs)).toBeCloseTo(10, 5);
  });
});

describe("ageingBuckets", () => {
  const rows = [
    { id: "future", status: "open", amount: "100", due_date: daysAgo(-5) },
    { id: "d10", status: "open", amount: "200", due_date: daysAgo(10) },
    { id: "d45", status: "open", amount: "300", due_date: daysAgo(45) },
    { id: "d75", status: "open", amount: "400", due_date: daysAgo(75) },
    { id: "d200", status: "open", amount: "500", due_date: daysAgo(200) },
    { id: "paid", status: "paid", amount: "900", due_date: daysAgo(300) },
  ];

  it("puts each debt in exactly one band", () => {
    const b = ageingBuckets(rows, nowMs);
    expect(b.map((x) => x.value)).toEqual([100, 200, 300, 400, 500]);
  });

  it("sums to what is outstanding, ignoring settled rows", () => {
    const total = ageingBuckets(rows, nowMs).reduce((s, b) => s + b.value, 0);
    expect(total).toBe(1500);
  });

  it("colours past-due bands off the status tokens, not the categorical ramp", () => {
    const b = ageingBuckets(rows, nowMs);
    expect(b[0]!.color).toContain("--theme-text-muted");
    expect(b[4]!.color).toContain("--destructive");
  });
});

describe("pastDue", () => {
  it("counts only what is actually late — not-yet-due money is not a problem", () => {
    const res = pastDue(
      [
        { status: "open", amount: "100", due_date: daysAgo(-5) },
        { status: "open", amount: "200", due_date: daysAgo(3) },
        { status: "open", amount: "300", due_date: daysAgo(90) },
      ],
      nowMs,
    );
    expect(res).toEqual({ total: 500, count: 2 });
  });

  it("is zero and empty for a community that owes nothing", () => {
    expect(pastDue([], nowMs)).toEqual({ total: 0, count: 0 });
  });
});

describe("collectionMonths", () => {
  it("always returns the full window, zero-filled, so the sparkline keeps its width", () => {
    const months = collectionMonths([], 12, NOW);
    expect(months).toHaveLength(12);
    expect(months.every((m) => m.collected === 0)).toBe(true);
  });

  it("lands a payment in the month it was paid, and the last bucket is this month", () => {
    const months = collectionMonths(
      [{ amount_paid: "600.75", paid_at: NOW.toISOString() }],
      12,
      NOW,
    );
    expect(months.at(-1)!.collected).toBeCloseTo(600.75, 5);
  });

  it("ignores an unpaid charge even if it carries an amount", () => {
    const months = collectionMonths([{ amount: "500", amount_paid: "0", paid_at: null }], 12, NOW);
    expect(months.every((m) => m.collected === 0)).toBe(true);
  });

  it("ignores a payment older than the window", () => {
    const months = collectionMonths([{ amount_paid: "500", paid_at: daysAgo(800) }], 12, NOW);
    expect(months.every((m) => m.collected === 0)).toBe(true);
  });
});

describe("request ageing", () => {
  const rows = [
    { id: "new", date_created: daysAgo(1) },
    { id: "week", date_created: daysAgo(12) },
    { id: "month", date_created: daysAgo(60) },
    { id: "ancient", date_created: daysAgo(400) },
  ];

  it("buckets by age with no row counted twice", () => {
    const b = requestBuckets(rows, nowMs);
    expect(b.map((x) => x.count)).toEqual([1, 1, 1, 1]);
  });

  it("treats a row with no created date as brand new rather than dropping it", () => {
    expect(requestAgeDays({ date_created: null }, nowMs)).toBe(0);
    expect(requestBuckets([{ date_created: null }], nowMs)[0]!.count).toBe(1);
  });

  it("counts anything 30 days or older as stale", () => {
    expect(staleRequests(rows, nowMs)).toBe(2);
  });

  it("returns empty buckets, not an empty array, for a clear queue", () => {
    expect(requestBuckets([], nowMs).map((b) => b.count)).toEqual([0, 0, 0, 0]);
  });
});

describe("summariseOccupancy", () => {
  it("counts active homes only — an inactive unit is not somebody's home", () => {
    const s = summariseOccupancy([
      { status: "active", occupancy: "owner" },
      { status: "active", occupancy: "owner" },
      { status: "active", occupancy: "tenant" },
      { status: "inactive", occupancy: "owner" },
    ]);
    expect(s.counts).toEqual({ owner: 2, tenant: 1 });
    expect(s.recorded).toBe(3);
    expect(s.ownerPct).toBe(67);
  });

  it("buckets a home with no recorded occupancy as unknown and leaves it out of the split", () => {
    const s = summariseOccupancy([
      { status: "active", occupancy: null },
      { status: "active", occupancy: "owner" },
    ]);
    expect(s.counts.unknown).toBe(1);
    expect(s.recorded).toBe(1);
  });

  // An "unknown: 28" donut is worse than no donut — null is what tells the
  // surface to say what to do instead.
  it("returns a null percentage when nothing has been recorded", () => {
    const s = summariseOccupancy([{ status: "active", occupancy: null }]);
    expect(s.ownerPct).toBeNull();
    expect(s.recorded).toBe(0);
  });

  it("survives an empty community", () => {
    expect(summariseOccupancy([])).toEqual({ counts: {}, recorded: 0, ownerPct: null });
  });
});

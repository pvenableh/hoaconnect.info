import { describe, it, expect } from "vitest";
import {
  chargesDueForPeriod,
  lateFeesToApply,
  autopayRunsFor,
  periodsFor,
  type BillableLink,
  type ScheduleLike,
  type ChargeLike,
  type LateFeePolicy,
  type MethodLike,
} from "#core/shared/billing/engine";

const schedule = (over: Partial<ScheduleLike> = {}): ScheduleLike => ({
  id: "sch1",
  title: "Dues",
  amount: 300,
  frequency: "monthly",
  cadence: "monthly",
  amount_source: "fixed",
  audience: { all: true },
  generate_days_ahead: 14,
  start_date: "2026-01-01",
  end_date: null,
  last_generated_period: null,
  ...over,
});

const link = (over: Partial<BillableLink> = {}): BillableLink => ({
  member: "m1",
  unit: "u1",
  start_date: "2025-06-01",
  end_date: null,
  ownership_percentage: null,
  is_primary_unit: true,
  member_type: "owner",
  ...over,
});

const charge = (over: Partial<ChargeLike> = {}): ChargeLike => ({
  id: "c1",
  member: "m1",
  unit: "u1",
  request_type: "monthly_dues",
  status: "active",
  amount: 300,
  amount_remaining: 300,
  due_date: "2026-03-01",
  source: "schedule",
  source_id: "sch1",
  period_start: "2026-03-01",
  ...over,
});

const policy = (over: Partial<LateFeePolicy> = {}): LateFeePolicy => ({
  enabled: true,
  amount: 25,
  kind: "flat",
  repeat: "once",
  cap: null,
  grace_days: 10,
  ...over,
});

const method = (over: Partial<MethodLike> = {}): MethodLike => ({
  id: "pm1",
  member: "m1",
  is_autopay: true,
  autopay_day: 5,
  status: "active",
  ...over,
});

describe("periodsFor", () => {
  it("monthly periods are whole calendar months anchored on start_date", () => {
    const p = periodsFor(schedule(), "2026-02-20");
    expect(p.map((x) => x.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(p[0]).toMatchObject({ start: "2026-01-01", end: "2026-01-31", due: "2026-01-01" });
  });

  it("semiannual cadence yields two periods a year, six months long", () => {
    const p = periodsFor(schedule({ cadence: "semiannual", start_date: "2026-01-01" }), "2027-01-01");
    expect(p.map((x) => x.key)).toEqual(["2026-01", "2026-07", "2027-01"]);
    expect(p[1]).toMatchObject({ start: "2026-07-01", end: "2026-12-31" });
  });

  it("falls back to legacy frequency when cadence is null", () => {
    const p = periodsFor(schedule({ cadence: null, frequency: "quarterly" }), "2026-12-01");
    expect(p.map((x) => x.key)).toEqual(["2026-01", "2026-04", "2026-07", "2026-10"]);
  });

  it("stops at end_date and honours generate_days_ahead", () => {
    // Apr 1 is due in 14 days on Mar 18; not on Mar 17.
    expect(periodsFor(schedule(), "2026-03-17").at(-1)?.key).toBe("2026-03");
    expect(periodsFor(schedule(), "2026-03-18").at(-1)?.key).toBe("2026-04");
    expect(periodsFor(schedule({ end_date: "2026-02-15" }), "2026-12-01").map((x) => x.key)).toEqual([
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("chargesDueForPeriod", () => {
  it("bills the responsible owner the full fixed amount, keyed (schedule, unit, period)", () => {
    const drafts = chargesDueForPeriod(schedule({ last_generated_period: "2026-02" }), [link()], "2026-03-01");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      key: "sch1:u1:2026-03",
      schedule: "sch1",
      unit: "u1",
      member: "m1",
      period: "2026-03",
      period_start: "2026-03-01",
      period_end: "2026-03-31",
      due_date: "2026-03-01",
      amount: 300,
      prorated: false,
      request_type: "monthly_dues",
      source: "schedule",
      source_id: "sch1",
    });
  });

  it("prorates daily on a link's first period only (month boundary)", () => {
    const l = link({ start_date: "2026-01-15" });
    const jan = chargesDueForPeriod(schedule(), [l], "2026-01-01");
    expect(jan).toHaveLength(1);
    // Jan 15..31 inclusive = 17 of 31 days.
    expect(jan[0].amount).toBe(Math.round((300 * 17) / 31 * 100) / 100);
    expect(jan[0].prorated).toBe(true);

    const feb = chargesDueForPeriod(schedule({ last_generated_period: "2026-01" }), [l], "2026-02-01");
    expect(feb[0]).toMatchObject({ period: "2026-02", amount: 300, prorated: false });
  });

  it("a link that starts on the period's first day is not prorated", () => {
    const d = chargesDueForPeriod(schedule(), [link({ start_date: "2026-01-01" })], "2026-01-01");
    expect(d[0]).toMatchObject({ amount: 300, prorated: false });
  });

  it("splits ownership_pct across active co-owners and the shares sum to the total", () => {
    const links = [
      link({ member: "a", ownership_percentage: 33.33 }),
      link({ member: "b", ownership_percentage: 33.33, is_primary_unit: false }),
      link({ member: "c", ownership_percentage: 33.34, is_primary_unit: false }),
    ];
    const d = chargesDueForPeriod(schedule({ amount_source: "ownership_pct", amount: 100 }), links, "2026-01-01");
    expect(d).toHaveLength(3);
    const total = d.reduce((s, x) => s + x.amount, 0);
    expect(Math.round(total * 100)).toBe(10000);
    expect(d.map((x) => x.key)).toEqual(["sch1:u1:2026-01:a", "sch1:u1:2026-01:b", "sch1:u1:2026-01:c"]);
  });

  it("splits equally when any co-owner is missing a percentage", () => {
    const links = [link({ member: "a" }), link({ member: "b", is_primary_unit: false, ownership_percentage: 60 })];
    const d = chargesDueForPeriod(schedule({ amount_source: "ownership_pct", amount: 301 }), links, "2026-01-01");
    expect(d.map((x) => x.amount).sort()).toEqual([150.5, 150.5]);
  });

  it("per_unit_rate multiplies the schedule amount by the link's unit rate", () => {
    const d = chargesDueForPeriod(
      schedule({ amount_source: "per_unit_rate", amount: 0.5 }),
      [link({ unit_rate: 1200 })],
      "2026-01-01",
    );
    expect(d[0].amount).toBe(600);
  });

  it("is idempotent on re-run: existing keys and last_generated_period suppress drafts", () => {
    const first = chargesDueForPeriod(schedule(), [link()], "2026-03-01");
    expect(first.map((x) => x.period)).toEqual(["2026-01", "2026-02", "2026-03"]);
    const existingKeys = new Set(first.map((x) => x.key));
    expect(chargesDueForPeriod(schedule(), [link()], "2026-03-01", { existingKeys })).toEqual([]);
    expect(chargesDueForPeriod(schedule({ last_generated_period: "2026-03" }), [link()], "2026-03-01")).toEqual([]);
  });

  it("excludes an end-dated link, a not-yet-started link, and a tenant", () => {
    const links = [
      link({ member: "gone", end_date: "2026-02-28" }),
      link({ member: "future", start_date: "2026-04-01" }),
      link({ member: "renter", member_type: "tenant" }),
      link({ member: "here", is_primary_unit: false }),
    ];
    const d = chargesDueForPeriod(schedule({ last_generated_period: "2026-02" }), links, "2026-03-01");
    expect(d.map((x) => x.member)).toEqual(["here"]);
  });

  it("a link ending mid-period is still billed for that period", () => {
    const d = chargesDueForPeriod(
      schedule({ last_generated_period: "2026-02" }),
      [link({ end_date: "2026-03-10" })],
      "2026-03-01",
    );
    expect(d).toHaveLength(1);
  });

  it("audience { units } restricts which unit links are billed", () => {
    const links = [link({ unit: "u1" }), link({ unit: "u2", member: "m2" })];
    const d = chargesDueForPeriod(schedule({ audience: { units: ["u2"] } }), links, "2026-01-01");
    expect(d.map((x) => x.unit)).toEqual(["u2"]);
  });

  it("with co-owners under fixed, the primary-unit link is responsible, else the earliest start", () => {
    const links = [
      link({ member: "late", start_date: "2025-09-01", is_primary_unit: false }),
      link({ member: "early", start_date: "2025-01-01", is_primary_unit: false }),
    ];
    expect(chargesDueForPeriod(schedule(), links, "2026-01-01")[0].member).toBe("early");
    const withPrimary = [...links, link({ member: "prim", start_date: "2025-12-01", is_primary_unit: true })];
    expect(chargesDueForPeriod(schedule(), withPrimary, "2026-01-01")[0].member).toBe("prim");
  });

  it("returns nothing for a paused or canceled schedule", () => {
    expect(chargesDueForPeriod(schedule({ status: "paused" }), [link()], "2026-01-01")).toEqual([]);
  });
});

describe("lateFeesToApply", () => {
  it("does nothing while disabled or inside the grace period", () => {
    expect(lateFeesToApply([charge()], policy({ enabled: false }), "2026-04-01")).toEqual([]);
    // due Mar 1 + 10 days grace = Mar 11; not late until Mar 12.
    expect(lateFeesToApply([charge()], policy(), "2026-03-11")).toEqual([]);
    expect(lateFeesToApply([charge()], policy(), "2026-03-12")).toHaveLength(1);
  });

  it("applies one flat fee per charge, keyed on the charge and period", () => {
    const fees = lateFeesToApply([charge()], policy(), "2026-03-20");
    expect(fees[0]).toMatchObject({
      key: "late_fee:c1:once",
      charge: "c1",
      member: "m1",
      unit: "u1",
      amount: 25,
      period: "once",
      due_date: "2026-03-20",
      request_type: "late_fee",
      source: "late_fee",
      source_id: "c1",
    });
  });

  it("percent fees are a percentage of the remaining balance", () => {
    const fees = lateFeesToApply([charge({ amount_remaining: 120 })], policy({ kind: "percent", amount: 10 }), "2026-04-01");
    expect(fees[0].amount).toBe(12);
  });

  it("never duplicates a fee for a period already carrying one (once)", () => {
    const existing = charge({
      id: "f1",
      request_type: "late_fee",
      source: "late_fee",
      source_id: "c1",
      period_start: "2026-03-20",
      status: "paid",
      amount: 25,
      amount_remaining: 0,
    });
    expect(lateFeesToApply([charge(), existing], policy(), "2026-05-01")).toEqual([]);
  });

  it("monthly repeat adds one fee per calendar month, skipping months already fed", () => {
    const march = lateFeesToApply([charge()], policy({ repeat: "monthly" }), "2026-03-20");
    expect(march[0].key).toBe("late_fee:c1:2026-03");
    const marchFee = charge({
      id: "f1",
      request_type: "late_fee",
      source: "late_fee",
      source_id: "c1",
      period_start: "2026-03-20",
      amount: 25,
      amount_remaining: 25,
      status: "paid",
    });
    expect(lateFeesToApply([charge(), marchFee], policy({ repeat: "monthly" }), "2026-03-28")).toEqual([]);
    const april = lateFeesToApply([charge(), marchFee], policy({ repeat: "monthly" }), "2026-04-02");
    expect(april.map((f) => f.key)).toEqual(["late_fee:c1:2026-04"]);
  });

  it("caps the running total of fees on a charge", () => {
    const marchFee = charge({
      id: "f1",
      request_type: "late_fee",
      source: "late_fee",
      source_id: "c1",
      period_start: "2026-03-20",
      amount: 25,
      amount_remaining: 25,
    });
    const april = lateFeesToApply([charge(), marchFee], policy({ repeat: "monthly", cap: 40 }), "2026-04-02");
    expect(april[0].amount).toBe(15);
    const aprilFee = charge({ ...marchFee, id: "f2", period_start: "2026-04-02", amount: 15, amount_remaining: 15 });
    expect(lateFeesToApply([charge(), marchFee, aprilFee], policy({ repeat: "monthly", cap: 40 }), "2026-05-02")).toEqual([]);
  });

  it("skips paid, canceled, draft charges and late fees themselves", () => {
    const rows = [
      charge({ id: "paid", status: "paid", amount_remaining: 0 }),
      charge({ id: "canceled", status: "canceled" }),
      charge({ id: "draft", status: "draft" }),
      charge({ id: "fee", request_type: "late_fee", source: "late_fee", source_id: "x" }),
      charge({ id: "partial", status: "partially_paid", amount_remaining: 50 }),
    ];
    expect(lateFeesToApply(rows, policy(), "2026-05-01").map((f) => f.charge)).toEqual(["partial"]);
  });
});

describe("autopayRunsFor", () => {
  const open = [
    charge({ id: "c2", due_date: "2026-04-01", amount_remaining: 300 }),
    charge({ id: "c1", due_date: "2026-03-01", amount_remaining: 120.5, status: "partially_paid" }),
    charge({ id: "other", member: "m2", amount_remaining: 10 }),
  ];

  it("runs on the method's day, oldest charge first, with the member's total", () => {
    const runs = autopayRunsFor("2026-04-05", [method()], open);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ member: "m1", method: "pm1", charges: ["c1", "c2"], total: 420.5 });
  });

  it("does not run on other days, for disabled methods, or when autopay is off", () => {
    expect(autopayRunsFor("2026-04-06", [method()], open)).toEqual([]);
    expect(autopayRunsFor("2026-04-05", [method({ status: "disabled" })], open)).toEqual([]);
    expect(autopayRunsFor("2026-04-05", [method({ is_autopay: false })], open)).toEqual([]);
  });

  it("on the 29th–31st only methods clamped to the month's last day run", () => {
    expect(autopayRunsFor("2026-01-31", [method({ autopay_day: 15 })], open)).toEqual([]);
    expect(autopayRunsFor("2026-01-31", [method({ autopay_day: 31 })], open)).toHaveLength(1);
    expect(autopayRunsFor("2026-01-30", [method({ autopay_day: 31 })], open)).toEqual([]);
    // February has no 30th: a day-30 method runs on the 28th.
    expect(autopayRunsFor("2026-02-28", [method({ autopay_day: 30 })], open)).toHaveLength(1);
    expect(autopayRunsFor("2026-04-30", [method({ autopay_day: 30 })], open)).toHaveLength(1);
  });

  it("skips members already charged today and members with nothing open", () => {
    expect(autopayRunsFor("2026-04-05", [method()], open, new Set(["m1"]))).toEqual([]);
    expect(autopayRunsFor("2026-04-05", [method({ member: "m3" })], open)).toEqual([]);
    expect(
      autopayRunsFor("2026-04-05", [method()], [charge({ status: "paid", amount_remaining: 0 })]),
    ).toEqual([]);
  });

  it("uses one method per member, preferring the first listed", () => {
    const runs = autopayRunsFor("2026-04-05", [method({ id: "pmA" }), method({ id: "pmB" })], open);
    expect(runs.map((r) => r.method)).toEqual(["pmA"]);
  });
});

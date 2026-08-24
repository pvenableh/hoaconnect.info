/**
 * The attention curve exists to solve one specific failure, so that failure is
 * the first thing tested here.
 *
 * Score linearly on days-overdue and the oldest item wins forever: Earnest had
 * a $165 invoice 547 days late sitting at the top of the feed for a year and a
 * half. A feed like that gets ignored, and once it is ignored the genuinely
 * urgent thing underneath is invisible too. So the property that matters is not
 * "old things score high" — it is **"a fortnight-old actionable thing outranks
 * an ancient small one"**, which is what the ramp/hot/decay/floor shape buys.
 *
 * The rest pins the constants, because the buckets decide what the cron is
 * allowed to put on somebody's phone and a drifting threshold there is a
 * drifting definition of "urgent".
 */

import { describe, it, expect } from "vitest";
import {
  ATTENTION,
  attentionScore,
  attentionPriority,
  overdueWeight,
  priorityFromScore,
  daysBetween,
} from "#core/shared/ai/attention";

describe("the shape of the curve", () => {
  it("ramps from a floor, not from zero — day one already registers", () => {
    expect(overdueWeight(1)).toBeCloseTo(ATTENTION.RAMP_FLOOR + (1 / 14) * 0.65, 5);
    expect(overdueWeight(1)).toBeGreaterThan(0.35);
  });

  it("reaches full weight at the end of the ramp and holds it through the hot window", () => {
    expect(overdueWeight(14)).toBeCloseTo(1, 5);
    expect(overdueWeight(30)).toBe(1);
    expect(overdueWeight(45)).toBe(1);
  });

  it("decays across the cold window instead of falling off a cliff", () => {
    const at46 = overdueWeight(46);
    const at90 = overdueWeight(90);
    const at120 = overdueWeight(120);
    expect(at46).toBeLessThan(1);
    expect(at90).toBeLessThan(at46);
    expect(at120).toBeLessThan(at90);
    // The decay lands ON the stale floor rather than crossing it.
    expect(at120).toBeCloseTo(1 - ATTENTION.DECAY_DEPTH, 5);
  });

  it("bottoms out at a visible floor — never zero, never top", () => {
    expect(overdueWeight(121)).toBe(ATTENTION.STALE_FLOOR);
    expect(overdueWeight(547)).toBe(ATTENTION.STALE_FLOOR);
    expect(overdueWeight(10_000)).toBe(ATTENTION.STALE_FLOOR);
    expect(ATTENTION.STALE_FLOOR).toBeGreaterThan(0);
  });

  it("treats 'not overdue' the same however it is expressed", () => {
    expect(overdueWeight(0)).toBe(0);
    expect(overdueWeight(-5)).toBe(0);
    expect(attentionScore({})).toBe(ATTENTION.BASE);
    expect(attentionScore({ daysOverdue: 0 })).toBe(ATTENTION.BASE);
    expect(attentionScore({ daysOverdue: -9 })).toBe(ATTENTION.BASE);
  });
});

describe("the failure this exists to prevent", () => {
  it("ranks a 14-day-old actionable item above a 547-day-old small one", () => {
    const ancient = attentionScore({ type: "action", daysOverdue: 547, amount: 165 });
    const fortnight = attentionScore({ type: "action", daysOverdue: 14 });
    expect(fortnight).toBeGreaterThan(ancient);
  });

  it("does not call that ancient item urgent", () => {
    expect(attentionPriority({ type: "action", daysOverdue: 547, amount: 165 }))
      .not.toBe("urgent");
  });

  it("still shows it — decay is demotion, not suppression", () => {
    expect(attentionScore({ type: "action", daysOverdue: 547, amount: 165 }))
      .toBeGreaterThan(ATTENTION.BASE);
  });
});

describe("money is log-scaled and capped", () => {
  it("rises with the order of magnitude, not linearly", () => {
    const at200 = attentionScore({ amount: 200 }) - ATTENTION.BASE;
    const at1k = attentionScore({ amount: 1_000 }) - ATTENTION.BASE;
    const at10k = attentionScore({ amount: 10_000 }) - ATTENTION.BASE;
    expect(at200).toBe(14);
    expect(at1k).toBe(18);
    expect(at10k).toBe(ATTENTION.MONEY_CAP);
  });

  it("caps, so a large number cannot buy urgency on its own", () => {
    expect(attentionScore({ amount: 10_000_000 }) - ATTENTION.BASE).toBe(ATTENTION.MONEY_CAP);
    expect(attentionPriority({ amount: 10_000_000 })).not.toBe("urgent");
  });

  it("ignores zero and negative amounts", () => {
    expect(attentionScore({ amount: 0 })).toBe(ATTENTION.BASE);
    expect(attentionScore({ amount: -500 })).toBe(ATTENTION.BASE);
  });
});

describe("buckets", () => {
  it("splits exactly on the documented thresholds", () => {
    expect(priorityFromScore(ATTENTION.URGENT_AT)).toBe("urgent");
    expect(priorityFromScore(ATTENTION.URGENT_AT - 1)).toBe("high");
    expect(priorityFromScore(ATTENTION.HIGH_AT)).toBe("high");
    expect(priorityFromScore(ATTENTION.HIGH_AT - 1)).toBe("medium");
    expect(priorityFromScore(ATTENTION.MEDIUM_AT)).toBe("medium");
    expect(priorityFromScore(ATTENTION.MEDIUM_AT - 1)).toBe("low");
  });

  it("clamps the score to 0–100 whatever is thrown at it", () => {
    expect(attentionScore({ type: "action", daysOverdue: 30, amount: 1e9, isToday: true, isTomorrow: true }))
      .toBeLessThanOrEqual(100);
    expect(attentionScore({ type: "action", daysOverdue: 30, amount: 1e9, isToday: true, isTomorrow: true }))
      .toBeGreaterThanOrEqual(0);
  });
});

describe("golden scores", () => {
  // Pinned values, not recomputed formulas — if the curve is retuned these
  // should be updated deliberately, with the change visible in the diff.
  const cases: Array<[string, Parameters<typeof attentionScore>[0], number, string]> = [
    ["a request open 31 days", { type: "action", daysOverdue: 31 }, 84, "urgent"],
    ["a request open 3 days", { type: "action", daysOverdue: 3 }, 66, "high"],
    ["a $600 balance, last paid 40 days ago", { type: "action", daysOverdue: 40, amount: 600 }, 100, "urgent"],
    ["a $165 balance 547 days stale", { type: "action", daysOverdue: 547, amount: 165 }, 69, "high"],
    ["a project quiet 21 days", { type: "action", daysOverdue: 21 }, 84, "urgent"],
    ["a vendor expiring in a month", { type: "reminder" }, 40, "low"],
    ["a vendor expiring tomorrow", { type: "reminder", isTomorrow: true }, 51, "medium"],
  ];

  for (const [label, input, score, priority] of cases) {
    it(`${label} → ${score} (${priority})`, () => {
      expect(attentionScore(input)).toBe(score);
      expect(attentionPriority(input)).toBe(priority);
    });
  }
});

describe("daysBetween", () => {
  it("floors at zero, so a Directus timestamp ahead of the app server reads as today", () => {
    // Directus runs on another machine and has been observed ~3.5s ahead. A
    // negative age must never become a negative score contribution.
    const now = new Date("2026-08-24T12:00:00.000Z");
    expect(daysBetween("2026-08-24T12:00:04.000Z", now)).toBe(0);
  });

  it("counts whole elapsed days", () => {
    expect(daysBetween("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z")).toBe(30);
  });

  it("returns 0 rather than NaN for unparseable input", () => {
    expect(daysBetween("not-a-date", new Date())).toBe(0);
  });
});

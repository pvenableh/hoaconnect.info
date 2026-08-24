/**
 * Earned trust is a suggestion engine, and the only way it can do harm is by
 * suggesting too eagerly. Every test here is about the *refusals*: the ratio
 * gate, the ceiling, and the fact that a nudge never contains a tier the person
 * has not actually earned.
 *
 * The one test that matters most is the last group — nothing in this module can
 * produce a tier above 3, and nothing anywhere lets any tier touch outbound
 * work. That cap lives in `shouldAutoApprove`, and it is asserted against the
 * live catalog rather than a copied list so it fails if the catalog changes.
 */

import { describe, it, expect } from "vitest";
import {
  TRUST_MILESTONES,
  CLEAN_RATIO,
  isCleanRecord,
  earnedTier,
  milestoneReached,
  trustNudge,
} from "../../core/shared/ai/trust";
import { ACTION_CATALOG, shouldAutoApprove } from "../../core/shared/ai/actions";

describe("the ratio gate", () => {
  it("treats no rejections as clean, provided anything was approved at all", () => {
    expect(isCleanRecord({ approved: 1, rejected: 0 })).toBe(true);
    expect(isCleanRecord({ approved: 0, rejected: 0 })).toBe(false);
  });

  it("wants approvals to outnumber rejections by the stated ratio", () => {
    expect(CLEAN_RATIO).toBe(2);
    expect(isCleanRecord({ approved: 10, rejected: 5 })).toBe(true); // exactly 2×
    expect(isCleanRecord({ approved: 9, rejected: 5 })).toBe(false);
  });

  it("does not read a busy corrector as a truster", () => {
    // Thirty approvals is a lot, and twenty rejections says why: this person is
    // editing the assistant's judgement, not delegating to it.
    expect(isCleanRecord({ approved: 30, rejected: 20 })).toBe(false);
    expect(earnedTier({ approved: 30, rejected: 20 })).toBe(0);
  });

  it("ignores nonsense inputs rather than trusting them", () => {
    expect(isCleanRecord({ approved: -5, rejected: 0 })).toBe(false);
    expect(earnedTier({ approved: NaN as any, rejected: 0 })).toBe(0);
  });
});

describe("the ladder", () => {
  it("is the 3 / 10 / 25 ladder the plan specifies", () => {
    expect(TRUST_MILESTONES).toEqual([
      { count: 3, tier: 1 },
      { count: 10, tier: 2 },
      { count: 25, tier: 3 },
    ]);
  });

  it("earns each tier only at its threshold", () => {
    expect(earnedTier({ approved: 2, rejected: 0 })).toBe(0);
    expect(earnedTier({ approved: 3, rejected: 0 })).toBe(1);
    expect(earnedTier({ approved: 9, rejected: 0 })).toBe(1);
    expect(earnedTier({ approved: 10, rejected: 0 })).toBe(2);
    expect(earnedTier({ approved: 24, rejected: 0 })).toBe(2);
    expect(earnedTier({ approved: 25, rejected: 0 })).toBe(3);
  });

  it("never climbs past 3, however long the record", () => {
    expect(earnedTier({ approved: 10_000, rejected: 0 })).toBe(3);
  });

  it("reports the milestone actually crossed", () => {
    expect(milestoneReached(2)).toBeNull();
    expect(milestoneReached(3)).toBe(3);
    expect(milestoneReached(24)).toBe(10);
    expect(milestoneReached(999)).toBe(25);
  });
});

describe("the nudge", () => {
  it("stays quiet when the dial is already where the record would put it", () => {
    expect(trustNudge({ approved: 12, rejected: 0 }, 2).suggest).toBe(false);
    expect(trustNudge({ approved: 12, rejected: 0 }, 3).suggest).toBe(false);
  });

  it("stays quiet at the top of the dial no matter the record", () => {
    expect(trustNudge({ approved: 500, rejected: 0 }, 3).suggest).toBe(false);
  });

  it("stays quiet when the record is not clean, however long it is", () => {
    expect(trustNudge({ approved: 40, rejected: 30 }, 0).suggest).toBe(false);
  });

  it("suggests exactly one step's worth of what was earned", () => {
    const n = trustNudge({ approved: 11, rejected: 3 }, 0);
    expect(n.suggest).toBe(true);
    expect(n.earnedTier).toBe(2);
    expect(n.milestone).toBe(10);
    expect(n.reason).toContain("10");
  });

  it("says out loud that resident-facing work still waits", () => {
    // The nudge is an invitation to widen autonomy. If the copy does not name
    // the limit, the invitation reads as broader than it is.
    const n = trustNudge({ approved: 30, rejected: 0 }, 0);
    expect(n.reason.toLowerCase()).toMatch(/resident|board/);
  });

  it("coerces a junk tier to 0 rather than treating it as high", () => {
    expect(trustNudge({ approved: 3, rejected: 0 }, undefined).suggest).toBe(true);
    expect(trustNudge({ approved: 3, rejected: 0 }, "banana").suggest).toBe(true);
  });
});

describe("nothing earned here reaches outbound work", () => {
  it("leaves every outbound action needing a person at the top tier", () => {
    const outbound = ACTION_CATALOG.filter((a) => a.outbound);
    expect(outbound.length).toBeGreaterThan(0);
    for (const def of outbound) {
      for (const tier of [0, 1, 2, 3] as const) {
        expect(shouldAutoApprove(def, tier)).toBe(false);
      }
    }
  });

  it("caps the highest tier the nudge can ever propose at the catalog's own cap", () => {
    const top = trustNudge({ approved: 1_000_000, rejected: 0 }, 0);
    expect(top.earnedTier).toBe(3);
    // …and tier 3 still refuses the outbound catalog. Belt, braces, and the
    // reason both are here: the number this module produces is fed straight to
    // a dial whose only safety property is that one.
    for (const def of ACTION_CATALOG.filter((a) => a.outbound)) {
      expect(shouldAutoApprove(def, top.earnedTier)).toBe(false);
    }
  });
});

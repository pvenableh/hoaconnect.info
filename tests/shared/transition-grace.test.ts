/**
 * The grace window says the same thing everywhere, and says it correctly at the
 * edges.
 *
 * `describeGrace` exists because four screens describe one timestamp, and the
 * bug it prevents is not a typo — it is two screens disagreeing about whether a
 * community is still working. So the assertions here are about the two things a
 * board acts on: whether the window is open at all, and how many days are left.
 *
 * The boundary matters more than it looks. `isEntitledFrom` passes while
 * `grace_ends_at > now` — strictly. If this module called the same instant
 * "active" the UI would promise access the entitlement check had already
 * withdrawn.
 */

import { describe, it, expect } from "vitest";
import { describeGrace } from "#core/shared/transition/grace";
import { isEntitledFrom } from "#core/shared/utils/entitlement";

const NOW = new Date("2026-08-20T12:00:00.000Z");

describe("describeGrace", () => {
  it("returns null when there is no window", () => {
    expect(describeGrace(null, NOW)).toBeNull();
    expect(describeGrace(undefined, NOW)).toBeNull();
    expect(describeGrace("", NOW)).toBeNull();
  });

  it("returns null for a timestamp it cannot read, rather than NaN copy", () => {
    expect(describeGrace("not a date", NOW)).toBeNull();
  });

  it("describes an open window with the date and the days left", () => {
    const g = describeGrace("2026-10-19T12:00:00.000Z", NOW);
    expect(g?.active).toBe(true);
    expect(g?.daysRemaining).toBe(60);
    expect(g?.endsOn).toBe("October 19, 2026");
    expect(g?.endsOnShort).toBe("Oct 19");
    expect(g?.detail).toContain("October 19, 2026");
    expect(g?.headline).toContain("grace period");
  });

  it("agrees with the entitlement check about the exact boundary", () => {
    // The instant it closes: entitlement stops passing, so the copy must stop
    // claiming the community is running.
    const atClose = describeGrace(NOW.toISOString(), NOW);
    expect(atClose?.active).toBe(false);
    expect(isEntitledFrom({ subscription_status: "canceled", grace_ends_at: NOW.toISOString() }, NOW)).toBe(false);

    // One second before: both still say yes.
    const justOpen = new Date(NOW.getTime() + 1000).toISOString();
    expect(describeGrace(justOpen, NOW)?.active).toBe(true);
    expect(isEntitledFrom({ subscription_status: "canceled", grace_ends_at: justOpen }, NOW)).toBe(true);
  });

  it("rounds a part-day up, because half a day of access is still a day to plan in", () => {
    expect(describeGrace("2026-08-20T18:00:00.000Z", NOW)?.daysRemaining).toBe(1);
    expect(describeGrace("2026-08-21T18:00:00.000Z", NOW)?.daysRemaining).toBe(2);
  });

  it("says day, not days, on the last one", () => {
    const g = describeGrace("2026-08-21T00:00:00.000Z", NOW);
    expect(g?.daysRemaining).toBe(1);
    expect(g?.badge).toContain("1 day left");
    expect(g?.badge).not.toContain("1 days");
  });

  it("describes a closed window as closed, not as a subscription that lapsed", () => {
    const g = describeGrace("2026-07-01T00:00:00.000Z", NOW);
    expect(g?.active).toBe(false);
    expect(g?.daysRemaining).toBe(0);
    expect(g?.headline).toContain("has ended");
    // The continuity promise survives the window closing.
    expect(g?.detail).toContain("export");
  });

  it("formats in UTC, so the sentence matches the instant entitlement uses", () => {
    // 00:30 UTC is the previous evening in the Americas. The date shown has to
    // be the date the check turns over, not the reader's local one.
    const g = describeGrace("2026-10-19T00:30:00.000Z", NOW);
    expect(g?.endsOn).toBe("October 19, 2026");
  });
});

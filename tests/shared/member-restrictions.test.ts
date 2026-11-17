/**
 * Restricted members (core/shared/members/restrictions.ts,
 * docs/spec-member-restrictions.md): when a pause is in force, what imposing
 * and lifting write, and who may post.
 */
import { describe, it, expect } from "vitest";
import {
  canPost,
  endedAt,
  inForceAt,
  isRestrictedAt,
  openRestriction,
  planImpose,
  planLift,
  restrictedMemberIds,
  restrictionUntil,
  resumeInstant,
} from "#core/shared/members/restrictions";

const T = (iso: string) => new Date(iso);
const START = "2026-11-17T12:00:00.000Z";
const END = "2026-12-17T12:00:00.000Z";
const row = (over: Record<string, unknown> = {}) => ({ id: "r", member: "m", starts_at: START, ends_at: END, lifted_at: null, ...over });

describe("isRestrictedAt", () => {
  it("start is inclusive, end and lift exclusive", () => {
    expect(isRestrictedAt([row()], T("2026-11-17T11:59:59.999Z"))).toBe(false);
    expect(isRestrictedAt([row()], T(START))).toBe(true);
    expect(isRestrictedAt([row()], T("2026-12-17T11:59:59.999Z"))).toBe(true);
    expect(isRestrictedAt([row()], T(END))).toBe(false);
    const lifted = row({ lifted_at: "2026-11-20T00:00:00.000Z" });
    expect(isRestrictedAt([lifted], T("2026-11-19T23:59:59.999Z"))).toBe(true);
    expect(isRestrictedAt([lifted], T("2026-11-20T00:00:00.000Z"))).toBe(false);
  });

  it("lifted early, ended by date, until lifted, a future start", () => {
    expect(isRestrictedAt([row({ lifted_at: "2026-11-18T00:00:00.000Z" })], T("2026-11-25T00:00:00.000Z"))).toBe(false);
    expect(isRestrictedAt([row()], T("2027-01-01T00:00:00.000Z"))).toBe(false);
    expect(isRestrictedAt([row({ ends_at: null })], T("2030-01-01T00:00:00.000Z"))).toBe(true);
    expect(isRestrictedAt([row({ starts_at: "2026-12-01T00:00:00.000Z" })], T("2026-11-25T00:00:00.000Z"))).toBe(false);
  });

  it("no rows, a row without a start, and a bad date are not in force", () => {
    expect(isRestrictedAt([], T(START))).toBe(false);
    expect(inForceAt(row({ starts_at: null }), T(END))).toBe(false);
    expect(inForceAt(row({ starts_at: "nonsense" }), T(END))).toBe(false);
  });

  it("openRestriction picks the row in force, and restrictedMemberIds groups by membership", () => {
    const old = row({ id: "old", ends_at: "2026-11-01T00:00:00.000Z", starts_at: "2026-10-01T00:00:00.000Z" });
    const now = row({ id: "now" });
    expect(openRestriction([old, now], T("2026-11-20T00:00:00.000Z"))?.id).toBe("now");
    expect(openRestriction([old], T("2026-11-20T00:00:00.000Z"))).toBeNull();
    const ids = restrictedMemberIds([now, row({ member: { id: "m2" } }), row({ member: "m3", lifted_at: START })], T("2026-11-20T00:00:00.000Z"));
    expect([...ids].sort()).toEqual(["m", "m2"]);
  });
});

describe("planImpose", () => {
  const now = T("2026-11-17T12:00:00.000Z");
  it("writes a row starting now, the notes trimmed, until a date or until lifted", () => {
    expect(planImpose({ rows: [], now, endsAt: END, memberNote: "  Please keep it civil.  ", internalNote: " Two warnings. " })).toEqual({
      ok: true,
      row: { starts_at: now.toISOString(), ends_at: END, member_note: "Please keep it civil.", internal_note: "Two warnings." },
    });
    const forever = planImpose({ rows: [], now, endsAt: null, memberNote: "Paused.", internalNote: "" });
    expect(forever).toMatchObject({ ok: true, row: { ends_at: null, internal_note: null } });
  });

  it("refuses an open row (409), and a row that starts later", () => {
    expect(planImpose({ rows: [row()], now: T("2026-11-20T00:00:00.000Z"), memberNote: "x" })).toMatchObject({ ok: false, status: 409 });
    expect(planImpose({ rows: [row({ starts_at: "2026-12-01T00:00:00.000Z" })], now, memberNote: "x" })).toMatchObject({ ok: false, status: 409 });
  });

  it("allows a new one once the last has ended, by date or by lift", () => {
    expect(planImpose({ rows: [row()], now: T("2027-01-01T00:00:00.000Z"), memberNote: "x" }).ok).toBe(true);
    expect(planImpose({ rows: [row({ lifted_at: "2026-11-18T00:00:00.000Z" })], now: T("2026-11-19T00:00:00.000Z"), memberNote: "x" }).ok).toBe(true);
  });

  it("refuses with 400: no member note, notes too long, an end date in the past or not a date", () => {
    expect(planImpose({ rows: [], now, memberNote: "   " })).toMatchObject({ ok: false, status: 400 });
    expect(planImpose({ rows: [], now, memberNote: "x".repeat(1001) })).toMatchObject({ ok: false, status: 400 });
    expect(planImpose({ rows: [], now, memberNote: "x", internalNote: "y".repeat(2001) })).toMatchObject({ ok: false, status: 400 });
    expect(planImpose({ rows: [], now, memberNote: "x", endsAt: "2026-11-17T12:00:00.000Z" })).toMatchObject({ ok: false, status: 400 });
    expect(planImpose({ rows: [], now, memberNote: "x", endsAt: "soon" })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("planLift", () => {
  it("ends an open row now, by the admin, without deleting it", () => {
    const now = T("2026-11-20T00:00:00.000Z");
    expect(planLift(row(), now, "admin-1")).toEqual({ ok: true, patch: { lifted_at: now.toISOString(), lifted_by: "admin-1" } });
  });

  it("is a no-op on an ended row: lifted, or its date passed", () => {
    expect(planLift(row({ lifted_at: "2026-11-18T00:00:00.000Z" }), T("2026-11-20T00:00:00.000Z"), "a")).toMatchObject({ ok: false, noop: true });
    expect(planLift(row(), T("2027-01-01T00:00:00.000Z"), "a")).toMatchObject({ ok: false, noop: true });
    expect(endedAt(row(), T(END))).toBe(true);
  });
});

describe("canPost", () => {
  it.each([
    ["active", false, true],
    ["active", true, false],
    ["pending", false, false],
    ["pending", true, false],
    ["inactive", false, false],
    ["inactive", true, false],
    ["archived", false, false],
    ["archived", true, false],
    [null, false, false],
  ])("status %s, restricted %s → %s", (status, restricted, want) => {
    expect(canPost({ status, restricted })).toBe(want);
  });
});

describe("restrictionUntil", () => {
  it("names the date, or the board", () => {
    expect(restrictionUntil(END, "America/New_York")).toBe("until December 17, 2026");
    // Midnight in New York is still the 17th there, though the 18th in UTC.
    expect(restrictionUntil("2026-12-18T04:59:00.000Z", "America/New_York")).toBe("until December 17, 2026");
    expect(restrictionUntil(null)).toBe("until the board lifts it");
  });
});

describe("resumeInstant", () => {
  it("is midnight at the start of the day picked, on the community's clock", () => {
    expect(resumeInstant("2026-12-17", "America/New_York")?.toISOString()).toBe("2026-12-17T05:00:00.000Z");
    expect(resumeInstant("2026-07-04", "America/New_York")?.toISOString()).toBe("2026-07-04T04:00:00.000Z");
    expect(resumeInstant("2026-12-17", "Pacific/Honolulu")?.toISOString()).toBe("2026-12-17T10:00:00.000Z");
    expect(resumeInstant("2026-03-08", "America/Chicago")?.toISOString()).toBe("2026-03-08T06:00:00.000Z"); // DST starts at 2am
  });

  it("refuses what is not a real day", () => {
    expect(resumeInstant("2026-02-30", "America/New_York")).toBeNull();
    expect(resumeInstant("next week", "America/New_York")).toBeNull();
  });
});

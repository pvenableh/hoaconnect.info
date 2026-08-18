import { describe, it, expect } from "vitest";
import {
  memberLabel,
  summarizeActivity,
  dailySeries,
  type ActivityRow,
} from "#core/shared/activity/summary";

describe("memberLabel", () => {
  it("uses full name, then email, then a fallback", () => {
    expect(memberLabel({ id: "1", first_name: "Ada", last_name: "Lovelace" })).toBe("Ada Lovelace");
    expect(memberLabel({ id: "1", email: "ada@x.com" })).toBe("ada@x.com");
    expect(memberLabel({ id: "1" })).toBe("Member");
    expect(memberLabel("member-id")).toBe("Member");
    expect(memberLabel(null)).toBe("Unknown");
  });
});

describe("summarizeActivity", () => {
  const rows: ActivityRow[] = [
    { event_type: "page_view", path: "/docs", date_created: "2026-06-10T10:00:00Z", member: { id: "m1", first_name: "Ada" } },
    { event_type: "page_view", path: "/docs", date_created: "2026-06-10T11:00:00Z", member: { id: "m2", first_name: "Bo" } },
    { event_type: "page_view", path: "/payments", date_created: "2026-06-11T09:00:00Z", member: { id: "m1", first_name: "Ada" } },
    { event_type: "download", target_id: "doc-1", label: "Pool Rules.pdf", date_created: "2026-06-11T09:05:00Z", member: { id: "m1", first_name: "Ada" } },
    { event_type: "download", target_id: "doc-1", label: "Pool Rules.pdf", date_created: "2026-06-11T12:00:00Z", member: { id: "m2", first_name: "Bo" } },
    { event_type: "session_start", date_created: "2026-06-11T08:00:00Z", member: { id: "m1", first_name: "Ada" } },
  ];
  const s = summarizeActivity(rows);

  it("counts totals and per-type", () => {
    expect(s.total).toBe(6);
    expect(s.pageViews).toBe(3);
    expect(s.downloads).toBe(2);
    expect(s.logins).toBe(1); // session_start counts as a login marker
    expect(s.byType).toMatchObject({ page_view: 3, download: 2, session_start: 1 });
  });

  it("counts distinct active members", () => {
    expect(s.activeMembers).toBe(2);
  });

  it("buckets by UTC day", () => {
    expect(s.byDay).toEqual({ "2026-06-10": 2, "2026-06-11": 4 });
  });

  it("ranks top targets, paths and members", () => {
    expect(s.topTargets[0]).toMatchObject({ label: "Pool Rules.pdf", count: 2 });
    expect(s.topPaths[0]).toMatchObject({ key: "/docs", count: 2 });
    expect(s.topMembers[0]).toMatchObject({ label: "Ada", count: 4 });
  });

  it("handles an empty list", () => {
    const e = summarizeActivity([]);
    expect(e.total).toBe(0);
    expect(e.activeMembers).toBe(0);
    expect(e.topTargets).toEqual([]);
  });
});

describe("dailySeries", () => {
  it("fills a continuous zero-padded window ending at `end`", () => {
    const series = dailySeries({ "2026-06-11": 4 }, "2026-06-11", 3);
    expect(series).toEqual([
      { date: "2026-06-09", count: 0 },
      { date: "2026-06-10", count: 0 },
      { date: "2026-06-11", count: 4 },
    ]);
  });

  it("returns [] for a bad end date", () => {
    expect(dailySeries({}, "nope", 7)).toEqual([]);
  });
});

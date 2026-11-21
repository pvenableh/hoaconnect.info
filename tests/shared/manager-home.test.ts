import { describe, expect, it } from "vitest";
import { areaForType, delegatedQueue, loadByArea, responseHoursSeries } from "#core/shared/home/manager-home";

const r = (id: string, type: string, status: string, created: string, updated = created) => ({
  id, type, status, date_created: created, date_updated: updated,
});

describe("manager home", () => {
  it("maps violations to their own area and the rest to inquiries", () => {
    expect(areaForType("violation")).toBe("violations");
    expect(areaForType("maintenance")).toBe("inquiries");
  });

  it("queues open items oldest first and hides areas the manager cannot work", () => {
    const rows = [
      r("new", "question", "open", "2026-11-10"),
      r("old", "maintenance", "in_progress", "2026-10-01"),
      r("done", "question", "resolved", "2026-09-01"),
      r("viol", "violation", "open", "2026-09-15"),
    ];
    expect(delegatedQueue(rows, () => true).map((x) => x.id)).toEqual(["viol", "old", "new"]);
    expect(delegatedQueue(rows, (a) => a === "inquiries").map((x) => x.id)).toEqual(["old", "new"]);
  });

  it("counts open items per area, busiest first, keeping empty areas", () => {
    const q = [r("a", "question", "open", "2026-11-01"), r("b", "maintenance", "open", "2026-11-02")];
    const bars = loadByArea(q, ["violations", "inquiries"]);
    expect(bars.map((b) => [b.area, b.open])).toEqual([["inquiries", 2], ["violations", 0]]);
  });

  it("averages hours to finish by week and carries a quiet week forward", () => {
    const asOf = new Date("2026-11-21T12:00:00Z");
    const rows = [
      r("a", "question", "resolved", "2026-11-19T00:00:00Z", "2026-11-20T00:00:00Z"), // 24h, last week bucket
      r("b", "question", "closed", "2026-11-18T00:00:00Z", "2026-11-20T12:00:00Z"), // 60h
      r("c", "question", "resolved", "2026-11-01T00:00:00Z", "2026-11-03T00:00:00Z"), // 48h, third week back
      r("open", "question", "open", "2026-11-01T00:00:00Z"),
    ];
    const s = responseHoursSeries(rows, asOf, 4);
    expect(s).toHaveLength(4);
    expect(s[3]).toBe(42);
    expect(s[0]).toBe(0);
    expect(s[1]).toBe(48);
    expect(s[2]).toBe(48);
  });
});

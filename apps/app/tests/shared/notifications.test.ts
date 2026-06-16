import { describe, it, expect } from "vitest";
import {
  sortByDateDesc,
  unreadCount,
  unreadCountByType,
  dateBucket,
  groupByDate,
  notificationTargetPath,
  type NotificationLike,
} from "#core/shared/notifications/grouping";

// Fixed "now" so date bucketing is deterministic: Thu 2026-06-11 09:00 local.
const NOW = new Date(2026, 5, 11, 9, 0, 0);

function n(over: Partial<NotificationLike> = {}): NotificationLike {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    type: over.type ?? "announcement",
    date: over.date ?? NOW.toISOString(),
    isRead: over.isRead ?? false,
    priority: over.priority,
    metadata: over.metadata ?? {},
  };
}

describe("sortByDateDesc", () => {
  it("orders newest first", () => {
    const list = [
      n({ id: "a", date: "2026-06-01T00:00:00Z" }),
      n({ id: "b", date: "2026-06-10T00:00:00Z" }),
      n({ id: "c", date: "2026-06-05T00:00:00Z" }),
    ];
    expect(sortByDateDesc(list).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("pushes undated/garbage to the end and does not mutate input", () => {
    const list = [n({ id: "good", date: "2026-06-10T00:00:00Z" }), n({ id: "bad", date: "nope" })];
    const sorted = sortByDateDesc(list);
    expect(sorted.map((x) => x.id)).toEqual(["good", "bad"]);
    expect(list.map((x) => x.id)).toEqual(["good", "bad"]); // original untouched
  });
});

describe("unread counts", () => {
  const list = [
    n({ type: "request", isRead: false }),
    n({ type: "request", isRead: true }),
    n({ type: "payment", isRead: false }),
    n({ type: "task", isRead: false }),
  ];
  it("counts all unread", () => {
    expect(unreadCount(list)).toBe(3);
  });
  it("counts unread for a single type", () => {
    expect(unreadCountByType(list, "request")).toBe(1);
    expect(unreadCountByType(list, "payment")).toBe(1);
    expect(unreadCountByType(list, "task")).toBe(1);
    expect(unreadCountByType(list, "meeting")).toBe(0);
  });
});

describe("dateBucket", () => {
  it("classifies today/yesterday/this-week/older", () => {
    expect(dateBucket(new Date(2026, 5, 11, 8, 0, 0).toISOString(), NOW)).toBe("today");
    expect(dateBucket(new Date(2026, 5, 10, 23, 0, 0).toISOString(), NOW)).toBe("yesterday");
    expect(dateBucket(new Date(2026, 5, 7, 12, 0, 0).toISOString(), NOW)).toBe("week");
    expect(dateBucket(new Date(2026, 4, 1, 12, 0, 0).toISOString(), NOW)).toBe("earlier");
  });
  it("treats garbage dates as older", () => {
    expect(dateBucket("nope", NOW)).toBe("earlier");
  });
});

describe("groupByDate", () => {
  it("returns ordered, non-empty sections newest-first within each", () => {
    const list = [
      n({ id: "old", date: new Date(2026, 4, 1).toISOString() }),
      n({ id: "today1", date: new Date(2026, 5, 11, 1).toISOString() }),
      n({ id: "today2", date: new Date(2026, 5, 11, 7).toISOString() }),
      n({ id: "yest", date: new Date(2026, 5, 10, 12).toISOString() }),
    ];
    const groups = groupByDate(list, NOW);
    expect(groups.map((g) => g.key)).toEqual(["today", "yesterday", "earlier"]);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].items.map((x) => x.id)).toEqual(["today2", "today1"]);
    expect(groups[1].items.map((x) => x.id)).toEqual(["yest"]);
  });

  it("omits empty buckets entirely", () => {
    const groups = groupByDate([n({ date: new Date(2026, 5, 11).toISOString() })], NOW);
    expect(groups.map((g) => g.key)).toEqual(["today"]);
  });
});

describe("notificationTargetPath", () => {
  it("routes requests to their detail or list", () => {
    expect(notificationTargetPath(n({ type: "request", metadata: { requestId: "r1" } }))).toBe("/requests/r1");
    expect(notificationTargetPath(n({ type: "request", metadata: {} }))).toBe("/requests");
  });
  it("routes tasks to their project", () => {
    expect(notificationTargetPath(n({ type: "task", metadata: { projectId: "p1" } }))).toBe("/projects/p1");
    expect(notificationTargetPath(n({ type: "task", metadata: {} }))).toBe("/projects");
  });
  it("routes mentions to the channel with a message anchor", () => {
    expect(
      notificationTargetPath(n({ type: "mention", metadata: { channelId: "c1", messageId: "m1" } }))
    ).toBe("/admin/channels/c1#message-m1");
    expect(notificationTargetPath(n({ type: "mention", metadata: {} }))).toBe("/admin/channels");
  });
  it("routes comments by their target collection", () => {
    expect(
      notificationTargetPath(
        n({ type: "comment", metadata: { commentTargetCollection: "hoa_requests", commentTargetId: "r9" } })
      )
    ).toBe("/requests/r9");
    expect(
      notificationTargetPath(n({ type: "comment", metadata: { commentTargetCollection: "hoa_meetings" } }))
    ).toBe("/meetings");
    expect(
      notificationTargetPath(n({ type: "comment", metadata: { commentTargetCollection: "unknown_thing" } }))
    ).toBeNull();
  });
  it("maps simple types and returns null for unknowns", () => {
    expect(notificationTargetPath(n({ type: "payment" }))).toBe("/payments");
    expect(notificationTargetPath(n({ type: "announcement" }))).toBe("/announcements");
    expect(notificationTargetPath(n({ type: "membership" }))).toBe("/admin/members");
    expect(notificationTargetPath(n({ type: "weird" }))).toBeNull();
  });
});

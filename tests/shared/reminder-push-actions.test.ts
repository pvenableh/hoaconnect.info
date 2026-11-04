/**
 * The buttons on a reminder's push (Phase 6): dues → Pay, meeting → Add to
 * calendar, request → Open; the rest get none. And the payload they end up in.
 */
import { describe, expect, it } from "vitest";
import { meetingCalendarPath, reminderPushActions } from "#core/shared/reminders/messages";
import { buildPushPayload } from "#core/shared/notifications/push";

const ORG = { id: "o1", slug: "oak", name: "Oak Court" };

describe("reminderPushActions", () => {
  it("dues → Pay, to the payments page", () => {
    expect(reminderPushActions({ rule: "dues", path: "/payments", entities: [{ collection: "payment_requests", id: "c1" }] })).toEqual([
      { action: "pay", title: "Pay", path: "/payments" },
    ]);
  });

  it("meeting → Add to calendar, to that meeting's .ics (a root path, not under the slug)", () => {
    const a = reminderPushActions({ rule: "meeting", path: "/meetings", entities: [{ collection: "hoa_meetings", id: "m 1" }] });
    expect(a).toEqual([{ action: "calendar", title: "Add to calendar", path: "/api/meetings/m%201/calendar", root: true }]);
    expect(a[0]!.path).toBe(meetingCalendarPath("m 1"));
  });

  it("a meeting reminder with no meeting entity gets no button rather than a dead one", () => {
    expect(reminderPushActions({ rule: "meeting", path: "/meetings", entities: [] })).toEqual([]);
  });

  it("request → Open, to the request's own page", () => {
    expect(reminderPushActions({ rule: "request", path: "/requests/r9", entities: [{ collection: "hoa_requests", id: "r9" }] })).toEqual([
      { action: "open", title: "Open", path: "/requests/r9" },
    ]);
  });

  it.each(["violation", "poll", "coverage"] as const)("%s → none", (rule) => {
    expect(reminderPushActions({ rule, path: "/x", entities: [] })).toEqual([]);
  });

  it("end to end: the payload a dues reminder sends", () => {
    const p = buildPushPayload({
      title: "Due today: $450.00",
      body: "$450.00 is due today.",
      org: ORG,
      path: "/payments",
      origin: "https://app.test",
      collection: "payment_requests",
      item: "c1",
      actions: reminderPushActions({ rule: "dues", path: "/payments", entities: [{ collection: "payment_requests", id: "c1" }] }),
    });
    expect(p).toMatchObject({
      tag: "payment_requests:c1",
      url: "https://app.test/oak/payments",
      actions: [{ action: "pay", title: "Pay", url: "https://app.test/oak/payments" }],
    });
  });
});

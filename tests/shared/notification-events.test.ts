/**
 * What counts as news, and what a member reads when it is.
 *
 * The planner is the half of the notify-event path that decides everything a
 * caller must NOT be able to choose — the copy, the category, the audience — so
 * it is pure and tested here without a Directus anywhere near it. The other
 * half (turning an audience descriptor into user ids) needs the database and
 * lives in `core/server/utils/notification-events.ts`.
 *
 * The bias under most of these cases: returning null is the normal answer.
 * Drafts, edits and republishes are not news, and a client that fires on every
 * save should get silence rather than a fan-out.
 */

import { describe, it, expect } from "vitest";
import {
  planNotifyEvent,
  isNotifiableCollection,
  formatMeetingDate,
  NOTIFIABLE_COLLECTIONS,
} from "#core/shared/notifications/events";

const plan = (
  collection: string,
  item: Record<string, unknown>,
  action: "create" | "update" = "create"
) => planNotifyEvent({ collection, action, item, itemId: String(item.id ?? "item-1") });

describe("what a client is allowed to announce", () => {
  it("accepts the three browser-written collections", () => {
    for (const c of NOTIFIABLE_COLLECTIONS) expect(isNotifiableCollection(c)).toBe(true);
  });

  it("refuses announcements even though the planner understands them", () => {
    // The AI executor creates announcements server-side, so a plan exists. No
    // browser should be able to address the whole community by naming a row.
    expect(isNotifiableCollection("hoa_announcements")).toBe(false);
    expect(plan("hoa_announcements", { id: "a1", status: "published", title: "Roof work" })).not.toBeNull();
  });

  it("refuses anything else, including a plausible-looking collection", () => {
    expect(isNotifiableCollection("hoa_requests")).toBe(false);
    expect(isNotifiableCollection("directus_users")).toBe(false);
    expect(isNotifiableCollection("")).toBe(false);
  });

  it("plans nothing for a collection with no plan", () => {
    expect(plan("hoa_requests", { id: "r1", title: "Leak" })).toBeNull();
  });

  it("plans nothing without an id to point at", () => {
    expect(planNotifyEvent({ collection: "hoa_meetings", action: "update", item: { is_published: true }, itemId: "" })).toBeNull();
  });
});

describe("mentions", () => {
  const mention = {
    id: "m1",
    mentioned_user: "u-recipient",
    mentioned_by: { id: "u-author", first_name: "Dana", last_name: "Reyes" },
    channel: { id: "c1", name: "Maintenance" },
    message: { id: "msg1", content: "<p>Can <strong>you</strong> look at   this?</p>" },
  };

  it("addresses the mentioned person and nobody else", () => {
    const p = plan("hoa_channel_mentions", mention)!;
    expect(p.audience).toEqual({ kind: "user", id: "u-recipient" });
    expect(p.category).toBe("mention");
    expect(p.actorId).toBe("u-author");
  });

  it("quotes the message with its markup stripped and whitespace collapsed", () => {
    const p = plan("hoa_channel_mentions", mention)!;
    expect(p.subject).toBe("Dana Reyes mentioned you");
    expect(p.message).toBe('In Maintenance: "Can you look at this?"');
  });

  it("still says something useful when the message body is missing", () => {
    const p = plan("hoa_channel_mentions", { ...mention, message: null })!;
    expect(p.message).toBe("Dana Reyes mentioned you in Maintenance.");
  });

  it("deep-links to the channel, falling back to the roster", () => {
    expect(plan("hoa_channel_mentions", mention)!.path).toBe("/admin/channels/c1");
    expect(plan("hoa_channel_mentions", { ...mention, channel: null })!.path).toBe("/admin/channels");
  });

  it("fires every time — each mention is genuinely new", () => {
    expect(plan("hoa_channel_mentions", mention)!.once).toBe(false);
  });

  it("says nothing without a recipient, and nothing on an update", () => {
    expect(plan("hoa_channel_mentions", { ...mention, mentioned_user: null })).toBeNull();
    expect(plan("hoa_channel_mentions", mention, "update")).toBeNull();
  });
});

describe("meetings", () => {
  const meeting = {
    id: "mt1",
    title: "Q3 budget review",
    type: "board",
    is_published: true,
    target_audience: "owners",
    meeting_date: "2026-03-04T18:00:00.000Z",
  };

  it("is news only once it is published", () => {
    expect(plan("hoa_meetings", { ...meeting, is_published: false }, "update")).toBeNull();
    expect(plan("hoa_meetings", meeting, "update")).not.toBeNull();
  });

  it("goes to the audience the meeting itself names", () => {
    const p = plan("hoa_meetings", meeting, "update")!;
    expect(p.audience).toEqual({ kind: "org-audience", audience: "owners" });
    expect(p.category).toBe("meeting");
  });

  it("defaults to the whole community when no audience is set", () => {
    const p = plan("hoa_meetings", { ...meeting, target_audience: null }, "update")!;
    expect(p.audience).toEqual({ kind: "org-audience", audience: "all" });
  });

  it("announces at most once, so a republish is not a second notice", () => {
    expect(plan("hoa_meetings", meeting, "update")!.once).toBe(true);
  });

  it("names the meeting type and carries the date in the body", () => {
    const p = plan("hoa_meetings", meeting, "update")!;
    expect(p.subject).toBe("Board meeting scheduled");
    expect(p.message).toContain("Q3 budget review");
    expect(p.message).toContain("—");
  });

  it("falls back to a generic label for an unknown type", () => {
    expect(plan("hoa_meetings", { ...meeting, type: "workshop" }, "update")!.subject).toBe(
      "Meeting scheduled"
    );
  });

  it("omits the date rather than printing an invalid one", () => {
    const p = plan("hoa_meetings", { ...meeting, meeting_date: "not a date" }, "update")!;
    expect(p.message).toBe("Q3 budget review");
    expect(formatMeetingDate("not a date")).toBe("");
    expect(formatMeetingDate(null)).toBe("");
  });
});

describe("comments", () => {
  const comment = {
    id: "c1",
    status: "published",
    body: "<p>I'll take a look tomorrow.</p>",
    target_collection: "hoa_requests",
    target_id: "req-9",
    user_created: { id: "u-author", first_name: "Sam", last_name: "Ito" },
  };

  it("reaches the people already on that target", () => {
    const p = plan("hoa_comments", comment)!;
    expect(p.audience).toEqual({ kind: "participants", collection: "hoa_requests", id: "req-9" });
    expect(p.category).toBe("comment");
    expect(p.actorId).toBe("u-author");
  });

  it("deep-links to the target, not to the comment row", () => {
    expect(plan("hoa_comments", comment)!.path).toBe("/requests/req-9");
    expect(plan("hoa_comments", { ...comment, target_collection: "hoa_meetings" })!.path).toBe("/meetings");
  });

  it("drops the link rather than guessing for an unmapped target", () => {
    expect(plan("hoa_comments", { ...comment, target_collection: "hoa_projects" })!.path).toBeNull();
  });

  it("says nothing for a draft or a deleted comment", () => {
    expect(plan("hoa_comments", { ...comment, status: "draft" })).toBeNull();
    expect(plan("hoa_comments", { ...comment, status: "deleted" })).toBeNull();
  });

  it("says nothing without a target to point at", () => {
    expect(plan("hoa_comments", { ...comment, target_id: null })).toBeNull();
    expect(plan("hoa_comments", { ...comment, target_collection: "" })).toBeNull();
  });

  it("plans an internal note the same way — who sees it is the resolver's call", () => {
    // `is_internal` narrows the audience server-side (staff only). The copy and
    // the category are identical, so the flag doesn't leak into the plan.
    const internal = plan("hoa_comments", { ...comment, is_internal: true })!;
    expect(internal.audience).toEqual(plan("hoa_comments", comment)!.audience);
    expect(internal.subject).toBe("Sam Ito commented");
  });
});

describe("announcements (server-created only)", () => {
  const announcement = {
    id: "a1",
    status: "published",
    title: "Elevator maintenance Thursday",
    content: "<p>The east elevator will be out from 9am.</p>",
    target_audience: "all",
  };

  it("is news only once published", () => {
    expect(plan("hoa_announcements", { ...announcement, status: "draft" })).toBeNull();
  });

  it("goes to its audience, once, and lands in the building feed", () => {
    const p = plan("hoa_announcements", announcement)!;
    expect(p.category).toBe("announcement");
    expect(p.audience).toEqual({ kind: "org-audience", audience: "all" });
    expect(p.once).toBe(true);
    expect(p.path).toBe("/?tab=building");
  });

  it("uses the announcement's own title and a plain-text excerpt", () => {
    const p = plan("hoa_announcements", announcement)!;
    expect(p.subject).toBe("Elevator maintenance Thursday");
    expect(p.message).toBe("The east elevator will be out from 9am.");
  });
});

describe("excerpts stay inside a push payload", () => {
  it("truncates a long body on a boundary and marks the cut", () => {
    const long = "x".repeat(400);
    const p = plan("hoa_comments", {
      id: "c1",
      status: "published",
      body: long,
      target_collection: "hoa_requests",
      target_id: "r1",
    })!;
    expect(p.message.length).toBeLessThanOrEqual(140);
    expect(p.message.endsWith("…")).toBe(true);
  });
});

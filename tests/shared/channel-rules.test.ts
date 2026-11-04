import { describe, it, expect } from "vitest";
import {
  EDIT_WINDOW_MS,
  PRESENCE_TTL_MS,
  canOfferEdit,
  checkEditAllowed,
  collapsedSubject,
  dmPairKey,
  dmSlug,
  dmTitle,
  isPresent,
  isValidDmRoster,
  parseCollapsedCount,
  planChannelFanOut,
} from "#core/shared/channels/rules";

const NOW = new Date("2026-11-04T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("checkEditAllowed — the 15-minute window", () => {
  const base = { isAuthor: true, isManager: false, now: NOW, status: "published" };

  it("lets a member edit their own message inside the window", () => {
    expect(checkEditAllowed({ ...base, createdAt: ago(60_000) })).toEqual({ ok: true, moderated: false });
    expect(checkEditAllowed({ ...base, createdAt: ago(EDIT_WINDOW_MS) })).toEqual({ ok: true, moderated: false });
  });

  it("refuses a member outside the window (403 window_closed)", () => {
    expect(checkEditAllowed({ ...base, createdAt: ago(EDIT_WINDOW_MS + 1) })).toEqual({
      ok: false,
      status: 403,
      reason: "window_closed",
    });
  });

  it("refuses when the timestamp can't prove the message is recent", () => {
    expect(checkEditAllowed({ ...base, createdAt: null })).toMatchObject({ ok: false, reason: "window_closed" });
    expect(checkEditAllowed({ ...base, createdAt: "garbage" })).toMatchObject({ ok: false, reason: "window_closed" });
  });

  it("a manager editing their own message has no window and is not moderation", () => {
    expect(checkEditAllowed({ ...base, isManager: true, createdAt: ago(30 * 86_400_000) })).toEqual({
      ok: true,
      moderated: false,
    });
  });

  it("a manager editing someone else's message is allowed and is moderation", () => {
    expect(checkEditAllowed({ ...base, isAuthor: false, isManager: true, createdAt: ago(86_400_000) })).toEqual({
      ok: true,
      moderated: true,
    });
  });

  it("refuses a member editing someone else's message (403 not_yours), even a fresh one", () => {
    expect(checkEditAllowed({ ...base, isAuthor: false, createdAt: ago(1000) })).toEqual({
      ok: false,
      status: 403,
      reason: "not_yours",
    });
  });

  it("refuses a hidden/deleted message for everyone, managers included (409)", () => {
    expect(checkEditAllowed({ ...base, isManager: true, status: "deleted", createdAt: ago(1000) })).toEqual({
      ok: false,
      status: 409,
      reason: "not_editable",
    });
  });

  it("canOfferEdit mirrors the rule for the button", () => {
    expect(canOfferEdit({ ...base, createdAt: ago(1000) })).toBe(true);
    expect(canOfferEdit({ ...base, createdAt: ago(EDIT_WINDOW_MS + 5000) })).toBe(false);
  });
});

describe("presence", () => {
  it("a beat is good for the TTL and a little clock skew", () => {
    expect(isPresent(ago(0), NOW)).toBe(true);
    expect(isPresent(ago(PRESENCE_TTL_MS), NOW)).toBe(true);
    expect(isPresent(ago(PRESENCE_TTL_MS + 1), NOW)).toBe(false);
    expect(isPresent(ago(-3000), NOW)).toBe(true);
    expect(isPresent(ago(-60_000), NOW)).toBe(false);
  });

  it("no stamp, or a bad one, is absent", () => {
    expect(isPresent(null, NOW)).toBe(false);
    expect(isPresent(undefined, NOW)).toBe(false);
    expect(isPresent("nope", NOW)).toBe(false);
  });
});

describe("planChannelFanOut", () => {
  const members = [
    { user: "author" },
    { user: "a" },
    { user: "muted", notifications_enabled: false },
    { user: "reading", present_at: ago(20_000) },
    { user: "gone", present_at: ago(5 * 60_000) },
    { user: "mentioned" },
    { user: "default-on", notifications_enabled: null },
    { user: "a" }, // a duplicate roster row
  ];

  it("excludes the author, the muted, the present and the mentioned", () => {
    expect(planChannelFanOut({ members, authorId: "author", mentionedIds: ["mentioned"], now: NOW })).toEqual([
      "a",
      "gone",
      "default-on",
    ]);
  });

  it("only ever returns people on the roster", () => {
    expect(planChannelFanOut({ members: [{ user: "a" }], authorId: "x", mentionedIds: ["outsider"], now: NOW })).toEqual(["a"]);
  });

  it("an empty roster notifies nobody", () => {
    expect(planChannelFanOut({ members: [], authorId: "x", now: NOW })).toEqual([]);
  });
});

describe("collapsed bell subject", () => {
  it("reads '3 new in #board' and round-trips its count", () => {
    expect(collapsedSubject({ count: 3, channelName: "board" })).toBe("3 new in #board");
    expect(collapsedSubject({ count: 1, channelName: "#board" })).toBe("1 new in #board");
    expect(parseCollapsedCount("3 new in #board")).toBe(3);
  });

  it("a DM reads 'N new from <name>'", () => {
    expect(collapsedSubject({ count: 2, channelName: "x", isDm: true, authorName: "Ana Ruiz" })).toBe("2 new from Ana Ruiz");
    expect(parseCollapsedCount("2 new from Ana Ruiz")).toBe(2);
  });

  it("doesn't mistake other subjects for a collapsed row", () => {
    expect(parseCollapsedCount("Alex mentioned you")).toBe(0);
    expect(parseCollapsedCount(null)).toBe(0);
  });
});

describe("direct messages", () => {
  it("the pair key and slug are the same whoever starts it", () => {
    expect(dmPairKey("b", "a")).toBe(dmPairKey("a", "b"));
    expect(dmSlug("u-2", "u-1")).toBe(dmSlug("u-1", "u-2"));
    expect(dmSlug("u-1", "u-2")).toMatch(/^dm-[a-z0-9-]+$/);
  });

  it("a roster is valid only as exactly the two people", () => {
    expect(isValidDmRoster(["a", "b"], ["a", "b"])).toBe(true);
    expect(isValidDmRoster(["a", "b", "c"], ["a", "b"])).toBe(false);
    expect(isValidDmRoster(["a"], ["a", "b"])).toBe(false);
    expect(isValidDmRoster(["a", "c"], ["a", "b"])).toBe(false);
  });

  it("titles a DM with the other person's name", () => {
    const roster = [
      { user: "me", first_name: "Me", last_name: "Myself" },
      { user: "ana", first_name: "Ana", last_name: "Ruiz" },
    ];
    expect(dmTitle(roster, "me")).toBe("Ana Ruiz");
    expect(dmTitle([{ user: "ana" }, { user: "me" }], "me")).toBe("Direct message");
  });
});

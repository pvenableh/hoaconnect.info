/**
 * `/api/org/notify-event` lets a browser say "this row is news". That is a
 * deliberately small amount of trust — the caller names a row and nothing else —
 * but it is still the first place in this app where a client can start a
 * community-wide fan-out, so the boundary is worth pinning down.
 *
 * Two things must hold, and they are different from each other:
 *
 *   1. The org comes from the ROW, never from the caller. Otherwise "I'm a
 *      member of org A" plus "notify about org B's meeting" is a leak with two
 *      valid halves.
 *   2. Authorization runs BEFORE anything is resolved or written. A refusal has
 *      to cost the pointed-at community nothing — no recipient read, no bell.
 *
 * These exercise `announceEvent`, which is where both live; the route is a thin
 * wrapper that supplies `authorize` from `checkMembership`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query: unknown) => ({ op: "readOne", collection, id, query }),
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
  readNotifications: (query: unknown) => ({ op: "readNotifications", collection: "directus_notifications", query }),
}));

const notified: Array<{ organizationId: string; recipientUserIds: string[]; category: string }> = [];
vi.mock("#core/server/utils/notify", () => ({
  notifyUsers: async (opts: any) => {
    notified.push(opts);
    return { bell: opts.recipientUserIds.length, push: 0, email: 0 };
  },
}));

const HOME = "org-home";
const OTHER = "org-other";

type Op = { op: string; collection: string; id?: string; query?: any };
let ops: Op[];

/** The meeting under test, and which org owns it. */
let meetingOrg: string;
/** Existing bell rows for the (collection, item) pair — drives the `once` guard. */
let existingNotifications: number;

beforeEach(() => {
  vi.resetModules();
  ops = [];
  notified.length = 0;
  meetingOrg = HOME;
  existingNotifications = 0;

  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { directusRoleHoaAdmin: "role-admin", directusRolePropertyManager: "role-pm" },
  }));

  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      ops.push(desc);
      if (desc.op === "readOne" && desc.collection === "hoa_meetings") {
        return {
          id: "meeting-1",
          title: "Q3 budget review",
          type: "board",
          is_published: true,
          target_audience: "all",
          organization: meetingOrg,
          user_created: "u-author",
        };
      }
      if (desc.op === "readNotifications") {
        return Array.from({ length: existingNotifications }, (_, i) => ({ id: `n${i}` }));
      }
      if (desc.collection === "hoa_members") {
        return [{ user: "u-member-1" }, { user: "u-member-2" }];
      }
      return [];
    },
  }));

  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const load = async () => (await import("#core/server/utils/notification-events")).announceEvent;

const announceMeeting = (authorize?: (orgId: string) => boolean) => ({
  collection: "hoa_meetings",
  action: "update" as const,
  itemId: "meeting-1",
  ...(authorize ? { authorize } : {}),
});

describe("the org comes from the row, not the caller", () => {
  it("notifies when the caller belongs to the row's community", async () => {
    const announceEvent = await load();
    const res = await announceEvent(announceMeeting((orgId) => orgId === HOME));

    expect(res.ok).toBe(true);
    expect(notified).toHaveLength(1);
    expect(notified[0]!.organizationId).toBe(HOME);
    expect(notified[0]!.recipientUserIds).toEqual(["u-member-1", "u-member-2"]);
  });

  it("refuses when the row belongs to a community the caller is not in", async () => {
    // The failure this exists for: a member of org A pointing at org B's
    // meeting. The membership check is real — it is just answering about the
    // wrong org unless the org is read off the row first.
    meetingOrg = OTHER;
    const seen: string[] = [];

    const announceEvent = await load();
    const res = await announceEvent(
      announceMeeting((orgId) => {
        seen.push(orgId);
        return orgId === HOME; // caller's real membership
      })
    );

    expect(seen).toEqual([OTHER]); // asked about the ROW's org
    expect(res).toEqual({ ok: false, reason: "not authorized for this organization" });
    expect(notified).toHaveLength(0);
  });

  it("spends nothing on the other community when it refuses", async () => {
    meetingOrg = OTHER;
    const announceEvent = await load();
    await announceEvent(announceMeeting(() => false));

    // The row read is unavoidable — it is how we learn the org. Everything
    // after it must not happen.
    expect(ops.map((o) => o.op)).toEqual(["readOne"]);
  });

  it("authorizes before resolving recipients, not after filtering them", async () => {
    const announceEvent = await load();
    let authorizedAt = -1;
    await announceEvent(
      announceMeeting(() => {
        authorizedAt = ops.length;
        return true;
      })
    );
    const firstMemberRead = ops.findIndex((o) => o.collection === "hoa_members");
    expect(authorizedAt).toBeGreaterThanOrEqual(0);
    expect(firstMemberRead).toBeGreaterThan(authorizedAt - 1);
  });

  it("runs unauthorized for server-internal callers that pass no gate", async () => {
    // `announceEvent` is called directly from the AI action executor, which is
    // already past its own authorization. Omitting `authorize` must mean
    // "already checked", not "check nothing by accident" — so it is a distinct,
    // deliberate call shape rather than a default.
    const announceEvent = await load();
    const res = await announceEvent(announceMeeting());
    expect(res.ok).toBe(true);
    expect(notified[0]!.organizationId).toBe(HOME);
  });
});

describe("nothing to say is not an error", () => {
  it("reports an unreadable row without throwing", async () => {
    vi.stubGlobal("getTypedDirectus", () => ({
      request: async () => {
        throw new Error("gone");
      },
    }));
    const announceEvent = await load();
    expect(await announceEvent(announceMeeting(() => true))).toEqual({
      ok: false,
      reason: "item not readable",
    });
  });

  it("refuses a collection with no plan at all", async () => {
    const announceEvent = await load();
    const res = await announceEvent({
      collection: "directus_users",
      action: "create",
      itemId: "u1",
      authorize: () => true,
    });
    expect(res).toEqual({ ok: false, reason: "collection is not notifiable" });
    expect(ops).toHaveLength(0);
  });

  it("stays quiet on a republish that already announced", async () => {
    existingNotifications = 1;
    const announceEvent = await load();
    const res = await announceEvent(announceMeeting(() => true));
    expect(res).toEqual({ ok: false, reason: "already announced" });
    expect(notified).toHaveLength(0);
  });

  it("announces anyway when the dedupe check itself fails", async () => {
    // A duplicate notice is a far smaller harm than a lost one, so the guard
    // fails open — the opposite direction from the tenancy check above.
    vi.stubGlobal("getTypedDirectus", () => ({
      request: async (desc: Op) => {
        ops.push(desc);
        if (desc.op === "readNotifications") throw new Error("notifications unreadable");
        if (desc.op === "readOne") {
          return { id: "meeting-1", title: "T", is_published: true, organization: HOME };
        }
        return [{ user: "u-member-1" }];
      },
    }));
    const announceEvent = await load();
    const res = await announceEvent(announceMeeting(() => true));
    expect(res.ok).toBe(true);
    expect(notified).toHaveLength(1);
  });
});

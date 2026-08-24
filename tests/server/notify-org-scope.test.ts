/**
 * A notification is addressed to a PERSON but branded as a COMMUNITY, so the
 * one thing the send path must never do is put one community's message in
 * front of another community's member.
 *
 * `notifyUsers` takes user ids from its callers, and some of those callers
 * derive them from rows that arrived in a request body. `organizationId` is
 * what the push payload is branded and deep-linked with, so an unchecked id
 * receives THIS community's message under THIS community's name.
 *
 * The subtle one, and the reason the gate's POSITION is tested and not just
 * its existence: the preferences read below it deliberately fails OPEN — an
 * unreadable preference falls back to notifying everyone rather than losing a
 * durable bell row. Put the tenancy filter inside or after that block and a
 * preference read failure hands the fallback the unfiltered list, turning a
 * convenience into a bypass.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
  readUsers: (query: unknown) => ({ op: "readUsers", collection: "directus_users", query }),
  readItem: (collection: string, id: string, query: unknown) => ({ op: "readOne", collection, id, query }),
  createNotification: (data: any) => ({ op: "bell", collection: "directus_notifications", data }),
}));

const pushed: Array<{ userId: string }> = [];
vi.mock("#core/server/utils/push", () => ({
  sendPushToUser: async (userId: string) => {
    pushed.push({ userId });
    return 1;
  },
}));

const ORG = "org-1";

type Op = { op: string; collection: string; data?: any; query?: any; id?: string };

let ops: Op[];
/** user ids with an hoa_members row in ORG */
let members: string[];
let failMembershipRead: boolean;
let failPreferenceRead: boolean;
/** Fail only the read that asks for `notification_preferences` (the 403 the
 *  retry exists for), so the reduced retry read succeeds. */
let failPreferenceFieldOnly: boolean;
let logs: { warn: unknown[][]; error: unknown[][] };

beforeEach(() => {
  vi.resetModules();
  ops = [];
  pushed.length = 0;
  members = [];
  failMembershipRead = false;
  failPreferenceRead = false;
  failPreferenceFieldOnly = false;
  logs = { warn: [], error: [] };

  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      ops.push(desc);
      if (desc.collection === "hoa_members") {
        if (failMembershipRead) throw new Error("membership read exploded");
        const wanted: string[] = desc.query?.filter?.user?._in ?? [];
        return members.filter((m) => wanted.includes(m)).map((user) => ({ user }));
      }
      if (desc.op === "readUsers") {
        if (failPreferenceRead) throw new Error("preferences unreadable");
        const fields: string[] = desc.query?.fields ?? [];
        if (failPreferenceFieldOnly && fields.includes("notification_preferences")) {
          throw new Error("field 403");
        }
        const wanted: string[] = desc.query?.filter?.id?._in ?? [];
        // No stored preferences → every category allowed by default.
        return wanted.map((id) => ({ id, notification_preferences: null }));
      }
      if (desc.op === "readOne" && desc.collection === "hoa_organizations") {
        return { id: ORG, slug: "harborview", name: "Harborview Lofts" };
      }
      return { ok: true };
    },
  }));

  vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void logs.warn.push(a));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logs.error.push(a));
});

const load = async () => (await import("#core/server/utils/notify")).notifyUsers;

const send = (recipientUserIds: string[]) =>
  ({
    organizationId: ORG,
    recipientUserIds,
    category: "task" as const,
    subject: "New task assigned",
    message: "You were assigned something.",
    path: "/admin/projects",
  });

const bellRecipients = () =>
  ops.filter((o) => o.op === "bell").map((o) => o.data.recipient);

describe("who actually receives a notification", () => {
  it("notifies a member of this community", async () => {
    members = ["insider"];
    const notifyUsers = await load();
    const res = await notifyUsers(send(["insider"]));

    expect(bellRecipients()).toEqual(["insider"]);
    expect(res.bell).toBe(1);
  });

  it("drops a user who has no membership here", async () => {
    members = ["insider"];
    const notifyUsers = await load();
    const res = await notifyUsers(send(["insider", "outsider"]));

    expect(bellRecipients()).toEqual(["insider"]);
    expect(pushed.map((p) => p.userId)).toEqual(["insider"]);
    expect(res.bell).toBe(1);
  });

  it("says so in the log rather than dropping silently", async () => {
    members = [];
    const notifyUsers = await load();
    await notifyUsers(send(["outsider"]));

    expect(logs.warn.flat().join(" ")).toMatch(/dropped 1 recipient/i);
  });

  it("sends nothing at all when every recipient is an outsider", async () => {
    members = ["someone-else"];
    const notifyUsers = await load();
    const res = await notifyUsers(send(["outsider"]));

    expect(res).toEqual({ bell: 0, push: 0, email: 0 });
    expect(ops.some((o) => o.op === "bell")).toBe(false);
    // And it stops before spending a preferences read on people it won't notify.
    expect(ops.some((o) => o.op === "readUsers")).toBe(false);
  });

  it("still honours excludeUserId", async () => {
    members = ["a", "b"];
    const notifyUsers = await load();
    await notifyUsers({ ...send(["a", "b"]), excludeUserId: "a" });

    expect(bellRecipients()).toEqual(["b"]);
  });
});

describe("the gate cannot be bypassed by the fail-open preferences path", () => {
  it("an unreadable preference falls back to bells for MEMBERS only", async () => {
    // The regression this exists for: the fallback re-sends to its input list,
    // so if the filter ran after it, the outsider would land in the fallback.
    members = ["insider"];
    failPreferenceRead = true;

    const notifyUsers = await load();
    const res = await notifyUsers(send(["insider", "outsider"]));

    expect(bellRecipients()).toEqual(["insider"]);
    expect(res).toEqual({ bell: 1, push: 0, email: 0 });
    expect(logs.warn.flat().join(" ")).toMatch(/bell-only fallback/);
  });

  it("filters before it reads preferences at all", async () => {
    members = ["insider"];
    const notifyUsers = await load();
    await notifyUsers(send(["insider", "outsider"]));

    const order = ops.map((o) => (o.collection === "hoa_members" ? "membership" : o.op));
    expect(order.indexOf("membership")).toBe(0);
    // The preferences read only ever sees the survivors.
    const prefRead = ops.find((o) => o.op === "readUsers")!;
    expect(prefRead.query.filter.id._in).toEqual(["insider"]);
  });

  it("the RETRY read inherits the same scoped list", async () => {
    // Phase 2b added a second read: when the `notification_preferences` field
    // alone 403s, the read is repeated without it rather than zeroing the
    // fan-out. That retry is a NEW place a recipient list gets used, and it
    // must be fed by the gate's output — not by the caller's `asked` list.
    // Structurally that holds because the gate is above the whole block; this
    // asserts it, so a later refactor that hoists the read can't quietly widen
    // the audience.
    members = ["insider"];
    failPreferenceFieldOnly = true;

    const notifyUsers = await load();
    const res = await notifyUsers(send(["insider", "outsider"]));

    const reads = ops.filter((o) => o.op === "readUsers");
    expect(reads).toHaveLength(2);
    expect(reads[1]!.query.fields).not.toContain("notification_preferences");
    for (const r of reads) expect(r.query.filter.id._in).toEqual(["insider"]);

    // And the retry's opt-in default really does reach both channels — the
    // point of the retry is that it does NOT degrade to bell-only.
    expect(bellRecipients()).toEqual(["insider"]);
    expect(pushed.map((p) => p.userId)).toEqual(["insider"]);
    expect(res.bell).toBe(1);
  });
});

describe("when the membership lookup itself fails", () => {
  it("sends to nobody rather than to everybody", async () => {
    // Deliberately the opposite of the preferences fallback next to it. There
    // the risk is a muted category; here it is one community's message reaching
    // another community's member, so a transient error becomes silence.
    members = ["insider"];
    failMembershipRead = true;

    const notifyUsers = await load();
    const res = await notifyUsers(send(["insider", "outsider"]));

    expect(res).toEqual({ bell: 0, push: 0, email: 0 });
    expect(ops.some((o) => o.op === "bell")).toBe(false);
    expect(pushed).toHaveLength(0);
  });

  it("logs the failure as an error, not a shrug", async () => {
    failMembershipRead = true;
    const notifyUsers = await load();
    await notifyUsers(send(["insider"]));

    expect(logs.error.flat().join(" ")).toMatch(/membership lookup failed/i);
  });
});

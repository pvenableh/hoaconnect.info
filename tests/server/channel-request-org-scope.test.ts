/**
 * The ids a channel or request route is handed must belong to the community the
 * route authorized against. Every one of these routes writes on the admin
 * client, so its own check is the only fence between communities:
 *
 *  - POST /api/hoa/channels/report — the caller must be able to read the
 *    channel, checked before the message is read; until 2026-11-12 any
 *    signed-in user could write `report` rows (with a message snippet) into
 *    another community's moderation log, and the 404/200 said whether a message
 *    id existed there;
 *  - POST /api/hoa/channels/invite — the invitee (and `hoa_member`) must be an
 *    active member of the channel's community;
 *  - POST /api/hoa/channels/create — the linked `request` / `project` and every
 *    `invite_users` entry must be the community's own, before the channel row;
 *  - POST /api/hoa/requests/manager-create — the `unit` and `member` must be the
 *    organization's own.
 *
 * Oscar administers Lenox and nothing else.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  readItem: (collection: string, id: string, query: any) => ({ op: "readItem", collection, id, query }),
  createItem: (collection: string, data: any) => ({ op: "createItem", collection, data }),
  createItems: (collection: string, data: any) => ({ op: "createItems", collection, data }),
}));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const report = (await import("#core/server/api/hoa/channels/report.post")).default as (e: H3Event) => Promise<any>;
const invite = (await import("#core/server/api/hoa/channels/invite.post")).default as (e: H3Event) => Promise<any>;
const create = (await import("#core/server/api/hoa/channels/create.post")).default as (e: H3Event) => Promise<any>;
const managerCreate = (await import("#core/server/api/hoa/requests/manager-create.post")).default as (
  e: H3Event
) => Promise<any>;

const ME = "u-oscar";
const LENOX = "org-lenox";
const OTHER = "org-other";

const idOf = (v: any) => (v == null ? null : typeof v === "string" ? v : (v.id ?? null));

// Just enough of a Directus filter for these routes: field → { _eq | _in | _neq }.
function matches(row: any, filter: any): boolean {
  return Object.entries(filter ?? {}).every(([field, cond]: [string, any]) => {
    if (field === "_and") return (cond as any[]).every((f) => matches(row, f));
    const v = idOf(row[field]);
    if ("_eq" in cond) return v === cond._eq;
    if ("_in" in cond) return cond._in.includes(v);
    if ("_neq" in cond) return v !== cond._neq;
    return true;
  });
}

const TABLES: Record<string, any[]> = {
  hoa_channels: [
    { id: "ch-lenox", organization: LENOX, is_private: false, status: "published" },
    { id: "ch-lenox-private", organization: LENOX, is_private: true, status: "published" },
    { id: "ch-other", organization: OTHER, is_private: false, status: "published" },
  ],
  hoa_channel_messages: [
    { id: "msg-lenox", content: "Lenox hello", user_created: { id: "u-ana" }, channel: { id: "ch-lenox", organization: { id: LENOX } } },
    { id: "msg-lenox-private", content: "Private hello", user_created: { id: "u-ana" }, channel: { id: "ch-lenox-private", organization: { id: LENOX } } },
    { id: "msg-other", content: "Other secret", user_created: { id: "u-bea" }, channel: { id: "ch-other", organization: { id: OTHER } } },
  ],
  hoa_channel_members: [],
  hoa_members: [
    { id: "m-oscar", user: ME, organization: LENOX, status: "active" },
    { id: "m-ana", user: "u-ana", organization: LENOX, status: "active" },
    { id: "m-cal", user: "u-cal", organization: LENOX, status: "inactive" },
    { id: "m-bea", user: "u-bea", organization: OTHER, status: "active" },
  ],
  hoa_requests: [
    { id: "req-lenox", organization: LENOX },
    { id: "req-other", organization: OTHER },
  ],
  hoa_projects: [
    { id: "proj-lenox", organization: LENOX },
    { id: "proj-other", organization: OTHER },
  ],
  hoa_units: [
    { id: "unit-lenox", organization: LENOX },
    { id: "unit-other", organization: OTHER },
  ],
};

let ops: Array<{ op: string; collection: string; data?: any }>;
let logged: any[];
let body: any;
let channelMembers: any[];

const reads = (collection: string) => ops.filter((o) => o.op === "readItems" && o.collection === collection);
const writes = () => ops.filter((o) => o.op === "createItem" || o.op === "createItems");

beforeEach(() => {
  ops = [];
  logged = [];
  body = {};
  channelMembers = [];
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: ME }));
  vi.stubGlobal("checkAdminAccess", async (_e: unknown, org: string) =>
    org === LENOX ? { isAdmin: true, memberId: "m-oscar" } : { isAdmin: false }
  );
  vi.stubGlobal("isActiveBoardMember", async () => false);
  // The real one: admin/board of the channel's org (or channel admin) → that org id.
  vi.stubGlobal("requireChannelManager", async (_e: unknown, _d: unknown, _u: string, channelId: string) => {
    const org = TABLES.hoa_channels.find((c) => c.id === channelId)?.organization;
    if (!org) throw Object.assign(new Error("Channel not found"), { statusCode: 404 });
    if (org !== LENOX) throw Object.assign(new Error("Not allowed"), { statusCode: 403 });
    return org;
  });
  vi.stubGlobal("refuseIfDirectMessage", async () => {});
  vi.stubGlobal("getOrgChannelEnrollees", async () => [{ user: ME, hoa_member: "m-oscar" }]);
  vi.stubGlobal("logChannelModeration", async (e: any) => void logged.push(e));
  vi.stubGlobal("requireAdminOrManagerGrant", async (_e: unknown, org: string) => {
    if (org !== LENOX) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      ops.push(op);
      if (op.op === "readItems") {
        const table = op.collection === "hoa_channel_members" ? channelMembers : (TABLES[op.collection] ?? []);
        const rows = table.filter((r) => matches(r, op.query?.filter));
        return op.query?.limit > 0 ? rows.slice(0, op.query.limit) : rows;
      }
      if (op.op === "createItem") return { id: `new-${op.collection}`, ...op.data };
      if (op.op === "createItems") return op.data;
      return null;
    },
  }));
});

describe("POST /api/hoa/channels/report", () => {
  it("reports a message in a channel of the caller's own community", async () => {
    body = { channel: "ch-lenox", messageId: "msg-lenox", reason: "spam" };
    expect(await report({} as H3Event)).toEqual({ ok: true });
    expect(logged).toEqual([
      expect.objectContaining({ organization: LENOX, channel: "ch-lenox", action: "report", messageContent: "Lenox hello" }),
    ]);
  });

  it("refuses another community's channel without reading the message or logging", async () => {
    body = { channel: "ch-other", messageId: "msg-other" };
    await expect(report({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(reads("hoa_channel_messages")).toEqual([]);
    expect(logged).toEqual([]);
  });

  it("answers a real and a made-up message id in another community the same way", async () => {
    body = { channel: "ch-other", messageId: "msg-nope" };
    await expect(report({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(reads("hoa_channel_messages")).toEqual([]);
  });

  it("a private channel takes the caller's own membership row, not their admin role", async () => {
    body = { channel: "ch-lenox-private", messageId: "msg-lenox-private" };
    await expect(report({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(logged).toEqual([]);

    channelMembers = [{ id: "cm-1", channel: "ch-lenox-private", user: ME }];
    expect(await report({} as H3Event)).toEqual({ ok: true });
    expect(logged).toHaveLength(1);
  });
});

describe("POST /api/hoa/channels/invite", () => {
  it("adds an active member of the channel's community", async () => {
    body = { channel: "ch-lenox", user: "u-ana", hoa_member: "m-ana" };
    const res = await invite({} as H3Event);
    expect(res.created).toBe(true);
    expect(writes()).toEqual([
      expect.objectContaining({ op: "createItem", collection: "hoa_channel_members", data: expect.objectContaining({ user: "u-ana", hoa_member: "m-ana" }) }),
    ]);
  });

  it("refuses another community's member, and an inactive one, writing nothing", async () => {
    for (const user of ["u-bea", "u-cal"]) {
      body = { channel: "ch-lenox", user };
      await expect(invite({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(writes()).toEqual([]);
  });

  it("refuses another community's hoa_member row attached to an own-community user", async () => {
    body = { channel: "ch-lenox", user: "u-ana", hoa_member: "m-bea" };
    await expect(invite({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toEqual([]);
  });
});

describe("POST /api/hoa/channels/create", () => {
  const base = { organization: LENOX, name: "Ticket", slug: "ticket-1", is_private: false };

  it("creates a channel linked to the community's own request and project, inviting its own member", async () => {
    body = { ...base, request: "req-lenox", project: "proj-lenox", invite_users: ["u-ana"] };
    const res = await create({} as H3Event);
    expect(res.channel).toMatchObject({ organization: LENOX, request: "req-lenox", project: "proj-lenox" });
    const enrolled = writes().find((o) => o.op === "createItems")!.data.map((r: any) => r.user);
    expect(enrolled.sort()).toEqual(["u-ana", ME].sort());
  });

  it("refuses another community's request before writing anything", async () => {
    body = { ...base, request: "req-other" };
    await expect(create({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toEqual([]);
  });

  it("refuses another community's project before writing anything", async () => {
    body = { ...base, project: "proj-other" };
    await expect(create({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toEqual([]);
  });

  it("refuses an invitee who is not an active member of the community before writing anything", async () => {
    body = { ...base, invite_users: ["u-ana", "u-bea"] };
    await expect(create({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toEqual([]);
  });
});

describe("POST /api/hoa/requests/manager-create", () => {
  const base = { organization: LENOX, type: "violation", title: "Trash cans out" };

  it("creates a request about the organization's own unit and member", async () => {
    body = { ...base, unit: "unit-lenox", member: "m-ana" };
    const res = await managerCreate({} as H3Event);
    expect(res.request).toMatchObject({ organization: LENOX, unit: "unit-lenox", member: "m-ana" });
  });

  it("refuses another community's unit, writing nothing", async () => {
    body = { ...base, unit: "unit-other" };
    await expect(managerCreate({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toEqual([]);
  });

  it("refuses another community's member, writing nothing", async () => {
    body = { ...base, member: "m-bea" };
    await expect(managerCreate({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toEqual([]);
  });
});

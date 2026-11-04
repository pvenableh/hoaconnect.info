/**
 * Phase 7 routes: the edit window (server-enforced), the notify-on-message
 * fan-out, the DM roster, and the heartbeat. The route is the fence for all of
 * them — messages are created from the browser, so these are the only server
 * moments there are.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  readItem: (collection: string, id: string, query: any) => ({ op: "readItem", collection, id, query }),
  createItem: (collection: string, data: any) => ({ op: "createItem", collection, data }),
  createItems: (collection: string, data: any) => ({ op: "createItems", collection, data }),
  updateItem: (collection: string, id: string, data: any) => ({ op: "updateItem", collection, id, data }),
}));

let notify: ReturnType<typeof vi.fn>;
vi.mock("#core/server/utils/notify", () => ({ notifyUsers: (...a: unknown[]) => notify(...a) }));

const ME = "user-me";
const ORG = "org-1";
const CH = "chan-1";
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

type Op = { op: string; collection: string; id?: string; data?: any; query?: any };
let ops: Op[];
let body: any;
let params: Record<string, string>;
let reads: Record<string, (op: Op) => any>;
let manager: boolean;
let moderation: any[];
let failEditedAt: boolean;
let eligible: Array<{ user: string; hoa_member: string | null }>;

function stub() {
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("getRouterParam", (_e: unknown, k: string) => params[k]);
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: ME }));
  vi.stubGlobal("requireChannelManager", async () => {
    if (!manager) throw Object.assign(new Error("403"), { statusCode: 403 });
    return ORG;
  });
  vi.stubGlobal("stripHtml", (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  vi.stubGlobal("logChannelModeration", async (e: any) => void moderation.push(e));
  vi.stubGlobal("checkAdminAccess", async () => ({ isAdmin: false }));
  vi.stubGlobal("isActiveBoardMember", async () => false);
  vi.stubGlobal("getOrgChannelEnrollees", async () => eligible);
  vi.stubGlobal("safeRequestOrigin", async () => "https://app.test");
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: Op) => {
      ops.push(op);
      if (op.op === "updateItem" && failEditedAt && "edited_at" in (op.data ?? {})) {
        throw new Error("edited_at not found");
      }
      if (op.op === "createItem") return { id: "dm-new", ...op.data };
      if (op.op === "createItems") return op.data;
      if (op.op === "readItems" || op.op === "readItem") return reads[op.collection]?.(op) ?? [];
      return {};
    },
  }));
}

beforeEach(() => {
  ops = [];
  body = {};
  params = { channel: CH };
  reads = {};
  manager = false;
  moderation = [];
  failEditedAt = false;
  eligible = [
    { user: ME, hoa_member: "m-me" },
    { user: "ana", hoa_member: "m-ana" },
  ];
  notify = vi.fn(async () => ({ bell: 1, push: 1, email: 0 }));
  stub();
});

const writes = (name: string) => ops.filter((o) => o.op === "updateItem" && o.collection === name);

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /channels/:channel/edit", () => {
  const route = async () => (await import("#core/server/api/hoa/channels/[channel]/edit.post")).default as any;
  const message = (over: Record<string, unknown> = {}) => ({
    id: "msg-1",
    content: "<p>hello</p>",
    status: "published",
    date_created: ago(60_000),
    attachments: [],
    user_created: { id: ME },
    channel: { organization: { id: ORG } },
    ...over,
  });

  it("a member edits their own recent message: content, is_edited and edited_at", async () => {
    reads.hoa_channel_messages = () => [message()];
    body = { messageId: "msg-1", content: "<p>hello there</p>" };
    const res = await (await route())({});
    const w = writes("hoa_channel_messages")[0]!;
    expect(w.id).toBe("msg-1");
    expect(w.data).toMatchObject({ content: "<p>hello there</p>", is_edited: true });
    expect(typeof w.data.edited_at).toBe("string");
    expect(res).toMatchObject({ ok: true, moderated: false });
    expect(moderation).toEqual([]);
  });

  it("scopes the message read to the channel", async () => {
    reads.hoa_channel_messages = () => [message()];
    body = { messageId: "msg-1", content: "<p>x</p>" };
    await (await route())({});
    const read = ops.find((o) => o.op === "readItems" && o.collection === "hoa_channel_messages")!;
    expect(read.query.filter).toEqual({ id: { _eq: "msg-1" }, channel: { _eq: CH } });
  });

  it("refuses a member past 15 minutes (403) and writes nothing", async () => {
    reads.hoa_channel_messages = () => [message({ date_created: ago(16 * 60_000) })];
    body = { messageId: "msg-1", content: "<p>late</p>" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 403 });
    expect(writes("hoa_channel_messages")).toEqual([]);
  });

  it("refuses editing someone else's message (403)", async () => {
    reads.hoa_channel_messages = () => [message({ user_created: { id: "other" } })];
    body = { messageId: "msg-1", content: "<p>mine now</p>" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 403 });
    expect(writes("hoa_channel_messages")).toEqual([]);
  });

  it("a manager edits their own old message with no window and no moderation entry", async () => {
    manager = true;
    reads.hoa_channel_messages = () => [message({ date_created: ago(30 * 86_400_000) })];
    body = { messageId: "msg-1", content: "<p>fixed</p>" };
    await (await route())({});
    expect(writes("hoa_channel_messages")).toHaveLength(1);
    expect(moderation).toEqual([]);
  });

  it("a manager editing another member's message writes a moderation entry holding the ORIGINAL text", async () => {
    manager = true;
    reads.hoa_channel_messages = () => [message({ user_created: { id: "other" }, content: "<p>original</p>" })];
    body = { messageId: "msg-1", content: "<p>corrected</p>" };
    const res = await (await route())({});
    expect(res).toMatchObject({ ok: true, moderated: true });
    expect(moderation).toEqual([
      expect.objectContaining({
        organization: ORG,
        channel: CH,
        moderator: ME,
        action: "edit",
        messageId: "msg-1",
        messageAuthor: "other",
        messageContent: "<p>original</p>",
      }),
    ]);
  });

  it("404s a message that isn't in this channel", async () => {
    reads.hoa_channel_messages = () => [];
    body = { messageId: "elsewhere", content: "<p>x</p>" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses an empty message, but allows empty text on one that has attachments", async () => {
    reads.hoa_channel_messages = () => [message()];
    body = { messageId: "msg-1", content: "<p> </p>" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 400 });
    reads.hoa_channel_messages = () => [message({ attachments: ["f1"] })];
    await (await route())({});
    expect(writes("hoa_channel_messages")).toHaveLength(1);
  });

  it("keeps the edit when edited_at isn't migrated yet", async () => {
    failEditedAt = true;
    reads.hoa_channel_messages = () => [message()];
    body = { messageId: "msg-1", content: "<p>ok</p>" };
    await (await route())({});
    const ok = ops.filter((o) => o.op === "updateItem" && !("edited_at" in o.data));
    expect(ok[0]!.data).toMatchObject({ content: "<p>ok</p>", is_edited: true });
  });

  it("a hidden message can't be edited (409)", async () => {
    manager = true;
    reads.hoa_channel_messages = () => [message({ status: "deleted" })];
    body = { messageId: "msg-1", content: "<p>x</p>" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 409 });
  });

  it("no change is a no-op", async () => {
    reads.hoa_channel_messages = () => [message()];
    body = { messageId: "msg-1", content: "<p>hello</p>" };
    expect(await (await route())({})).toMatchObject({ unchanged: true });
    expect(writes("hoa_channel_messages")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("notify-on-message", () => {
  const run = async (over: Record<string, unknown> = {}) => {
    const { notifyChannelMessage } = await import("#core/server/utils/channel-fanout");
    return notifyChannelMessage({
      directus: (globalThis as any).getTypedDirectus(),
      channelId: CH,
      messageId: `msg-${Math.random()}`,
      actorId: ME,
      origin: "https://app.test",
      ...over,
    } as any);
  };
  const seed = (over: { members?: any[]; mentions?: any[]; message?: any; channel?: any } = {}) => {
    reads.hoa_channels = () => [{ id: CH, name: "board", organization: ORG, status: "published", ...over.channel }];
    reads.hoa_channel_messages = () => [
      {
        id: "m",
        content: "<p>Pool vote tonight</p>",
        status: "published",
        date_created: new Date().toISOString(),
        user_created: { id: ME, first_name: "Morgan", last_name: "Lee" },
        ...over.message,
      },
    ];
    reads.hoa_channel_members = () =>
      over.members ?? [
        { user: ME },
        { user: "a" },
        { user: "muted", notifications_enabled: false },
        { user: "reading", present_at: new Date().toISOString() },
        { user: "mentioned" },
      ];
    reads.hoa_channel_mentions = () => over.mentions ?? [{ mentioned_user: "mentioned" }];
  };

  it("one collapsed bell row + a push tagged per channel; the author, muted, channel-open and mentioned are left out", async () => {
    seed();
    const res = await run();
    expect(res).toEqual({ ok: true, recipients: 1 });
    const o = notify.mock.calls[0]![0];
    expect(o.recipientUserIds).toEqual(["a"]);
    expect(o).toMatchObject({
      organizationId: ORG,
      category: "channel",
      collection: "hoa_channels",
      item: CH, // → push tag "hoa_channels:chan-1": the next message REPLACES this notification
      path: `/admin/channels/${CH}`,
      excludeUserId: ME,
      subject: "#board",
      message: "Morgan Lee: Pool vote tonight",
    });
    expect(o.bellCollapse.subjectFor(3)).toBe("3 new in #board");
    expect(o.pushActions).toEqual([{ action: "open", title: "Open", path: `/admin/channels/${CH}` }]);
    expect(o.email).toBeUndefined(); // email reaches people through the digest only
  });

  it("a mention keeps its own row: the mentioned user is not in the collapsed fan-out", async () => {
    seed({ members: [{ user: ME }, { user: "mentioned" }], mentions: [{ mentioned_user: "mentioned" }] });
    expect(await run()).toEqual({ ok: true, recipients: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it("a DM titles by the sender and collapses 'N new from <name>'", async () => {
    seed({ channel: { is_dm: true, name: "Direct message" }, members: [{ user: ME }, { user: "ana" }], mentions: [] });
    await run();
    const o = notify.mock.calls[0]![0];
    expect(o.subject).toBe("Morgan Lee");
    expect(o.bellCollapse.subjectFor(2)).toBe("2 new from Morgan Lee");
  });

  it("only the author can fan out their message", async () => {
    seed({ message: { user_created: { id: "someone-else" } } });
    expect(await run()).toEqual({ ok: false, reason: "not_author" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("refuses a stale message (a replay) and a draft", async () => {
    seed({ message: { date_created: ago(10 * 60_000) } });
    expect(await run()).toEqual({ ok: false, reason: "stale" });
    seed({ message: { status: "draft" } });
    expect(await run()).toEqual({ ok: false, reason: "not_published" });
  });

  it("fans out a given message once", async () => {
    seed();
    expect(await run({ messageId: "same" })).toMatchObject({ ok: true });
    expect(await run({ messageId: "same" })).toEqual({ ok: false, reason: "duplicate" });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("skips an archived or deleted channel", async () => {
    seed({ channel: { status: "archived" } });
    expect(await run()).toEqual({ ok: false, reason: "channel_unavailable" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /channels/dm", () => {
  const route = async () => (await import("#core/server/api/hoa/channels/dm.post")).default as any;

  it("creates a private DM with exactly the two people, under a pair-derived slug", async () => {
    body = { organization: ORG, userId: "ana" };
    reads.hoa_channels = () => [];
    const res = await (await route())({});
    expect(res.created).toBe(true);
    const ch = ops.find((o) => o.op === "createItem" && o.collection === "hoa_channels")!;
    expect(ch.data).toMatchObject({ is_private: true, is_dm: true, organization: ORG, slug: "dm-ana-user-me" });
    const roster = ops.find((o) => o.op === "createItems" && o.collection === "hoa_channel_members")!;
    expect(roster.data.map((r: any) => r.user).sort()).toEqual(["ana", ME]);
    expect(roster.data.every((r: any) => r.role === "member")).toBe(true);
  });

  it("opens the existing DM instead of making a second one", async () => {
    body = { organization: ORG, userId: "ana" };
    reads.hoa_channels = () => [{ id: "dm-1", name: "Direct message", slug: "dm-ana-user-me" }];
    const res = await (await route())({});
    expect(res).toMatchObject({ created: false, channel: { id: "dm-1" } });
    expect(ops.some((o) => o.op === "createItem")).toBe(false);
  });

  it("refuses a peer who can't use channels (a plain resident), and messaging yourself", async () => {
    body = { organization: ORG, userId: "resident" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 403 });
    body = { organization: ORG, userId: ME };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses a caller who isn't an admin or board member", async () => {
    eligible = [{ user: "ana", hoa_member: "m-ana" }];
    body = { organization: ORG, userId: "ana" };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 403 });
  });

  it("says what to run when is_dm isn't migrated", async () => {
    body = { organization: ORG, userId: "ana" };
    reads.hoa_channels = () => {
      throw new Error("no is_dm");
    };
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 409 });
  });

  it("no third party can join: invite and remove-member refuse a DM", async () => {
    reads.hoa_channels = () => ({ id: "dm-1", is_dm: true });
    const { refuseIfDirectMessage } = await import("#core/server/utils/channel-enrollment");
    await expect(refuseIfDirectMessage((globalThis as any).getTypedDirectus(), "dm-1")).rejects.toMatchObject({
      statusCode: 403,
    });
    reads.hoa_channels = () => ({ id: "c", is_dm: false });
    await expect(refuseIfDirectMessage((globalThis as any).getTypedDirectus(), "c")).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("POST /channels/:channel/presence", () => {
  const route = async () => (await import("#core/server/api/hoa/channels/[channel]/presence.post")).default as any;
  const seed = () => {
    reads.hoa_channels = () => [{ id: CH, organization: ORG, is_private: false, status: "published" }];
  };

  it("stamps present_at on my roster row and returns who else is here", async () => {
    seed();
    reads.hoa_channel_members = (op) =>
      op.query.fields.includes("id") && op.query.fields.length === 1
        ? [{ id: "row-me" }]
        : [{ user: { id: "ana", first_name: "Ana", last_name: "Ruiz", avatar: null } }];
    const res = await (await route())({});
    const stamp = writes("hoa_channel_members")[0]!;
    expect(stamp.id).toBe("row-me");
    expect(typeof stamp.data.present_at).toBe("string");
    expect(res.here).toEqual([{ id: "ana", first_name: "Ana", last_name: "Ruiz", avatar: null }]);
    // "who's here" only asks for fresh beats, and never for me.
    const q = ops.filter((o) => o.op === "readItems" && o.collection === "hoa_channel_members").pop()!;
    expect(q.query.filter.user).toEqual({ _neq: ME });
    expect(new Date(q.query.filter.present_at._gte).getTime()).toBeGreaterThan(NOW - 120_000);
  });

  it("leaving clears the stamp", async () => {
    seed();
    reads.hoa_channel_members = () => [{ id: "row-me" }];
    body = { leaving: true };
    expect(await (await route())({})).toEqual({ ok: true, here: [] });
    expect(writes("hoa_channel_members")[0]!.data).toEqual({ present_at: null });
  });

  it("refuses someone with no row on a private channel", async () => {
    reads.hoa_channels = () => [{ id: CH, organization: ORG, is_private: true, status: "published" }];
    reads.hoa_channel_members = () => [];
    await expect((await route())({})).rejects.toMatchObject({ statusCode: 403 });
  });

  it("answers an empty room rather than failing when present_at isn't migrated", async () => {
    seed();
    let n = 0;
    reads.hoa_channel_members = () => {
      if (n++ === 0) return [{ id: "row-me" }];
      throw new Error("no present_at");
    };
    const res = await (await route())({});
    expect(res).toEqual({ ok: true, here: [] });
  });
});

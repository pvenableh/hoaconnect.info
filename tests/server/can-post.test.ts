/**
 * The server half of "posting paused" (docs/spec-member-restrictions.md):
 * the places that act for a caller and reach other people refuse a paused
 * member and an archived one, and admit an active one; a paused helper's
 * areas stop. (Support's "Ask your community" is a link to the requests page,
 * a request to the board, which a paused member keeps: nothing to gate.)
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());
const bells: any[] = [];
vi.mock("#core/server/utils/notify", () => ({
  notifyUsers: async (o: any) => {
    bells.push(o);
    return { bell: o.recipientUserIds.length, push: 0, email: 0 };
  },
}));

const CH = uuid(501);
const ARCHIVED_USER = uuid(502);
const ARCHIVED: Who = { userId: ARCHIVED_USER, memberId: uuid(503) };
const state: { who: Who; db: Db } = { who: PERSONAS.owner, db: seed() };
let fake: ReturnType<typeof stubGlobals>;

function extend(db: Db) {
  db.hoa_members!.push({ id: ARCHIVED.memberId, organization: ORG, user: ARCHIVED_USER, first_name: "Gil", last_name: "Gone", status: "archived" });
  db.hoa_member_restrictions = [];
  db.hoa_channels = [{ id: CH, name: "general", organization: ORG, status: "published", is_dm: false }];
  db.hoa_channel_members = [
    { id: uuid(510), channel: CH, user: ID.userBob, notifications_enabled: true },
    { id: uuid(511), channel: CH, user: ID.userAnn, notifications_enabled: true },
  ];
  db.hoa_channel_mentions = [];
  db.hoa_channel_messages = [];
  db.hoa_area_grants = [];
  db.hoa_team_members = [];
}

const pauseBob = () =>
  state.db.hoa_member_restrictions!.push({ id: uuid(520), organization: ORG, member: ID.memberBob, starts_at: "2026-01-01T00:00:00.000Z", ends_at: null, lifted_at: null, member_note: "x" });

const message = (author: string) => {
  const id = uuid(600 + state.db.hoa_channel_messages!.length);
  state.db.hoa_channel_messages!.push({ id, channel: { id: CH, organization: { id: ORG } }, content: "hello", status: "published", attachments: null, date_created: new Date().toISOString(), user_created: { id: author, first_name: "x", last_name: "y" } });
  return id;
};

let edit: (e: any) => Promise<any>;
let notify: (e: any) => Promise<any>;
let notifyEvent: (e: any) => Promise<any>;
let authorized: boolean | null;

beforeAll(async () => {
  fake = stubGlobals(state);
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireAuthenticatedUser", async () => {
    if (!state.who.userId) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return { userId: state.who.userId };
  });
  vi.stubGlobal("requireChannelManager", async () => {
    throw Object.assign(new Error("no"), { statusCode: 403 });
  });
  vi.stubGlobal("stripHtml", (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, " ").trim());
  vi.stubGlobal("logChannelModeration", async () => undefined);
  vi.stubGlobal("safeRequestOrigin", async () => "https://app.test");
  // notify-event's fan-out: what matters here is what its authorize answers for the row's org.
  vi.stubGlobal("announceEvent", async (input: any) => {
    authorized = await input.authorize(ORG);
    return authorized ? { ok: true } : { ok: false, reason: "not authorized for this organization" };
  });
  // The real checkMembership reads ACTIVE rows; the fixture's stub answers from the persona.
  vi.stubGlobal("checkMembership", async () => {
    const m = state.db.hoa_members!.find((r) => r.user === state.who.userId && r.organization === ORG && r.status === "active");
    return m ? { isMember: true, memberId: m.id } : { isMember: false };
  });
  vi.stubGlobal("notifyChannelMessage", (await import("#core/server/utils/channel-fanout")).notifyChannelMessage);
  edit = (await import("#core/server/api/hoa/channels/[channel]/edit.post")).default as any;
  notify = (await import("#core/server/api/hoa/channels/[channel]/notify.post")).default as any;
  notifyEvent = (await import("#core/server/api/org/notify-event.post")).default as any;
});

beforeEach(() => {
  state.db = seed();
  extend(state.db);
  state.who = PERSONAS.owner;
  bells.length = 0;
  authorized = null;
  fake.reset();
});

const as = (who: Who) => (state.who = who);
const editAs = (who: Who, author = who.userId!) => {
  as(who);
  const id = message(author);
  return edit(ev({ params: { channel: CH }, body: { messageId: id, content: "edited" } }));
};
const notifyAs = (who: Who) => {
  as(who);
  const id = message(who.userId!);
  return notify(ev({ params: { channel: CH }, body: { messageId: id } }));
};

describe("requireCanPost and canPostIn", () => {
  it("an active member posts; paused, archived and outsiders do not", async () => {
    const { canPostIn, requireCanPost } = await import("#core/server/utils/member-restrictions");
    expect(await canPostIn(ev(), ORG)).toBe(true);
    pauseBob();
    expect(await canPostIn(ev(), ORG)).toBe(false);
    await expect(requireCanPost(ev(), ORG)).rejects.toMatchObject({ statusCode: 403, message: "Your posting is paused in this community." });
    as(ARCHIVED);
    await expect(requireCanPost(ev(), ORG)).rejects.toMatchObject({ statusCode: 403, message: "Only an active member of this community can post here." });
    as(PERSONAS.outsider);
    expect(await canPostIn(ev(), ORG)).toBe(false);
    await expect(requireCanPost(ev(), null)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("a pause that ended by date, or was lifted, no longer counts", async () => {
    const { canPostIn } = await import("#core/server/utils/member-restrictions");
    state.db.hoa_member_restrictions!.push({ id: "a", organization: ORG, member: ID.memberBob, starts_at: "2026-01-01T00:00:00.000Z", ends_at: "2026-01-02T00:00:00.000Z", lifted_at: null });
    state.db.hoa_member_restrictions!.push({ id: "b", organization: ORG, member: ID.memberBob, starts_at: "2026-01-01T00:00:00.000Z", ends_at: null, lifted_at: "2026-01-03T00:00:00.000Z" });
    expect(await canPostIn(ev(), ORG)).toBe(true);
  });
});

describe("the server places", () => {
  it("message edit: refuses a paused and an archived member, writing nothing; admits an active one", async () => {
    pauseBob();
    await expect(editAs(PERSONAS.owner)).rejects.toMatchObject({ statusCode: 403 });
    await expect(editAs(ARCHIVED)).rejects.toMatchObject({ statusCode: 403 });
    expect(fake.calls.filter((c) => c.op === "updateItem")).toHaveLength(0);
    await expect(editAs(PERSONAS.board)).resolves.toMatchObject({ ok: true });
  });

  it("channel notify and its fan-out (the author): a paused or archived author reaches nobody; an active one does", async () => {
    pauseBob();
    expect(await notifyAs(PERSONAS.owner)).toEqual({ ok: false, reason: "cannot_post" });
    expect(await notifyAs(ARCHIVED)).toEqual({ ok: false, reason: "cannot_post" });
    expect(bells).toHaveLength(0);
    const res = await notifyAs(PERSONAS.board);
    expect(res).toMatchObject({ ok: true });
    expect(bells.map((b) => b.recipientUserIds)).toEqual([[ID.userBob]]);
  });

  it("notify-event: refused for a paused and an archived member, allowed for an active one", async () => {
    const call = () => notifyEvent(ev({ body: { collection: "hoa_comments", action: "create", itemId: "c1" } }));
    pauseBob();
    expect(await call()).toMatchObject({ ok: false });
    expect(authorized).toBe(false);
    as(ARCHIVED);
    expect(await call()).toMatchObject({ ok: false });
    as(PERSONAS.board);
    expect(await call()).toMatchObject({ ok: true });
  });
});

describe("helper and committee areas", () => {
  it("are paused while the helper's posting is, and come back when it ends", async () => {
    vi.unstubAllGlobals();
    fake = stubGlobals(state);
    vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
    vi.stubGlobal("checkMembership", async () => ({ isMember: true, memberId: ID.memberBob }));
    const { getHelperAreas } = await import("#core/server/utils/manager-access");
    state.db.hoa_area_grants!.push({ id: "g1", organization: ORG, area: "projects", member: ID.memberBob, team: null, starts_at: "2026-01-01T00:00:00.000Z", ends_at: null });
    expect(await getHelperAreas(ev(), ORG)).toEqual(["projects"]);
    pauseBob();
    expect(await getHelperAreas(ev(), ORG)).toEqual([]);
  });
});

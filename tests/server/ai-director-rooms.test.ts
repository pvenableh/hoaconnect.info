/**
 * The Board Room's HTTP doors — sessions and minutes (Round 2, Phase 6 UI).
 *
 * The utils under these routes were tested in Session 7. What is new here is
 * everything a URL makes possible, and there are three distinct hazards:
 *
 * 1. **Org scope.** A session id and a minutes id are bare uuids in a URL, and
 *    being an admin of one community is not being an admin of another. Every
 *    door is asserted to refuse a community the caller has no standing in, and
 *    to refuse it BEFORE reading a row.
 *
 * 2. **The room cannot be told a lie.** `op: "activity"` takes a step id from
 *    the browser and the server reads the step back before writing the line, so
 *    an activity entry cannot claim an approval that never happened.
 *
 * 3. **Minutes count their own steps.** The save route refuses the caller's
 *    step list entirely: it re-reads the plan and rolls it up itself, because a
 *    governance record whose tally came from the screen displaying it can be
 *    wrong in exactly the way nobody notices.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query?: unknown) => ({
    op: "readOne",
    collection,
    id,
    query,
  }),
  readItems: (collection: string, query?: unknown) => ({ op: "read", collection, query }),
  readUsers: (query?: unknown) => ({ op: "read", collection: "directus_users", query }),
  createItem: (collection: string, payload: unknown) => ({ op: "create", collection, payload }),
  updateItem: (collection: string, id: string, payload: unknown) => ({
    op: "updateOne",
    collection,
    id,
    payload,
  }),
  deleteItem: (collection: string, id: string) => ({ op: "delete", collection, id }),
  aggregate: (collection: string, query: unknown) => ({ op: "aggregate", collection, query }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";
const THEM = "user-them";

type Op = { op: string; collection: string; [k: string]: any };

let ops: Op[];
let rows: Record<string, any[]>;
let isAdminOf: string[];
let isBoardOf: string[];
let seq: number;

function matches(row: any, filter: any): boolean {
  if (!filter) return true;
  if (Array.isArray(filter._and)) return filter._and.every((f: any) => matches(row, f));
  return Object.entries(filter).every(([field, cond]: [string, any]) => {
    if (field === "_and") return true;
    const v = row[field];
    if (cond?._eq !== undefined) return String(v) === String(cond._eq);
    if (cond?._neq !== undefined) return String(v) !== String(cond._neq);
    return true;
  });
}

beforeEach(() => {
  vi.resetModules();
  ops = [];
  seq = 0;
  isAdminOf = [HOME];
  isBoardOf = [];
  rows = {
    ai_actions: [],
    hoa_director_sessions: [],
    hoa_director_minutes: [],
    directus_users: [
      { id: ME, first_name: "Dana", last_name: "Ruiz", email: "d@example.com" },
      { id: THEM, first_name: "Sam", last_name: "Ali", email: "s@example.com" },
    ],
  };

  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("readBody", async (e: any) => e?.__body ?? {});
  vi.stubGlobal("getRouterParam", (e: any, k: string) => e?.__params?.[k]);
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: ME }));
  vi.stubGlobal("checkAdminAccess", async (_e: any, orgId: string) => ({
    isAdmin: isAdminOf.includes(orgId),
    memberId: "hm-1",
  }));
  vi.stubGlobal("isActiveBoardMember", async (_d: any, _u: string, orgId: string) =>
    isBoardOf.includes(orgId)
  );
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      ops.push(desc);
      const all = (rows[desc.collection] ||= []);
      switch (desc.op) {
        case "readOne":
          return all.find((r) => String(r.id) === String(desc.id)) ?? null;
        case "read": {
          const out = all.filter((r) => matches(r, desc.query?.filter));
          const limit = desc.query?.limit;
          return typeof limit === "number" && limit > 0 ? out.slice(0, limit) : out;
        }
        case "create": {
          const created = {
            id: `new-${++seq}`,
            date_created: new Date().toISOString(),
            ...(desc.payload as any),
          };
          all.push(created);
          return created;
        }
        case "updateOne": {
          const row = all.find((r) => String(r.id) === String(desc.id));
          if (row) Object.assign(row, desc.payload);
          return row;
        }
        default:
          return null;
      }
    },
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const listSessions = async () =>
  (await import("#core/server/api/ai/director/sessions/index.get")).default as any;
const conveneSession = async () =>
  (await import("#core/server/api/ai/director/sessions/index.post")).default as any;
const readSession = async () =>
  (await import("#core/server/api/ai/director/sessions/[id]/index.get")).default as any;
const actOnSession = async () =>
  (await import("#core/server/api/ai/director/sessions/[id]/index.post")).default as any;
const listMinutesRoute = async () =>
  (await import("#core/server/api/ai/director/minutes/index.get")).default as any;
const saveMinutesRoute = async () =>
  (await import("#core/server/api/ai/director/minutes/index.post")).default as any;
const readMinutesRoute = async () =>
  (await import("#core/server/api/ai/director/minutes/[id]/index.get")).default as any;
const shareMinutesRoute = async () =>
  (await import("#core/server/api/ai/director/minutes/[id]/index.post")).default as any;

const session = (over: Record<string, any> = {}) => ({
  id: "s1",
  organization: HOME,
  host: ME,
  presenter: ME,
  title: "Money",
  status: "live",
  scope_type: "org",
  subject: "money",
  plan_id: "plan-1",
  current_slide: 0,
  revision: 3,
  last_activity: null,
  attendees: [{ userId: ME, name: "Dana Ruiz", role: "host", status: "active", lastSeen: null }],
  view_only: false,
  date_created: "2026-08-24T10:00:00Z",
  ...over,
});

const step = (id: string, over: Record<string, any> = {}) => ({
  id,
  organization: HOME,
  session_id: "plan-1",
  action_type: "create_task",
  title: `Step ${id}`,
  preview: JSON.stringify({ kind: "create_task", title: "Order chlorine" }),
  status: "pending",
  outbound: false,
  date_created: `2026-08-24T1${id.slice(-1)}:00:00Z`,
  ...over,
});

// ── Org scope, on every door ─────────────────────────────────────────────────

describe("Board Room routes — org scope", () => {
  const doors: Array<[string, () => Promise<any>, (org: string) => any]> = [
    ["GET /sessions", listSessions, (org) => ({ __query: { orgId: org } })],
    ["POST /sessions", conveneSession, (org) => ({ __body: { orgId: org } })],
    [
      "GET /sessions/[id]",
      readSession,
      (org) => ({ __query: { orgId: org }, __params: { id: "s1" } }),
    ],
    [
      "POST /sessions/[id]",
      actOnSession,
      (org) => ({ __body: { orgId: org, op: "join" }, __params: { id: "s1" } }),
    ],
    ["GET /minutes", listMinutesRoute, (org) => ({ __query: { orgId: org } })],
    [
      "POST /minutes",
      saveMinutesRoute,
      (org) => ({ __body: { orgId: org, planId: "plan-1" } }),
    ],
    [
      "GET /minutes/[id]",
      readMinutesRoute,
      (org) => ({ __query: { orgId: org }, __params: { id: "m1" } }),
    ],
    [
      "POST /minutes/[id]",
      shareMinutesRoute,
      (org) => ({ __body: { orgId: org, op: "share" }, __params: { id: "m1" } }),
    ],
  ];

  for (const [name, load, event] of doors) {
    it(`${name} refuses a community the caller has no standing in`, async () => {
      const handler = await load();
      await expect(handler(event(OTHER))).rejects.toMatchObject({ statusCode: 403 });
    });

    it(`${name} refuses before reading a single row`, async () => {
      rows.hoa_director_sessions = [session({ organization: OTHER })];
      const handler = await load();
      await handler(event(OTHER)).catch(() => {});
      expect(ops).toEqual([]);
    });

    it(`${name} requires an orgId`, async () => {
      const handler = await load();
      const e = event(HOME);
      if (e.__query) e.__query.orgId = "";
      if (e.__body) e.__body.orgId = "";
      await expect(handler(e)).rejects.toMatchObject({ statusCode: 400 });
    });
  }

  it("serves a seated board member who is not an admin", async () => {
    isAdminOf = [];
    isBoardOf = [HOME];
    rows.hoa_director_sessions = [session()];
    const handler = await listSessions();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.sessions).toHaveLength(1);
  });
});

// ── Convening ────────────────────────────────────────────────────────────────

describe("POST /api/ai/director/sessions — convening a room", () => {
  it("seats the host by name and opens on revision 1", async () => {
    const handler = await conveneSession();
    const res = await handler({ __body: { orgId: HOME, subject: "money", title: "Money" } });
    expect(res.provisioned).toBe(true);
    expect(res.session.hostId).toBe(ME);
    expect(res.session.attendees[0]).toMatchObject({
      userId: ME,
      name: "Dana Ruiz",
      role: "host",
    });
    // The convene itself is activity — a room opens with its clock already
    // moving, so a follower that arrives late still has something to compare.
    expect(res.session.revision).toBe(1);
    expect(res.session.lastActivity?.type).toBe("convene");
  });

  it("files an entity session as entity-scoped even without an explicit scopeType", async () => {
    const handler = await conveneSession();
    const res = await handler({
      __body: { orgId: HOME, entityType: "request", entityId: "r1" },
    });
    expect(res.session.scopeType).toBe("entity");
    expect(res.session.entityId).toBe("r1");
  });
});

// ── The poll door ────────────────────────────────────────────────────────────

describe("GET /api/ai/director/sessions/[id] — the poll", () => {
  beforeEach(() => {
    rows.hoa_director_sessions = [session()];
    rows.ai_actions = [step("a1"), step("a2")];
  });

  it("hands back the session and its steps on a first look", async () => {
    const handler = await readSession();
    const res = await handler({ __query: { orgId: HOME }, __params: { id: "s1" } });
    expect(res.changed).toBe(true);
    expect(res.revision).toBe(3);
    expect(res.steps.map((s: any) => s.id)).toEqual(["a1", "a2"]);
  });

  it("omits the steps entirely when the revision has not moved", async () => {
    const handler = await readSession();
    const res = await handler({
      __query: { orgId: HOME, since: "3" },
      __params: { id: "s1" },
    });
    expect(res.changed).toBe(false);
    expect(res.steps).toBeNull();
  });

  it("re-reads the steps as soon as the revision moves", async () => {
    const handler = await readSession();
    rows.hoa_director_sessions[0]!.revision = 4;
    rows.ai_actions[0]!.status = "executed";
    const res = await handler({
      __query: { orgId: HOME, since: "3" },
      __params: { id: "s1" },
    });
    expect(res.changed).toBe(true);
    expect(res.steps.find((s: any) => s.id === "a1").status).toBe("executed");
  });

  it("parses the step preview, so a card never renders one character per line", async () => {
    const handler = await readSession();
    const res = await handler({ __query: { orgId: HOME }, __params: { id: "s1" } });
    expect(res.steps[0].preview).toEqual({ kind: "create_task", title: "Order chlorine" });
  });

  it("cannot reach another community's session with a guessed id", async () => {
    rows.hoa_director_sessions = [session({ organization: OTHER })];
    const handler = await readSession();
    await expect(
      handler({ __query: { orgId: HOME }, __params: { id: "s1" } })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── In-room verbs ────────────────────────────────────────────────────────────

describe("POST /api/ai/director/sessions/[id] — in the room", () => {
  beforeEach(() => {
    rows.hoa_director_sessions = [session()];
    rows.ai_actions = [step("a1"), step("a2")];
  });

  it("refuses an op it does not know, before touching anything", async () => {
    const handler = await actOnSession();
    await expect(
      handler({ __body: { orgId: HOME, op: "delete_everything" }, __params: { id: "s1" } })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(ops).toEqual([]);
  });

  it("seats a second person without unseating the host", async () => {
    vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: THEM }));
    isAdminOf = [HOME];
    const handler = await actOnSession();
    const res = await handler({ __body: { orgId: HOME, op: "join" }, __params: { id: "s1" } });
    expect(res.session.attendees).toHaveLength(2);
    expect(res.session.attendees.find((a: any) => a.userId === ME).role).toBe("host");
    expect(res.session.attendees.find((a: any) => a.userId === THEM)).toMatchObject({
      name: "Sam Ali",
      role: "member",
      status: "active",
    });
  });

  it("bumps the revision on every op — that IS the sync clock", async () => {
    const handler = await actOnSession();
    const before = rows.hoa_director_sessions[0]!.revision;
    await handler({ __body: { orgId: HOME, op: "present", slide: 2 }, __params: { id: "s1" } });
    expect(rows.hoa_director_sessions[0]!.revision).toBe(before + 1);
    expect(rows.hoa_director_sessions[0]!.current_slide).toBe(2);
  });

  it("reads the step back rather than believing what it was told about it", async () => {
    rows.ai_actions[0]!.status = "rejected";
    rows.ai_actions[0]!.title = "Chase the irrigation contractor";
    const handler = await actOnSession();
    const res = await handler({
      __body: { orgId: HOME, op: "activity", stepId: "a1", label: "APPROVED IT ALL" },
      __params: { id: "s1" },
    });
    expect(res.session.lastActivity).toMatchObject({
      type: "decision",
      stepId: "a1",
      status: "rejected",
      label: "Chase the irrigation contractor",
    });
  });

  it("cannot attach a plan without one", async () => {
    const handler = await actOnSession();
    await expect(
      handler({ __body: { orgId: HOME, op: "plan" }, __params: { id: "s1" } })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("attaches a plan and rewinds the room to slide one", async () => {
    rows.hoa_director_sessions[0]!.current_slide = 4;
    const handler = await actOnSession();
    await handler({
      __body: { orgId: HOME, op: "plan", planId: "plan-2", title: "Requests" },
      __params: { id: "s1" },
    });
    expect(rows.hoa_director_sessions[0]!.plan_id).toBe("plan-2");
    expect(rows.hoa_director_sessions[0]!.current_slide).toBe(0);
  });

  it("lets only the host end the meeting", async () => {
    vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: THEM }));
    const handler = await actOnSession();
    await expect(
      handler({ __body: { orgId: HOME, op: "end" }, __params: { id: "s1" } })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(rows.hoa_director_sessions[0]!.status).toBe("live");
  });

  it("ends it for the host", async () => {
    const handler = await actOnSession();
    await handler({ __body: { orgId: HOME, op: "end" }, __params: { id: "s1" } });
    expect(rows.hoa_director_sessions[0]!.status).toBe("ended");
  });

  it("gives a seat up without ending the meeting for everyone", async () => {
    const handler = await actOnSession();
    await handler({ __body: { orgId: HOME, op: "leave" }, __params: { id: "s1" } });
    expect(rows.hoa_director_sessions[0]!.status).toBe("live");
    expect(rows.hoa_director_sessions[0]!.attendees[0].status).toBe("left");
  });
});

// ── Minutes ──────────────────────────────────────────────────────────────────

describe("POST /api/ai/director/minutes — recording the decision", () => {
  it("counts the steps itself, ignoring whatever the caller claims", async () => {
    rows.ai_actions = [
      step("a1", { status: "executed" }),
      step("a2", { status: "rejected" }),
      step("a3", { status: "pending" }),
      step("a4", { status: "failed" }),
    ];
    const handler = await saveMinutesRoute();
    const res = await handler({
      __body: {
        orgId: HOME,
        planId: "plan-1",
        title: "Money",
        intro: "A briefing.",
        points: ["One", "Two"],
        // A caller trying to write its own history — the route has no field
        // for it, so this is simply not read.
        steps: [{ id: "fake", actionType: "create_task", title: "Nope", status: "executed" }],
        stats: { done: 99, skipped: 0, failed: 0, open: 0, total: 99, captured: 0 },
      },
    });
    expect(res.saved).toBe(true);
    expect(res.stats).toMatchObject({ done: 1, skipped: 1, open: 1, failed: 1, total: 4 });
    const saved = rows.hoa_director_minutes[0]!;
    expect(saved.stats).toMatchObject({ done: 1, total: 4 });
    expect(saved.steps.map((s: any) => s.id)).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("cannot pull another community's steps in under a guessed plan id", async () => {
    rows.ai_actions = [step("a1", { organization: OTHER })];
    const handler = await saveMinutesRoute();
    const res = await handler({ __body: { orgId: HOME, planId: "plan-1" } });
    expect(res.stats.total).toBe(0);
    expect(rows.hoa_director_minutes[0]!.steps).toEqual([]);
  });

  it("requires a planId — minutes with no plan behind them are not a record", async () => {
    const handler = await saveMinutesRoute();
    await expect(handler({ __body: { orgId: HOME } })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("GET/POST /api/ai/director/minutes/[id] — reading and sharing", () => {
  const minutesRow = (over: Record<string, any> = {}) => ({
    id: "m1",
    organization: HOME,
    author: { first_name: "Dana", last_name: "Ruiz" },
    title: "Money",
    scope_type: "org",
    subject: "money",
    plan_id: "plan-1",
    intro: "A briefing.",
    points: ["One"],
    steps: [{ id: "a1", actionType: "create_task", title: "Order chlorine", status: "executed" }],
    stats: { done: 1, skipped: 0, failed: 0, open: 0, total: 1, captured: 0 },
    status: "recorded",
    date_created: "2026-08-24T12:00:00Z",
    ...over,
  });

  it("returns one record in full", async () => {
    rows.hoa_director_minutes = [minutesRow()];
    const handler = await readMinutesRoute();
    const res = await handler({ __query: { orgId: HOME }, __params: { id: "m1" } });
    expect(res.minutes).toMatchObject({ id: "m1", authorName: "Dana Ruiz", status: "recorded" });
    expect(res.minutes.steps).toHaveLength(1);
  });

  it("404s on another community's record rather than leaking its shape", async () => {
    rows.hoa_director_minutes = [minutesRow({ organization: OTHER })];
    const handler = await readMinutesRoute();
    await expect(
      handler({ __query: { orgId: HOME }, __params: { id: "m1" } })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("shares a record, and says so twice the same way", async () => {
    rows.hoa_director_minutes = [minutesRow()];
    const handler = await shareMinutesRoute();
    const first = await handler({
      __body: { orgId: HOME, op: "share" },
      __params: { id: "m1" },
    });
    expect(first.minutes.status).toBe("shared");
    const again = await handler({
      __body: { orgId: HOME, op: "share" },
      __params: { id: "m1" },
    });
    expect(again.minutes.status).toBe("shared");
  });

  it("refuses an op it does not know", async () => {
    rows.hoa_director_minutes = [minutesRow()];
    const handler = await shareMinutesRoute();
    await expect(
      handler({ __body: { orgId: HOME, op: "unshare" }, __params: { id: "m1" } })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("cannot share another community's record", async () => {
    rows.hoa_director_minutes = [minutesRow({ organization: OTHER })];
    const handler = await shareMinutesRoute();
    await expect(
      handler({ __body: { orgId: HOME, op: "share" }, __params: { id: "m1" } })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(rows.hoa_director_minutes[0]!.status).toBe("recorded");
  });
});

/**
 * The restricted-member routes (docs/spec-member-restrictions.md): admin only
 * for writes and history, every member and row read through the org filter,
 * who can be paused, lifting ends without deleting, a board-visible ledger
 * entry without the internal note, a bell the member always gets, and `mine`
 * returning only what the member may see.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const synced: string[][] = [];
let syncFails = false;
vi.mock("#core/server/utils/admin-scope", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  syncAdminScope: async (keys: string[]) => {
    synced.push(keys);
    if (syncFails) throw new Error("sync down");
    return { checked: keys.length, updated: 1, changes: [] };
  },
}));
const bells: any[] = [];
vi.mock("#core/server/utils/notify", () => ({
  notifyUsers: async (o: any) => {
    bells.push(o);
    return { bell: o.recipientUserIds.length, push: 0, email: 0 };
  },
}));

const HOA_ADMIN = "role-hoa-admin";
const PM = "role-pm";
const APP_ADMIN = "role-app-admin";
const ID2 = {
  memberPm: uuid(301),
  memberAdminRole: uuid(302),
  memberGone: uuid(303),
  memberNoLogin: uuid(304),
  memberAppAdmin: uuid(305),
};

const state: { who: Who; db: Db } = { who: PERSONAS.admin, db: seed() };
let fake: ReturnType<typeof stubGlobals>;
let ledger: any[] = [];

const R = "#core/server/api/org/member-restrictions";
let post: (e: any) => Promise<any>;
let get: (e: any) => Promise<any>;
let lift: (e: any) => Promise<any>;
let mine: (e: any) => Promise<any>;

function extend(db: Db) {
  db.hoa_members!.push(
    { id: ID2.memberPm, organization: ORG, user: uuid(306), first_name: "Pat", last_name: "Manager", status: "active", role: PM },
    { id: ID2.memberAdminRole, organization: ORG, user: uuid(307), first_name: "Ada", last_name: "Second", status: "active", role: HOA_ADMIN },
    { id: ID2.memberGone, organization: ORG, user: uuid(308), first_name: "Gil", last_name: "Gone", status: "archived" },
    { id: ID2.memberNoLogin, organization: ORG, user: null, first_name: "Nora", last_name: "Nologin", status: "active" },
    { id: ID2.memberAppAdmin, organization: ORG, user: uuid(309), first_name: "Pia", last_name: "Platform", status: "active", role: APP_ADMIN }
  );
  db.hoa_member_restrictions = [];
}

beforeAll(async () => {
  fake = stubGlobals(state);
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { directusRoleHoaAdmin: HOA_ADMIN, directusRolePropertyManager: PM, directusRoleAppAdmin: APP_ADMIN } }));
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("writeAuditEntry", async (entry: any) => {
    ledger.push(entry);
    return "audit-1";
  });
  post = (await import(/* @vite-ignore */ `${R}/index.post`)).default;
  get = (await import(/* @vite-ignore */ `${R}/index.get`)).default;
  lift = (await import(/* @vite-ignore */ `${R}/[id]/lift.post`)).default;
  mine = (await import(/* @vite-ignore */ `${R}/mine.get`)).default;
});

beforeEach(() => {
  state.db = seed();
  extend(state.db);
  state.who = PERSONAS.admin;
  ledger = [];
  bells.length = 0;
  synced.length = 0;
  syncFails = false;
  fake.reset();
});

const as = (who: Who) => (state.who = who);
const rows = () => state.db.hoa_member_restrictions!;
const writes = () => fake.calls.filter((c) => c.op !== "readItems" && c.op !== "readItem");
const pause = (body: any = {}) => post(ev({ body: { orgId: ORG, member: ID.memberBob, memberNote: "Please keep it civil.", ...body } }));
const openRow = (over: any = {}) => {
  const row = { id: uuid(400 + rows().length), organization: ORG, member: ID.memberBob, starts_at: "2026-01-01T00:00:00.000Z", ends_at: null, lifted_at: null, member_note: "Paused.", internal_note: "Third warning.", holder_name: "Bob Diaz", imposed_by: ID.userAdmin, ...over };
  rows().push(row);
  return row;
};

describe("who may call", () => {
  const calls = {
    post: () => pause(),
    list: () => get(ev({ query: { orgId: ORG } })),
    history: () => get(ev({ query: { orgId: ORG, member: ID.memberBob } })),
    lift: () => lift(ev({ params: { id: openRow().id }, body: { orgId: ORG } })),
  };

  for (const [name, call] of Object.entries(calls)) {
    it(`${name}: 401 without a session`, async () => {
      as(PERSONAS.nobody);
      await expect(call()).rejects.toMatchObject({ statusCode: 401 });
    });

    it(`${name}: 403 for a plain member, a board seat and a manager, writing nothing`, async () => {
      for (const who of [PERSONAS.owner, PERSONAS.board, PERSONAS.manager]) {
        as(who);
        await expect(call(), JSON.stringify(who)).rejects.toMatchObject({ statusCode: 403 });
      }
      expect(writes()).toHaveLength(0);
      expect(ledger).toHaveLength(0);
      expect(bells).toHaveLength(0);
    });
  }

  it("400 without orgId, and for a bad body", async () => {
    await expect(get(ev({ query: {} }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(post(ev({ body: { member: ID.memberBob, memberNote: "x" } }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(pause({ member: undefined })).rejects.toMatchObject({ statusCode: 400 });
    await expect(pause({ memberNote: "   " })).rejects.toMatchObject({ statusCode: 400 });
    await expect(pause({ endsOn: "2026-02-30" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(pause({ endsOn: "2020-01-01" })).rejects.toMatchObject({ statusCode: 400 });
    expect(rows()).toHaveLength(0);
  });

  it("404 for another community's member or pause", async () => {
    await expect(pause({ member: ID.memberOther })).rejects.toMatchObject({ statusCode: 404 });
    await expect(get(ev({ query: { orgId: ORG, member: ID.memberOther } }))).rejects.toMatchObject({ statusCode: 404 });
    const theirs = openRow({ organization: OTHER, member: ID.memberOther });
    await expect(lift(ev({ params: { id: theirs.id }, body: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 404 });
    expect(theirs.lifted_at).toBeNull();
  });
});

describe("who can be paused", () => {
  it("400 for an admin (HOA Admin or App Administrator) and a property manager: remove the role first", async () => {
    await expect(pause({ member: ID2.memberAdminRole })).rejects.toMatchObject({ statusCode: 400 });
    await expect(pause({ member: ID2.memberAppAdmin })).rejects.toMatchObject({ statusCode: 400 });
    await expect(pause({ member: ID2.memberPm })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("409 for a membership that is not active, a current board term, and a pause already open", async () => {
    await expect(pause({ member: ID2.memberGone })).rejects.toMatchObject({ statusCode: 409 });
    await expect(pause({ member: ID.memberAnn })).rejects.toMatchObject({ statusCode: 409, message: "They hold a board seat. End or change their term first." });
    openRow();
    await expect(pause()).rejects.toMatchObject({ statusCode: 409 });
    expect(rows()).toHaveLength(1);
    expect(ledger).toHaveLength(0);
  });

  it("an ended term does not protect: Bob's 2019 seat is over", async () => {
    await expect(pause()).resolves.toMatchObject({ recorded: true });
  });

  it("the history says why not, so the sheet offers no control the POST would refuse", async () => {
    const ann = await get(ev({ query: { orgId: ORG, member: ID.memberAnn } }));
    expect(ann).toMatchObject({ canRestrict: false, reason: "They hold a board seat. End or change their term first." });
    const admin = await get(ev({ query: { orgId: ORG, member: ID2.memberAdminRole } }));
    expect(admin.canRestrict).toBe(false);
    const bob = await get(ev({ query: { orgId: ORG, member: ID.memberBob } }));
    expect(bob).toMatchObject({ canRestrict: true, reason: null, open: null, rows: [] });
  });
});

describe("pausing", () => {
  it("writes one row from now, until the day picked on the community's clock, by the admin", async () => {
    const res = await pause({ endsOn: "2099-12-18", internalNote: "Third warning." });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      organization: ORG,
      member: ID.memberBob,
      ends_at: "2099-12-18T05:00:00.000Z",
      member_note: "Please keep it civil.",
      internal_note: "Third warning.",
      imposed_by: ID.userAdmin,
      holder_name: "Bob Diaz",
    });
    expect(rows()[0]!.lifted_at ?? null).toBeNull();
    expect(res).toMatchObject({ recorded: true, notified: true, scopeSynced: true, restriction: { until: "until December 18, 2099" } });
    expect(synced).toEqual([[ID.memberBob]]);
  });

  it("until lifted when no day is given", async () => {
    const res = await pause();
    expect(rows()[0]!.ends_at).toBeNull();
    expect(res.restriction.until).toBe("until the board lifts it");
  });

  it("the ledger entry is board-visible, names the member, the dates and their note, never the internal note", async () => {
    await pause({ endsOn: "2099-12-18", internalNote: "Neighbour complaints, do not share" });
    expect(ledger).toHaveLength(1);
    const e = ledger[0];
    expect(e).toMatchObject({ event_type: "member_restricted", visibility: "board", organization: ORG, actor_user: ID.userAdmin });
    expect(e.summary).toBe("Bob Diaz's posting was paused until December 18, 2099.");
    expect(e.payload).toMatchObject({ member: { member_id: ID.memberBob, name: "Bob Diaz" }, member_note: "Please keep it civil.", ends_at: "2099-12-18T05:00:00.000Z" });
    expect(JSON.stringify(e)).not.toContain("Neighbour complaints");
  });

  it("rings the member's bell even with notifications off, and only theirs", async () => {
    await pause();
    expect(bells).toHaveLength(1);
    expect(bells[0]).toMatchObject({ organizationId: ORG, recipientUserIds: [ID.userBob], category: "membership", mustReach: true });
    expect(bells[0].message).toContain("Please keep it civil.");
  });

  it("a member with no login: the row and the entry, no bell", async () => {
    const res = await pause({ member: ID2.memberNoLogin });
    expect(res).toMatchObject({ recorded: true, notified: false });
    expect(bells).toHaveLength(0);
  });

  it("a failed sync is reported, not hidden; the row stands", async () => {
    syncFails = true;
    const res = await pause();
    expect(res.scopeSynced).toBe(false);
    expect(rows()).toHaveLength(1);
  });

  it("the community list shows pauses in force only", async () => {
    openRow({ id: "in-force" });
    openRow({ id: "ended", member: ID2.memberNoLogin, ends_at: "2026-01-02T00:00:00.000Z" });
    openRow({ id: "lifted", member: ID2.memberPm, lifted_at: "2026-01-02T00:00:00.000Z" });
    openRow({ id: "elsewhere", organization: OTHER, member: ID.memberOther });
    const res = await get(ev({ query: { orgId: ORG } }));
    expect(res.open).toEqual([{ id: "in-force", member: ID.memberBob, endsAt: null }]);
  });
});

describe("lifting", () => {
  it("ends it now, by the admin, without deleting it; the history keeps both", async () => {
    const row = openRow();
    const res = await lift(ev({ params: { id: row.id }, body: { orgId: ORG } }));
    expect(res).toMatchObject({ lifted: true, recorded: true, notified: true, scopeSynced: true });
    expect(rows()).toHaveLength(1);
    expect(row.lifted_at).toBe(res.liftedAt);
    expect(row.lifted_by).toBe(ID.userAdmin);
    expect(writes().filter((w) => w.op === "deleteItem")).toHaveLength(0);
    expect(synced).toEqual([[ID.memberBob]]);
    const history = await get(ev({ query: { orgId: ORG, member: ID.memberBob } }));
    expect(history.rows[0]).toMatchObject({ inForce: false, imposedBy: "Ada Min", liftedBy: "Ada Min", internalNote: "Third warning." });
  });

  it("409 when already ended, by a lift or its date", async () => {
    const lifted = openRow({ lifted_at: "2026-01-02T00:00:00.000Z" });
    const ended = openRow({ ends_at: "2026-01-02T00:00:00.000Z" });
    for (const r of [lifted, ended]) {
      await expect(lift(ev({ params: { id: r.id }, body: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 409 });
    }
    expect(ledger).toHaveLength(0);
  });

  it("the lift's entry is board-visible and the member's bell rings", async () => {
    const row = openRow();
    await lift(ev({ params: { id: row.id }, body: { orgId: ORG } }));
    expect(ledger[0]).toMatchObject({ event_type: "member_restriction_lifted", visibility: "board" });
    expect(JSON.stringify(ledger[0])).not.toContain("Third warning");
    expect(bells[0]).toMatchObject({ recipientUserIds: [ID.userBob], category: "membership", mustReach: true });
  });
});

describe("mine", () => {
  // mine reads in one batch; here the batch is the same specs read one by one against the fake.
  let batches: string[][];
  beforeEach(() => {
    batches = [];
    vi.stubGlobal("readItemsBatch", async (specs: any) => {
      batches.push(Object.keys(specs));
      return (await import("#core/server/utils/directus-graphql")).readItemsBatchRest(specs);
    });
  });
  afterEach(() => {
    vi.stubGlobal("readItemsBatch", undefined);
  });
  const failBatch = () =>
    vi.stubGlobal("readItemsBatch", async () => {
      throw new Error("graphql down");
    });

  it("reads the memberships and their open pauses in one batch", async () => {
    openRow({ ends_at: "2099-01-01T00:00:00.000Z" });
    as(PERSONAS.owner);
    await mine(ev({ query: { orgId: ORG } }));
    expect(batches).toEqual([["mr_mine", "mr_open"]]);
    // The two specs, then (only for a pause) the community's clock for `until`.
    expect(fake.calls.filter((c) => c.op === "readItems").map((c) => c.collection)).toEqual(["hoa_members", "hoa_member_restrictions", "hoa_organizations"]);
  });

  it("answers the same, in two rounds, when the batch fails", async () => {
    openRow({ ends_at: "2099-01-01T00:00:00.000Z" });
    openRow({ member: ID.memberAnn, member_note: "Not Bob's." });
    openRow({ lifted_at: "2026-02-01T00:00:00.000Z", member_note: "Lifted." });
    as(PERSONAS.owner);
    const ok = await mine(ev({ query: { orgId: ORG } }));
    failBatch();
    expect(await mine(ev({ query: { orgId: ORG } }))).toEqual(ok);
    expect(ok).toMatchObject({ restricted: true, memberNote: "Paused." });
    as(PERSONAS.board);
    const ann = await mine(ev({ query: { orgId: ORG } }));
    expect(ann).toMatchObject({ restricted: true, memberNote: "Not Bob's." });
  });

  it("a refusal shows nothing of anyone's pause", async () => {
    openRow({ member_note: "Bob's note." });
    as(PERSONAS.outsider);
    const err = await mine(ev({ query: { orgId: ORG } })).catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(err)).not.toContain("Bob's note.");
  });

  it("returns only the member-facing fields of the caller's own pause", async () => {
    openRow({ ends_at: "2099-01-01T00:00:00.000Z" });
    as(PERSONAS.owner);
    const res = await mine(ev({ query: { orgId: ORG } }));
    expect(res).toEqual({ restricted: true, endsAt: "2099-01-01T00:00:00.000Z", memberNote: "Paused.", until: "until December 31, 2098" });
  });

  it("not paused: nothing to say; and someone else's pause is not theirs", async () => {
    openRow({ member: ID.memberAnn });
    as(PERSONAS.owner);
    expect(await mine(ev({ query: { orgId: ORG } }))).toEqual({ restricted: false, endsAt: null, memberNote: null, until: null });
  });

  it("403 for someone who is not an active member there; 401 without a session", async () => {
    as(PERSONAS.outsider);
    await expect(mine(ev({ query: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 403 });
    as(PERSONAS.nobody);
    await expect(mine(ev({ query: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 401 });
  });

  it("heals the mirror: a pause past its end date reopens posts_in", async () => {
    state.db.hoa_members!.find((m) => m.id === ID.memberBob)!.posts_in = null;
    openRow({ ends_at: "2026-01-02T00:00:00.000Z" });
    as(PERSONAS.owner);
    await mine(ev({ query: { orgId: ORG } }));
    expect(synced).toEqual([[ID.memberBob]]);
  });
});

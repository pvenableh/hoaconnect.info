/**
 * The delegation routes (docs/spec-delegation.md): admin only on every route,
 * every member and team read through the org filter, a no-op writes nothing,
 * off ends a row and never deletes it, and every change is in the ledger.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const HOA_ADMIN = "role-hoa-admin";
const PM = "role-pm";
const ID2 = {
  memberPm: uuid(201),
  memberAdminRole: uuid(202),
  memberGone: uuid(203),
  teamOther: uuid(204),
  teamArchived: uuid(205),
};

const state: { who: Who; db: Db } = { who: PERSONAS.admin, db: seed() };
let fake: ReturnType<typeof stubGlobals>;
let ledger: any[] = [];
let ledgerFails = false;

const R = "#core/server/api/org/area-grants";
let post: (e: any) => Promise<any>;
let get: (e: any) => Promise<any>;

function extend(db: Db) {
  db.hoa_members!.push(
    { id: ID2.memberPm, organization: ORG, user: uuid(206), first_name: "Pat", last_name: "Manager", status: "active", role: PM },
    { id: ID2.memberAdminRole, organization: ORG, user: uuid(207), first_name: "Ada", last_name: "Second", status: "active", role: HOA_ADMIN },
    { id: ID2.memberGone, organization: ORG, user: uuid(208), first_name: "Gil", last_name: "Gone", status: "archived" }
  );
  db.hoa_teams!.push(
    { id: ID2.teamOther, organization: OTHER, name: "Their committee", status: "active" },
    { id: ID2.teamArchived, organization: ORG, name: "Old committee", status: "archived" }
  );
  db.hoa_area_grants = [];
  db.hoa_team_members = [];
}

beforeAll(async () => {
  fake = stubGlobals(state);
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { directusRoleHoaAdmin: HOA_ADMIN, directusRolePropertyManager: PM } }));
  vi.stubGlobal("writeAuditEntry", async (entry: any) => {
    if (ledgerFails) throw new Error("ledger down");
    ledger.push(entry);
    return "audit-1";
  });
  post = (await import(/* @vite-ignore */ `${R}/index.post`)).default;
  get = (await import(/* @vite-ignore */ `${R}/index.get`)).default;
});

beforeEach(() => {
  state.db = seed();
  extend(state.db);
  state.who = PERSONAS.admin;
  ledger = [];
  ledgerFails = false;
  fake.reset();
});

const as = (who: Who) => (state.who = who);
const grants = () => state.db.hoa_area_grants!;
const writes = () => fake.calls.filter((c) => c.op !== "readItems" && c.op !== "readItem");
const give = (body: any) => post(ev({ body: { orgId: ORG, ...body } }));

const HELPER: Who = { ...PERSONAS.owner, helps: ["projects", "responsibilities"] };

describe("who may call", () => {
  const calls = {
    post: () => give({ member: ID.memberBob, area: "projects", value: true }),
    list: () => get(ev({ query: { orgId: ORG } })),
    holder: () => get(ev({ query: { orgId: ORG, member: ID.memberBob } })),
  };

  for (const [name, call] of Object.entries(calls)) {
    it(`${name}: 401 without a session`, async () => {
      as(PERSONAS.nobody);
      await expect(call()).rejects.toMatchObject({ statusCode: 401 });
    });

    it(`${name}: 403 for a plain member, a board seat, a manager and a helper, writing nothing`, async () => {
      for (const who of [PERSONAS.owner, PERSONAS.board, PERSONAS.manager, PERSONAS.editor, HELPER]) {
        as(who);
        await expect(call(), JSON.stringify(who)).rejects.toMatchObject({ statusCode: 403 });
      }
      expect(writes()).toHaveLength(0);
      expect(ledger).toHaveLength(0);
    });
  }

  it("a helper cannot widen their own grants", async () => {
    as({ ...HELPER });
    await expect(give({ member: ID.memberBob, area: "documents", value: true })).rejects.toMatchObject({ statusCode: 403 });
    expect(grants()).toHaveLength(0);
  });

  it("400 without orgId, and for a bad body", async () => {
    await expect(post(ev({ body: { member: ID.memberBob, area: "projects", value: true } }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(get(ev({ query: {} }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(give({ area: "projects", value: true })).rejects.toMatchObject({ statusCode: 400 });
    await expect(give({ member: ID.memberBob, team: ID.teamGrounds, area: "projects", value: true })).rejects.toMatchObject({ statusCode: 400 });
    await expect(give({ member: ID.memberBob, area: "projects" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(get(ev({ query: { orgId: ORG, member: ID.memberBob, team: ID.teamGrounds } }))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("400 for an area a helper cannot hold", async () => {
    for (const area of ["inquiries", "violations", "directory", "communications", "activity", "contact_platform", "billing"]) {
      await expect(give({ member: ID.memberBob, area, value: true }), area).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(grants()).toHaveLength(0);
  });

  it("404 for another community's member or team", async () => {
    await expect(give({ member: ID.memberOther, area: "projects", value: true })).rejects.toMatchObject({ statusCode: 404 });
    await expect(give({ team: ID2.teamOther, area: "projects", value: true })).rejects.toMatchObject({ statusCode: 404 });
    await expect(get(ev({ query: { orgId: ORG, member: ID.memberOther } }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(get(ev({ query: { orgId: ORG, team: ID2.teamOther } }))).rejects.toMatchObject({ statusCode: 404 });
    expect(writes()).toHaveLength(0);
  });
});

describe("who can hold", () => {
  it("refuses a property manager and an admin (400)", async () => {
    await expect(give({ member: ID2.memberPm, area: "projects", value: true })).rejects.toMatchObject({ statusCode: 400, message: "Use Property management for a property manager." });
    await expect(give({ member: ID2.memberAdminRole, area: "projects", value: true })).rejects.toMatchObject({ statusCode: 400, message: "Admins already work every area." });
  });

  it("refuses to open one for an inactive member or an archived committee (409), but lets one be ended", async () => {
    await expect(give({ member: ID2.memberGone, area: "projects", value: true })).rejects.toMatchObject({ statusCode: 409 });
    await expect(give({ team: ID2.teamArchived, area: "projects", value: true })).rejects.toMatchObject({ statusCode: 409 });
    grants().push({ id: "g-old", organization: ORG, area: "projects", member: ID2.memberGone, team: null, starts_at: "2026-01-01T00:00:00Z", ends_at: null });
    const res = await give({ member: ID2.memberGone, area: "projects", value: false });
    expect(res.changed).toBe(true);
    expect(grants()[0]).toMatchObject({ end_reason: "revoked", holder_name: "Gil Gone" });
  });
});

describe("switching", () => {
  it("on opens a row from now by the admin, and writes one ledger entry", async () => {
    const res = await give({ member: ID.memberBob, area: "projects", value: true });
    expect(res).toMatchObject({ changed: true, areas: ["projects"], recorded: true, summary: "Bob Diaz can now work on Projects." });
    expect(grants()).toHaveLength(1);
    expect(grants()[0]).toMatchObject({ organization: ORG, area: "projects", member: ID.memberBob, team: null, granted_by: ID.userAdmin });
    expect(grants()[0].ends_at ?? null).toBeNull();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ event_type: "helper_grant_changed", organization: ORG, visibility: "owners" });
    // The session carries no name; the entry still names the admin, not a login.
    expect(ledger[0]).toMatchObject({ actor_user: ID.userAdmin, actor_name: "Ada Min" });
  });

  it("on twice is a no-op: no second row, no second entry", async () => {
    await give({ member: ID.memberBob, area: "projects", value: true });
    const res = await give({ member: ID.memberBob, area: "projects", value: true });
    expect(res).toMatchObject({ changed: false, areas: ["projects"], recorded: false });
    expect(grants()).toHaveLength(1);
    expect(ledger).toHaveLength(1);
  });

  it("off with nothing open writes nothing", async () => {
    const res = await give({ member: ID.memberBob, area: "projects", value: false });
    expect(res.changed).toBe(false);
    expect(writes()).toHaveLength(0);
    expect(ledger).toHaveLength(0);
  });

  it("off ends the row, freezing the name, and deletes nothing", async () => {
    await give({ member: ID.memberBob, area: "projects", value: true });
    const res = await give({ member: ID.memberBob, area: "projects", value: false });
    expect(res).toMatchObject({ changed: true, areas: [], summary: "Bob Diaz no longer works on Projects." });
    expect(grants()).toHaveLength(1);
    expect(grants()[0]).toMatchObject({ end_reason: "revoked", ended_by: ID.userAdmin, holder_name: "Bob Diaz" });
    expect(typeof grants()[0].ends_at).toBe("string");
    expect(fake.calls.some((c) => c.op === "deleteItem")).toBe(false);
    expect(ledger).toHaveLength(2);
  });

  it("a committee holds a row of its own", async () => {
    const res = await give({ team: ID.teamGrounds, area: "responsibilities", value: true });
    expect(res.summary).toBe("The Grounds committee can now work on Responsibilities register.");
    expect(grants()[0]).toMatchObject({ team: ID.teamGrounds, member: null });
  });

  it("reports a ledger failure rather than a clean success; the change stands", async () => {
    ledgerFails = true;
    const res = await give({ member: ID.memberBob, area: "feedback", value: true });
    expect(res).toMatchObject({ changed: true, recorded: false, recordError: "ledger down" });
    expect(grants()).toHaveLength(1);
  });
});

describe("reading", () => {
  it("says who cannot hold an area, so the page offers no switch the POST would refuse", async () => {
    const read = (q: any) => get(ev({ query: { orgId: ORG, ...q } }));
    expect(await read({ member: ID2.memberPm })).toMatchObject({ canHold: false, reason: "A property manager's areas are set in Property management." });
    expect(await read({ member: ID2.memberAdminRole })).toMatchObject({ canHold: false, reason: "Admins already work every area." });
    expect(await read({ member: ID2.memberGone })).toMatchObject({ canHold: false });
    expect(await read({ team: ID2.teamArchived })).toMatchObject({ canHold: false });
    expect(await read({ team: ID.teamGrounds })).toMatchObject({ canHold: true });
  });

  it("a holder's rows, open and ended, with who granted and ended each", async () => {
    await give({ member: ID.memberBob, area: "projects", value: true });
    await give({ member: ID.memberBob, area: "projects", value: false });
    await give({ member: ID.memberBob, area: "documents", value: true });
    const res = await get(ev({ query: { orgId: ORG, member: ID.memberBob } }));
    expect(res.holder).toMatchObject({ kind: "member", id: ID.memberBob, name: "Bob Diaz" });
    expect(res).toMatchObject({ canHold: true, reason: null });
    expect(res.open).toEqual(["documents"]);
    expect(res.rows).toHaveLength(2);
    expect(res.rows.find((r: any) => r.area === "projects")).toMatchObject({ open: false, grantedBy: "Ada Min", endedBy: "Ada Min", endReason: "revoked" });
  });

  it("the community's open rows, never another community's", async () => {
    await give({ member: ID.memberBob, area: "projects", value: true });
    await give({ team: ID.teamGrounds, area: "feedback", value: true });
    grants().push({ id: "g-other", organization: OTHER, area: "projects", member: ID.memberOther, starts_at: "2026-01-01T00:00:00Z", ends_at: null });
    const res = await get(ev({ query: { orgId: ORG } }));
    expect(res.open).toHaveLength(2);
    expect(res.open.map((r: any) => r.member ?? r.team).sort()).toEqual([ID.memberBob, ID.teamGrounds].sort());
  });
});

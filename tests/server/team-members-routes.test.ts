/**
 * Committee membership routes (docs/spec-delegation.md): joining a committee
 * grants its areas, so every change is admin only, read through the org
 * filter, and recorded in the ledger with the areas that came or went.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const ROW = uuid(401);
const ROW_OTHER = uuid(402);
const TEAM_OTHER = uuid(403);
const TEAM_ARCHIVED = uuid(404);
const MEMBER_NO_LOGIN = uuid(405);
const MEMBER_GONE = uuid(406);

const state: { who: Who; db: Db } = { who: PERSONAS.admin, db: seed() };
let fake: ReturnType<typeof stubGlobals>;
let ledger: any[] = [];

let add: (e: any) => Promise<any>;
let patch: (e: any) => Promise<any>;
let remove: (e: any) => Promise<any>;

beforeAll(async () => {
  fake = stubGlobals(state);
  vi.stubGlobal("writeAuditEntry", async (entry: any) => {
    ledger.push(entry);
    return "audit-1";
  });
  add = (await import("#core/server/api/org/teams/[id]/members.post")).default as any;
  patch = (await import("#core/server/api/org/teams/members/[id].patch")).default as any;
  remove = (await import("#core/server/api/org/teams/members/[id].delete")).default as any;
});

beforeEach(() => {
  const db = seed();
  db.hoa_teams!.push(
    { id: TEAM_OTHER, organization: OTHER, name: "Theirs", status: "active" },
    { id: TEAM_ARCHIVED, organization: ORG, name: "Old", status: "archived" }
  );
  db.hoa_members!.push(
    { id: MEMBER_NO_LOGIN, organization: ORG, user: null, first_name: "No", last_name: "Login", status: "active" },
    { id: MEMBER_GONE, organization: ORG, user: uuid(407), first_name: "Gil", last_name: "Gone", status: "archived" }
  );
  db.hoa_team_members = [
    { id: ROW, organization: ORG, team: ID.teamGrounds, user: ID.userAnn, member: ID.memberAnn, role: "member" },
    { id: ROW_OTHER, organization: OTHER, team: TEAM_OTHER, user: uuid(9), member: ID.memberOther, role: "member" },
  ];
  db.hoa_area_grants = [
    { id: uuid(408), organization: ORG, area: "projects", team: ID.teamGrounds, member: null, starts_at: "2026-01-01T00:00:00Z", ends_at: null },
  ];
  state.db = db;
  state.who = PERSONAS.admin;
  ledger = [];
  fake.reset();
});

const as = (who: Who) => (state.who = who);
const rows = () => state.db.hoa_team_members!;
const writes = () => fake.calls.filter((c) => c.op !== "readItems" && c.op !== "readItem");

const VALID = {
  add: () => add(ev({ params: { id: ID.teamGrounds }, body: { orgId: ORG, member: ID.memberBob } })),
  patch: () => patch(ev({ params: { id: ROW }, body: { orgId: ORG, role: "lead" } })),
  remove: () => remove(ev({ params: { id: ROW }, query: { orgId: ORG } })),
};

describe("who may call", () => {
  for (const [name, call] of Object.entries(VALID)) {
    it(`${name}: 401 without a session`, async () => {
      as(PERSONAS.nobody);
      await expect(call()).rejects.toMatchObject({ statusCode: 401 });
    });

    it(`${name}: 403 for a plain member, a board seat, a manager and a committee member`, async () => {
      for (const who of [PERSONAS.owner, PERSONAS.board, PERSONAS.manager, { ...PERSONAS.board, helps: ["projects"] }]) {
        as(who);
        await expect(call()).rejects.toMatchObject({ statusCode: 403 });
      }
      expect(writes()).toHaveLength(0);
      expect(ledger).toHaveLength(0);
    });
  }

  it("400 without orgId or with a bad body", async () => {
    await expect(add(ev({ params: { id: ID.teamGrounds }, body: { member: ID.memberBob } }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(add(ev({ params: { id: ID.teamGrounds }, body: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(patch(ev({ params: { id: ROW }, body: { orgId: ORG, role: "chair" } }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(remove(ev({ params: { id: ROW }, query: {} }))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("404 for another community's team, member or row", async () => {
    await expect(add(ev({ params: { id: TEAM_OTHER }, body: { orgId: ORG, member: ID.memberBob } }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(add(ev({ params: { id: ID.teamGrounds }, body: { orgId: ORG, member: ID.memberOther } }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(patch(ev({ params: { id: ROW_OTHER }, body: { orgId: ORG, role: "lead" } }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(remove(ev({ params: { id: ROW_OTHER }, query: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 404 });
    expect(writes()).toHaveLength(0);
  });
});

describe("adding", () => {
  it("adds an active member with a login, and records the areas that came with it", async () => {
    const res = await VALID.add();
    expect(res.summary).toBe("Bob Diaz joined the Grounds committee (Projects).");
    expect(rows().find((r) => r.member === ID.memberBob)).toMatchObject({ team: ID.teamGrounds, user: ID.userBob, organization: ORG, role: "member" });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ event_type: "committee_member_changed", visibility: "owners" });
  });

  it("refuses (409) an archived committee, an inactive member, one with no login, and a second row", async () => {
    await expect(add(ev({ params: { id: TEAM_ARCHIVED }, body: { orgId: ORG, member: ID.memberBob } }))).rejects.toMatchObject({ statusCode: 409 });
    await expect(add(ev({ params: { id: ID.teamGrounds }, body: { orgId: ORG, member: MEMBER_GONE } }))).rejects.toMatchObject({ statusCode: 409 });
    await expect(add(ev({ params: { id: ID.teamGrounds }, body: { orgId: ORG, member: MEMBER_NO_LOGIN } }))).rejects.toMatchObject({ statusCode: 409 });
    await expect(add(ev({ params: { id: ID.teamGrounds }, body: { orgId: ORG, member: ID.memberAnn } }))).rejects.toMatchObject({ statusCode: 409 });
    expect(ledger).toHaveLength(0);
  });
});

describe("changing and removing", () => {
  it("makes a member the lead, once", async () => {
    expect((await VALID.patch()).summary).toBe("Ann Lee became the lead of the Grounds committee.");
    expect(rows().find((r) => r.id === ROW)?.role).toBe("lead");
    expect((await VALID.patch()).changed).toBe(false);
    expect(ledger).toHaveLength(1);
  });

  it("removes them, naming the areas they lose", async () => {
    const res = await VALID.remove();
    expect(res.summary).toBe("Ann Lee left the Grounds committee (Projects).");
    expect(rows().find((r) => r.id === ROW)).toBeUndefined();
    expect(ledger).toHaveLength(1);
  });
});

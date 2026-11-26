/**
 * The routes that make inquiries, violations, directory, communications and
 * meetings holdable by a helper or committee (docs/spec-delegation.md): each
 * reads and writes with the app's token behind requireAreaWork, so a helper
 * (a plain HOA Member in Directus) works the area the way a manager does, and
 * nobody without the area gets in. Run against the in-memory Directus.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const state: { who: Who; db: Db } = { who: PERSONAS.admin, db: seed() };

/** requireAreaWork as manager-access.ts decides it, on the personas. */
function areaGate() {
  return async (_e: any, _orgId: string, key: string) => {
    const who = state.who;
    if (who.admin) return { via: "admin" };
    if (who.grants?.[key] === true) return { via: "manager" };
    if ((who.helps ?? []).includes(key)) return { via: "helper" };
    throw Object.assign(new Error(`Not authorized for this action (${key})`), { statusCode: 403 });
  };
}

const helper = (...areas: string[]): Who => ({ ...PERSONAS.owner, helps: areas });

beforeAll(() => {
  stubGlobals(state);
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireAreaWork", areaGate());
});

beforeEach(() => {
  state.db = seed();
  state.who = PERSONAS.admin;
});

/** The common refusals: 401 without a session, 400 without orgId, 403 without the area. */
async function refusals(call: (o: { query?: any; body?: any; params?: any }) => Promise<any>, input: { query?: any; body?: any; params?: any }, area: string) {
  state.who = PERSONAS.nobody;
  await expect(call(input)).rejects.toMatchObject({ statusCode: 401 });
  state.who = PERSONAS.admin;
  const noOrg = { ...input, query: input.query ? { ...input.query, orgId: undefined } : undefined, body: input.body ? { ...input.body, orgId: undefined } : undefined };
  await expect(call(noOrg)).rejects.toMatchObject({ statusCode: 400 });
  for (const who of [PERSONAS.owner, PERSONAS.board, helper("projects"), { ...PERSONAS.manager, grants: { projects: true } }]) {
    state.who = who;
    await expect(call(input), JSON.stringify(who)).rejects.toMatchObject({ statusCode: 403 });
  }
  state.who = helper(area);
}

describe("GET /api/org/directory", () => {
  let route: (e: any) => Promise<any>;
  beforeAll(async () => {
    route = (await import("#core/server/api/org/directory/index.get")).default as any;
  });
  const call = (o: { query?: any }) => route(ev(o));

  beforeEach(() => {
    state.db.hoa_members!.push(
      { id: uuid(901), organization: ORG, first_name: "Ina", last_name: "Active", email: "ina@example.test", phone: "555-0101", member_type: "owner", status: "inactive" },
      { id: uuid(902), organization: ORG, first_name: "Cy", last_name: "Tenant", email: "cy@example.test", phone: null, member_type: "tenant", status: "active" }
    );
  });

  it("refuses without a session, an orgId or the directory area", async () => {
    await refusals(call, { query: { orgId: ORG } }, "directory");
  });

  it("a helper holding directory reads the active members with contact fields, this community only", async () => {
    for (const who of [helper("directory"), PERSONAS.manager, PERSONAS.admin]) {
      state.who = who;
      const { members } = await call({ query: { orgId: ORG } });
      const ids = members.map((m: any) => m.id);
      expect(ids).toContain(uuid(902));
      expect(ids).not.toContain(uuid(901));
      expect(ids).not.toContain(ID.memberOther);
      expect(members.find((m: any) => m.id === uuid(902))).toMatchObject({ first_name: "Cy", email: "cy@example.test", member_type: "tenant" });
    }
  });

  it("asks for the fields the page shows, filtered to the community", async () => {
    const calls = stubGlobals(state);
    vi.stubGlobal("requireAreaWork", areaGate());
    await call({ query: { orgId: ORG } });
    const read = calls.calls.find((c: any) => c.collection === "hoa_members");
    expect(read.query.filter).toEqual({ organization: { _eq: ORG }, status: { _eq: "active" } });
    expect(read.query.fields).toEqual(["id", "first_name", "last_name", "email", "phone", "member_type"]);
  });
});

describe("change requests (directory approvals)", () => {
  it("a helper holding directory is a change reviewer; a plain owner is not", async () => {
    vi.stubGlobal("getHelperAreas", async () => state.who.helps ?? []);
    const { isChangeReviewer } = await import("#core/server/utils/change-request-access");
    state.who = helper("directory");
    expect(await isChangeReviewer(ev(), ORG)).toBe(true);
    state.who = helper("projects");
    expect(await isChangeReviewer(ev(), ORG)).toBe(false);
    state.who = PERSONAS.manager;
    expect(await isChangeReviewer(ev(), ORG)).toBe(true);
  });
});

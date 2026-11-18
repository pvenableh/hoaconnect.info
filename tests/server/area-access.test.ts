/**
 * Who holds an area, read on the server (docs/spec-delegation.md): the real
 * getHelperAreas against an in-memory Directus, and the gates that read it.
 * A helper works what they were given and nothing else, never through money,
 * and never becomes the property_manager actor.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const PM = "role-pm";
const state: { who: Who; db: Db } = { who: PERSONAS.owner, db: seed() };
let access: typeof import("#core/server/utils/manager-access");

const OPEN = "2026-01-01T00:00:00.000Z";
let n = 300;
const row = (over: Record<string, any>) => ({ id: uuid(n++), organization: ORG, area: "projects", member: null, team: null, starts_at: OPEN, ends_at: null, ...over });

beforeAll(async () => {
  stubGlobals(state);
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { directusRolePropertyManager: PM } }));
  access = await import("#core/server/utils/manager-access");
});

beforeEach(() => {
  state.db = seed();
  state.db.hoa_area_grants = [];
  state.db.hoa_team_members = [{ id: "tm-1", organization: ORG, team: ID.teamGrounds, user: ID.userBob, member: ID.memberBob, role: "member" }];
  state.who = PERSONAS.owner; // Bob, a plain owner
});

const helps = () => access.getHelperAreas(ev(), ORG);

describe("getHelperAreas", () => {
  it("reads a row naming the member", async () => {
    state.db.hoa_area_grants!.push(row({ member: ID.memberBob, area: "documents" }));
    expect(await helps()).toEqual(["documents"]);
  });

  it("a committee member holds the committee's areas while on it", async () => {
    state.db.hoa_area_grants!.push(row({ team: ID.teamGrounds, area: "responsibilities" }));
    expect(await helps()).toEqual(["responsibilities"]);
  });

  it("loses them when removed from the committee", async () => {
    state.db.hoa_area_grants!.push(row({ team: ID.teamGrounds, area: "responsibilities" }));
    state.db.hoa_team_members = [];
    expect(await helps()).toEqual([]);
  });

  it("loses them when the committee is archived", async () => {
    state.db.hoa_area_grants!.push(row({ team: ID.teamGrounds, area: "responsibilities" }));
    state.db.hoa_teams![0].status = "archived";
    expect(await helps()).toEqual([]);
  });

  it("an inactive membership holds nothing, whatever the rows say", async () => {
    state.db.hoa_area_grants!.push(row({ member: ID.memberBob }), row({ team: ID.teamGrounds, area: "feedback" }));
    state.who = { ...PERSONAS.owner, memberId: null }; // checkMembership reads active rows only
    expect(await helps()).toEqual([]);
  });

  it("ignores ended, future, other-org and non-helper rows", async () => {
    state.db.hoa_area_grants!.push(
      row({ member: ID.memberBob, ends_at: "2026-02-01T00:00:00.000Z" }),
      row({ member: ID.memberBob, area: "feedback", starts_at: "2999-01-01T00:00:00.000Z" }),
      row({ member: ID.memberBob, area: "documents", organization: OTHER }),
      row({ member: ID.memberBob, area: "inquiries" }),
      row({ member: ID.memberBob, area: "communications" })
    );
    expect(await helps()).toEqual([]);
  });

  it("someone else's row is not mine", async () => {
    state.db.hoa_area_grants!.push(row({ member: ID.memberAnn }));
    expect(await helps()).toEqual([]);
  });

  it("fails closed when the collection cannot be read", async () => {
    state.db.hoa_area_grants!.push(row({ member: ID.memberBob }));
    vi.stubGlobal("getTypedDirectus", () => ({ request: async () => { throw new Error("no collection"); } }));
    try {
      expect(await helps()).toEqual([]);
    } finally {
      stubGlobals(state);
    }
  });
});

describe("the gates", () => {
  beforeEach(() => {
    state.db.hoa_area_grants!.push(row({ member: ID.memberBob, area: "projects" }), row({ member: ID.memberBob, area: "inquiries" }));
  });

  it("requireAreaWork admits a helper for their area, and no other", async () => {
    expect(await access.requireAreaWork(ev(), ORG, "projects")).toEqual({ via: "helper" });
    await expect(access.requireAreaWork(ev(), ORG, "inquiries")).rejects.toMatchObject({ statusCode: 403 });
    await expect(access.requireAreaWork(ev(), ORG, "documents")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("the expense writes gate on money:enter, which a helper with projects never gets", async () => {
    await expect(access.requireAdminOrManagerGrant(ev(), ORG, "projects")).rejects.toMatchObject({ statusCode: 403 });
    // docs/spec-money-approvals.md: every write route asks requireMoneyEnter.
    for (const f of ["index.post.ts", "[id].patch.ts", "[id].delete.ts", "[id]/submit.post.ts", "[id]/pay.post.ts", "[id]/void.post.ts", "receipt.post.ts"]) {
      const src = readFileSync(join(process.cwd(), "core/server/api/org/expenses", f), "utf8");
      expect(src, f).toContain("requireMoneyEnter(");
      expect(src, f).not.toContain("requireAreaWork");
    }
    // money:enter comes from a seat, admin, or the property manager's own grant, never a helper area.
    const roleContext = readFileSync(join(process.cwd(), "core/server/utils/role-context.ts"), "utf8");
    const line = roleContext.split("\n").find((l) => l.includes('"money:enter"'));
    expect(line).toBe('  if (grants?.projects === true) caps.add("money:enter");');
  });

  it("a helper is never the property_manager actor", async () => {
    expect(await access.getManagerGrants(ev(), ORG)).toBeNull();
    const boardAccess = readFileSync(join(process.cwd(), "core/server/utils/board-access.ts"), "utf8");
    expect(boardAccess).not.toMatch(/getHelperAreas|getAreaGrants|hoa_area_grants/);
  });

  it("an admin and a manager pass as before", async () => {
    state.who = PERSONAS.admin;
    expect(await access.requireAreaWork(ev(), ORG, "projects")).toEqual({ via: "admin" });
    state.db.hoa_members!.push({ id: uuid(250), organization: ORG, user: uuid(251), status: "active", role: PM, manager_permissions: { projects: true } });
    state.who = { userId: uuid(251), memberId: uuid(250) };
    expect(await access.requireAreaWork(ev(), ORG, "projects")).toEqual({ via: "manager" });
    expect(await access.requireAdminOrManagerGrant(ev(), ORG, "projects")).toEqual({ via: "manager" });
  });

  it("getAreaGrants merges both kinds", async () => {
    const g = await access.getAreaGrants(ev(), ORG);
    expect(g.manager).toBeNull();
    expect(g.helps).toEqual(["projects"]);
    expect(g.areas.projects).toBe(true);
    expect(g.areas.inquiries).toBe(false);
  });
});

describe("the area utils read helpers (stubbed reader)", () => {
  it("polls: a helper with feedback manages; without it, only votes", async () => {
    const { getPollAccess } = await import("#core/server/utils/poll-access");
    state.who = { ...PERSONAS.owner, helps: ["feedback"] };
    expect((await getPollAccess(ev(), ORG)).canManage).toBe(true);
    state.who = { ...PERSONAS.owner, helps: [] };
    expect((await getPollAccess(ev(), ORG)).canManage).toBe(false);
  });

  it("the register: a helper with responsibilities edits; it never makes them admin", async () => {
    const { getResponsibilityAccess } = await import("#core/server/utils/responsibility-access");
    state.who = { ...PERSONAS.owner, helps: ["responsibilities"] };
    expect(await getResponsibilityAccess(ev(), ORG)).toMatchObject({ canEdit: true, canRead: true, isAdmin: false });
    state.who = { ...PERSONAS.owner, helps: ["projects"] };
    expect(await getResponsibilityAccess(ev(), ORG)).toMatchObject({ canEdit: false, canRead: false });
  });

  it("projects: a helper with projects writes every project", async () => {
    vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: state.who.userId }));
    vi.stubGlobal("requireMembership", async () => ({ memberId: state.who.memberId }));
    const { getProjectAccess } = await import("#core/server/utils/project-access");
    state.who = { ...PERSONAS.owner, helps: ["projects"] };
    expect((await getProjectAccess(ev(), ORG)).canWriteAll).toBe(true);
    state.who = { ...PERSONAS.owner, helps: ["feedback"] };
    expect((await getProjectAccess(ev(), ORG)).canWriteAll).toBe(false);
  });
});

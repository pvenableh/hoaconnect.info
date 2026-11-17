/**
 * GET /api/org/member-names and the server helpers: names only, only this
 * community's memberships, only for its members and admins.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const state: { who: Who; db: Db } = { who: PERSONAS.owner, db: seed() };
let get: (e: any) => Promise<any>;
let helpers: typeof import("#core/server/utils/member-names");

beforeAll(async () => {
  stubGlobals(state);
  get = (await import("#core/server/api/org/member-names.get")).default;
  helpers = await import("#core/server/utils/member-names");
});

beforeEach(() => {
  state.db = seed();
  // Ann's login calls itself something else; the community's record says Ann Lee.
  state.db.directus_users!.find((u) => u.id === ID.userAnn)!.first_name = "Abby";
  state.who = PERSONAS.owner;
});

const ask = (users: string[], orgId: string = ORG) => get(ev({ query: { orgId, users: users.join(",") } }));

describe("GET /api/org/member-names", () => {
  it("401 without a session, 400 without orgId, 403 for someone with no seat here", async () => {
    state.who = PERSONAS.nobody;
    await expect(ask([ID.userAnn])).rejects.toMatchObject({ statusCode: 401 });
    state.who = PERSONAS.owner;
    await expect(ask([ID.userAnn], "")).rejects.toMatchObject({ statusCode: 400 });
    state.who = PERSONAS.outsider;
    await expect(ask([ID.userAnn])).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns the membership's name, never the login's, and nothing else", async () => {
    const res = await ask([ID.userAnn, ID.userBob]);
    expect(res).toEqual({ names: { [ID.userAnn]: "Ann Lee", [ID.userBob]: "Bob Diaz" } });
  });

  it("leaves out logins with no membership in this community", async () => {
    // uuid(9) is a member of another community only; uuid(99) of none.
    expect(await ask([uuid(9), uuid(99)])).toEqual({ names: {} });
  });
});

describe("the helpers", () => {
  it("ledgerActorFor names the person by their membership, then their login", async () => {
    expect(await helpers.ledgerActorFor(ORG, { id: ID.userAnn, email: "ann@example.test" })).toMatchObject({ name: "Ann Lee" });
    expect(await helpers.ledgerActorFor(OTHER, { id: ID.userAnn, email: "ann@example.test" })).toMatchObject({ name: "Abby Lee" });
  });

  it("memberNameFor falls back to the login's name, then the fallback", async () => {
    expect(await helpers.memberNameFor(ORG, { id: ID.userAnn, first_name: "Abby", last_name: "Lee" })).toBe("Ann Lee");
    expect(await helpers.memberNameFor(OTHER, { id: ID.userAnn, first_name: "Abby", last_name: "Lee" })).toBe("Abby Lee");
    expect(await helpers.memberNameFor(ORG, null, "A member")).toBe("A member");
  });
});

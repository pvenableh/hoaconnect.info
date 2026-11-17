/**
 * A resident asks to change the name on file (hoa_members), the name other
 * members see. Like the phone number, it is a request an admin approves; only
 * the two name fields can travel in it, whatever else is sent.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, PERSONAS, ev, seed, stubGlobals, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const state: { who: Who; db: Db } = { who: PERSONAS.owner, db: seed() };
let submit: (e: any) => Promise<any>;
let applyChangeRequest: typeof import("#core/server/utils/change-requests").applyChangeRequest;

beforeAll(async () => {
  stubGlobals(state);
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: state.who.userId }));
  vi.stubGlobal("requireMembership", async () => ({ memberId: state.who.memberId }));
  vi.stubGlobal("notifyReviewersOfChangeRequest", async () => undefined);
  submit = (await import("#core/server/api/org/change-requests/index.post")).default;
  ({ applyChangeRequest } = await import("#core/server/utils/change-requests"));
});

beforeEach(() => {
  state.db = { ...seed(), hoa_member_change_requests: [] };
  state.who = PERSONAS.owner; // Bob Diaz
});

const ask = (payload: Record<string, unknown>) => submit(ev({ body: { orgId: ORG, kind: "name", action: "update", payload } }));
const lastRequest = () => state.db.hoa_member_change_requests!.at(-1)!;
const bob = () => state.db.hoa_members!.find((m) => m.id === ID.memberBob)!;

describe("asking to change the name on file", () => {
  it("stores a pending request for the asker's own membership, and leaves the name alone", async () => {
    await ask({ first_name: "  Robert  ", last_name: "Diaz" });
    expect(lastRequest()).toMatchObject({ kind: "name", target_collection: "hoa_members", target_id: ID.memberBob });
    expect(lastRequest().payload).toEqual({ first_name: "Robert", last_name: "Diaz" });
    expect(bob().first_name).toBe("Bob");
  });

  it("carries only the two name fields, never a role, an email or another member", async () => {
    await ask({ first_name: "Robert", last_name: "Diaz", role: "admin", email: "x@y.test", status: "active", id: ID.memberAnn });
    expect(lastRequest().payload).toEqual({ first_name: "Robert", last_name: "Diaz" });
    expect(lastRequest().target_id).toBe(ID.memberBob);
  });

  it("refuses an empty name (400) and stores nothing", async () => {
    await expect(ask({ first_name: "  ", last_name: "" })).rejects.toMatchObject({ statusCode: 400 });
    expect(state.db.hoa_member_change_requests).toHaveLength(0);
  });

  it("collapses inner spaces and caps each part at 100 characters", async () => {
    await ask({ first_name: "Mary   Ann", last_name: "x".repeat(150) });
    expect(lastRequest().payload).toEqual({ first_name: "Mary Ann", last_name: "x".repeat(100) });
  });
});

describe("approving it", () => {
  it("writes the two name fields to the membership and nothing else", async () => {
    await applyChangeRequest(
      getTypedDirectus(),
      { kind: "name", action: "update", member: ID.memberBob, organization: ORG, payload: { first_name: "Robert", last_name: "Diaz", status: "archived", role: "x" } },
      "2026-11-17T18:00:00.000Z"
    );
    expect(bob()).toMatchObject({ first_name: "Robert", last_name: "Diaz", status: "active" });
    expect(bob()).not.toHaveProperty("role");
  });
});

/**
 * A resident's new pet or vehicle lands on a unit. Before 2026-11-16 an
 * approved request created the row with the person and no unit, so it showed
 * in My Household and on no unit page.
 *
 *   POST /api/org/change-requests   records the unit chosen (or the only one)
 *   applyChangeRequest              writes it, if it is still the resident's
 *
 * Bob is linked to 4B (primary) and 5C, Ann to 4B only.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const U = { u4B: uuid(201), u5C: uuid(202), uOther: uuid(203), uOld: uuid(204) };

function db(): Db {
  return {
    ...seed(),
    hoa_units: [
      { id: U.u4B, organization: ORG, unit_number: "4B" },
      { id: U.u5C, organization: ORG, unit_number: "5C" },
      { id: U.uOld, organization: ORG, unit_number: "9Z" },
      { id: U.uOther, organization: OTHER, unit_number: "1A" },
    ],
    hoa_member_units: [
      { id: uuid(211), member_id: ID.memberBob, unit_id: U.u4B, status: "published", is_primary_unit: true },
      { id: uuid(212), member_id: ID.memberBob, unit_id: U.u5C, status: "published", is_primary_unit: false },
      { id: uuid(213), member_id: ID.memberBob, unit_id: U.uOld, status: "published", end_date: "2020-01-31" },
      { id: uuid(214), member_id: ID.memberAnn, unit_id: U.u4B, status: "published" },
    ],
    hoa_member_change_requests: [],
    hoa_pets: [],
    hoa_vehicles: [],
  };
}

const state: { who: Who; db: Db } = { who: PERSONAS.owner, db: db() };
let fake: ReturnType<typeof stubGlobals>;
let submit: (e: any) => Promise<any>;
let applyChangeRequest: typeof import("#core/server/utils/change-requests").applyChangeRequest;

beforeAll(async () => {
  fake = stubGlobals(state);
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: state.who.userId }));
  vi.stubGlobal("requireMembership", async () => ({ memberId: state.who.memberId }));
  vi.stubGlobal("notifyReviewersOfChangeRequest", async () => undefined);
  submit = (await import("#core/server/api/org/change-requests/index.post")).default;
  ({ applyChangeRequest } = await import("#core/server/utils/change-requests"));
});

beforeEach(() => {
  state.db = db();
  state.who = PERSONAS.owner;
  fake.reset();
});

const ann: Who = { userId: ID.userAnn, memberId: ID.memberAnn };
const addPet = (payload: Record<string, unknown>) => submit(ev({ body: { orgId: ORG, kind: "pet", action: "create", payload: { name: "Milo", type: "cat", ...payload } } }));
const lastRequest = () => state.db.hoa_member_change_requests!.at(-1)!;

describe("submitting a new pet or vehicle", () => {
  it("records the unit the resident chose, with its number for the reviewer", async () => {
    await addPet({ unit_id: U.u5C });
    expect(lastRequest().payload).toMatchObject({ name: "Milo", unit_id: U.u5C, unit_number: "5C" });
  });

  it("uses the only unit of a resident with one", async () => {
    state.who = ann;
    await addPet({});
    expect(lastRequest().payload).toMatchObject({ unit_id: U.u4B, unit_number: "4B" });
  });

  it("leaves the unit open when a resident with several chose none", async () => {
    await addPet({});
    expect(lastRequest().payload.unit_id).toBeUndefined();
  });

  it("refuses a unit that isn't the resident's: another person's, an ended link, another community's", async () => {
    state.who = ann;
    for (const unit_id of [U.u5C, U.uOld, U.uOther]) {
      await expect(addPet({ unit_id })).rejects.toMatchObject({ statusCode: 400, message: "That unit isn't one of yours." });
    }
    expect(state.db.hoa_member_change_requests).toHaveLength(0);
  });

  it("refuses a photo the community may not use", async () => {
    await expect(addPet({ unit_id: U.u4B, image: ID.fileElsewhere })).rejects.toMatchObject({ statusCode: 403 });
    expect(state.db.hoa_member_change_requests).toHaveLength(0);
  });
});

describe("approving it", () => {
  const request = (payload: Record<string, unknown>, member = ID.memberBob) => ({
    kind: "pet",
    action: "create",
    payload: { name: "Milo", type: "cat", ...payload },
    member,
    organization: ORG,
  });

  it("puts the pet on the chosen unit, with only the pet's own fields", async () => {
    await applyChangeRequest(getTypedDirectus(), request({ unit_id: U.u5C, unit_number: "5C" }), "2026-11-16T15:00:00.000Z");
    const pet = state.db.hoa_pets!.at(-1)!;
    expect(pet).toMatchObject({ name: "Milo", unit_id: U.u5C, member_id: ID.memberBob, organization: ORG, status: "published" });
    expect(pet).not.toHaveProperty("unit_number");
  });

  it("falls back to the resident's only unit when the chosen one is no longer theirs", async () => {
    state.db.hoa_member_units = state.db.hoa_member_units!.filter((l) => l.unit_id !== U.u5C);
    await applyChangeRequest(getTypedDirectus(), request({ unit_id: U.u5C }), "2026-11-16T15:00:00.000Z");
    expect(state.db.hoa_pets!.at(-1)).toMatchObject({ unit_id: U.u4B });
  });

  it("puts the only unit on a request made before the unit was asked", async () => {
    await applyChangeRequest(getTypedDirectus(), request({}, ID.memberAnn), "2026-11-16T15:00:00.000Z");
    expect(state.db.hoa_pets!.at(-1)).toMatchObject({ unit_id: U.u4B, member_id: ID.memberAnn });
  });
});

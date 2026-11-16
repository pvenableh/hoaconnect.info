/**
 * Admin writes that name another row, moved off Directus because a validation
 * cannot follow a relation (scripts/lib/admin-scope-perms.ts): a plain id
 * failed it, so the pages could not save, and an object holding only the id
 * passed it, so through the API an admin could link a row to another
 * community's meeting or member.
 *
 *   POST  /api/org/meetings/[id]/attendees
 *   POST  /api/hoa/units/records   (pets, vehicles)
 *   PATCH /api/hoa/units/records
 *
 * The admin persona is an admin of ORG only; OTHER is a community they are not
 * an admin of.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";
import { planAttendees } from "#core/shared/meetings/attendee-writes";
import { recordCommunity } from "#core/shared/units/record-writes";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const U = {
  meeting: uuid(101),
  meetingOther: uuid(102),
  unit: uuid(111),
  unitOther: uuid(112),
  pet: uuid(121),
  petOther: uuid(122),
  petStraddle: uuid(123),
  vehicle: uuid(131),
};

function db(): Db {
  return {
    ...seed(),
    hoa_meetings: [
      { id: U.meeting, organization: ORG, title: "Annual meeting" },
      { id: U.meetingOther, organization: OTHER, title: "Their meeting" },
    ],
    hoa_meeting_attendees: [{ id: uuid(141), meeting: U.meeting, hoa_member: ID.memberAdmin, attendance: "present" }],
    hoa_units: [
      { id: U.unit, organization: ORG, unit_number: "4B" },
      { id: U.unitOther, organization: OTHER, unit_number: "1A" },
    ],
    hoa_pets: [
      { id: U.pet, organization: ORG, unit_id: U.unit, member_id: ID.memberBob, name: "Bella", status: "published" },
      { id: U.petOther, organization: OTHER, unit_id: U.unitOther, member_id: ID.memberOther, name: "Rex", status: "published" },
      // Its own organization says ORG, its person is OTHER's: no one's to edit here.
      { id: U.petStraddle, organization: ORG, unit_id: U.unit, member_id: ID.memberOther, name: "Odd", status: "published" },
    ],
    hoa_vehicles: [{ id: U.vehicle, organization: ORG, unit_id: U.unit, member_id: ID.memberBob, make: "Toyota", status: "published" }],
  };
}

const state: { who: Who; db: Db } = { who: PERSONAS.admin, db: db() };
let fake: ReturnType<typeof stubGlobals>;

const ROUTES = {
  attendees: "#core/server/api/org/meetings/[id]/attendees.post",
  create: "#core/server/api/hoa/units/records.post",
  patch: "#core/server/api/hoa/units/records.patch",
} as const;
type Route = keyof typeof ROUTES;
const handlers: Partial<Record<Route, (e: any) => Promise<any>>> = {};
const call = (route: Route, o: { body?: any; params?: any }) => handlers[route]!(ev(o));
const as = (who: Who) => (state.who = who);
const writes = () => fake.calls.filter((c) => !c.op.startsWith("read"));

beforeAll(async () => {
  fake = stubGlobals(state);
  // An admin of ORG only.
  vi.stubGlobal("checkAdminAccess", async (_e: unknown, org: string) => ({ isAdmin: !!state.who.admin && org === ORG }));
  for (const [k, path] of Object.entries(ROUTES)) handlers[k as Route] = (await import(/* @vite-ignore */ path)).default;
});

beforeEach(() => {
  state.db = db();
  as(PERSONAS.admin);
  fake.reset();
});

const attendee = (over: Record<string, unknown> = {}) => ({ hoa_member: ID.memberBob, ...over });
const ADD = { params: { id: U.meeting }, body: { attendees: [attendee()] } };
const PET = { orgId: ORG, unitId: U.unit, kind: "pet", record: { member_id: ID.memberBob, name: "Milo", type: "cat" } };
const VEHICLE = { orgId: ORG, unitId: U.unit, kind: "vehicle", record: { member_id: ID.memberAnn, make: "Honda", license_plate: "7ABC123" } };
const PATCH = { orgId: ORG, id: U.pet, kind: "pet", patch: { breed: "Labrador" } };

describe("who may call", () => {
  const VALID: Record<Route, { body?: any; params?: any }> = { attendees: ADD, create: { body: PET }, patch: { body: PATCH } };
  for (const route of Object.keys(ROUTES) as Route[]) {
    it(`${route}: 401 signed out, 403 for a resident, nothing written`, async () => {
      as(PERSONAS.nobody);
      await expect(call(route, VALID[route])).rejects.toMatchObject({ statusCode: 401 });
      for (const who of [PERSONAS.owner, PERSONAS.board, PERSONAS.manager]) {
        as(who);
        await expect(call(route, VALID[route])).rejects.toMatchObject({ statusCode: 403 });
      }
      expect(writes()).toHaveLength(0);
    });
  }
});

describe("POST /api/org/meetings/[id]/attendees", () => {
  it("adds people of the meeting's community, with the meeting set by the server", async () => {
    const res = await call("attendees", {
      params: { id: U.meeting },
      body: { attendees: [attendee(), attendee({ hoa_member: ID.memberAnn, board_term: ID.termAnn, role_at_meeting: "Treasurer", is_board_member: true })] },
    });
    expect(res.created).toHaveLength(2);
    expect(state.db.hoa_meeting_attendees!.slice(1)).toEqual([
      expect.objectContaining({ meeting: U.meeting, hoa_member: ID.memberBob, board_term: null, role_at_meeting: null, is_board_member: false, attendance: "present" }),
      expect.objectContaining({ meeting: U.meeting, hoa_member: ID.memberAnn, board_term: ID.termAnn, role_at_meeting: "Treasurer", is_board_member: true }),
    ]);
  });

  it("skips someone already attending, and a repeat in the body", async () => {
    const res = await call("attendees", { params: { id: U.meeting }, body: { attendees: [attendee({ hoa_member: ID.memberAdmin }), attendee(), attendee()] } });
    expect(res.skipped).toEqual([ID.memberAdmin, ID.memberBob]);
    expect(state.db.hoa_meeting_attendees!.filter((a) => a.hoa_member === ID.memberBob)).toHaveLength(1);
  });

  it("refuses another community's meeting, person or board term, and writes nothing", async () => {
    await expect(call("attendees", { ...ADD, params: { id: U.meetingOther } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call("attendees", { ...ADD, params: { id: uuid(199) } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call("attendees", { ...ADD, body: { attendees: [attendee(), attendee({ hoa_member: ID.memberOther })] } })).rejects.toMatchObject({
      statusCode: 400,
      message: "That person isn't a member of this community.",
    });
    for (const board_term of [ID.termOther, ID.termAnn]) {
      // termOther is another community's; termAnn is Ann's, not Bob's.
      await expect(call("attendees", { ...ADD, body: { attendees: [attendee({ board_term })] } })).rejects.toMatchObject({
        statusCode: 400,
        message: "That board term isn't this person's.",
      });
    }
    expect(writes()).toHaveLength(0);
  });

  it("refuses a body it does not know: no meeting of its own choosing, no empty list", async () => {
    for (const body of [{ attendees: [] }, { attendees: [attendee({ meeting: U.meetingOther })] }, { attendees: [attendee({ hoa_member: "m-1" })] }, null]) {
      await expect(call("attendees", { ...ADD, body })).rejects.toMatchObject({ statusCode: 400 });
    }
  });
});

describe("POST /api/hoa/units/records", () => {
  it("adds a pet or vehicle to the unit, with the unit, community, status and start set by the server", async () => {
    await call("create", { body: PET });
    await call("create", { body: VEHICLE });
    expect(state.db.hoa_pets!.at(-1)).toMatchObject({ unit_id: U.unit, organization: ORG, member_id: ID.memberBob, name: "Milo", type: "cat", status: "published" });
    expect(state.db.hoa_pets!.at(-1)!.start_date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(state.db.hoa_vehicles!.at(-1)).toMatchObject({ unit_id: U.unit, organization: ORG, member_id: ID.memberAnn, make: "Honda", license_plate: "7ABC123" });
  });

  it("refuses another community's unit, person or file", async () => {
    await expect(call("create", { body: { ...PET, unitId: U.unitOther } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call("create", { body: { ...PET, orgId: OTHER, unitId: U.unitOther } })).rejects.toMatchObject({ statusCode: 403 });
    await expect(call("create", { body: { ...PET, record: { ...PET.record, member_id: ID.memberOther } } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("create", { body: { ...PET, record: { ...PET.record, image: ID.fileElsewhere } } })).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toHaveLength(0);
    await call("create", { body: { ...PET, record: { ...PET.record, image: ID.fileOk } } });
    expect(state.db.hoa_pets!.at(-1)).toMatchObject({ image: ID.fileOk });
  });

  it("will not take a community, unit or field of the caller's choosing", async () => {
    for (const record of [
      { ...PET.record, organization: OTHER },
      { ...PET.record, unit_id: U.unitOther },
      { ...PET.record, name: "" },
      { ...PET.record, type: "horse" },
      { ...PET.record, member_id: { id: ID.memberOther } },
    ]) {
      await expect(call("create", { body: { ...PET, record } })).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(call("create", { body: { ...PET, kind: "lease" } })).rejects.toMatchObject({ statusCode: 400 });
    expect(writes()).toHaveLength(0);
  });
});

describe("PATCH /api/hoa/units/records", () => {
  it("changes a pet or vehicle, and ends one on move-out", async () => {
    await call("patch", { body: PATCH });
    expect(state.db.hoa_pets!.find((p) => p.id === U.pet)).toMatchObject({ breed: "Labrador", member_id: ID.memberBob });
    await call("patch", { body: { orgId: ORG, id: U.vehicle, kind: "vehicle", patch: { end_date: "2026-11-15T12:00:00.000Z", status: "archived" } } });
    expect(state.db.hoa_vehicles!.find((v) => v.id === U.vehicle)).toMatchObject({ end_date: "2026-11-15T12:00:00.000Z", status: "archived" });
  });

  it("moves a record to another person of the community, not of another", async () => {
    await call("patch", { body: { ...PATCH, patch: { member_id: ID.memberAnn } } });
    expect(state.db.hoa_pets!.find((p) => p.id === U.pet)).toMatchObject({ member_id: ID.memberAnn });
    await expect(call("patch", { body: { ...PATCH, patch: { member_id: ID.memberOther } } })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses another community's row, a row that straddles two, and a row of the wrong kind", async () => {
    await expect(call("patch", { body: { ...PATCH, id: U.petOther } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call("patch", { body: { ...PATCH, id: U.petStraddle } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call("patch", { body: { ...PATCH, kind: "vehicle", patch: { make: "Ford" } } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call("patch", { body: { ...PATCH, orgId: OTHER, id: U.petOther } })).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toHaveLength(0);
  });

  it("will not move a row to another unit or community, and needs something to change", async () => {
    for (const patch of [{ unit_id: U.unitOther }, { organization: OTHER }, {}, { image: ID.fileElsewhere }]) {
      await expect(call("patch", { body: { ...PATCH, patch } })).rejects.toMatchObject({ statusCode: expect.any(Number) });
    }
    expect(writes()).toHaveLength(0);
  });
});

describe("the pure checks", () => {
  it("recordCommunity: the one community a row's links agree on, else none", () => {
    expect(recordCommunity({ organization: ORG, unit_id: { organization: ORG }, member_id: { organization: ORG } })).toBe(ORG);
    expect(recordCommunity({ organization: null, unit_id: { organization: ORG }, member_id: null })).toBe(ORG);
    expect(recordCommunity({ organization: ORG, member_id: { organization: OTHER } })).toBeNull();
    expect(recordCommunity({ organization: null, unit_id: null, member_id: null })).toBeNull();
  });

  it("planAttendees: the first refusal wins, before anything is planned", () => {
    const plan = planAttendees({
      meetingId: U.meeting,
      orgId: ORG,
      attendees: [{ hoa_member: ID.memberBob }, { hoa_member: ID.memberOther }],
      members: [
        { id: ID.memberBob, organization: ORG },
        { id: ID.memberOther, organization: OTHER },
      ],
      terms: [],
      attending: [],
    });
    expect(plan).toEqual({ ok: false, status: 400, error: "That person isn't a member of this community." });
  });
});

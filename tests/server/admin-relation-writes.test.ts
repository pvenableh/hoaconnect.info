/**
 * Admin writes that name another row, moved off Directus because a validation
 * cannot follow a relation (scripts/lib/admin-scope-perms.ts): a plain id
 * failed it, so the pages could not save, and an object holding only the id
 * passed it, so through the API an admin could link a row to another
 * community's meeting or member.
 *
 *   POST  /api/org/meetings/[id]/attendees
 *   POST  /api/hoa/units/records   (pets, vehicles, leases)
 *   PATCH /api/hoa/units/records
 *
 * The admin persona is an admin of ORG only; OTHER is a community they are not
 * an admin of.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";
import { planAttendees } from "#core/shared/meetings/attendee-writes";
import { chooseRecordUnit, currentUnitsInOrg, leaseCommunity, recordCommunity } from "#core/shared/units/record-writes";

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
  lease: uuid(151),
  leaseOther: uuid(152),
  leaseStraddle: uuid(153),
  myUpload: uuid(161),
  myFiled: uuid(162),
  theirUpload: uuid(163),
};

function db(): Db {
  const base = seed();
  return {
    ...base,
    directus_files: [
      ...(base.directus_files ?? []),
      // The lease form uploads with no folder: the admin's own upload, filed nowhere.
      { id: U.myUpload, uploaded_by: ID.userAdmin, folder: null, type: "application/pdf" },
      { id: U.myFiled, uploaded_by: ID.userAdmin, folder: uuid(170), type: "application/pdf" },
      { id: U.theirUpload, uploaded_by: ID.userBob, folder: null, type: "application/pdf" },
    ],
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
    hoa_leases: [
      { id: U.lease, organization: ORG, unit: U.unit, tenant: ID.memberBob, owner: ID.memberAnn, status: "active", rent_amount: 2000 },
      { id: U.leaseOther, organization: OTHER, unit: U.unitOther, tenant: ID.memberOther, owner: null, status: "active" },
      // Its own organization and unit say ORG, its tenant is OTHER's.
      { id: U.leaseStraddle, organization: ORG, unit: U.unit, tenant: ID.memberOther, owner: null, status: "active" },
    ],
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
  // The attendees route asks requireAreaWork("meetings") since docs/spec-delegation.md.
  vi.stubGlobal("requireAreaWork", async (_e: unknown, org: string, key: string) => {
    if (state.who.admin && org === ORG) return { via: "admin" };
    if ((state.who.helps ?? []).includes(key)) return { via: "helper" };
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  });
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

const LEASE = {
  orgId: ORG,
  unitId: U.unit,
  kind: "lease",
  record: { tenant: ID.memberBob, owner: ID.memberAnn, rent_amount: 2100, start_date: "2026-12-01T12:00:00.000Z", end_date: null },
};
const LEASE_PATCH = { orgId: ORG, id: U.lease, kind: "lease", patch: { rent_amount: 2200 } };

describe("leases through POST and PATCH /api/hoa/units/records", () => {
  it("adds a lease to the unit, with the unit, community and status set by the server", async () => {
    await call("create", { body: LEASE });
    expect(state.db.hoa_leases!.at(-1)).toMatchObject({
      unit: U.unit,
      organization: ORG,
      tenant: ID.memberBob,
      owner: ID.memberAnn,
      rent_amount: 2100,
      status: "active",
      start_date: "2026-12-01T12:00:00.000Z",
    });
  });

  it("takes a document of the community's, or one the admin uploaded and filed nowhere", async () => {
    for (const document of [ID.fileOk, U.myUpload]) {
      await call("create", { body: { ...LEASE, record: { ...LEASE.record, document } } });
      expect(state.db.hoa_leases!.at(-1)).toMatchObject({ document });
    }
  });

  it("refuses another community's unit, tenant, owner or document, and someone else's upload", async () => {
    await expect(call("create", { body: { ...LEASE, unitId: U.unitOther } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call("create", { body: { ...LEASE, record: { ...LEASE.record, tenant: ID.memberOther } } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("create", { body: { ...LEASE, record: { ...LEASE.record, owner: ID.memberOther } } })).rejects.toMatchObject({ statusCode: 400 });
    for (const document of [ID.fileElsewhere, U.myFiled, U.theirUpload]) {
      await expect(call("create", { body: { ...LEASE, record: { ...LEASE.record, document } } })).rejects.toMatchObject({
        statusCode: 403,
        message: "That document isn't one of this community's files.",
      });
    }
    expect(writes()).toHaveLength(0);
  });

  it("will not take a unit, community or value of the caller's choosing", async () => {
    for (const record of [
      { ...LEASE.record, unit: U.unitOther },
      { ...LEASE.record, organization: OTHER },
      { ...LEASE.record, tenant: { id: ID.memberOther } },
      { ...LEASE.record, status: "pending" },
      { ...LEASE.record, rent_amount: -5 },
      { owner: ID.memberAnn },
    ]) {
      await expect(call("create", { body: { ...LEASE, record } })).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(writes()).toHaveLength(0);
  });

  it("changes a lease and ends one, keeping it", async () => {
    await call("patch", { body: LEASE_PATCH });
    expect(state.db.hoa_leases!.find((l) => l.id === U.lease)).toMatchObject({ rent_amount: 2200, tenant: ID.memberBob });
    await call("patch", { body: { ...LEASE_PATCH, patch: { end_date: "2026-11-16T12:00:00.000Z", status: "expired" } } });
    expect(state.db.hoa_leases!.find((l) => l.id === U.lease)).toMatchObject({ end_date: "2026-11-16T12:00:00.000Z", status: "expired" });
  });

  it("refuses another community's lease, one that straddles two, and another community's tenant or document", async () => {
    await expect(call("patch", { body: { ...LEASE_PATCH, id: U.leaseOther } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call("patch", { body: { ...LEASE_PATCH, id: U.leaseStraddle } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call("patch", { body: { ...LEASE_PATCH, id: U.pet } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(call("patch", { body: { ...LEASE_PATCH, patch: { tenant: ID.memberOther } } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("patch", { body: { ...LEASE_PATCH, patch: { document: U.theirUpload } } })).rejects.toMatchObject({ statusCode: 403 });
    for (const patch of [{ unit: U.unitOther }, { organization: OTHER }, {}]) {
      await expect(call("patch", { body: { ...LEASE_PATCH, patch } })).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(writes()).toHaveLength(0);
  });

  it("is refused to a resident, a board seat and a manager", async () => {
    for (const who of [PERSONAS.owner, PERSONAS.board, PERSONAS.manager]) {
      as(who);
      await expect(call("create", { body: LEASE })).rejects.toMatchObject({ statusCode: 403 });
      await expect(call("patch", { body: LEASE_PATCH })).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(writes()).toHaveLength(0);
  });
});

describe("the pure checks", () => {
  it("leaseCommunity: its own community, its unit's, its tenant's and its owner's must agree", () => {
    expect(leaseCommunity({ organization: ORG, unit: { organization: ORG }, tenant: { organization: ORG }, owner: null })).toBe(ORG);
    expect(leaseCommunity({ organization: ORG, unit: { organization: ORG }, tenant: { organization: ORG }, owner: { organization: OTHER } })).toBeNull();
    expect(leaseCommunity({ organization: ORG, unit: { organization: OTHER } })).toBeNull();
  });

  it("currentUnitsInOrg: linked, not archived, not ended, in this community, primary first", () => {
    const unit = (id: string, organization: string, unit_number: string) => ({ id, organization, unit_number });
    const links = [
      { unit_id: unit(uuid(1), ORG, "4B"), status: "published", end_date: null, is_primary_unit: false },
      { unit_id: unit(uuid(2), ORG, "5C"), status: "published", end_date: null, is_primary_unit: true },
      { unit_id: unit(uuid(3), ORG, "6D"), status: "published", end_date: "2026-11-15" },
      { unit_id: unit(uuid(4), ORG, "7E"), status: "archived", end_date: null },
      { unit_id: unit(uuid(5), OTHER, "1A"), status: "published", end_date: null },
      { unit_id: unit(uuid(6), ORG, "8F"), status: "published", end_date: "2026-11-16" },
      { unit_id: uuid(7), status: "published" },
    ];
    expect(currentUnitsInOrg(links, ORG, "2026-11-16")).toEqual([
      { id: uuid(2), unit_number: "5C" },
      { id: uuid(1), unit_number: "4B" },
      { id: uuid(6), unit_number: "8F" },
    ]);
  });

  it("chooseRecordUnit: the chosen unit if still theirs, else their only one, else none", () => {
    expect(chooseRecordUnit(uuid(2), [uuid(1), uuid(2)])).toBe(uuid(2));
    expect(chooseRecordUnit(uuid(9), [uuid(1)])).toBe(uuid(1));
    expect(chooseRecordUnit(undefined, [uuid(1)])).toBe(uuid(1));
    expect(chooseRecordUnit(undefined, [uuid(1), uuid(2)])).toBeNull();
    expect(chooseRecordUnit(uuid(1), [])).toBeNull();
  });

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

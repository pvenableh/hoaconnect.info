/**
 * GET /api/org/my-household reads as one batch (core/server/utils/household-reads.ts).
 * The live equivalence with the old separate reads was checked against every
 * member with household rows; these pin the pure parts.
 */
import { describe, it, expect } from "vitest";
import { householdFrom, householdSpecs, soleActiveMembership } from "#core/server/utils/household-reads";

const ORG = "org-1";

describe("householdSpecs", () => {
  it("names the member by id when it is known", () => {
    const s = householdSpecs(ORG, { memberId: "m-1" });
    expect(s.hh_member.filter).toEqual({ id: { _eq: "m-1" } });
    expect(s.hh_vehicles.filter).toEqual({ member_id: { _eq: "m-1" }, status: { _neq: "archived" } });
    expect(s.hh_leases.filter._or).toEqual([{ owner: { _eq: "m-1" } }, { tenant: { _eq: "m-1" } }]);
  });

  it("before the check, names the caller's active membership in the community", () => {
    const s = householdSpecs(ORG, { userId: "u-1", orgId: ORG });
    const member = { user: { _eq: "u-1" }, organization: { _eq: ORG }, status: { _eq: "active" } };
    expect(s.hh_member.filter).toEqual(member);
    expect(s.hh_pets.filter).toEqual({ member_id: member, status: { _neq: "archived" } });
    expect(s.hh_pending.filter).toEqual({ member, status: { _eq: "pending" } });
    expect(s.hh_links.filter).toEqual({ member_id: member });
    expect(s.hh_leases.filter).toEqual({ organization: { _eq: ORG }, status: { _eq: "active" }, _or: [{ owner: member }, { tenant: member }] });
  });

  it("keeps the old reads' sorts and limits", () => {
    const s = householdSpecs(ORG, { memberId: "m-1" });
    expect([s.hh_vehicles.sort, s.hh_vehicles.limit]).toEqual([["make"], 100]);
    expect([s.hh_pets.sort, s.hh_pets.limit]).toEqual([["name"], 100]);
    expect([s.hh_pending.sort, s.hh_pending.limit]).toEqual([["-date_created"], 100]);
    expect([s.hh_leases.sort, s.hh_leases.limit]).toEqual([["-start_date"], 50]);
  });
});

describe("householdFrom", () => {
  const unit = (id: string, organization = ORG) => ({ id, organization, unit_number: id.toUpperCase() });
  const rows = {
    hh_member: [{ member_type: "owner", phone: "555", id: "m-1", first_name: "A", last_name: "B", email: "a@b", mailing_address: null }],
    hh_vehicles: [{ id: "v-1" }],
    hh_pets: [],
    hh_pending: [{ id: "r-1" }],
    hh_links: [
      { unit_id: unit("u1"), status: "active", end_date: null, is_primary_unit: false, member_type: "tenant" },
      { unit_id: unit("u2"), status: "active", end_date: null, is_primary_unit: true, member_type: null },
      { unit_id: unit("u3", "org-2"), status: "active", end_date: null, is_primary_unit: false, member_type: "owner" },
      { unit_id: unit("u4"), status: "archived", end_date: null, is_primary_unit: false, member_type: "owner" },
    ],
    hh_leases: [{ id: "l-1", tenant: null }],
  };

  it("returns the member's own fields in the old order, without its residency", () => {
    const h = householdFrom(rows, ORG, "2026-11-25");
    expect(Object.keys(h.member!)).toEqual(["id", "first_name", "last_name", "email", "phone", "mailing_address"]);
  });

  it("serves both unit lists from one read of the links", () => {
    const h = householdFrom(rows, ORG, "2026-11-25");
    expect(h.units).toEqual([{ id: "u2", unit_number: "U2" }, { id: "u1", unit_number: "U1" }]);
    // u1's link says tenant; u2's has none and falls back to the member's own (owner).
    expect(h.ownedUnits).toEqual([{ id: "u2", unit_number: "U2" }]);
  });

  it("passes the lists through", () => {
    const h = householdFrom(rows, ORG, "2026-11-25");
    expect([h.vehicles, h.pets, h.pendingRequests, h.leases]).toEqual([rows.hh_vehicles, [], rows.hh_pending, rows.hh_leases]);
  });

  it("has no member without a member row", () => {
    expect(householdFrom({ ...rows, hh_member: [] }, ORG, "2026-11-25").member).toBeNull();
  });
});

describe("soleActiveMembership", () => {
  it("is true only for exactly one active membership", () => {
    expect(soleActiveMembership([{ status: "active" }, { status: "inactive" }])).toBe(true);
    expect(soleActiveMembership([{ status: "active" }, { status: "active" }])).toBe(false);
    expect(soleActiveMembership([{ status: "pending" }])).toBe(false);
  });
});

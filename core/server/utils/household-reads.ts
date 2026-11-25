/**
 * The reads behind GET /api/org/my-household, as one readItemsBatch.
 *
 * The route used to make nine requests: the membership check, then the member,
 * vehicles, pets, pending requests, unit links (twice, plus the member again
 * for its residency) and leases, each its own read. Directus serves requests
 * one after another (~40ms of CPU each), so they now go as one batch with the
 * caller's access snapshot.
 *
 * Before the membership check has answered, the member id is not known, so
 * the first batch names the member as "the caller's active membership in this
 * community" (a relational filter). That is the member checkMembership picks
 * exactly when the caller has ONE active membership there, which is the case
 * the route keeps; otherwise it reads again by member id. Only the rows of the
 * member the membership check returns are ever handed back.
 */
import { currentUnitsInOrg, type UnitLink } from "#core/shared/units/record-writes";
import { ownedUnitsInOrg, type OwnerUnitLink } from "#core/shared/units/lease-requests";
import type { BatchSpec } from "./directus-graphql";

/** Who the reads are about: a member id, or the caller's active membership in the org. */
export type HouseholdMember = { memberId: string } | { userId: string; orgId: string };

export const HOUSEHOLD_MEMBER_FIELDS = ["id", "first_name", "last_name", "email", "phone", "mailing_address"] as const;

/** A filter on a field that points at hoa_members. */
function memberIs(who: HouseholdMember): Record<string, unknown> {
  return "memberId" in who
    ? { _eq: who.memberId }
    : { user: { _eq: who.userId }, organization: { _eq: who.orgId }, status: { _eq: "active" } };
}

/** The route's reads: the same filters, fields, sorts and limits as its separate reads. */
export function householdSpecs(orgId: string, who: HouseholdMember) {
  const member = memberIs(who);
  return {
    hh_member: {
      collection: "hoa_members",
      // memberOwnedUnitsInOrg's read of the member's residency rides along.
      filter: "memberId" in who ? { id: { _eq: who.memberId } } : (member as Record<string, unknown>),
      fields: [...HOUSEHOLD_MEMBER_FIELDS, "member_type"],
      limit: -1,
    },
    hh_vehicles: {
      collection: "hoa_vehicles",
      filter: { member_id: member, status: { _neq: "archived" } },
      fields: ["id", "make", "model", "year", "license_plate", "parking_spot", "image"],
      sort: ["make"],
      limit: 100,
    },
    hh_pets: {
      collection: "hoa_pets",
      filter: { member_id: member, status: { _neq: "archived" } },
      fields: ["id", "name", "type", "breed", "weight", "image"],
      sort: ["name"],
      limit: 100,
    },
    hh_pending: {
      collection: "hoa_member_change_requests",
      filter: { member: member, status: { _eq: "pending" } },
      fields: ["id", "kind", "action", "target_id", "payload", "date_created"],
      sort: ["-date_created"],
      limit: 100,
    },
    // memberUnitsInOrg and memberOwnedUnitsInOrg read the same links; one read serves both.
    hh_links: {
      collection: "hoa_member_units",
      filter: { member_id: member },
      fields: ["unit_id.id", "unit_id.organization", "unit_id.unit_number", "status", "end_date", "is_primary_unit", "member_type"],
      limit: -1,
    },
    hh_leases: {
      collection: "hoa_leases",
      filter: {
        organization: { _eq: orgId },
        status: { _eq: "active" },
        _or: [{ owner: member }, { tenant: member }],
      },
      fields: ["id", "status", "start_date", "end_date", "document", "owner", "unit.id", "unit.unit_number", "tenant.id", "tenant.first_name", "tenant.last_name"],
      sort: ["-start_date"],
      limit: 50,
    },
  } satisfies Record<string, BatchSpec>;
}

export type HouseholdRows = Record<keyof ReturnType<typeof householdSpecs>, any[]>;

/** The route's answer from the rows (before invited tenants are added to the leases). */
export function householdFrom(rows: HouseholdRows, orgId: string, today: string) {
  const memberRow = rows.hh_member[0] ?? null;
  const member = memberRow ? Object.fromEntries(HOUSEHOLD_MEMBER_FIELDS.map((f) => [f, memberRow[f]])) : null;
  const links = rows.hh_links as Array<UnitLink & OwnerUnitLink>;
  return {
    member,
    vehicles: rows.hh_vehicles,
    pets: rows.hh_pets,
    pendingRequests: rows.hh_pending,
    units: currentUnitsInOrg(links, orgId, today),
    ownedUnits: ownedUnitsInOrg(links, memberRow?.member_type ?? null, orgId, today),
    leases: rows.hh_leases as Array<{ id: string; tenant?: unknown }>,
  };
}

/** Whether the relational read is the member checkMembership picked: exactly one active membership. */
export function soleActiveMembership(mine: readonly any[]): boolean {
  return mine.filter((m) => m?.status === "active").length === 1;
}

import { withInvitedTenants } from "#core/server/utils/lease-requests";
import { householdFrom, householdSpecs, soleActiveMembership, type HouseholdRows } from "#core/server/utils/household-reads";

/**
 * The authenticated resident's own household data for the self-service page:
 * their member contact + mailing address, their (active) vehicles and pets, the
 * units they are linked to (a new pet or vehicle asks which, when there are
 * several), the units they own (an owner reports a lease on one) and the
 * active leases they are the owner or tenant of, and any pending change
 * requests so the UI can show "awaiting review" badges.
 * Org-scoped to the caller's membership — never another member's data.
 *
 * One Directus request in the usual case (household-reads.ts): the reads ride
 * with the caller's access snapshot, keyed on "the caller's active membership",
 * and are kept only when that is the member the membership check picks.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  let rows = (await batchWithAccessSnapshot(event, orgId, householdSpecs(orgId, { userId: String(userId), orgId }))) as HouseholdRows;

  // The refusal comes before any of these rows leave.
  const { memberId } = await requireMembership(event, orgId);
  if (!memberId) throw createError({ statusCode: 403, message: "No member record in this organization" });

  const snapshot = await accessSnapshot(event, orgId, "base");
  if (!snapshot || !soleActiveMembership(snapshot.mine)) {
    // Several active memberships (or no snapshot): read again for the one the check picked.
    rows = (await readItemsBatch(householdSpecs(orgId, { memberId }))) as HouseholdRows;
  }

  const household = householdFrom(rows, orgId, new Date().toISOString().slice(0, 10));
  return {
    memberId,
    member: household.member,
    vehicles: household.vehicles,
    pets: household.pets,
    pendingRequests: household.pendingRequests,
    units: household.units,
    ownedUnits: household.ownedUnits,
    // The owner typed the tenant's email; a tenant on the lease is the tenant.
    leases: await withInvitedTenants(orgId, household.leases, { withEmail: true }),
  };
});

import { readItem, readItems } from "@directus/sdk";
import { memberOwnedUnitsInOrg, memberUnitsInOrg } from "#core/server/utils/unit-record-writes";
import { withInvitedTenants } from "#core/server/utils/lease-requests";

/**
 * The authenticated resident's own household data for the self-service page:
 * their member contact + mailing address, their (active) vehicles and pets, the
 * units they are linked to (a new pet or vehicle asks which, when there are
 * several), the units they own (an owner reports a lease on one) and the
 * active leases they are the owner or tenant of, and any pending change
 * requests so the UI can show "awaiting review" badges.
 * Org-scoped to the caller's membership — never another member's data.
 */
export default defineEventHandler(async (event) => {
  await requireAuthenticatedUser(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const { memberId } = await requireMembership(event, orgId);
  if (!memberId) throw createError({ statusCode: 403, message: "No member record in this organization" });

  const admin = getTypedDirectus();

  const [member, vehicles, pets, pendingRequests, units, ownedUnits, leases] = await Promise.all([
    admin.request(
      readItem("hoa_members", memberId, {
        fields: ["id", "first_name", "last_name", "email", "phone", "mailing_address"],
      })
    ),
    admin.request(
      readItems("hoa_vehicles", {
        filter: { member_id: { _eq: memberId }, status: { _neq: "archived" } },
        fields: ["id", "make", "model", "year", "license_plate", "parking_spot", "image"],
        sort: ["make"],
        limit: 100,
      })
    ),
    admin.request(
      readItems("hoa_pets", {
        filter: { member_id: { _eq: memberId }, status: { _neq: "archived" } },
        fields: ["id", "name", "type", "breed", "weight", "image"],
        sort: ["name"],
        limit: 100,
      })
    ),
    admin.request(
      readItems("hoa_member_change_requests", {
        filter: { member: { _eq: memberId }, status: { _eq: "pending" } },
        fields: ["id", "kind", "action", "target_id", "payload", "date_created"],
        sort: ["-date_created"],
        limit: 100,
      })
    ),
    memberUnitsInOrg(orgId, memberId),
    memberOwnedUnitsInOrg(orgId, memberId),
    admin.request(
      readItems("hoa_leases", {
        filter: {
          organization: { _eq: orgId },
          status: { _eq: "active" },
          _or: [{ owner: { _eq: memberId } }, { tenant: { _eq: memberId } }],
        },
        fields: ["id", "status", "start_date", "end_date", "document", "owner", { unit: ["id", "unit_number"], tenant: ["id", "first_name", "last_name"] }],
        sort: ["-start_date"],
        limit: 50,
      })
    ),
  ]);

  return {
    memberId,
    member,
    vehicles,
    pets,
    pendingRequests,
    units,
    ownedUnits,
    // The owner typed the tenant's email; a tenant on the lease is the tenant.
    leases: await withInvitedTenants(orgId, leases as Array<{ id: string; tenant?: unknown }>, { withEmail: true }),
  };
});

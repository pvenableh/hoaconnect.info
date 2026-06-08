import { readItem, readItems } from "@directus/sdk";

/**
 * The authenticated resident's own household data for the self-service page:
 * their member contact + mailing address, their (active) vehicles and pets, and
 * any pending change requests so the UI can show "awaiting review" badges.
 * Org-scoped to the caller's membership — never another member's data.
 */
export default defineEventHandler(async (event) => {
  await requireAuthenticatedUser(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const { memberId } = await requireMembership(event, orgId);
  if (!memberId) throw createError({ statusCode: 403, message: "No member record in this organization" });

  const admin = getTypedDirectus();

  const [member, vehicles, pets, pendingRequests] = await Promise.all([
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
        fields: ["id", "kind", "action", "target_id", "date_created"],
        sort: ["-date_created"],
        limit: 100,
      })
    ),
  ]);

  return { memberId, member, vehicles, pets, pendingRequests };
});

import { readItems, type QueryFields } from "@directus/sdk";
import type { HoaMemberChangeRequest, Schema } from "#core/types/directus";

/**
 * List change requests for an org.
 *   - scope=mine (default): the caller's own submissions.
 *   - scope=pending / scope=all: requires reviewer access (admin / PM-directory);
 *     returns the org's pending (or all) requests with member + submitter detail.
 */
export default defineEventHandler(async (event) => {
  await requireAuthenticatedUser(event);
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  const scope = String(query.scope || "mine");

  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const { memberId } = await requireMembership(event, orgId);
  const admin = getTypedDirectus();

  const baseFields: QueryFields<Schema, HoaMemberChangeRequest> = [
    "id",
    "status",
    "kind",
    "action",
    "target_collection",
    "target_id",
    "payload",
    "note",
    "review_note",
    "reviewed_at",
    "date_created",
    {
      member: ["id", "first_name", "last_name"],
      submitted_by: ["id", "first_name", "last_name"],
      reviewed_by: ["first_name", "last_name"],
    },
  ];

  if (scope === "pending" || scope === "all") {
    await requireChangeReviewer(event, orgId);
    const filter: Record<string, any> = { organization: { _eq: orgId } };
    if (scope === "pending") filter.status = { _eq: "pending" };
    const rows = await admin.request(
      readItems("hoa_member_change_requests", {
        filter,
        fields: baseFields,
        sort: ["-date_created"],
        limit: 200,
      })
    );
    return { scope, requests: rows };
  }

  // scope=mine
  if (!memberId) return { scope: "mine", requests: [] };
  const rows = await admin.request(
    readItems("hoa_member_change_requests", {
      filter: { organization: { _eq: orgId }, member: { _eq: memberId } },
      fields: baseFields,
      sort: ["-date_created"],
      limit: 100,
    })
  );
  return { scope: "mine", requests: rows };
});

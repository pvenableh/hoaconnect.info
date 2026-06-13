// GET /api/org/activity?orgId=...&memberId=&eventType=&from=&to=&limit=
//
// Tenant- and role-scoped read of portal activity:
//   • org admin OR a Property Manager with the `activity` grant → all of the
//     org's activity (optionally filtered by member / type / date).
//   • a plain member → ONLY their own activity (memberId filter ignored).
//   • anyone else → 403.
// Always hard-scoped to the org.

import { readItems } from "@directus/sdk";
import type { HoaActivity } from "~~/types/directus";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const query = getQuery(event);
  const orgId = String(query.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const admin = await checkAdminAccess(event, orgId);
  const grants = await getManagerGrants(event, orgId);
  const membership = await checkMembership(event, orgId);
  const canSeeAll = admin.isAdmin || grants?.activity === true;

  if (!canSeeAll && !membership.isMember) {
    throw createError({ statusCode: 403, message: "Not authorized to view activity" });
  }

  const filter: Record<string, any> = { organization: { _eq: orgId } };

  if (canSeeAll) {
    if (query.memberId) filter.member = { _eq: String(query.memberId) };
  } else {
    // Members see only their own activity.
    filter.member = { _eq: membership.memberId };
  }

  if (query.eventType) filter.event_type = { _eq: String(query.eventType) };
  if (query.from || query.to) {
    filter.date_created = {};
    if (query.from) filter.date_created._gte = String(query.from);
    if (query.to) filter.date_created._lte = String(query.to);
  }

  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);

  const activity = (await getTypedDirectus().request(
    readItems("hoa_activity", {
      filter,
      sort: ["-date_created"],
      limit,
      fields: [
        "id",
        "event_type",
        "path",
        "target_collection",
        "target_id",
        "label",
        "metadata",
        "ip",
        "date_created",
        { member: ["id", "first_name", "last_name", "email"] },
      ],
    })
  )) as HoaActivity[];

  return { activity, scope: canSeeAll ? "all" : "own" };
});

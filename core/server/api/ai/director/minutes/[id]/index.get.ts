/**
 * GET /api/ai/director/minutes/[id] — one decision record, in full.
 *
 * Query: orgId (required).
 *
 * `loadMinutes` re-checks the org itself: a minutes id is a bare uuid in a URL,
 * and being an admin somewhere is not being an admin here.
 *
 * Gated like the plan endpoint: org admins and seated board members.
 */

import { loadMinutes } from "#core/server/utils/director-minutes";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);

  const q = getQuery(event);
  const orgId = String(q.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const minutesId = String(getRouterParam(event, "id") || "").trim();
  if (!minutesId) throw createError({ statusCode: 400, message: "minutes id is required" });

  const directus = getTypedDirectus();

  // Authorization first — before a single row of this community is read.
  const admin = await checkAdminAccess(event, orgId);
  const allowed = admin.isAdmin || (await isActiveBoardMember(directus, userId, orgId));
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Admin or board access required" });
  }

  const minutes = await loadMinutes(minutesId, orgId);
  if (!minutes) throw createError({ statusCode: 404, message: "Minutes not found" });

  return { minutes };
});

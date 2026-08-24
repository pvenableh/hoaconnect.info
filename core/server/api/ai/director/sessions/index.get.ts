/**
 * GET /api/ai/director/sessions — the Board Room meetings running right now.
 *
 * The "pull up a chair" list. A session is a `hoa_director_sessions` row, and
 * `listLiveSessions()` already filters to this community and to `status: live`,
 * so this route is the door and nothing more.
 *
 * Query: orgId (required).
 *
 * Gated exactly like `/api/ai/director/plan`: org admins and seated board
 * members. A live session names what the board is about to decide, which is the
 * same business the plan behind it is.
 */

import { listLiveSessions } from "#core/server/utils/director-sessions";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);

  const q = getQuery(event);
  const orgId = String(q.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const directus = getTypedDirectus();

  // Authorization first — before a single row of this community is read.
  const admin = await checkAdminAccess(event, orgId);
  const allowed = admin.isAdmin || (await isActiveBoardMember(directus, userId, orgId));
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Admin or board access required" });
  }

  return { sessions: await listLiveSessions(orgId) };
});

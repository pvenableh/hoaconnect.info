/**
 * GET /api/ai/director/minutes — this community's decision records.
 *
 * Minutes are the durable half of the Board Room: a meeting ends, the room
 * closes, and what survives is what was decided. They are listed on the
 * **meetings hub** rather than only inside the Board Room, because that is
 * where an HOA already keeps its record of itself — the Board Room is where
 * minutes are made, not where they live.
 *
 * Query: orgId (required), limit (optional, default 40, max 100).
 *
 * Gated like the plan endpoint: org admins and seated board members.
 */

import { listMinutes } from "#core/server/utils/director-minutes";

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

  const limit = Math.min(100, Math.max(1, Number(q.limit) || 40));
  return { minutes: await listMinutes(orgId, limit) };
});

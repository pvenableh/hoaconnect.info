/**
 * POST /api/ai/director/minutes/[id] — share a decision record with the board.
 *
 * Body: { orgId, op: "share" }
 *
 * One door for the same reason the session's is: sharing is a status flip on a
 * record, not a resource of its own, and `markMinutesShared()` already refuses
 * a row that is not this community's.
 *
 * Gated like the plan endpoint: org admins and seated board members.
 */

import { loadMinutes, markMinutesShared } from "#core/server/utils/director-minutes";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);

  const body = ((await readBody(event).catch(() => ({}))) || {}) as {
    orgId?: string;
    op?: string;
  };

  const orgId = String(body.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  if (String(body.op || "").trim() !== "share") {
    throw createError({ statusCode: 400, message: "Unknown op" });
  }

  const minutesId = String(getRouterParam(event, "id") || "").trim();
  if (!minutesId) throw createError({ statusCode: 400, message: "minutes id is required" });

  const directus = getTypedDirectus();

  // Authorization first — before a single row of this community is read.
  const admin = await checkAdminAccess(event, orgId);
  const allowed = admin.isAdmin || (await isActiveBoardMember(directus, userId, orgId));
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Admin or board access required" });
  }

  const ok = await markMinutesShared(minutesId, orgId);
  if (!ok) throw createError({ statusCode: 404, message: "Minutes not found" });

  return { ok: true, minutes: await loadMinutes(minutesId, orgId) };
});

/**
 * GET /api/ai/notices — what this community should be looking at.
 *
 * Deterministic: the generators in `server/utils/ai-notices.ts` read the org's
 * own rows and do arithmetic. No LLM is called here, so this endpoint costs
 * nothing, spends no AI credits, and returns the same answer twice for the same
 * data.
 *
 * Query:
 *   orgId       (required) — the community
 *   entityType  (optional) — with entityId, focus on one record
 *   entityId    (optional)
 *   limit       (optional, default 50, max 200)
 *
 * Gated to org admins and seated board members. Deliberately NOT open to plain
 * members: a notice names other people's arrears, other people's requests and
 * the association's vendor exposure. That is the board's business.
 */

import { collectOrgNotices, collectDirectorAgenda } from "#core/server/utils/ai-notices";

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);

  const q = getQuery(event);
  const orgId = String(q.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const directus = getTypedDirectus();

  // The tenancy line. `checkAdminAccess` answers for THIS org only, and board
  // membership is read against this org's roster, so a caller asking about a
  // community they have no standing in gets 403 rather than a filtered list —
  // which is the right answer, because an empty list is itself information.
  const admin = await checkAdminAccess(event, orgId);
  const allowed = admin.isAdmin || (await isActiveBoardMember(directus, userId, orgId));
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Admin or board access required" });
  }

  const now = new Date();
  const entityType = q.entityType ? String(q.entityType) : null;
  const entityId = q.entityId ? String(q.entityId) : null;

  if (entityType && entityId) {
    const agenda = await collectDirectorAgenda(directus, orgId, now, { entityType, entityId });
    return {
      notices: agenda.groups.flatMap((g) => g.notices),
      total: agenda.totalNotices,
      generatedAt: now.toISOString(),
      scope: { entityType, entityId },
    };
  }

  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const all = await collectOrgNotices(directus, orgId, now);

  return {
    notices: all.slice(0, limit),
    total: all.length,
    generatedAt: now.toISOString(),
    scope: { entityType: null, entityId: null },
  };
});

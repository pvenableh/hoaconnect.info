/**
 * GET /api/ai/director/briefing — the saved briefing, and only ever the saved one.
 *
 * `POST /api/ai/director/plan` serves a cached briefing for six hours and
 * charges nothing for it — but if the cache is cold it DRAFTS, which costs
 * credits. That is exactly right for the Board Room, where a person asked for a
 * briefing, and exactly wrong for the stacks home, which nobody asked anything
 * of: a dashboard that spends money on mount is the one thing Phase 7 can get
 * catastrophically wrong.
 *
 * So the read is split from the write. This route calls
 * `loadLatestDirectorBriefing()` and nothing else. There is no `refresh`, no
 * wallet lookup, no Anthropic client in the module graph, and no branch that
 * reaches one — a cold cache returns `{ briefing: null }` and the Know pile
 * shows what it has, which may be nothing. The home page cannot bill the
 * community by rendering.
 *
 * Query: orgId (required). Optional entityType/entityId/subject/topic select a
 * narrower section, using the same cache key the writer derives.
 *
 * Gated exactly like `/api/ai/director/plan`: org admins and seated board
 * members. A briefing names other people's arrears; reading one is board
 * business.
 */

import {
  loadLatestDirectorBriefing,
  directorBriefingCacheKey,
  type DirectorBriefingScope,
} from "#core/server/utils/director-briefings";

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

  const entityType = String(q.entityType || "").trim();
  const entityId = String(q.entityId || "").trim();
  const isEntity = !!entityType && !!entityId;

  const scope: DirectorBriefingScope = {
    scopeType: isEntity ? "entity" : "org",
    entityType: isEntity ? entityType : null,
    entityId: isEntity ? entityId : null,
    subject: String(q.subject || "").trim() || null,
    topic: String(q.topic || "").trim() || null,
  };

  const cached = await loadLatestDirectorBriefing(orgId, scope);

  return {
    cacheKey: directorBriefingCacheKey(scope),
    briefing: cached
      ? {
          planId: cached.planId,
          intro: cached.intro,
          points: cached.points,
          stepCount: cached.stepCount,
          savedAt: cached.savedAt,
        }
      : null,
  };
});

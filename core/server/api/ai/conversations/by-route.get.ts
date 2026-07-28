// GET /api/ai/conversations/by-route?orgId=&route=&scope= — the caller's recent
// conversations scoped to a page/route (not a specific entity), newest first, so
// a general "help me on this screen" thread persists per section. Auth-gated,
// org + user scoped. Matches in memory (Directus can't deep-filter JSON); a
// route match wins, else a coarser scope match. Degrades to empty pre-migration.

import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;
  const q = getQuery(event);
  const orgId = String(q.orgId || "").trim();
  const route = String(q.route || "").trim();
  const scope = String(q.scope || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!route && !scope) {
    throw createError({ statusCode: 400, message: "route or scope is required" });
  }

  await requireOrgComposeAccess(event, orgId);

  try {
    const rows = await getTypedDirectus().request(
      readItems("ai_conversations", {
        filter: { organization: { _eq: orgId }, user: { _eq: userId } },
        fields: ["id", "title", "model", "date_updated", "context"],
        sort: ["-date_updated"],
        limit: 30,
      })
    );

    const matches = rows.filter((r) => {
      const c = (r.context ?? null) as { entityId?: string; route?: string; scope?: string } | null;
      if (!c || c.entityId) return false; // only page/route-scoped (not entity) threads
      return route ? c.route === route : c.scope === scope;
    });
    return { conversations: matches };
  } catch {
    return { conversations: [] };
  }
});

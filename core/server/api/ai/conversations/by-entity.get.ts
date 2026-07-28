// GET /api/ai/conversations/by-entity?orgId=&entityType=&entityId= — the caller's
// recent conversations SCOPED to a specific entity (a member, vendor, project,
// ticket…), newest first, so the panel can resume that item's own thread and
// show its history. Auth-gated, org + user scoped.
//
// Directus can't deep-filter JSON, so we fetch the user's recent context-tagged
// conversations and match in memory (mirrors Earnest's by-entity pattern). If
// the `context` column isn't present yet (pre-migration), this degrades to an
// empty list rather than erroring.

import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;
  const q = getQuery(event);
  const orgId = String(q.orgId || "").trim();
  const entityType = String(q.entityType || "").trim();
  const entityId = String(q.entityId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!entityType || !entityId) {
    throw createError({ statusCode: 400, message: "entityType and entityId are required" });
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
      const c = (r.context ?? null) as { entityType?: string; entityId?: string } | null;
      return c?.entityType === entityType && String(c?.entityId ?? "") === entityId;
    });
    return { conversations: matches };
  } catch {
    return { conversations: [] };
  }
});

// GET /api/ai/conversations?orgId=... — the caller's recent assistant
// conversations in this org (for the panel's resume list). Auth-gated and
// restricted to comms-capable actors; scoped to the org AND the current user
// (staff see their own threads, not each other's).

import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;
  const orgId = String(getQuery(event).orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  await requireOrgComposeAccess(event, orgId);

  const rows = (await getTypedDirectus().request(
    readItems("ai_conversations", {
      filter: { organization: { _eq: orgId }, user: { _eq: userId } },
      fields: ["id", "title", "model", "date_updated", "date_created"],
      sort: ["-date_updated"],
      limit: 50,
    })
  )) as { id: string; title?: string | null; model?: string | null; date_updated?: string | null }[];

  return { conversations: rows };
});

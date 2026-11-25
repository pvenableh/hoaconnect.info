// GET /api/ai/conversations?orgId=... — the caller's recent assistant
// conversations in this org (for the panel's resume list). Auth-gated and
// restricted to comms-capable actors; scoped to the org AND the current user
// (staff see their own threads, not each other's).

import { readItems } from "@directus/sdk";
import { conversationListSpec } from "#core/server/utils/ai-action-reads";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;
  const orgId = String(getQuery(event).orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  // The list and the caller's standing as ONE request (ai-action-reads.ts);
  // the gate then answers from the cached standing and refuses before any of
  // these rows is used. A failed batch reads on its own below, as before.
  const spec = conversationListSpec(orgId, userId);
  const batched = await batchWithAccessSnapshot(event, orgId, { cv_rows: spec }).catch(() => null);
  await requireOrgComposeAccess(event, orgId);

  const rows = (batched
    ? batched.cv_rows
    : await getTypedDirectus().request(
        readItems("ai_conversations", {
          filter: spec.filter as any,
          fields: [...spec.fields] as any,
          sort: [...spec.sort!] as any,
          limit: spec.limit,
        })
      )) as { id: string; title?: string | null; model?: string | null; date_updated?: string | null }[];

  return { conversations: rows };
});

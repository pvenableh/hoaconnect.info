// GET /api/ai/messages?orgId=...&conversationId=... — the turns of one
// conversation, for resuming it in the panel. Auth-gated, comms-capable actors
// only, and hard-scoped to the org + the owning user (so a conversation id from
// another tenant or person returns nothing).

import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session.user as any)?.id ?? null;
  const query = getQuery(event);
  const orgId = String(query.orgId || "").trim();
  const conversationId = String(query.conversationId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!conversationId) throw createError({ statusCode: 400, message: "conversationId is required" });

  await requireOrgComposeAccess(event, orgId);

  const directus = getTypedDirectus();

  // Verify the conversation belongs to this org + user before returning turns.
  const convo = (await directus.request(
    readItems("ai_conversations", {
      filter: { id: { _eq: conversationId }, organization: { _eq: orgId }, user: { _eq: userId } },
      fields: ["id", "title", "model"],
      limit: 1,
    })
  )) as { id: string; title?: string | null; model?: string | null }[];
  if (!convo?.[0]) {
    throw createError({ statusCode: 404, message: "Conversation not found" });
  }

  const messages = (await directus.request(
    readItems("ai_messages", {
      filter: { conversation: { _eq: conversationId } },
      fields: ["id", "role", "content", "date_created"],
      sort: ["date_created"],
      limit: 200,
    })
  )) as { id: string; role: "user" | "assistant"; content?: string | null; date_created?: string | null }[];

  return { conversation: convo[0], messages };
});

/**
 * POST /api/user/push/unsubscribe  { endpoint }
 *
 * Drop this browser's subscription. Scoped to the signed-in member's own rows so
 * knowing (or guessing) someone else's endpoint can't silence their
 * notifications — the endpoint is the only identifier the client has, and it
 * travels in a request body, so it must not be authority on its own.
 */
import { deleteItem, readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  const body = await readBody(event);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) {
    throw createError({ statusCode: 400, statusMessage: "endpoint is required" });
  }

  const admin = getTypedDirectus();
  const rows = await admin.request(
    readItems("push_subscriptions", {
      filter: { endpoint: { _eq: endpoint }, user: { _eq: userId } },
      fields: ["id"],
      limit: 1,
    })
  );

  if (rows?.[0]) {
    await admin.request(deleteItem("push_subscriptions", rows[0].id));
    return { ok: true, deleted: true };
  }
  // Already gone (or never ours) — the caller's goal is met either way.
  return { ok: true, deleted: false };
});

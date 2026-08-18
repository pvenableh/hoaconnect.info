/**
 * POST /api/user/push/subscribe  { endpoint, keys: { p256dh, auth } }
 *
 * Register this browser's push subscription against the signed-in member.
 *
 * Upsert BY ENDPOINT, not by user: one member can have several browsers/devices
 * (phone, laptop, tablet) and each is a separate subscription, while the same
 * browser re-subscribing must update its row rather than accumulate duplicates
 * that would each deliver the same notification.
 *
 * An endpoint that already belongs to a DIFFERENT user is reassigned — that's a
 * shared device where someone else signed in, and the browser is now theirs.
 */
import { createItem, readItems, updateItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  const body = await readBody(event);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    throw createError({ statusCode: 400, statusMessage: "endpoint and keys are required" });
  }
  // A push endpoint is always an https URL issued by the browser's push service.
  if (!/^https:\/\//i.test(endpoint)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid endpoint" });
  }

  const admin = getTypedDirectus();
  const now = new Date().toISOString();
  const userAgent = (getRequestHeader(event, "user-agent") || "").slice(0, 255);

  const existing = await admin.request(
    readItems("push_subscriptions", {
      filter: { endpoint: { _eq: endpoint } },
      fields: ["id"],
      limit: 1,
    })
  );

  const payload = {
    user: userId,
    endpoint,
    p256dh,
    auth,
    user_agent: userAgent,
    last_used_at: now,
  };

  if (existing?.[0]) {
    await admin.request(updateItem("push_subscriptions", existing[0].id, payload));
    return { ok: true, created: false };
  }
  await admin.request(createItem("push_subscriptions", payload));
  return { ok: true, created: true };
});

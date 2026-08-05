/**
 * PATCH /api/user/notification-preferences
 *
 * Update the signed-in member's notification settings. Body may include
 * `email_notifications` (boolean master switch) and/or `notification_preferences`
 * (the per-category + digest JSON, sanitized to known keys before writing).
 */

import { updateUser } from "@directus/sdk";
import { sanitizePreferences } from "#core/shared/notifications/preferences";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  const body = await readBody(event);
  const patch: Record<string, unknown> = {};
  if (typeof body?.email_notifications === "boolean") {
    patch.email_notifications = body.email_notifications;
  }
  if (body?.notification_preferences !== undefined) {
    patch.notification_preferences = sanitizePreferences(body.notification_preferences);
  }
  if (!Object.keys(patch).length) {
    throw createError({ statusCode: 400, statusMessage: "Nothing to update" });
  }

  const admin = getTypedDirectus();
  await admin.request(updateUser(userId, patch as Record<string, any>));
  return { ok: true, ...patch };
});

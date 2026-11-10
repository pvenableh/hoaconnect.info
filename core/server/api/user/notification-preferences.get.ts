/**
 * GET /api/user/notification-preferences
 *
 * The signed-in member's unified notification settings: the app's master email
 * switch (`email_enabled`, stored as `_email` in the blob — never Directus's own
 * `email_notifications`, see the PATCH) plus the per-category + digest JSON blob.
 * Degrades gracefully if the JSON column hasn't been provisioned yet (returns
 * opt-in defaults).
 */

import { readUser } from "@directus/sdk";
import { emailMasterOn } from "#core/shared/notifications/preferences";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  const admin = getTypedDirectus();
  let row: any = null;
  try {
    row = await admin.request(
      readUser(userId, {
        fields: ["notification_preferences"],
      })
    );
  } catch (e) {
    // Field may not exist yet — fall back to defaults so the UI still renders.
    console.warn("[notification-preferences] read failed", (e as Error).message);
  }

  const prefs =
    row?.notification_preferences && typeof row.notification_preferences === "object"
      ? row.notification_preferences
      : {};
  return { email_enabled: emailMasterOn(prefs), notification_preferences: prefs };
});

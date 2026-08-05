/**
 * GET /api/user/notification-preferences
 *
 * The signed-in member's unified notification settings: the master email switch
 * plus the per-category + digest JSON blob. Degrades gracefully if the JSON
 * column hasn't been provisioned yet (returns opt-in defaults).
 */

import { readUser } from "@directus/sdk";

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
        fields: ["email_notifications", "notification_preferences"],
      })
    );
  } catch (e) {
    // Field may not exist yet — fall back to defaults so the UI still renders.
    console.warn("[notification-preferences] read failed", (e as Error).message);
  }

  return {
    email_notifications: row?.email_notifications ?? true,
    notification_preferences:
      row?.notification_preferences && typeof row.notification_preferences === "object"
        ? row.notification_preferences
        : {},
  };
});

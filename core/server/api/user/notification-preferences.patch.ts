/**
 * PATCH /api/user/notification-preferences
 *
 * Update the signed-in member's notification settings. Body may include
 * `email_enabled` (the app's master email switch) and/or `notification_preferences`
 * (the per-category + digest JSON, sanitized to known keys before writing).
 *
 * The master switch is stored as `_email` INSIDE `notification_preferences`, not
 * in Directus's `email_notifications` (Session H: that field makes Directus email
 * every bell row itself, so it stays false). The blob is written whole, so the
 * stored one is read first: a category save must not reset `_email`, and an
 * email-only save must not wipe the categories. Every save also writes
 * `email_notifications: false`, which re-silences anyone Studio switched back on.
 */

import { readUser, updateUser } from "@directus/sdk";
import {
  DIRECTUS_EMAIL_OFF,
  emailMasterOn,
  sanitizePreferences,
} from "#core/shared/notifications/preferences";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  const body = await readBody(event);
  const setsEmail = typeof body?.email_enabled === "boolean";
  const setsPrefs = body?.notification_preferences !== undefined;
  if (!setsEmail && !setsPrefs) {
    throw createError({ statusCode: 400, statusMessage: "Nothing to update" });
  }

  const admin = getTypedDirectus();
  let stored: Record<string, unknown> = {};
  try {
    const row = (await admin.request(
      readUser(userId, { fields: ["notification_preferences"] })
    )) as { notification_preferences?: unknown } | null;
    stored = sanitizePreferences(row?.notification_preferences);
  } catch (e) {
    // Writing without the stored blob would drop whichever half this save
    // didn't carry, so refuse; the client rolls its toggle back.
    console.warn("[notification-preferences] read before write failed", (e as Error).message);
    throw createError({ statusCode: 503, statusMessage: "Couldn't load your settings; try again" });
  }

  const next = setsPrefs ? sanitizePreferences(body.notification_preferences) : { ...stored };
  if (setsEmail) next._email = body.email_enabled;
  else if (typeof next._email !== "boolean" && typeof stored._email === "boolean") next._email = stored._email;

  await admin.request(
    updateUser(userId, { notification_preferences: next, ...DIRECTUS_EMAIL_OFF } as Record<string, any>)
  );
  return { ok: true, email_enabled: emailMasterOn(next), notification_preferences: next };
});

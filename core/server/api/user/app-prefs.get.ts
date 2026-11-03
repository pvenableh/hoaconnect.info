/**
 * GET /api/user/app-prefs
 *
 * The signed-in user's workspace preferences (`directus_users.app_prefs`,
 * sanitized — core/shared/nav/app-prefs.ts). The SESSION's user, always: there
 * is no id parameter, so nobody can read anyone else's.
 *
 * Degrades gracefully when the field has not been provisioned yet
 * (scripts/add-user-app-prefs-field.ts): `available: false` and empty prefs,
 * and the client keeps its localStorage cache as the only copy.
 */

import { readUser } from "@directus/sdk";
import { sanitizeAppPrefs } from "#core/shared/nav/app-prefs";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  const admin = getTypedDirectus();
  try {
    const row = (await admin.request(readUser(userId, { fields: ["app_prefs"] } as any))) as {
      app_prefs?: unknown;
    } | null;
    return { available: true, prefs: sanitizeAppPrefs(row?.app_prefs) };
  } catch (e) {
    console.warn("[app-prefs] read failed", (e as Error).message);
    return { available: false, prefs: {} };
  }
});

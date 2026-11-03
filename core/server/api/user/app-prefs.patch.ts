/**
 * PATCH /api/user/app-prefs
 *
 * Merge a change into the signed-in user's workspace preferences
 * (`directus_users.app_prefs`). Body: `{ dock: { palette?, position?, labels?,
 * glass? } }`.
 *
 * ⚠️ Writes the SESSION's user and nothing else. The body is reduced to the four
 * known dock keys (sanitizeAppPrefs) before it goes anywhere near the row, so
 * an `id`, `role`, `email` or any other field in it is dropped, not written —
 * the admin token below would otherwise write whatever it was handed.
 */

import { readUser, updateUser } from "@directus/sdk";
import { mergeAppPrefs, sanitizeAppPrefs } from "#core/shared/nav/app-prefs";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  const patch = sanitizeAppPrefs(await readBody(event));
  if (!patch.dock) {
    throw createError({ statusCode: 400, statusMessage: "Nothing to update" });
  }

  const admin = getTypedDirectus();
  let current: unknown = {};
  try {
    const row = (await admin.request(readUser(userId, { fields: ["app_prefs"] } as any))) as {
      app_prefs?: unknown;
    } | null;
    current = row?.app_prefs;
  } catch {
    // The field is not provisioned yet: say so, rather than writing a field
    // Directus would reject. The client keeps its local copy.
    throw createError({ statusCode: 503, statusMessage: "App preferences are not available yet" });
  }

  const prefs = mergeAppPrefs(current, patch);
  await admin.request(updateUser(userId, { app_prefs: prefs } as Record<string, any>));
  return { ok: true, prefs };
});

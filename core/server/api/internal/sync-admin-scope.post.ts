// POST /api/internal/sync-admin-scope — recompute the scope fields Directus
// policies read (core/shared/roles/admin-scope.ts): admin_of and the manager
// scopes, active_in and posts_in on hoa_members, and posts_to on the channel
// rows of the people named.
//
// Called by the Directus Flow "Admin scope sync" on every hoa_members create
// and update, with the trigger as the body (`key` or `keys`), and nightly by
// "Admin scope reconcile" with `{ all: true }`. No keys named means everyone.
// Authorized via the cron secret or a signed-in App Administrator
// (`requireCronOrAppAdmin`): it can touch every community.
import { requireCronOrAppAdmin } from "../../utils/cron-auth";
import { syncAdminScope } from "../../utils/admin-scope";
import { syncKeysFrom } from "#core/shared/roles/admin-scope";

export default defineEventHandler(async (event) => {
  await requireCronOrAppAdmin(event);
  const body = await readBody(event).catch(() => null);
  const keys = syncKeysFrom(body);
  const result = await syncAdminScope(keys);
  if (result.updated) {
    console.log(`[admin-scope] ${result.updated} of ${result.checked} memberships updated`, result.changes);
  }
  if (result.channels?.updated) {
    console.log(`[admin-scope] posts_to rewritten on ${result.channels.updated} of ${result.channels.checked} channel rows`);
  }
  return { ok: true, scope: keys ? "keys" : "all", checked: result.checked, updated: result.updated, channels: result.channels };
});

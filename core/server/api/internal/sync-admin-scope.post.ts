// POST /api/internal/sync-admin-scope — recompute hoa_members.admin_of, which
// the HOA Admin policy scopes every rule with (core/shared/roles/admin-scope.ts).
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
  return { ok: true, scope: keys ? "keys" : "all", checked: result.checked, updated: result.updated };
});

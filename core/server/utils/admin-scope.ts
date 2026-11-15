/**
 * Keep the scope fields on hoa_members true (core/shared/roles/admin-scope.ts):
 * `admin_of`, `manager_of`, `communications_of`, `inquiries_of`. Called by the
 * Directus Flow on every hoa_members create and update, and nightly with no
 * keys to reconcile everyone. Idempotent: a row already right is not written,
 * so the Flow's own echo of this write ends here.
 *
 * Reads `*` rather than naming the fields, so a field not yet created is
 * skipped instead of failing the whole read (naming a missing field does).
 */
import { readItems, updateItem } from "@directus/sdk";
import { scopeChanges, type ScopeField, type ScopedMembershipWithGrants } from "#core/shared/roles/admin-scope";

export interface AdminScopeSyncResult {
  checked: number;
  updated: number;
  changes: { id: string; patch: Partial<Record<ScopeField, string | null>> }[];
}

/** Recompute the scope fields for the given memberships, or for every membership when `keys` is null. */
export async function syncAdminScope(keys: string[] | null): Promise<AdminScopeSyncResult> {
  const config = useRuntimeConfig();
  const roles = {
    hoaAdmin: String(config.public.directusRoleHoaAdmin || ""),
    propertyManager: String(config.public.directusRolePropertyManager || ""),
  };
  if (!roles.hoaAdmin) throw createError({ statusCode: 500, message: "HOA Admin role is not configured" });

  const directus = getTypedDirectus();
  const rows = (await directus.request(
    readItems("hoa_members", {
      ...(keys ? { filter: { id: { _in: keys } } } : {}),
      fields: ["*"] as any,
      limit: -1,
    })
  )) as unknown as ScopedMembershipWithGrants[];

  const changes = scopeChanges(rows ?? [], roles);
  for (const c of changes) {
    await directus.request(updateItem("hoa_members", c.id, c.patch as any));
  }
  return { checked: rows?.length ?? 0, updated: changes.length, changes };
}

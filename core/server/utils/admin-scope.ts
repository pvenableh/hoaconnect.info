/**
 * Keep `hoa_members.admin_of` true (core/shared/roles/admin-scope.ts). Called
 * by the Directus Flow on every hoa_members create and update, and nightly
 * with no keys to reconcile everyone. Idempotent: a row already right is not
 * written, so the Flow's own echo of this write ends here.
 */
import { readItems, updateItem } from "@directus/sdk";
import { adminScopeChanges, type ScopedMembership } from "#core/shared/roles/admin-scope";

const FIELDS = ["id", "role", "status", "organization", "admin_of"];

export interface AdminScopeSyncResult {
  checked: number;
  updated: number;
  changes: { id: string; admin_of: string | null }[];
}

/** Recompute `admin_of` for the given memberships, or for every membership when `keys` is null. */
export async function syncAdminScope(keys: string[] | null): Promise<AdminScopeSyncResult> {
  const config = useRuntimeConfig();
  const adminRole = String(config.public.directusRoleHoaAdmin || "");
  if (!adminRole) throw createError({ statusCode: 500, message: "HOA Admin role is not configured" });

  const directus = getTypedDirectus();
  const rows = (await directus.request(
    readItems("hoa_members", {
      ...(keys ? { filter: { id: { _in: keys } } } : {}),
      fields: FIELDS as any,
      limit: -1,
    })
  )) as unknown as ScopedMembership[];

  const changes = adminScopeChanges(rows ?? [], adminRole);
  for (const c of changes) {
    await directus.request(updateItem("hoa_members", c.id, { admin_of: c.admin_of } as any));
  }
  return { checked: rows?.length ?? 0, updated: changes.length, changes };
}

/**
 * The HOA Admin policy's scope: communities where the person is an admin,
 * not every community they belong to (core/shared/roles/admin-scope.ts).
 *
 * Every rule in scripts/setup-directus-permissions.ts is built with
 * `$CURRENT_USER.hoa_members.organization` (any membership). For the HOA
 * Admin policy that string is swapped, wherever it appears in a permission or
 * validation filter, for `$CURRENT_USER.hoa_members.admin_of`, which holds the
 * organization only on an HOA Admin membership. The HOA Member policy, also
 * attached to the HOA Admin role, keeps member-level access in the others.
 *
 * `admin_of` is a plain uuid, not a relation, so the two paths are two scalar
 * fields of one read and cannot collide the way `organization` and
 * `organization.folder` once did (scripts/lib/folder-org-filters.ts).
 */
export const ANY_MEMBERSHIP = "$CURRENT_USER.hoa_members.organization";
export const ADMIN_MEMBERSHIP = "$CURRENT_USER.hoa_members.admin_of";

/** A deep copy with every `ANY_MEMBERSHIP` value replaced by `ADMIN_MEMBERSHIP`. */
export function toAdminScope<T>(value: T): T {
  if (value === ANY_MEMBERSHIP) return ADMIN_MEMBERSHIP as unknown as T;
  if (Array.isArray(value)) return value.map((v) => toAdminScope(v)) as unknown as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toAdminScope(v)])) as T;
  }
  return value;
}

export function scopeAdminPermission<P extends { permissions: unknown; validation: unknown }>(p: P): P {
  return { ...p, permissions: toAdminScope(p.permissions), validation: toAdminScope(p.validation) };
}

/** True when a filter still reaches through any membership (a string that was not swapped). */
export function mentionsAnyMembership(value: unknown): boolean {
  return JSON.stringify(value ?? null).includes(ANY_MEMBERSHIP);
}

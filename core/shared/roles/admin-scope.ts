/**
 * Where a person is an admin, as Directus permissions can read it.
 *
 * A Directus user has one global role, set when their first invitation is
 * accepted, and the HOA Admin policy used to scope every rule with
 * `$CURRENT_USER.hoa_members.organization`: every community the person
 * belongs to, in any role. Directus variables cannot filter memberships by
 * role, so an admin of one community who was a plain member of another held
 * admin-level reads and writes in both.
 *
 * `hoa_members.admin_of` carries the answer as data: the membership's
 * organization when it is an HOA Admin membership the server would honour
 * (`checkAdminAccess`: active or pending), else null. The HOA Admin policy
 * scopes with `$CURRENT_USER.hoa_members.admin_of`; the HOA Member policy,
 * also attached to the HOA Admin role, gives member-level access everywhere
 * else. A Directus Flow keeps the field current through
 * `POST /api/internal/sync-admin-scope`; a nightly reconcile catches drift.
 *
 * The same field pattern scopes the Property Manager policy: `manager_of`
 * (an active Property Manager membership), and one field per grant whose
 * Directus rules reach beyond what a resident already reads:
 * `communications_of` (emails and their recipients) and `inquiries_of`
 * (every request, internal comments). The HOA Member policy, attached to the
 * Property Manager role too, gives a manager resident-level access in their
 * communities and wherever they live.
 *
 * Pure: no Directus, no H3.
 */

import { normalizeGrants } from "../transition/grants";

/** Membership statuses under which an HOA Admin membership grants admin, as the server reads them. */
export const ADMIN_SCOPE_STATUSES: readonly string[] = ["active", "pending"];

/**
 * Membership statuses under which a Property Manager membership counts, as
 * `getManagerGrants` reads them (active only, unlike admin).
 */
export const MANAGER_SCOPE_STATUSES: readonly string[] = ["active"];

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null;

export interface ScopedMembership {
  id: string;
  role?: unknown;
  status?: string | null;
  organization?: unknown;
  admin_of?: string | null;
}

/** The organization this membership administers, or null. */
export function adminScopeOf(m: ScopedMembership, hoaAdminRoleId: string): string | null {
  if (!hoaAdminRoleId) return null;
  if (idOf(m.role) !== hoaAdminRoleId) return null;
  if (!m.status || !ADMIN_SCOPE_STATUSES.includes(m.status)) return null;
  return idOf(m.organization);
}

/** Every scope field on hoa_members, in the order they were added. */
export const SCOPE_FIELDS = ["admin_of", "manager_of", "communications_of", "inquiries_of"] as const;
export type ScopeField = (typeof SCOPE_FIELDS)[number];
export const MANAGER_SCOPE_FIELDS: readonly ScopeField[] = ["manager_of", "communications_of", "inquiries_of"];

export interface ScopeRoles {
  hoaAdmin: string;
  propertyManager: string;
}

export interface ScopedMembershipWithGrants extends ScopedMembership {
  manager_permissions?: unknown;
  manager_of?: string | null;
  communications_of?: string | null;
  inquiries_of?: string | null;
}

/** The organization this membership manages, or null. The hat alone never counts: the role does. */
export function managerScopeOf(m: ScopedMembership, propertyManagerRoleId: string): string | null {
  if (!propertyManagerRoleId) return null;
  if (idOf(m.role) !== propertyManagerRoleId) return null;
  if (!m.status || !MANAGER_SCOPE_STATUSES.includes(m.status)) return null;
  return idOf(m.organization);
}

/** What every scope field of this membership should hold. */
export function scopeFieldsOf(m: ScopedMembershipWithGrants, roles: ScopeRoles): Record<ScopeField, string | null> {
  const managed = managerScopeOf(m, roles.propertyManager);
  const grants = normalizeGrants((m.manager_permissions ?? null) as Record<string, unknown> | null);
  return {
    admin_of: adminScopeOf(m, roles.hoaAdmin),
    manager_of: managed,
    communications_of: managed && grants.communications ? managed : null,
    inquiries_of: managed && grants.inquiries ? managed : null,
  };
}

/**
 * The rows with a wrong scope field, and the patch that fixes them. Only the
 * fields named (default: all) and present on the row are compared, so a
 * field not yet created is never "wrong".
 */
export function scopeChanges(
  rows: readonly ScopedMembershipWithGrants[],
  roles: ScopeRoles,
  fields: readonly ScopeField[] = SCOPE_FIELDS
): { id: string; patch: Partial<Record<ScopeField, string | null>> }[] {
  const out: { id: string; patch: Partial<Record<ScopeField, string | null>> }[] = [];
  for (const r of rows) {
    const want = scopeFieldsOf(r, roles);
    const patch: Partial<Record<ScopeField, string | null>> = {};
    for (const f of fields) {
      if (!(f in r)) continue;
      if (((r as unknown as Record<string, unknown>)[f] ?? null) !== want[f]) patch[f] = want[f];
    }
    if (Object.keys(patch).length) out.push({ id: r.id, patch });
  }
  return out;
}

/** The rows whose stored `admin_of` is wrong, with the value it should hold. */
export function adminScopeChanges(
  rows: readonly ScopedMembership[],
  hoaAdminRoleId: string
): { id: string; admin_of: string | null }[] {
  const out: { id: string; admin_of: string | null }[] = [];
  for (const r of rows) {
    const want = adminScopeOf(r, hoaAdminRoleId);
    if ((r.admin_of ?? null) !== want) out.push({ id: r.id, admin_of: want });
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The membership ids a sync request names. A Directus Flow sends its whole
 * trigger: `key` on create, `keys` on update, possibly as a JSON string. Null
 * means "none named: reconcile everyone", which is also the nightly call.
 */
export function syncKeysFrom(body: unknown): string[] | null {
  let b: unknown = body;
  if (typeof b === "string") {
    try {
      b = JSON.parse(b);
    } catch {
      return null;
    }
  }
  if (!b || typeof b !== "object") return null;
  const o = b as { all?: unknown; key?: unknown; keys?: unknown };
  if (o.all === true) return null;
  const raw = [...(Array.isArray(o.keys) ? o.keys : []), o.key].map((k) => (typeof k === "number" ? String(k) : k));
  const keys = [...new Set(raw.filter((k): k is string => typeof k === "string" && UUID.test(k)))];
  return keys.length ? keys.slice(0, 500) : null;
}

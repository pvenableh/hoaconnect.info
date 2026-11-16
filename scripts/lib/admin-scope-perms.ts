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
 * The Property Manager policy gets the same treatment, by grant (below).
 *
 * `admin_of` is a plain uuid, not a relation, so the two paths are two scalar
 * fields of one read and cannot collide the way `organization` and
 * `organization.folder` once did (scripts/lib/folder-org-filters.ts).
 */
export const ANY_MEMBERSHIP = "$CURRENT_USER.hoa_members.organization";
export const ADMIN_MEMBERSHIP = "$CURRENT_USER.hoa_members.admin_of";

/** A deep copy with every `ANY_MEMBERSHIP` value replaced by `path`. */
export function toScope<T>(value: T, path: string): T {
  if (value === ANY_MEMBERSHIP) return path as unknown as T;
  if (Array.isArray(value)) return value.map((v) => toScope(v, path)) as unknown as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toScope(v, path)])) as T;
  }
  return value;
}

/** A deep copy with every `ANY_MEMBERSHIP` value replaced by `ADMIN_MEMBERSHIP`. */
export function toAdminScope<T>(value: T): T {
  return toScope(value, ADMIN_MEMBERSHIP);
}

export function scopeAdminPermission<P extends { permissions: unknown; validation: unknown }>(p: P): P {
  return { ...p, permissions: toAdminScope(p.permissions), validation: toAdminScope(p.validation) };
}

// ── Property Manager ─────────────────────────────────────────────────────────
//
// The Property Manager role carries the HOA Member policy too, so a manager
// reads what any resident reads, in the communities they manage and wherever
// they live. The manager policy's own rules then only matter where they reach
// beyond that, and each of those is scoped by the field for the grant that
// covers it (core/shared/roles/admin-scope.ts):
//   emails and their recipients          communications_of
//   every request (read, edit), and
//   internal comments                    inquiries_of
//   everything else                      manager_of
// Measured on 2026-11-15: 17 of the 24 manager rules equalled the member
// rule, and five reached beyond it (the four above, and vendors).

export const MANAGER_MEMBERSHIP = "$CURRENT_USER.hoa_members.manager_of";
export const COMMUNICATIONS_MEMBERSHIP = "$CURRENT_USER.hoa_members.communications_of";
export const INQUIRIES_MEMBERSHIP = "$CURRENT_USER.hoa_members.inquiries_of";

/** The scope a Property Manager rule should read through. */
export function managerScopePath(collection: string, action: string): string {
  if (collection === "hoa_emails" || collection === "hoa_email_recipients") return COMMUNICATIONS_MEMBERSHIP;
  if (collection === "hoa_requests") return INQUIRIES_MEMBERSHIP;
  if (collection === "hoa_comments" && action === "read") return INQUIRIES_MEMBERSHIP;
  return MANAGER_MEMBERSHIP;
}

/**
 * Manager rules removed outright. Vendors: the manager rule read every vendor
 * with its contact fields; no manager page reads vendors, and "Vendors and
 * contracts" has no grant yet (AREAS: notify-only). A manager now reads the
 * vendors residents see (show_to_members). When the area gets its gate it
 * gets a scope field of its own.
 */
export const REMOVED_MANAGER_RULES: readonly { collection: string; action: string }[] = [
  { collection: "hoa_vendors", action: "read" },
];

export const isRemovedManagerRule = (collection: string, action: string) =>
  REMOVED_MANAGER_RULES.some((r) => r.collection === collection && r.action === action);

export function scopeManagerPermission<P extends { collection: string; action: string; permissions: unknown; validation: unknown }>(p: P): P {
  const path = managerScopePath(p.collection, p.action);
  return { ...p, permissions: toScope(p.permissions, path), validation: toScope(p.validation, path) };
}

// ── Admin writes that could leave the community ──────────────────────────────
//
// A create is checked only against its validation (Directus 11.13 does not
// apply a create rule's item filter), and an update's item filter only checks
// the row as it was. A validation cannot look a related row up. On a nested
// path (`meeting.organization`) it checks the payload only:
//   - a plain id fails it (a nested path needs an object), so the app's own
//     writes, which send ids, were refused;
//   - an object holding only the id passes it (an absent field is not
//     checked), and Directus then links the row after checking only that the
//     id exists (api/src/services/payload.ts, processM2O). So through the API
//     an admin could link a row to another community's meeting or member.
// Such a rule cannot be made safe in Directus. The write moves to a server
// route that checks both sides, and the rule goes.

/**
 * HOA Admin rules removed outright, each with the route that does the write:
 *   meeting attachments    none: no page writes these links;
 *                          `/api/directus/items` checks the meeting if one does
 *   meeting attendees      POST /api/org/meetings/[id]/attendees
 *   pets, vehicles         POST and PATCH /api/hoa/units/records
 *   member–unit links      /api/hoa/member-units/assign and /remove
 * Read and delete stay: they check the row as it is.
 */
export const REMOVED_ADMIN_RULES: readonly { collection: string; action: string }[] = [
  { collection: "hoa_meetings_files", action: "create" },
  { collection: "hoa_meetings_files", action: "update" },
  { collection: "hoa_meeting_attendees", action: "create" },
  { collection: "hoa_meeting_attendees", action: "update" },
  { collection: "hoa_pets", action: "create" },
  { collection: "hoa_pets", action: "update" },
  { collection: "hoa_vehicles", action: "create" },
  { collection: "hoa_vehicles", action: "update" },
  { collection: "hoa_member_units", action: "create" },
  { collection: "hoa_member_units", action: "update" },
];

export const isRemovedAdminRule = (collection: string, action: string) =>
  REMOVED_ADMIN_RULES.some((r) => r.collection === collection && r.action === action);

/**
 * HOA Admin update rules whose validation should repeat their item filter, so
 * an edit cannot point the row at another community: email templates, by
 * `organization`, a field of the row itself. A pin on a relation would not
 * hold (an object with only the id passes it, above). Not a general rule:
 * file and folder moves are relational too and the app makes them with the
 * user's token.
 */
export const PINNED_ADMIN_UPDATES: readonly string[] = ["hoa_email_templates"];

/** The rule with its validation pinned to its filter, when it is one of the pinned updates. */
export function pinAdminUpdate<P extends { collection: string; action: string; permissions: unknown; validation: unknown }>(p: P): P {
  if (p.action !== "update" || !PINNED_ADMIN_UPDATES.includes(p.collection)) return p;
  return { ...p, validation: p.permissions };
}

/** True when a filter still reaches through any membership (a string that was not swapped). */
export function mentionsAnyMembership(value: unknown): boolean {
  return JSON.stringify(value ?? null).includes(ANY_MEMBERSHIP);
}

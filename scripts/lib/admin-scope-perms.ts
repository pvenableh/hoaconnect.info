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

// ── HOA Member: where a person writes ────────────────────────────────────────
//
// Every HOA Member rule reached through any membership row, whatever its
// status, so an archived or inactive member still signed in could write with
// their own token (docs/spec-member-restrictions.md, found 2026-11-17). The
// member's writes now read through the fields the sync keeps
// (core/shared/roles/admin-scope.ts):
//   reach other people: comments (create, edit), reactions,
//   comment reports                                  posts_in
//   chat messages and mentions (create)              channel_memberships.posts_to
//   private to them and the board: requests
//   (create, edit their own), poll votes (create)    active_in
// Reads, and deleting one's own rows, keep any membership (whether an
// archived member should still read is a separate question).
//
// The scope fields hold null on every membership that does not qualify, so a
// list like [null, "org-a"] reaches. An item filter is SQL IN, which never
// matches null. A validation's `_in` would admit a null organization, but the
// organization is required and NOT NULL on all five collections (read
// 2026-11-17), so the database refuses it.

export const ACTIVE_MEMBERSHIP = "$CURRENT_USER.hoa_members.active_in";
export const POSTING_MEMBERSHIP = "$CURRENT_USER.hoa_members.posts_in";
/** The channels a person may post in: their channel rows' posts_to (a row's own channel, or null). */
export const POSTING_CHANNELS = "$CURRENT_USER.channel_memberships.posts_to";
/** The channel-membership check chat creates had before, when the posting scope is not ready. */
export const ENROLLED_CHANNELS = "$CURRENT_USER.channel_memberships.channel";

/**
 * The create validation on chat messages and mentions, for every policy.
 * `posts_to` is set only on a row that exists, so it still requires the
 * person to be on the channel; it also requires that they post in its
 * community. A message names a channel, not a community, and a validation on
 * `channel.organization` refuses a plain id (above), hence the field on the
 * channel row.
 */
export function chatCreateValidation(scoped: boolean): { channel: { _in: string } } {
  return { channel: { _in: scoped ? POSTING_CHANNELS : ENROLLED_CHANNELS } };
}

const MEMBER_WRITE_SCOPES: Readonly<Record<string, Partial<Record<string, string>>>> = {
  hoa_comments: { create: POSTING_MEMBERSHIP, update: POSTING_MEMBERSHIP },
  hoa_reactions: { create: POSTING_MEMBERSHIP, update: POSTING_MEMBERSHIP },
  hoa_comment_reports: { create: POSTING_MEMBERSHIP, update: POSTING_MEMBERSHIP },
  hoa_poll_votes: { create: ACTIVE_MEMBERSHIP, update: ACTIVE_MEMBERSHIP },
  // The spec names create; editing one's own request is a write an archived
  // member should not have either.
  hoa_requests: { create: ACTIVE_MEMBERSHIP, update: ACTIVE_MEMBERSHIP },
};

/** The scope an HOA Member rule should read through. */
export function memberScopePath(collection: string, action: string): string {
  return MEMBER_WRITE_SCOPES[collection]?.[action] ?? ANY_MEMBERSHIP;
}

/** The HOA Member rule with its writes scoped; reads, deletes and other collections unchanged. */
export function scopeMemberPermission<P extends { collection: string; action: string; permissions: unknown; validation: unknown }>(p: P): P {
  const path = memberScopePath(p.collection, p.action);
  if (path === ANY_MEMBERSHIP) return p;
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
 * HOA Admin rules removed outright: every create and update whose validation
 * followed a relation (measured live 2026-11-15), and the lease and expense
 * rules, which named rows they did not check (2026-11-16), each with what does
 * the write instead:
 *   meeting attachments    none: no page writes these links;
 *                          `/api/directus/items` checks the meeting if one does
 *   meeting attendees      POST /api/org/meetings/[id]/attendees
 *   pets, vehicles         POST and PATCH /api/hoa/units/records
 *   leases                 the same routes. Its validation was on the lease's
 *                          own organization, which held, but the unit, tenant
 *                          and owner it names were not checked at all
 *   expenses               POST and PATCH /api/org/expenses. The same: the
 *                          project and receipt it names went unchecked, and the
 *                          asset proxy opens a receipt to the books' readers
 *   member–unit links      /api/hoa/member-units/assign and /remove
 *   board terms            POST /api/org/board-terms, PATCH board-terms/[id],
 *                          DELETE board-terms/[id] (read stays)
 *   email recipients and   /api/email/send and the delivery webhook
 *   their activity         (/api/email/activity)
 *   mailing-list members   none: nothing in the app writes them
 *   mention edits          none: nothing in the app edits a mention
 *   project, event and     the project and task routes
 *   task links
 * The ones with no route named were written only with the app's token
 * already. Read and delete stay: they check the row as it is.
 *
 * A file field is the same kind of link: Directus links any file id, and a
 * row naming a file makes it its community's (core/server/utils/file-owner.ts).
 * Documents, meetings and amenities keep their create and update, without
 * their file fields (core/shared/roles/admin-file-fields.ts); a new
 * document's file is checked and set by `/api/directus/items`.
 */
const CREATE_AND_UPDATE = (collection: string) =>
  [
    { collection, action: "create" },
    { collection, action: "update" },
  ] as const;

export const REMOVED_ADMIN_RULES: readonly { collection: string; action: string }[] = [
  ...CREATE_AND_UPDATE("hoa_meetings_files"),
  ...CREATE_AND_UPDATE("hoa_meeting_attendees"),
  ...CREATE_AND_UPDATE("hoa_pets"),
  ...CREATE_AND_UPDATE("hoa_vehicles"),
  ...CREATE_AND_UPDATE("hoa_leases"),
  ...CREATE_AND_UPDATE("payment_expenses"),
  // And delete (2026-11-17, docs/spec-money-approvals.md): nothing past draft
  // is deleted, and a draft only by its enterer or an admin, through
  // DELETE /api/org/expenses/[id]. No policy writes payment_expenses.
  { collection: "payment_expenses", action: "delete" },
  ...CREATE_AND_UPDATE("hoa_member_units"),
  ...CREATE_AND_UPDATE("hoa_board_members"),
  // And delete (2026-11-16, Session 7): the Board tab removes a term through
  // DELETE /api/org/board-terms/[id], which refuses one a register row or a
  // meeting's attendance depends on. A delete through Directus checked neither,
  // so history could be erased through the API.
  { collection: "hoa_board_members", action: "delete" },
  ...CREATE_AND_UPDATE("hoa_email_recipients"),
  ...CREATE_AND_UPDATE("hoa_email_activity"),
  ...CREATE_AND_UPDATE("hoa_mailing_list_members"),
  { collection: "hoa_channel_mentions", action: "update" },
  ...CREATE_AND_UPDATE("hoa_projects_users"),
  ...CREATE_AND_UPDATE("hoa_projects_files"),
  ...CREATE_AND_UPDATE("hoa_projects_vendors"),
  ...CREATE_AND_UPDATE("hoa_project_events_files"),
  ...CREATE_AND_UPDATE("hoa_tasks_users"),
  // Committee membership (2026-11-17, docs/spec-delegation.md): joining a team
  // grants the committee's areas, so adding, re-roling and removing a member go
  // through /api/org/teams routes that write a ledger entry. Through Directus
  // none of that was recorded. Teams themselves keep their writes.
  ...CREATE_AND_UPDATE("hoa_team_members"),
  { collection: "hoa_team_members", action: "delete" },
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

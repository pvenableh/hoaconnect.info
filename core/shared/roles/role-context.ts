/**
 * RoleContext — who one person is in one community, resolved once.
 *
 * Spec: docs/spec-role-context.md. Plan: docs/plan-role-first-ux.md §2.1.
 *
 * Every part is per membership (`hoa_members` is one row per person per
 * community), so the same person can be an owner in one community, on the
 * board of a second and a manager in a third.
 *
 * Rules this module keeps:
 *  - Hats add; they never replace each other. A manager who is admin keeps the
 *    manager hat.
 *  - The manager hat never grants access. Access to an area comes only from
 *    admin, or from that area's work switch on a Property Manager membership —
 *    the same condition `requireAdminOrManagerGrant` enforces today.
 *  - Before `scripts/add-manager-hat.ts` has run, the row has no manager fields
 *    and the context degrades to today's behaviour (`source: "legacy"`).
 *
 * Pure: no Directus, no H3, no clock. The caller reads the rows and passes the
 * CURRENT board terms (its read decides "current").
 */
import {
  AREAS,
  MANAGER_GRANT_KEYS,
  normalizeGrants,
  type AreaKey,
} from "../transition/grants";
import { residencyFor, type MemberResidency } from "../members/residency";

type Ref = string | { id?: string | null } | null | undefined;

function idOf(ref: Ref): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  return ref.id ?? null;
}

/** The fields of a `hoa_members` row the resolver reads. Structural on purpose. */
export interface RoleMembership extends MemberResidency {
  id?: string | null;
  organization?: Ref;
  status?: string | null;
  role?: Ref;
  manager_permissions?: Record<string, unknown> | null;
  /** `undefined` (or null) means the field is not on the row yet: legacy. */
  is_manager?: boolean | null;
  manager_title?: string | null;
  /** `{ [area]: { work, notify } }`. `work` is a mirror; see the spec. */
  manager_areas?: Record<string, unknown> | null;
}

/** A current-term `hoa_board_members` row. Only the office is read. */
export interface RoleBoardTerm {
  title?: string | null;
}

/** The community's agency billing account, or null when it bills itself. */
export interface RoleBillingAccount {
  owner?: Ref;
  members?: Array<{ user?: Ref; role?: string | null }> | null;
}

export interface RoleIds {
  /** Platform App Admin: admin of every community, never an account owner. */
  appAdmin?: string | null;
  propertyManager?: string | null;
  /** Membership roles that make an admin. The server passes [HOA Admin]. */
  adminRoleIds: readonly (string | null | undefined)[];
}

export interface ResolveRoleOptions {
  /** The session user. Needed to match the billing account owner. */
  userId: string | null;
  /** The session user's own Directus role id. */
  globalRoleId?: string | null;
  roles: RoleIds;
  /** Falls back to the membership's organization. */
  orgId?: string | null;
}

export interface AreaAccess {
  canWork: boolean;
  isNotified: boolean;
}

export interface RoleContext {
  orgId: string | null;
  membershipId: string | null;
  residency: "owner" | "tenant" | "none";
  hats: { board: boolean; manager: boolean; admin: boolean };
  areas: Record<AreaKey, AreaAccess>;
  isAccountOwner: boolean;
  managerTitle: string | null;
  /** "hat" once the manager fields exist on the row; "legacy" before. */
  source: "hat" | "legacy";
}

const GRANTABLE = new Set<string>(MANAGER_GRANT_KEYS);

function areaMap(fn: (key: AreaKey) => AreaAccess): Record<AreaKey, AreaAccess> {
  return Object.fromEntries(AREAS.map((a) => [a.key, fn(a.key)])) as Record<AreaKey, AreaAccess>;
}

function notifyOn(stored: Record<string, unknown> | null | undefined, key: AreaKey): boolean {
  const row = stored?.[key];
  return !!row && typeof row === "object" && (row as { notify?: unknown }).notify === true;
}

/** A context with nothing in it: no membership, or one that is over. */
export function emptyRoleContext(orgId: string | null = null): RoleContext {
  return {
    orgId,
    membershipId: null,
    residency: "none",
    hats: { board: false, manager: false, admin: false },
    areas: areaMap(() => ({ canWork: false, isNotified: false })),
    isAccountOwner: false,
    managerTitle: null,
    source: "legacy",
  };
}

/**
 * Resolve one membership. `boardTerms` are the caller's CURRENT terms for this
 * membership; `billingAccount` is the community's agency account or null.
 *
 * Status: `active` gets everything; `pending` gets the admin hat only (as
 * `checkAdminAccess` admits pending admins today); `inactive` and `archived`
 * get nothing. The platform App Admin is admin everywhere, membership or not.
 */
export function resolveRoleContext(
  membership: RoleMembership | null | undefined,
  boardTerms: readonly RoleBoardTerm[] | null | undefined,
  billingAccount: RoleBillingAccount | null | undefined,
  options: ResolveRoleOptions
): RoleContext {
  const { roles, userId } = options;
  const orgId = options.orgId ?? idOf(membership?.organization) ?? null;
  const ctx = emptyRoleContext(orgId);

  const isAppAdmin = !!roles.appAdmin && options.globalRoleId === roles.appAdmin;
  const status = membership?.status ?? null;
  const active = !!membership && status === "active";
  const roleId = idOf(membership?.role);
  const adminIds = roles.adminRoleIds.filter((r): r is string => !!r);
  const adminByRole =
    !!membership && !!roleId && adminIds.includes(roleId) && (status === "active" || status === "pending");
  const isPmRole = !!roles.propertyManager && roleId === roles.propertyManager;

  const source: RoleContext["source"] = typeof membership?.is_manager === "boolean" ? "hat" : "legacy";

  ctx.membershipId = membership?.id ?? null;
  ctx.source = source;
  ctx.hats.admin = isAppAdmin || adminByRole;
  if (!active) {
    // Pending, inactive, archived, or no row: only the admin hat (and its
    // reach into every area) can survive.
    ctx.areas = areaMap(() => ({ canWork: ctx.hats.admin, isNotified: false }));
    return ctx;
  }

  ctx.residency = residencyFor(membership) ?? "none";
  ctx.hats.board = (boardTerms?.length ?? 0) > 0;
  ctx.hats.manager = source === "hat" ? membership.is_manager === true : isPmRole;
  ctx.managerTitle = ctx.hats.manager ? membership.manager_title?.trim() || null : null;

  const grants = normalizeGrants(membership.manager_permissions);
  ctx.areas = areaMap((key) => ({
    canWork:
      ctx.hats.admin || (isPmRole && GRANTABLE.has(key) && grants[key as keyof typeof grants] === true),
    isNotified: source === "hat" && ctx.hats.manager && notifyOn(membership.manager_areas, key),
  }));

  if (billingAccount) {
    ctx.isAccountOwner =
      !!userId &&
      (idOf(billingAccount.owner) === userId ||
        (billingAccount.members ?? []).some((m) => m.role === "owner" && idOf(m.user) === userId));
  } else {
    // Self-billed: the community's admins are its payers. Platform staff never are.
    ctx.isAccountOwner = adminByRole;
  }

  return ctx;
}

/** A `hoa_members` row as `pickNotified` needs it: the resolver's fields plus the login. */
export interface NotifiableMembership extends RoleMembership {
  user?: Ref;
}

export interface NotifiedPick {
  members: NotifiableMembership[];
  /** "area": members with the hat and notify on. "admins": nobody had it, so the admins. */
  via: "area" | "admins";
}

/**
 * Who is addressed for `area` in one community (plan §2.1): the members with
 * the manager hat and notify on for that area, else the community's admins.
 * Each row runs through `resolveRoleContext`, so "notified" and "admin" mean
 * exactly what they mean everywhere else — an archived row, a legacy row, or
 * the hat switched off never counts. Rows without a login are dropped.
 */
export function pickNotified(
  rows: readonly NotifiableMembership[],
  area: AreaKey,
  roles: RoleIds
): NotifiedPick {
  const withLogin = rows.filter((r) => !!idOf(r.user));
  const resolved = withLogin.map((row) => ({
    row,
    ctx: resolveRoleContext(row, [], null, { userId: idOf(row.user), roles }),
  }));
  const notified = resolved.filter(({ ctx }) => ctx.areas[area]?.isNotified).map(({ row }) => row);
  if (notified.length) return { members: notified, via: "area" };
  // Admins by membership role only — the platform App Admin is staff, not the community's admin.
  const admins = resolved
    .filter(({ row, ctx }) => ctx.hats.admin && row.status === "active")
    .map(({ row }) => row);
  return { members: admins, via: "admins" };
}

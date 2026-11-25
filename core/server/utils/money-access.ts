/**
 * Who may read a community's books: admins, and every board seat through
 * `money:read` (plan decision 16, docs/spec-capability-nav.md). Every
 * org-wide money read goes through a server route that calls this, so the
 * Directus Member policy can narrow to a member's own charges.
 *
 * Entering money (`money:enter`: enter, edit, submit, record paid, ask for a
 * void) is every board seat's, an admin's, and a property manager's with the
 * projects grant. Approving is neither: the rule decides it per approval, from
 * board seats only (core/shared/money/approval-rule.ts).
 */
import type { H3Event } from "h3";
import { boardTitleToActor, capabilitiesFor, type Actor } from "#core/shared/permissions";
import type { Seat } from "#core/shared/money/approval-rule";

export async function canReadMoney(event: H3Event, orgId: string): Promise<boolean> {
  // Money:read belongs to the admin hat and the board seats, nothing else, so
  // the check asks only those two questions and asks them together: the admin
  // read, and one read of the caller's current-term board seat joined through
  // their active membership. (resolveCapabilities also reads the manager
  // grants, the team-lead row and the membership first, then the seat: four
  // reads and two round trips for an answer these two give in one.)
  const [admin, seat] = await Promise.all([checkAdminAccess(event, orgId), getBoardSeatActor(event, orgId)]);
  if (admin.isAdmin) return true;
  return !!seat && capabilitiesFor([seat]).includes("money:read");
}

/** What the caller may do with a community's money, from rows already read. */
export interface MoneyAccess {
  userId: string;
  isAdmin: boolean;
  /** money:read: admin, or a current board seat. */
  canRead: boolean;
  /** money:enter: admin, a current board seat, or a property manager with the projects grant. */
  canEnter: boolean;
}

/** The hats the caller wears in a community, from rows already read. */
export interface OrgHats {
  userId: string;
  /** checkAdminAccess: App Administrator, or HOA Admin on an active or pending membership. */
  isAdmin: boolean;
  /** checkMembership: an active membership. */
  isMember: boolean;
  /** getBoardPosition: a current published term with an office, on an active membership. */
  offices: Actor[];
  isBoard: boolean;
  /** getManagerGrants: an active Property Manager membership, with its grants. */
  managerGrants: Record<string, unknown> | null;
}

/**
 * The caller's hats from the community's memberships (orgMembersSpec: `role`,
 * `manager_permissions`, board terms, any status) and its current seats
 * (seatsOfMembers): the same questions checkAdminAccess, checkMembership,
 * getBoardPosition and getManagerGrants ask, with no reads of their own.
 */
export async function orgHatsFrom(event: H3Event, members: readonly any[], seats: readonly Seat[]): Promise<OrgHats> {
  const session = await requireUserSession(event);
  const userId = String((session.user as { id?: unknown } | undefined)?.id ?? "");
  const own = members.filter((m) => String(m?.user?.id ?? m?.user ?? "") === userId);
  const ownSeats = seats.filter((s) => s.userId === userId && !!s.office);
  const manager = own.find((m) => m.status === "active" && isPropertyManagerRole(m.role));
  const mp = manager?.manager_permissions;
  return {
    userId,
    isAdmin: isAppAdminSession(session) || own.some((m) => ["active", "pending"].includes(m.status) && isHoaAdminRole(m.role)),
    isMember: own.some((m) => m.status === "active"),
    offices: ownSeats.map((s) => boardTitleToActor(s.office)).filter((a): a is Actor => !!a),
    isBoard: ownSeats.length > 0,
    managerGrants: manager ? (mp && typeof mp === "object" ? (mp as Record<string, unknown>) : {}) : null,
  };
}

/**
 * canReadMoney's and canEnterMoney's answers from rows a route already read
 * (orgHatsFrom): money:read is the admin hat or a current seat (every office
 * has it); money:enter adds a property manager's projects grant.
 */
export async function moneyAccessFrom(event: H3Event, members: readonly any[], seats: readonly Seat[]): Promise<MoneyAccess> {
  const hats = await orgHatsFrom(event, members, seats);
  const caps = capabilitiesFor(hats.offices);
  return {
    userId: hats.userId,
    isAdmin: hats.isAdmin,
    canRead: hats.isAdmin || caps.includes("money:read"),
    canEnter: hats.isAdmin || caps.includes("money:enter") || hats.managerGrants?.projects === true,
  };
}

/** moneyAccessFrom, 403 unless the caller may read the books. 401 without a session. */
export async function requireMoneyReadFrom(event: H3Event, members: readonly any[], seats: readonly Seat[]): Promise<MoneyAccess> {
  const access = await moneyAccessFrom(event, members, seats);
  if (!access.canRead) throw createError({ statusCode: 403, message: "Board or admin access required" });
  return access;
}

/** 401 without a session, 400 without `orgId`, 403 unless admin or money:read. Returns the orgId. */
export async function requireMoneyRead(event: H3Event, orgIdArg?: string): Promise<string> {
  await requireUserSession(event);
  const orgId = String(orgIdArg ?? getQuery(event).orgId ?? "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!(await canReadMoney(event, orgId))) {
    throw createError({ statusCode: 403, message: "Board or admin access required" });
  }
  return orgId;
}

/** Admin, or `money:enter` (every board seat; a manager with the projects grant). */
export async function canEnterMoney(event: H3Event, orgId: string): Promise<boolean> {
  const admin = await checkAdminAccess(event, orgId);
  if (admin.isAdmin) return true;
  try {
    const { capabilities } = await resolveCapabilities(event, orgId);
    return capabilities.includes("money:enter");
  } catch {
    return false;
  }
}

/**
 * 401 without a session, 400 without `orgId`, 403 unless admin or
 * money:enter. Returns who is asking, for the routes' exclusions and records.
 */
export async function requireMoneyEnter(event: H3Event, orgId: string): Promise<{ userId: string; isAdmin: boolean }> {
  const session = await requireUserSession(event);
  const userId = String((session.user as { id?: unknown } | undefined)?.id ?? "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!(await canEnterMoney(event, orgId))) {
    throw createError({ statusCode: 403, message: "Only the board, an admin or a manager with Projects can enter money." });
  }
  const admin = await checkAdminAccess(event, orgId);
  return { userId, isAdmin: !!admin.isAdmin };
}

/** A `limit` query value, clamped to 1..max. */
export function moneyLimit(event: H3Event, fallback: number, max = 1000): number {
  const n = Number(getQuery(event).limit);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
}

/**
 * Directus sends a decimal column as text ("175.00"), so a page that adds
 * amounts joined strings and showed $NaN. The money reads hand the page
 * numbers: each named field that came back as text becomes a number (null when
 * it isn't one).
 */
export function numericMoney<T extends object>(rows: readonly T[] | null | undefined, fields: readonly string[]): T[] {
  return (rows ?? []).map((row) => {
    const out = { ...row } as Record<string, unknown>;
    for (const f of fields) {
      const v = out[f];
      if (typeof v !== "string") continue;
      const n = Number(v);
      out[f] = v.trim() !== "" && Number.isFinite(n) ? n : null;
    }
    return out as T;
  });
}

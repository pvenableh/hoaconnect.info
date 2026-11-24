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
import { capabilitiesFor } from "#core/shared/permissions";

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

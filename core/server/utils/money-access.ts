/**
 * Who may read a community's books: admins, and every board seat through
 * `money:read` (plan decision 16, docs/spec-capability-nav.md). Every
 * org-wide money read goes through a server route that calls this, so the
 * Directus Member policy can narrow to a member's own charges.
 *
 * Read only. Money writes stay admin-only, and money going out will need
 * approval (decision 16).
 */
import type { H3Event } from "h3";

export async function canReadMoney(event: H3Event, orgId: string): Promise<boolean> {
  const admin = await checkAdminAccess(event, orgId);
  if (admin.isAdmin) return true;
  try {
    const { capabilities } = await resolveCapabilities(event, orgId);
    return capabilities.includes("money:read");
  } catch {
    return false;
  }
}

/** 401 without a session, 400 without `orgId`, 403 unless admin or money:read. Returns the orgId. */
export async function requireMoneyRead(event: H3Event): Promise<string> {
  await requireUserSession(event);
  const orgId = String(getQuery(event).orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!(await canReadMoney(event, orgId))) {
    throw createError({ statusCode: 403, message: "Board or admin access required" });
  }
  return orgId;
}

/** A `limit` query value, clamped to 1..max. */
export function moneyLimit(event: H3Event, fallback: number, max = 1000): number {
  const n = Number(getQuery(event).limit);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
}

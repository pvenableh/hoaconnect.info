/**
 * Responsibilities register access (server-side enforcement) — the gate file
 * for the `responsibilities` area in AREAS (docs/spec-responsibilities.md).
 *
 *   read     = org admin ∪ manager with the `responsibilities` grant
 *              ∪ every board seat (`responsibilities:read`, current term)
 *   edit     = org admin ∪ manager with the `responsibilities` grant
 *   admin    = the two visibility switches, and board-term actions. The
 *              grant is not enough for the switches: the delegate may be the
 *              party who is not answering.
 *   published = any live member (owners, tenants, anyone with a seat)
 *
 * The manager hat never grants: the grant is read by getManagerGrants, which
 * requires the Property Manager role. No Directus policy reads or writes the
 * register's collections, so these checks are the only way in.
 */
import type { H3Event } from "h3";
import { boardTitleToActor, hasCapability } from "#core/shared/permissions";

export interface ResponsibilityAccess {
  orgId: string;
  userId: string;
  /** The caller's membership here, for the activity row; null for the platform admin. */
  memberId: string | null;
  isAdmin: boolean;
  canEdit: boolean;
  canRead: boolean;
}

/** Everything the register's routes need to decide, in one place. Requires a session (401). */
export async function getResponsibilityAccess(event: H3Event, orgId: string): Promise<ResponsibilityAccess> {
  const session = await requireUserSession(event);
  const userId = String(session.user?.id ?? "");
  if (!userId) throw createError({ statusCode: 401, message: "Authentication required" });

  const admin = await checkAdminAccess(event, orgId);
  const isAdmin = admin.isAdmin === true;

  let canEdit = isAdmin;
  if (!canEdit) {
    const grants = await getManagerGrants(event, orgId);
    canEdit = grants?.responsibilities === true;
  }

  let canRead = canEdit;
  if (!canRead) {
    const office = await getBoardPosition(event, orgId);
    const actor = boardTitleToActor(office);
    canRead = !!actor && hasCapability([actor], "responsibilities:read");
  }

  const membership = await checkMembership(event, orgId);
  return { orgId, userId, memberId: membership.memberId ?? null, isAdmin, canEdit, canRead };
}

/** The `orgId` from the query (GET, DELETE) or the body, or 400. */
export function requireOrgParam(value: unknown): string {
  const orgId = typeof value === "string" ? value.trim() : "";
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  return orgId;
}

/** 403 unless admin, the `responsibilities` grant, or a board seat. */
export async function requireResponsibilitiesRead(event: H3Event, orgId: string): Promise<ResponsibilityAccess> {
  const access = await getResponsibilityAccess(event, orgId);
  if (!access.canRead) throw createError({ statusCode: 403, message: "Board or admin access required" });
  return access;
}

/** 403 unless admin or the `responsibilities` grant. */
export async function requireResponsibilitiesEdit(event: H3Event, orgId: string): Promise<ResponsibilityAccess> {
  const access = await getResponsibilityAccess(event, orgId);
  if (!access.canEdit) throw createError({ statusCode: 403, message: "Not authorized to edit the register (responsibilities)" });
  return access;
}

/** 403 unless an admin of this community. */
export async function requireResponsibilitiesAdmin(event: H3Event, orgId: string): Promise<ResponsibilityAccess> {
  const access = await getResponsibilityAccess(event, orgId);
  if (!access.isAdmin) throw createError({ statusCode: 403, message: "Only an admin can change this" });
  return access;
}

/** 403 unless a live member of this community (or an admin). Owners read the published register. */
export async function requirePublishedRead(event: H3Event, orgId: string): Promise<{ userId: string; isAdmin: boolean }> {
  const session = await requireUserSession(event);
  const userId = String(session.user?.id ?? "");
  if (!userId) throw createError({ statusCode: 401, message: "Authentication required" });
  const membership = await checkMembership(event, orgId);
  if (membership.isMember) return { userId, isAdmin: false };
  const admin = await checkAdminAccess(event, orgId);
  if (admin.isAdmin) return { userId, isAdmin: true };
  throw createError({ statusCode: 403, message: "You must be a member of this community" });
}

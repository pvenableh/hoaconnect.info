// Who may read and who may manage governing documents (docs/plan-governing-docs.md §7).
//
// Read: anyone with a seat in the organization. Manage (see drafts and
// unconfirmed suggestions; later upload, review, publish, edit text, confirm
// flags): HOA Admins and App Admins, current-term board members, and property
// managers who hold the `documents` grant.
//
// No Directus role has any permission on the governing collections. These
// routes read with the admin token, so this check is the enforcement.

import type { H3Event } from "h3";
import { hasCapability } from "#core/shared/permissions";
import { resolveActors } from "./board-access";
import { getManagerGrants } from "./manager-access";

export type GoverningAccess = { canManage: boolean };

/** The caller's access to an organization's governing documents. 401 without a session, 403 without a seat. */
export async function requireGoverningAccess(event: H3Event, organizationId: string): Promise<GoverningAccess> {
  const session = await getUserSession(event);
  if (!session?.user?.id) throw createError({ statusCode: 401, message: "Sign in to continue" });

  const actors = await resolveActors(event, organizationId);
  if (!hasCapability(actors, "governing:read")) {
    throw createError({ statusCode: 403, message: "You must be a member of this organization" });
  }
  if (hasCapability(actors, "governing:manage")) return { canManage: true };

  const grants = actors.includes("property_manager") ? await getManagerGrants(event, organizationId) : null;
  return { canManage: grants?.documents === true };
}

/** For routes only managers may call. */
export async function requireGoverningManage(event: H3Event, organizationId: string): Promise<GoverningAccess> {
  const access = await requireGoverningAccess(event, organizationId);
  if (!access.canManage) throw createError({ statusCode: 403, message: "Not authorized to manage governing documents" });
  return access;
}

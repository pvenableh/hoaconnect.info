import type { H3Event } from "h3";

/**
 * Who may review member change requests: HOA/App admins, a Property Manager
 * who's been granted the `directory` permission (they manage member records),
 * or a helper or committee holding the `directory` area (docs/spec-delegation.md).
 * Mirrors the reviewer set chosen for the self-service workflow.
 */
export async function isChangeReviewer(event: H3Event, organizationId: string): Promise<boolean> {
  const admin = await checkAdminAccess(event, organizationId);
  if (admin.isAdmin) return true;
  const grants = await getManagerGrants(event, organizationId);
  if (grants && grants.directory === true) return true;
  return (await getHelperAreas(event, organizationId)).includes("directory");
}

export async function requireChangeReviewer(event: H3Event, organizationId: string): Promise<void> {
  if (!(await isChangeReviewer(event, organizationId))) {
    throw createError({ statusCode: 403, message: "Admin or property-manager access required" });
  }
}

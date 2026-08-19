/**
 * Property Manager grant checks (server-side enforcement).
 *
 * Directus policies are role-wide, so the Property Manager policy is only an
 * org-scoped CEILING. The per-manager grant flags (hoa_members.manager_permissions)
 * are what actually decide what a given manager may do. For sensitive writes
 * (sending communications, creating violations) we enforce those flags here —
 * the same "elevated server route" pattern used for board access.
 */
import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";

// The canonical list lives in the shared transition module, because revocation
// walks it too: a key this file knew about and the revoker didn't would stay
// true after a manager left. Re-exported here so existing callers are unchanged.
export type { ManagerGrantKey } from "#core/shared/transition/grants";

/**
 * Return the calling user's Property Manager grant flags for an org, or null if
 * they are not an active Property Manager of that org.
 */
export async function getManagerGrants(
  event: H3Event,
  organizationId: string
): Promise<Record<string, boolean> | null> {
  const session = await getUserSession(event);
  if (!session?.user?.id) return null;

  const config = useRuntimeConfig();
  const pmRole = config.public.directusRolePropertyManager;
  if (!pmRole) return null;

  try {
    const directus = getTypedDirectus();
    const members = await directus.request(
      readItems("hoa_members", {
        filter: {
          user: { _eq: session.user.id },
          organization: { _eq: organizationId },
          role: { _eq: pmRole },
          status: { _eq: "active" },
        },
        fields: ["manager_permissions"],
        limit: 1,
      })
    );
    if (!members?.length) return null;
    const mp = (members[0] as any).manager_permissions;
    return mp && typeof mp === "object" ? mp : {};
  } catch (e) {
    console.error("[manager-access] grant lookup failed:", e);
    return null;
  }
}

/**
 * Authorize an action that an org admin OR a property manager (with a specific
 * granted capability) may perform. Throws 403 otherwise.
 */
export async function requireAdminOrManagerGrant(
  event: H3Event,
  organizationId: string,
  key: ManagerGrantKey
): Promise<{ via: "admin" | "manager" }> {
  const admin = await checkAdminAccess(event, organizationId);
  if (admin.isAdmin) return { via: "admin" };

  const grants = await getManagerGrants(event, organizationId);
  if (grants && grants[key] === true) return { via: "manager" };

  throw createError({
    statusCode: 403,
    message: `Not authorized for this action (${key})`,
  });
}

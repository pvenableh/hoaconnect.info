// server/utils/admin-auth.ts
/**
 * Server-side admin authorization utilities
 *
 * Provides functions to verify admin access for HOA organizations
 */

import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";

interface AdminCheckResult {
  isAdmin: boolean;
  isAppAdmin: boolean;
  isHoaAdmin: boolean;
  memberId?: string;
  userId?: string;
}

/**
 * Check if the current user is an admin of the specified organization
 */
export async function checkAdminAccess(
  event: H3Event,
  organizationId: string
): Promise<AdminCheckResult> {
  const config = useRuntimeConfig();
  const session = await getUserSession(event);

  if (!session?.user?.id) {
    return { isAdmin: false, isAppAdmin: false, isHoaAdmin: false };
  }

  const userId = session.user.id;
  const userRoleId = session.user.role?.id || session.user.role;

  // Check if user is App Administrator (system-wide admin)
  const isAppAdmin = userRoleId === config.public.directusRoleAppAdmin;

  if (isAppAdmin) {
    return {
      isAdmin: true,
      isAppAdmin: true,
      isHoaAdmin: false,
      userId,
    };
  }

  // Check if user is HOA Admin of the specific organization
  try {
    const directus = getTypedDirectus();

    const members = await directus.request(
      readItems("hoa_members", {
        filter: {
          user: { _eq: userId },
          organization: { _eq: organizationId },
          status: { _in: ["active", "pending"] },
        },
        fields: ["id", "role"],
        limit: 1,
      })
    );

    if (members && members.length > 0) {
      const member = members[0];
      const memberRoleId = typeof member.role === "string" ? member.role : member.role?.id;
      const isHoaAdmin = memberRoleId === config.public.directusRoleHoaAdmin;

      return {
        isAdmin: isHoaAdmin,
        isAppAdmin: false,
        isHoaAdmin,
        memberId: member.id,
        userId,
      };
    }
  } catch (error) {
    console.error("Error checking admin access:", error);
  }

  return { isAdmin: false, isAppAdmin: false, isHoaAdmin: false, userId };
}

/**
 * Require admin access for the specified organization
 * Throws an error if user is not an admin
 */
export async function requireAdminAccess(
  event: H3Event,
  organizationId: string
): Promise<AdminCheckResult> {
  const result = await checkAdminAccess(event, organizationId);

  if (!result.isAdmin) {
    throw createError({
      statusCode: 403,
      message: "Admin access required for this operation",
    });
  }

  return result;
}

/**
 * Require user session and return user info
 */
export async function requireAuthenticatedUser(event: H3Event) {
  const session = await requireUserSession(event);

  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      message: "Authentication required",
    });
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    role: session.user.role,
  };
}

/**
 * Check if user is a member of the specified organization
 */
export async function checkMembership(
  event: H3Event,
  organizationId: string
): Promise<{ isMember: boolean; memberId?: string; memberRole?: string }> {
  const session = await getUserSession(event);

  if (!session?.user?.id) {
    return { isMember: false };
  }

  try {
    const directus = getTypedDirectus();

    const members = await directus.request(
      readItems("hoa_members", {
        filter: {
          user: { _eq: session.user.id },
          organization: { _eq: organizationId },
          status: { _in: ["active"] },
        },
        fields: ["id", "role"],
        limit: 1,
      })
    );

    if (members && members.length > 0) {
      const member = members[0];
      const memberRole = typeof member.role === "string" ? member.role : member.role?.id;

      return {
        isMember: true,
        memberId: member.id,
        memberRole,
      };
    }
  } catch (error) {
    console.error("Error checking membership:", error);
  }

  return { isMember: false };
}

/**
 * Require membership in the specified organization
 * Throws an error if user is not a member
 */
export async function requireMembership(
  event: H3Event,
  organizationId: string
) {
  const result = await checkMembership(event, organizationId);

  if (!result.isMember) {
    throw createError({
      statusCode: 403,
      message: "You must be a member of this organization",
    });
  }

  return result;
}

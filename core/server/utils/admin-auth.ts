// server/utils/admin-auth.ts
/**
 * Server-side admin authorization utilities
 *
 * Provides functions to verify admin access for HOA organizations
 */

import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";
import { accessRoles, accessSnapshot, adminFrom, membershipFrom } from "./access-snapshot";
import {
  OPS_PERMISSIONS,
  opsCan,
  platformRoleFor,
  roleIdOf,
  type OpsPermission,
  type PlatformRole,
} from "#core/shared/ops/permissions";

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
  return perRequest(event, "admin", organizationId, () => readAdminAccess(event, organizationId));
}

/**
 * One read per request, user and org: canReadMoney, resolveActors and
 * getHelperAreas all ask the same two questions of `hoa_members`. A request
 * that changes membership and then re-checks should not reach for this.
 */
async function perRequest<T>(event: H3Event, kind: string, organizationId: string, run: () => Promise<T>): Promise<T> {
  const session = await getUserSession(event);
  const userId = session?.user?.id;
  if (!userId) return run();
  const context = ((event as any).context ??= {}) as Record<string, any>;
  const cache = (context.__accessReads ??= new Map<string, Promise<unknown>>()) as Map<string, Promise<unknown>>;
  const key = `${kind}:${userId}:${organizationId}`;
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const read = run();
  cache.set(key, read);
  return read;
}

/** The session's Directus role is App Administrator: no read needed. */
export function isAppAdminSession(session: { user?: any } | null | undefined): boolean {
  const role = session?.user?.role;
  return !!role && (role?.id || role) === useRuntimeConfig().public.directusRoleAppAdmin;
}

/** A membership's `role` (id or expanded) is HOA Admin. */
export function isHoaAdminRole(role: unknown): boolean {
  const id = typeof role === "string" ? role : (role as { id?: string } | null | undefined)?.id;
  return !!id && id === useRuntimeConfig().public.directusRoleHoaAdmin;
}

async function readAdminAccess(
  event: H3Event,
  organizationId: string
): Promise<AdminCheckResult> {
  const session = await getUserSession(event);

  if (!session?.user?.id) {
    return { isAdmin: false, isAppAdmin: false, isHoaAdmin: false };
  }

  const userId = session.user.id;

  // Check if user is App Administrator (system-wide admin)
  const isAppAdmin = isAppAdminSession(session);

  if (isAppAdmin) {
    return {
      isAdmin: true,
      isAppAdmin: true,
      isHoaAdmin: false,
      userId,
    };
  }

  // One read of the caller's standing serves this and the other access helpers.
  const snapshot = await accessSnapshot(event, organizationId, "base");
  if (snapshot) return adminFrom(snapshot, accessRoles());

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

    const member = members?.[0];
    if (member) {
      const isHoaAdmin = isHoaAdminRole(member.role);

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

// ── Platform roles: the operator console (docs/plan-operator-console.md §6) ──
//
// These are deliberately NOT built on `checkAdminAccess`. That function answers
// "may this person administer THIS community", and an HOA Admin passes it. The
// console spans every community, so the only thing that opens it is the user's
// own Directus role id: App Admin, or Platform Support. Nothing else — not an
// HOA Admin seat, a Property Manager grant, a board office or a billing-account
// role — is consulted, and no Directus or Stripe call is made before the answer.

export interface PlatformActor {
  userId: string;
  role: PlatformRole;
  permissions: readonly OpsPermission[];
}

/** The caller's platform role from the session alone, or null. */
export async function getPlatformActor(event: H3Event): Promise<PlatformActor | null> {
  const session = await getUserSession(event);
  const user = session?.user;
  const userId = user?.id;
  if (!user || !userId) return null;
  const config = useRuntimeConfig();
  const role = platformRoleFor(roleIdOf(user.role), {
    appAdmin: config.public.directusRoleAppAdmin as string | undefined,
    platformSupport: config.public.directusRolePlatformSupport as string | undefined,
  });
  return role ? { userId, role, permissions: OPS_PERMISSIONS[role] } : null;
}

async function requirePlatformActor(event: H3Event): Promise<PlatformActor> {
  const session = await getUserSession(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: "Authentication required" });
  }
  const actor = await getPlatformActor(event);
  if (!actor) {
    throw createError({ statusCode: 403, message: "HOA Connect staff only" });
  }
  return actor;
}

/** 403 unless the caller is the App Admin. For what Platform Support may never do. */
export async function requireAppAdmin(event: H3Event): Promise<PlatformActor> {
  const actor = await requirePlatformActor(event);
  if (actor.role !== "app_admin") {
    throw createError({ statusCode: 403, message: "App Admin only" });
  }
  return actor;
}

/**
 * 403 unless the caller's platform role carries `permission`. App Admin holds
 * all three; Platform Support holds `billing.read` and `support`, never
 * `billing.write`. Every `/api/ops` route calls this first.
 */
export async function requireOpsPermission(
  event: H3Event,
  permission: OpsPermission
): Promise<PlatformActor> {
  const actor = await requirePlatformActor(event);
  if (!opsCan(actor.role, permission)) {
    throw createError({ statusCode: 403, message: "Your HOA Connect role can't do this" });
  }
  return actor;
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
  return perRequest(event, "membership", organizationId, () => readMembership(event, organizationId));
}

async function readMembership(
  event: H3Event,
  organizationId: string
): Promise<{ isMember: boolean; memberId?: string; memberRole?: string }> {
  const session = await getUserSession(event);

  if (!session?.user?.id) {
    return { isMember: false };
  }

  const snapshot = await accessSnapshot(event, organizationId, "base");
  if (snapshot) return membershipFrom(snapshot);

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

    const member = members?.[0];
    if (member) {
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

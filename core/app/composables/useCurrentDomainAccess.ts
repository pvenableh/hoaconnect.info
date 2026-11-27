// composables/useCurrentDomainAccess.ts
/**
 * Composable to check user's access rights for the CURRENT organization being viewed.
 *
 * This is different from useSelectedOrg which checks the user's role in their SELECTED organization.
 * This composable specifically checks if the logged-in user has membership in the organization
 * whose slug they are currently viewing.
 *
 * Use cases:
 * - User navigates to /org-b/dashboard but only has membership in Org A
 *
 * In this case, this composable will correctly identify that the user is NOT an admin
 * of the currently viewed organization, preventing unauthorized access.
 *
 * The role answers come from the RoleContext (docs/spec-role-context.md): the
 * server's (useRoleContext) once it is loaded for the org on screen, and until
 * then the shared resolver over the cached membership, under the server's own
 * rules — so route middleware never has to wait, and never disagrees with the
 * server once it knows. The admin, admin-or-board, manager and nav-gate
 * middleware load the server context before they decide.
 */
import { normalizeGrants, type AreaKey, type ManagerGrantKey } from "#core/shared/transition/grants";
import { isCurrentBoardTerm, todayUtc } from "#core/shared/roles/role-context";
import { roleContextFromMembership, useRoleContext } from "./useRoleContext";
import { residencyFor } from "#core/shared/members/residency";

export const useCurrentDomainAccess = () => {
  const { activeHoa } = useActiveHoa();
  const { loggedIn, user } = useUserSession();
  const config = useRuntimeConfig();
  const route = useRoute();

  // Read memberships from the "user-members" useAsyncData cache that
  // useSelectedOrg populates. NOTE: this must be useNuxtData, NOT
  // useState("user-members") — useAsyncData and useState keep SEPARATE stores
  // even under the same key, so useState here would always be empty and every
  // current-domain check (admin / member / board / PM) would silently fail for
  // non-App-Admin users. useNuxtData returns a reactive ref to the same cache.
  const { data: membershipsState } = useNuxtData<any[]>("user-members");

  // Check if we're on an org context (slug route)
  const isOrgContext = computed(() => {
    return !!route.params.slug;
  });

  // Get the organization ID for the current domain context
  const currentDomainOrgId = computed(() => {
    if (!activeHoa.value) return null;
    return activeHoa.value.id;
  });

  // Find the user's membership in the current domain's organization
  const currentDomainMembership = computed(() => {
    if (!loggedIn.value || !currentDomainOrgId.value) return null;

    const memberships = membershipsState.value;
    if (!memberships || !Array.isArray(memberships)) return null;

    return (
      memberships.find(
        (m: any) => m?.organization?.id === currentDomainOrgId.value
      ) || null
    );
  });

  // Get the role ID from the membership (handles both string and object references)
  const currentDomainRoleId = computed(() => {
    const roleId = currentDomainMembership.value?.role;
    if (!roleId) return null;
    return typeof roleId === "string" ? roleId : roleId?.id;
  });

  /**
   * Get the user's global role ID (handles both string and object role references)
   */
  const userGlobalRoleId = computed(() => {
    const role = user.value?.role;
    if (!role) return null;
    // Handle role as object or string (Directus can return either)
    if (typeof role === "object" && role !== null) {
      return (role as any).id;
    }
    return role;
  });

  // Board terms current for the current domain, by the server's rule (both
  // ends inclusive, UTC dates).
  const currentDomainBoardTerms = computed(() => {
    const terms = currentDomainMembership.value?.board_member_terms;
    if (!terms || !Array.isArray(terms)) return [];
    const today = todayUtc();
    return terms.filter((term: any) => isCurrentBoardTerm(term, today));
  });

  // The server's context, when it is loaded for the org on screen.
  const role = useRoleContext();
  const serverContext = computed(() => {
    const ctx = role.context.value;
    return ctx && ctx.orgId && ctx.orgId === currentDomainOrgId.value ? ctx : null;
  });

  // The cached membership under the server's rules, for before it arrives.
  const cachedContext = computed(() =>
    roleContextFromMembership(
      currentDomainMembership.value,
      currentDomainBoardTerms.value,
      userGlobalRoleId.value,
      {
        appAdmin: config.public.directusRoleAppAdmin as string | undefined,   // App Administrator - full system access
        hoaAdmin: config.public.directusRoleHoaAdmin as string | undefined,   // HOA Admin - organization-level admin access
        propertyManager: config.public.directusRolePropertyManager as string | undefined,
      }
    )
  );

  // Without a login there is nothing to resolve, whatever is cached.
  const roleContext = computed(() =>
    loggedIn.value ? (serverContext.value ?? cachedContext.value) : cachedContext.value
  );

  /**
   * Check if user is an admin of the CURRENT domain's organization
   * Both App Administrator and HOA Admin roles grant full admin access
   * to view and manage all admin content and features (including during maintenance mode)
   */
  const isAdminOfCurrentDomain = computed(() => {
    if (!loggedIn.value) return false;
    // Global App Admin (before membership data loads), or the HOA Admin role on
    // a live membership here — what checkAdminAccess admits.
    return roleContext.value.hats.admin;
  });

  // Check if user is a member (any role) of the current domain's organization
  const isMemberOfCurrentDomain = computed(() => {
    return !!currentDomainMembership.value;
  });

  // Check if user is a regular member (not admin) of the current domain's organization
  const isRegularMemberOfCurrentDomain = computed(() => {
    if (!currentDomainRoleId.value) return false;

    const memberRoles = [
      config.public.directusRoleMember,
      config.public.directusRoleUser, // Legacy fallback
    ].filter(Boolean);

    return memberRoles.includes(currentDomainRoleId.value);
  });

  const isBoardMemberOfCurrentDomain = computed(() => loggedIn.value && roleContext.value.hats.board);

  // ── Property Manager (external management staff) ──────────────────────────
  // A real login role with per-manager grant flags (manager_permissions) the
  // admin toggles. The Directus policy is an org-scoped ceiling shared by all
  // managers; these flags decide what each manager actually sees/does (enforced
  // app-side here, and in server routes for sends / violation writes).
  // This is the ROLE (access), not the manager hat (identity): the manager
  // middleware admits on it.
  const isPropertyManagerOfCurrentDomain = computed(() => {
    return currentDomainRoleId.value === config.public.directusRolePropertyManager;
  });

  // Every grant key, from the one area list (core/shared/transition/grants.ts).
  const currentDomainManagerPermissions = computed(() =>
    normalizeGrants(currentDomainMembership.value?.manager_permissions)
  );

  // True if the user may access a capability of the current domain: admins
  // always can; property managers only for a granted capability — the area's
  // "can work on it" switch.
  const managerCan = (key: ManagerGrantKey): boolean => {
    if (isAdminOfCurrentDomain.value) return true;
    return roleContext.value.areas[key]?.canWork ?? false;
  };

  // Any area, grantable or not: admin, or that area's work switch. What the
  // nav registry's `area` needs read.
  const canWorkArea = (key: AreaKey): boolean => {
    if (isAdminOfCurrentDomain.value) return true;
    return roleContext.value.areas[key]?.canWork ?? false;
  };

  // Residency from the resolver (unit link first, member_type fallback).
  const currentDomainResidency = computed(() => roleContext.value.residency);

  // The manager HAT (identity, never access): the badge, the queue in an
  // admin's dock, the queue-first home.
  const hasManagerHat = computed(() => roleContext.value.hats.manager);

  // Owner or tenant of this membership whatever its status (the role context
  // above reads "none" for a row that is not active): the current unit link
  // first, member_type as the fallback.
  const currentDomainMemberType = computed<"owner" | "tenant" | null>(() =>
    residencyFor(currentDomainMembership.value as any)
  );

  return {
    // Context checks
    isOrgContext,
    currentDomainOrgId,

    // Membership in current domain
    currentDomainMembership,
    isMemberOfCurrentDomain,

    // Role checks for current domain
    isAdminOfCurrentDomain,
    isRegularMemberOfCurrentDomain,

    // Board member status for current domain
    isBoardMemberOfCurrentDomain,
    currentDomainBoardTerms,

    // Property Manager status + grants for current domain
    isPropertyManagerOfCurrentDomain,
    currentDomainManagerPermissions,
    managerCan,
    canWorkArea,
    hasManagerHat,
    currentDomainResidency,

    // Member type for current domain
    currentDomainMemberType,
  };
};

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
 * The role answers come from the shared RoleContext resolver
 * (docs/spec-role-context.md), run over the cached membership so route
 * middleware never waits on a fetch. See roleContextFromMembership for the
 * client rules kept until Session 2.
 */
import { normalizeGrants, type ManagerGrantKey } from "#core/shared/transition/grants";
import { roleContextFromMembership } from "./useRoleContext";

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

  // Board terms current for the current domain (the client's date filter;
  // the server's read is date-inclusive — see the spec).
  const currentDomainBoardTerms = computed(() => {
    const terms = currentDomainMembership.value?.board_member_terms;
    if (!terms || !Array.isArray(terms)) return [];

    const now = new Date();
    return terms.filter((term: any) => {
      if (term.status !== "published") return false;
      const startDate = term.term_start ? new Date(term.term_start) : null;
      const endDate = term.term_end ? new Date(term.term_end) : null;
      if (startDate && now < startDate) return false;
      if (endDate && now > endDate) return false;
      return true;
    });
  });

  // The membership resolved by the shared RoleContext resolver.
  const roleContext = computed(() =>
    roleContextFromMembership(
      currentDomainMembership.value,
      currentDomainBoardTerms.value,
      userGlobalRoleId.value,
      {
        appAdmin: config.public.directusRoleAppAdmin as string | undefined,   // App Administrator - full system access
        hoaAdmin: config.public.directusRoleHoaAdmin as string | undefined,   // HOA Admin - organization-level admin access
        legacyAdmin: config.public.directusRoleAdmin as string | undefined,   // Legacy fallback
        propertyManager: config.public.directusRolePropertyManager as string | undefined,
      }
    )
  );

  /**
   * Check if user is an admin of the CURRENT domain's organization
   * Both App Administrator and HOA Admin roles grant full admin access
   * to view and manage all admin content and features (including during maintenance mode)
   */
  const isAdminOfCurrentDomain = computed(() => {
    // HOA Admin users also get admin access - they can manage admin content
    // This ensures HOA Admin users can see navigation in maintenance mode.
    // Client-only rule (the server does not honour it): any membership here
    // plus the HOA Admin global role. Kept until Session 2.
    if (
      userGlobalRoleId.value &&
      userGlobalRoleId.value === config.public.directusRoleHoaAdmin &&
      currentDomainMembership.value
    ) {
      return true;
    }

    // Global App Admin (before membership data loads), or an admin role on
    // this organization's membership.
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

  const isBoardMemberOfCurrentDomain = computed(() => roleContext.value.hats.board);

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

  // Get member type for current domain
  const currentDomainMemberType = computed<"owner" | "tenant" | null>(() => {
    return currentDomainMembership.value?.member_type || null;
  });

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

    // Member type for current domain
    currentDomainMemberType,
  };
};

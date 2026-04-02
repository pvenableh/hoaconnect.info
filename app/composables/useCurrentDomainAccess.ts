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
 */
export const useCurrentDomainAccess = () => {
  const { activeHoa } = useActiveHoa();
  const { loggedIn, user } = useUserSession();
  const config = useRuntimeConfig();
  const route = useRoute();

  // Get memberships from the user-members async data (populated by useSelectedOrg)
  // Must use useNuxtData to access data from useAsyncData, not useState (different namespaces)
  const { data: membershipsData } = useNuxtData<any[]>("user-members");

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

    const memberships = membershipsData.value;
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

  /**
   * Check if user is an admin of the CURRENT domain's organization
   * Both App Administrator and HOA Admin roles grant full admin access
   * to view and manage all admin content and features (including during maintenance mode)
   */
  const isAdminOfCurrentDomain = computed(() => {
    const roleId = userGlobalRoleId.value;

    // First check if user has a global admin role (App Admin or HOA Admin)
    // This provides immediate admin access before membership data loads
    if (roleId === config.public.directusRoleAppAdmin) {
      return true;
    }

    // HOA Admin users also get admin access - they can manage admin content
    // This ensures HOA Admin users can see navigation in maintenance mode
    if (roleId === config.public.directusRoleHoaAdmin) {
      // For HOA Admin, we need to verify they have membership in this org
      // If memberships aren't loaded yet, we'll check on the next render
      if (currentDomainMembership.value) {
        return true;
      }
    }

    // Then check if they have admin role in this specific organization's membership
    if (!currentDomainRoleId.value) return false;

    const adminRoles = [
      config.public.directusRoleAppAdmin,   // App Administrator - full system access
      config.public.directusRoleHoaAdmin,   // HOA Admin - organization-level admin access
      config.public.directusRoleAdmin,      // Legacy fallback
    ].filter(Boolean);

    return adminRoles.includes(currentDomainRoleId.value);
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

  // Get board member status for current domain
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

  const isBoardMemberOfCurrentDomain = computed(() => {
    return currentDomainBoardTerms.value.length > 0;
  });

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

    // Member type for current domain
    currentDomainMemberType,
  };
};

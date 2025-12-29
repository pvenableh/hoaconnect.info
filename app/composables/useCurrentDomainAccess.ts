// composables/useCurrentDomainAccess.ts
/**
 * Composable to check user's access rights for the CURRENT domain/organization being viewed.
 *
 * This is different from useSelectedOrg which checks the user's role in their SELECTED organization.
 * This composable specifically checks if the logged-in user has membership in the organization
 * whose domain or slug they are currently viewing.
 *
 * Use cases:
 * - User visits a custom domain (org-b.com) but is logged in with Org A membership
 * - User navigates to /org-b/dashboard but only has membership in Org A
 *
 * In both cases, this composable will correctly identify that the user is NOT an admin
 * of the currently viewed organization, preventing unauthorized access.
 */
export const useCurrentDomainAccess = () => {
  const { activeHoa, isCustomDomain } = useActiveHoa();
  const { loggedIn, user } = useUserSession();
  const config = useRuntimeConfig();
  const route = useRoute();

  // Get memberships from the user-members async data (populated by useSelectedOrg)
  // Must use useNuxtData to access data from useAsyncData, not useState (different namespaces)
  const { data: membershipsData } = useNuxtData<any[]>("user-members");

  // Check if we're on an org context (custom domain or slug route)
  const isOrgContext = computed(() => {
    return isCustomDomain.value || !!route.params.slug;
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

  // Check if user is an admin of the CURRENT domain's organization
  const isAdminOfCurrentDomain = computed(() => {
    // First check if user is an App Administrator (global admin)
    const userRoleId = user.value?.role;
    if (userRoleId === config.public.directusRoleAppAdmin) {
      return true;
    }

    // Then check if they have admin role in this specific organization
    if (!currentDomainRoleId.value) return false;

    const adminRoles = [
      config.public.directusRoleAppAdmin,
      config.public.directusRoleHoaAdmin,
      config.public.directusRoleAdmin, // Legacy fallback
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

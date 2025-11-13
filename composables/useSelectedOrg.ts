/**
 * Composable to manage the currently selected organization
 * Handles users with multiple HOA memberships (e.g., property managers)
 */
export const useSelectedOrg = () => {
  const { user } = useDirectusAuth();
  const { fetchItems } = useDirectusItems();

  // Store selected org ID in localStorage
  const selectedOrgId = useState<string | null>("selectedOrgId", () => {
    if (import.meta.client) {
      return localStorage.getItem("selectedOrgId");
    }
    return null;
  });

  // Fetch all organizations user has access to
  const {
    data: memberships,
    pending,
    refresh: refreshMemberships,
  } = useAsyncData("user-members", async () => {
    if (!user.value?.id) return [];

    const result = await fetchItems("hoa_members", {
      fields: [
        "id",
        "organization.id",
        "organization.name",
        "organization.logo",
        "role.id",
        "role.name",
      ],
      filter: {
        user: { _eq: user.value.id },
      },
      sort: ["organization.name"],
    });

    return result.data.value || [];
  });

  // Get current organization details
  const currentOrg = computed(() => {
    if (!selectedOrgId.value || !memberships.value) return null;

    return memberships.value.find(
      (m) => m.organization?.id === selectedOrgId.value
    );
  });

  // Get current role in selected org (now returns the role name from directus_roles)
  const currentRole = computed(() => currentOrg.value?.role?.name || "Guest");

  // Set selected organization
  const setOrganization = (orgId: string) => {
    selectedOrgId.value = orgId;
    if (import.meta.client) {
      localStorage.setItem("selectedOrgId", orgId);
    }
  };

  // Auto-select first org if none selected
  const initializeOrg = () => {
    if (!selectedOrgId.value && memberships.value?.length) {
      setOrganization(memberships.value[0].organization.id);
    }
  };

  // Initialize on mount
  onMounted(() => {
    initializeOrg();
  });

  // Watch for memberships load
  watch(memberships, () => {
    initializeOrg();
  });

  return {
    selectedOrgId: computed(() => selectedOrgId.value),
    currentOrg,
    currentRole,
    memberships: computed(() => memberships.value || []),
    setOrganization,
    refreshMemberships,
    hasMultipleOrgs: computed(() => (memberships.value?.length || 0) > 1),
    isLoading: pending, // Add this to expose loading state
  };
};

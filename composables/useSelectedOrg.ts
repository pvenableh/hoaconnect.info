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
    if (!user.value?.id) {
      console.warn("[useSelectedOrg] No user ID found, skipping membership fetch");
      return [];
    }

    console.log("[useSelectedOrg] Fetching memberships for user:", user.value.id);

    try {
      const result = await fetchItems("hoa_members", {
        fields: [
          "id",
          "organization.id",
          "organization.name",
          "organization.settings.logo",
          "role.id",
          "role.name",
        ],
        filter: {
          user: { _eq: user.value.id },
        },
        sort: ["organization.name"],
      });

      console.log("[useSelectedOrg] Memberships result:", result.data.value);
      return result.data.value || [];
    } catch (error) {
      console.error("[useSelectedOrg] Error fetching memberships:", error);
      return [];
    }
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
      console.log("[useSelectedOrg] Auto-selecting first organization:", memberships.value[0].organization);
      setOrganization(memberships.value[0].organization.id);
    } else if (!memberships.value?.length) {
      console.warn("[useSelectedOrg] No memberships found to initialize");
    } else {
      console.log("[useSelectedOrg] Organization already selected:", selectedOrgId.value);
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

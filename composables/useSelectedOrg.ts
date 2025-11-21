/**
 * Composable to manage the currently selected organization
 * Handles users with multiple HOA memberships (e.g., property managers)
 * Now supports SSR by storing the selected org in the session
 */
export const useSelectedOrg = async () => {
  const { user } = useDirectusAuth();
  const { list: listMembers } = useDirectusItems("hoa_members");

  // Store selected org ID - initialize from session during SSR, localStorage on client
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const isInitialized = useState<boolean>("selectedOrgInitialized", () => false);

  // Sync selected org to session (client-side only)
  const syncToSession = async (orgId: string) => {
    // Only sync on client side - SSR doesn't have session cookies properly hydrated
    if (!import.meta.client) {
      return;
    }

    // Don't attempt to sync if user is not authenticated yet
    if (!user.value?.id) {
      console.warn("[useSelectedOrg] Skipping session sync - user not authenticated yet");
      return;
    }

    try {
      await $fetch("/api/org/selected", {
        method: "POST",
        body: { orgId },
      });
    } catch (error: any) {
      // During hydration, session might not be available yet - fail silently
      if (error?.statusCode === 401 || error?.status === 401) {
        console.warn("[useSelectedOrg] Session not yet available for sync, will retry on next interaction");
      } else {
        console.error("[useSelectedOrg] Failed to sync to session:", error);
      }
    }
  };

  // Fetch all organizations user has access to
  const {
    data: memberships,
    pending,
    refresh: refreshMemberships,
  } = await useAsyncData("user-members", async () => {
    if (!user.value?.id) {
      console.warn("[useSelectedOrg] No user ID found, skipping membership fetch");
      return [];
    }

    console.log("[useSelectedOrg] Fetching memberships for user:", user.value.id);

    try {
      // STEP 1: Initialize selected org from session (SSR) or localStorage (client)
      if (!selectedOrgId.value && !isInitialized.value) {
        // On client: prefer localStorage first
        if (import.meta.client) {
          const stored = localStorage.getItem("selectedOrgId");
          if (stored) {
            selectedOrgId.value = stored;
            console.log("[useSelectedOrg] Initialized from localStorage:", stored);
            // Sync to session for future SSR renders
            await syncToSession(stored);
          }
        } else {
          // On server (SSR): try to get from session
          try {
            const sessionOrg = await $fetch("/api/org/selected");
            if (sessionOrg?.selectedOrgId) {
              selectedOrgId.value = sessionOrg.selectedOrgId;
              console.log("[useSelectedOrg] Initialized from session:", selectedOrgId.value);
            }
          } catch (error) {
            // Session not available during SSR is expected - this is normal, no action needed
            // Will be initialized from localStorage on client side or auto-selected
          }
        }
      }

      // STEP 2: Fetch memberships
      const result = await listMembers({
        fields: [
          "id",
          "organization.id",
          "organization.name",
          "organization.settings.logo",
          "role",
        ],
        filter: {
          user: { _eq: user.value.id },
        },
        sort: ["organization.name"],
      });

      console.log("[useSelectedOrg] Memberships result:", result);

      // STEP 3: Auto-select first org if no org is selected yet
      if (!selectedOrgId.value && result && Array.isArray(result) && result.length > 0) {
        const firstOrg = result[0].organization?.id;
        if (firstOrg) {
          console.log("[useSelectedOrg] Auto-selecting first organization:", firstOrg);
          selectedOrgId.value = firstOrg;

          // Sync to session and localStorage
          await syncToSession(firstOrg);
          if (import.meta.client) {
            localStorage.setItem("selectedOrgId", firstOrg);
          }
        }
      }

      isInitialized.value = true;
      return result || [];
    } catch (error) {
      console.error("[useSelectedOrg] Error fetching memberships:", error);
      return [];
    }
  }, {
    watch: [user]
  });

  // Get current organization details
  const currentOrg = computed(() => {
    if (!selectedOrgId.value || !memberships.value || !Array.isArray(memberships.value)) return null;

    return memberships.value.find(
      (m) => m.organization?.id === selectedOrgId.value
    );
  });

  // Get current role in selected org (returns role ID since we can't query role name from core collection)
  const currentRole = computed(() => currentOrg.value?.role || "Guest");

  // Set selected organization
  const setOrganization = async (orgId: string) => {
    selectedOrgId.value = orgId;

    // Store in localStorage (client-side)
    if (import.meta.client) {
      localStorage.setItem("selectedOrgId", orgId);
    }

    // Store in session (works on both server and client)
    await syncToSession(orgId);

    console.log("[useSelectedOrg] Organization set to:", orgId);
  };

  return {
    selectedOrgId: computed(() => selectedOrgId.value),
    currentOrg,
    currentRole,
    memberships: computed(() => memberships.value || []),
    setOrganization,
    refreshMemberships,
    hasMultipleOrgs: computed(() => (Array.isArray(memberships.value) ? memberships.value.length : 0) > 1),
    isLoading: pending, // Add this to expose loading state
  };
};

// composables/useSelectedOrg.ts
/**
 * Composable to manage the currently selected organization
 * Handles users with multiple HOA memberships (e.g., property managers)
 * Now supports SSR by storing the selected org in the session
 */
export const useSelectedOrg = async () => {
  // Capture Nuxt context IMMEDIATELY at the top, before any awaits
  const nuxtApp = useNuxtApp();

  const { user } = useDirectusAuth();
  const { list: listMembers } = useDirectusItems("hoa_members");
  const config = useRuntimeConfig();

  // Store selected org ID - initialize from session during SSR, localStorage on client
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const isInitialized = useState<boolean>(
    "selectedOrgInitialized",
    () => false
  );

  // Sync selected org to session (client-side only)
  const syncToSession = (orgId: string) => {
    // Only sync on client side - SSR doesn't have session cookies properly hydrated
    if (!import.meta.client) {
      return;
    }

    // Don't attempt to sync if user is not authenticated yet
    if (!user.value?.id) {
      console.warn(
        "[useSelectedOrg] Skipping session sync - user not authenticated yet"
      );
      return;
    }

    // Fire-and-forget - no need to await
    $fetch("/api/org/selected", {
      method: "POST",
      body: { orgId },
    }).catch((error: any) => {
      // During hydration, session might not be available yet - fail silently
      if (error?.statusCode === 401 || error?.status === 401) {
        console.warn(
          "[useSelectedOrg] Session not yet available for sync, will retry on next interaction"
        );
      } else {
        console.error("[useSelectedOrg] Failed to sync to session:", error);
      }
    });
  };

  // Fetch all organizations user has access to
  const {
    data: memberships,
    pending,
    refresh: refreshMemberships,
  } = await useAsyncData(
    "user-members",
    async () => {
      if (!user.value?.id) {
        console.warn(
          "[useSelectedOrg] No user ID found, skipping membership fetch"
        );
        return [];
      }

      console.log(
        "[useSelectedOrg] Fetching memberships for user:",
        user.value.id
      );

      try {
        // STEP 1: Initialize selected org from session (SSR) or localStorage (client)
        if (!selectedOrgId.value && !isInitialized.value) {
          // On client: prefer localStorage first
          if (import.meta.client) {
            const stored = localStorage.getItem("selectedOrgId");
            if (stored) {
              // Use runWithContext for state updates after potential async operations
              nuxtApp.runWithContext(() => {
                selectedOrgId.value = stored;
              });
              console.log(
                "[useSelectedOrg] Initialized from localStorage:",
                stored
              );
              // Sync to session for future SSR renders (fire-and-forget)
              syncToSession(stored);
            }
          } else {
            // On server (SSR): try to get from session
            try {
              const sessionOrg = await $fetch("/api/org/selected");
              if (sessionOrg?.selectedOrgId) {
                nuxtApp.runWithContext(() => {
                  selectedOrgId.value = sessionOrg.selectedOrgId;
                });
                console.log(
                  "[useSelectedOrg] Initialized from session:",
                  selectedOrgId.value
                );
              }
            } catch (error) {
              // Session not available during SSR is expected - this is normal, no action needed
              // Will be initialized from localStorage on client side or auto-selected
            }
          }
        }

        // STEP 2: Fetch memberships with subscription info
        const result = await listMembers({
          fields: [
            "id",
            "organization.id",
            "organization.name",
            "organization.folder",
            "organization.slug",
            "organization.custom_domain",
            "organization.domain_verified",
            "organization.settings.logo",
            "organization.subscription_status",
            "organization.trial_ends_at",
            "role",
          ],
          filter: {
            user: { _eq: user.value.id },
          },
          sort: ["organization.name"],
        });

        console.log("[useSelectedOrg] Memberships result:", result);

        // STEP 3: Auto-select first org if no org is selected yet
        if (
          !selectedOrgId.value &&
          result &&
          Array.isArray(result) &&
          result.length > 0
        ) {
          const firstOrg = result[0].organization?.id;
          if (firstOrg) {
            console.log(
              "[useSelectedOrg] Auto-selecting first organization:",
              firstOrg
            );

            // Wrap all state mutations in runWithContext
            nuxtApp.runWithContext(() => {
              selectedOrgId.value = firstOrg;

              // Sync to session and localStorage (fire-and-forget)
              syncToSession(firstOrg);
              if (import.meta.client) {
                localStorage.setItem("selectedOrgId", firstOrg);
              }
            });
          }
        }

        nuxtApp.runWithContext(() => {
          isInitialized.value = true;
        });

        return result || [];
      } catch (error) {
        console.error("[useSelectedOrg] Error fetching memberships:", error);
        return [];
      }
    },
    {
      watch: [user],
    }
  );

  // Get current organization details
  const currentOrg = computed(() => {
    if (
      !selectedOrgId.value ||
      !memberships.value ||
      !Array.isArray(memberships.value)
    )
      return null;

    return (
      (memberships.value as any[]).find(
        (m: any) => m?.organization?.id === selectedOrgId.value
      ) || null
    );
  });

  // Get current role in selected org (returns role ID since we can't query role name from core collection)
  const currentRole = computed(() => currentOrg.value?.role || "Guest");

  // Get the actual role ID (handles both string and object role references)
  const actualRoleId = computed(() => {
    const roleId = currentOrg.value?.role;
    if (!roleId) return null;
    return typeof roleId === "string" ? roleId : roleId?.id;
  });

  // Check if current user is an admin in the selected organization
  // Admin access is granted to both App Administrators and HOA Admins
  const isAdmin = computed(() => {
    if (!actualRoleId.value) return false;
    // Check against both admin role types
    const adminRoles = [
      config.public.directusRoleAppAdmin, // App Administrator (c4903b32-db6f-4479-a627-55be7f328321)
      config.public.directusRoleHoaAdmin, // HOA Admin (38494e81-9b49-4c64-a197-fcb8097cd433)
      config.public.directusRoleAdmin, // Legacy fallback
    ].filter(Boolean);
    return adminRoles.includes(actualRoleId.value);
  });

  // Check if current user is a regular member (not admin) in the selected organization
  const isMember = computed(() => {
    if (!actualRoleId.value) return false;
    // Check against member role
    const memberRoles = [
      config.public.directusRoleMember, // HOA Member (558b04ed-fdcc-48c2-9cd0-977cccf988b9)
      config.public.directusRoleUser, // Legacy fallback
    ].filter(Boolean);
    return memberRoles.includes(actualRoleId.value);
  });

  // Check if user has any role in the organization (is authenticated member)
  const isOrgMember = computed(() => {
    return !!currentOrg.value?.role;
  });

  // Set selected organization
  const setOrganization = async (orgId: string) => {
    selectedOrgId.value = orgId;

    // Store in localStorage (client-side)
    if (import.meta.client) {
      localStorage.setItem("selectedOrgId", orgId);
    }

    // Store in session (fire-and-forget)
    syncToSession(orgId);

    console.log("[useSelectedOrg] Organization set to:", orgId);
  };

  return {
    selectedOrgId: computed(() => selectedOrgId.value),
    currentOrg,
    currentRole,
    memberships: computed(() => memberships.value || []),
    setOrganization,
    refreshMemberships,
    hasMultipleOrgs: computed(
      () =>
        (Array.isArray(memberships.value) ? memberships.value.length : 0) > 1
    ),
    isLoading: pending,
    // Role checking helpers
    isAdmin,
    isMember,
    isOrgMember,
  };
};

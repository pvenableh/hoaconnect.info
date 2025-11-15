// composables/useHOAAuth.ts
import type { RegisterData } from "~/types/directus";
import { toast } from "vue-sonner";

export const useHOAAuth = () => {
  const {
    user,
    login,
    logout,
    register: baseRegister,
    loggedIn,
    isAdmin,
  } = useDirectusAuth();
  const { activeHoa } = useActiveHoa();

  // Register with automatic HOA assignment
  const register = async (data: RegisterData) => {
    try {
      // Call base register
      const result = await baseRegister(data);

      // If we have an active HOA, update the user's profile
      if (result && activeHoa.value) {
        try {
          await $fetch("/api/profile/update", {
            method: "PATCH",
            body: {
              organization_id: activeHoa.value.id,
            },
          });

          // Also create HOA member record
          await $fetch("/api/hoa/members/create", {
            method: "POST",
            body: {
              user: result.id,
              organization: activeHoa.value.id,
              first_name: data.firstName,
              last_name: data.lastName,
              email: data.email,
              phone: data.phone,
              member_type: "owner", // Default type
            },
          });
        } catch (error) {
          console.error("Failed to assign user to HOA:", error);
        }
      }

      return result;
    } catch (error) {
      throw error;
    }
  };

  // Check if user belongs to current HOA
  const belongsToCurrentHOA = computed(() => {
    if (!user.value || !activeHoa.value) return false;

    // Check if user's profile has the organization
    if (user.value.profile?.organization_id) {
      return (
        (user.value.profile.organization_id as any)?.id ===
          activeHoa.value.id ||
        user.value.profile.organization_id === activeHoa.value.id
      );
    }

    // Check if user has organization directly
    if (user.value.organization) {
      return (user.value.organization as any).id === activeHoa.value.id;
    }

    return false;
  });

  // Check if user is HOA admin
  const isHOAAdmin = computed(() => {
    if (!user.value) return false;

    // Check if user is system admin
    if (isAdmin.value) return true;

    // Check if user has HOA admin role
    if (
      user.value.role?.name === "HOA Admin" ||
      user.value.role?.name === "Board Member"
    ) {
      return belongsToCurrentHOA.value;
    }

    return false;
  });

  // Check if user is board member
  const isBoardMember = computed(() => {
    if (!user.value?.profile) return false;
    return (
      user.value.profile.is_board_member === true && belongsToCurrentHOA.value
    );
  });

  // Switch HOA context (for users who belong to multiple HOAs)
  const switchHOA = async (organizationId: string) => {
    try {
      // Update profile with new organization
      await $fetch("/api/profile/update", {
        method: "PATCH",
        body: {
          organization_id: organizationId,
        },
      });

      // Refresh user session
      await $fetch("/api/auth/refresh", {
        method: "POST",
      });

      toast.success("Switched HOA context");

      // Reload the page to update context
      window.location.reload();
    } catch (error) {
      console.error("Failed to switch HOA:", error);
      toast.error("Failed to switch HOA context");
    }
  };

  // Get user's HOA memberships
  const getUserMemberships = async () => {
    if (!user.value) return [];

    try {
      const memberships = await $fetch(
        `/api/hoa/members/user/${user.value.id}`
      );
      return memberships;
    } catch (error) {
      console.error("Failed to fetch user memberships:", error);
      return [];
    }
  };

  // Require HOA membership (for middleware)
  const requireHOAMembership = () => {
    if (!loggedIn.value) {
      throw createError({
        statusCode: 401,
        statusMessage: "Authentication required",
      });
    }

    if (!belongsToCurrentHOA.value && !isAdmin.value) {
      throw createError({
        statusCode: 403,
        statusMessage: "You do not have access to this HOA",
      });
    }
  };

  // Require HOA admin (for middleware)
  const requireHOAAdmin = () => {
    requireHOAMembership();

    if (!isHOAAdmin.value) {
      throw createError({
        statusCode: 403,
        statusMessage: "Admin access required",
      });
    }
  };

  return {
    user,
    login,
    logout,
    register,
    loggedIn,
    isAdmin,
    activeHoa,
    belongsToCurrentHOA,
    isHOAAdmin,
    isBoardMember,
    switchHOA,
    getUserMemberships,
    requireHOAMembership,
    requireHOAAdmin,
  };
};

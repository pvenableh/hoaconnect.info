// composables/useHOAAuth.ts
import type { RegisterData } from "~/types/directus-schema";
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

      // If we have an active HOA, create HOA member record
      if (result && activeHoa.value) {
        try {
          await $fetch("/api/hoa/members/create", {
            method: "POST",
            body: {
              user: result.id,
              organization: activeHoa.value.id,
              status: "active"
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

    // Check if user has organization directly
    if (user.value.organization) {
      const orgId = typeof user.value.organization === 'object'
        ? user.value.organization.id
        : user.value.organization;
      return orgId === activeHoa.value.id;
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
    if (!user.value?.member) return false;
    const memberRole = typeof user.value.member === 'object' && 'role' in user.value.member
      ? user.value.member.role
      : null;
    const roleName = typeof memberRole === 'object' && memberRole && 'name' in memberRole
      ? memberRole.name
      : null;
    return (
      roleName === 'Board Member' && belongsToCurrentHOA.value
    );
  });

  // Switch HOA context (for users who belong to multiple HOAs)
  const switchHOA = async (organizationId: string) => {
    try {
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

// composables/useDirectusAuth.ts
import type {
  SessionUser,
  LoginCredentials,
  RegisterData,
} from "~/types/directus";
import { toast } from "vue-sonner";

export const useDirectusAuth = () => {
  const user = useState<SessionUser | null>("auth.user", () => null);
  const loggedIn = useState<boolean>("auth.loggedIn", () => false);
  const loading = useState<boolean>("auth.loading", () => false);

  // Fetch current session
  const fetchSession = async () => {
    try {
      const { data } = await $fetch("/api/auth/session");
      user.value = data?.user || null;
      loggedIn.value = !!data?.user;
      return data?.user;
    } catch (error) {
      console.error("Failed to fetch session:", error);
      user.value = null;
      loggedIn.value = false;
      return null;
    }
  };

  // Login
  const login = async (credentials: LoginCredentials) => {
    loading.value = true;
    try {
      const { user: userData } = await $fetch("/api/auth/login", {
        method: "POST",
        body: credentials,
      });

      user.value = userData;
      loggedIn.value = true;

      toast.success("Welcome back!");
      await navigateTo("/dashboard");

      return userData;
    } catch (error: any) {
      const message = error.data?.statusMessage || "Invalid email or password";
      toast.error(message);
      throw error;
    } finally {
      loading.value = false;
    }
  };

  // Register
  const register = async (data: RegisterData) => {
    loading.value = true;
    try {
      const { user: userData } = await $fetch("/api/auth/register", {
        method: "POST",
        body: data,
      });

      user.value = userData;
      loggedIn.value = true;

      toast.success("Account created successfully!");
      await navigateTo("/dashboard/onboarding");

      return userData;
    } catch (error: any) {
      const message = error.data?.statusMessage || "Failed to create account";
      toast.error(message);
      throw error;
    } finally {
      loading.value = false;
    }
  };

  // Logout
  const logout = async () => {
    loading.value = true;
    try {
      await $fetch("/api/auth/logout", {
        method: "POST",
      });

      user.value = null;
      loggedIn.value = false;

      toast.success("Logged out successfully");
      await navigateTo("/");
    } catch (error) {
      console.error("Logout error:", error);
      // Clear local state even if request fails
      user.value = null;
      loggedIn.value = false;
      await navigateTo("/");
    } finally {
      loading.value = false;
    }
  };

  // Check if user has specific role
  const hasRole = (roleName: string) => {
    if (!user.value?.role) return false;
    return user.value.role.name === roleName;
  };

  // Check if user is admin
  const isAdmin = computed(() => {
    if (!user.value?.role) return false;
    return user.value.role.admin_access === true;
  });

  // Check if user belongs to an organization
  const hasOrganization = computed(() => {
    return !!user.value?.organization;
  });

  // Initialize on app mount
  onMounted(async () => {
    if (!user.value) {
      await fetchSession();
    }
  });

  return {
    user: readonly(user),
    loggedIn: readonly(loggedIn),
    loading: readonly(loading),
    isAdmin,
    hasOrganization,
    login,
    logout,
    register,
    fetchSession,
    hasRole,
  };
};

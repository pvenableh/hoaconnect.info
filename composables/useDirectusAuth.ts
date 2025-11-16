import { createDirectus, authentication, rest, readMe } from "@directus/sdk";
import { toast } from "vue-sonner";

export const useDirectusAuth = () => {
  const config = useRuntimeConfig();
  const router = useRouter();

  // State management
  const state = useState("auth", () => ({
    user: null,
    loading: false,
    error: null,
  }));

  // Computed properties
  const user = computed(() => state.value.user);
  const isAuthenticated = computed(() => !!state.value.user);
  const loading = computed(() => state.value.loading);
  const error = computed(() => state.value.error);

  /**
   * Get authenticated Directus client
   */
  const getAuthClient = () => {
    return createDirectus(config.public.directus.url)
      .with(rest())
      .with(authentication("session"));
  };

  /**
   * Login with email and password
   */
  const login = async (email: string, password: string) => {
    state.value.loading = true;
    state.value.error = null;

    try {
      // Call server endpoint for login
      const result = await $fetch("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });

      if (result.user) {
        state.value.user = result.user;
        toast.success("Welcome back!");
        await router.push("/dashboard");
        return result.user;
      }
    } catch (err: any) {
      state.value.error = err?.message || "Login failed";
      toast.error(state.value.error);
      throw err;
    } finally {
      state.value.loading = false;
    }
  };

  /**
   * Register new user
   */
  const register = async (data: any) => {
    state.value.loading = true;
    state.value.error = null;

    try {
      const result = await $fetch("/api/auth/register", {
        method: "POST",
        body: data,
      });

      if (result.user) {
        state.value.user = result.user;
        toast.success("Account created successfully!");
        await router.push("/dashboard");
        return result.user;
      }
    } catch (err: any) {
      state.value.error = err?.message || "Registration failed";
      toast.error(state.value.error);
      throw err;
    } finally {
      state.value.loading = false;
    }
  };

  /**
   * Logout user
   */
  const logout = async () => {
    state.value.loading = true;

    try {
      await $fetch("/api/auth/logout", {
        method: "POST",
      });

      state.value.user = null;
      toast.success("Logged out successfully");
      await router.push("/auth/login");
    } catch (err: any) {
      console.error("Logout error:", err);
      // Clear state even if server call fails
      state.value.user = null;
      await router.push("/auth/login");
    } finally {
      state.value.loading = false;
    }
  };

  /**
   * Fetch current user data
   */
  const fetchUser = async () => {
    state.value.loading = true;
    state.value.error = null;

    try {
      const result = await $fetch("/api/auth/me");

      if (result.user) {
        state.value.user = result.user;
        return result.user;
      }

      return null;
    } catch (err: any) {
      state.value.error = err?.message || "Failed to fetch user";
      state.value.user = null;
      return null;
    } finally {
      state.value.loading = false;
    }
  };

  /**
   * Request password reset
   */
  const requestPasswordReset = async (email: string) => {
    state.value.loading = true;
    state.value.error = null;

    try {
      // Call server endpoint for password reset
      await $fetch("/api/auth/password/request", {
        method: "POST",
        body: { email },
      });

      toast.success("Password reset email sent!");
      return true;
    } catch (err: any) {
      state.value.error = err?.message || "Failed to send reset email";
      toast.error(state.value.error);
      throw err;
    } finally {
      state.value.loading = false;
    }
  };

  /**
   * Reset password with token
   */
  const resetPassword = async (token: string, password: string) => {
    state.value.loading = true;
    state.value.error = null;

    try {
      await $fetch("/api/auth/password/reset", {
        method: "POST",
        body: { token, password },
      });

      toast.success("Password reset successfully!");
      await router.push("/auth/login");
      return true;
    } catch (err: any) {
      state.value.error = err?.message || "Failed to reset password";
      toast.error(state.value.error);
      throw err;
    } finally {
      state.value.loading = false;
    }
  };

  /**
   * Refresh authentication token
   */
  const refreshToken = async () => {
    try {
      const result = await $fetch("/api/auth/refresh", {
        method: "POST",
      });

      return result.success;
    } catch (err) {
      console.error("Token refresh failed:", err);
      return false;
    }
  };

  /**
   * Initialize auth on app mount
   */
  const init = async () => {
    await fetchUser();
  };

  // Auto-initialize on mount
  onMounted(() => {
    init();
  });

  return {
    // State
    user: readonly(user),
    isAuthenticated: readonly(isAuthenticated),
    loading: readonly(loading),
    error: readonly(error),

    // Methods
    login,
    register,
    logout,
    fetchUser,
    requestPasswordReset,
    resetPassword,
    refreshToken,
    init,
  };
};

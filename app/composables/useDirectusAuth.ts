/**
 * useDirectusAuth - Authentication composable
 *
 * Handles authentication flows (login, logout, register) by calling
 * server endpoints and integrating with nuxt-auth-utils session management.
 *
 * For user-specific operations (profile, invitations, password resets),
 * use useDirectusUser() instead.
 *
 * Usage:
 * const { login, logout, register, user, loggedIn } = useDirectusAuth()
 */

export const useDirectusAuth = () => {
  // Get session from nuxt-auth-utils
  const session = useUserSession();

  // Computed refs from session
  const user = computed(() => session.user.value);
  const loggedIn = computed(() => session.loggedIn.value);

  /**
   * Login with email and password
   * Accepts either an object { email, password } or two separate parameters
   */
  const login = async (
    emailOrData: string | { email: string; password: string },
    password?: string
  ) => {
    try {
      // Handle both object and separate parameters
      const credentials =
        typeof emailOrData === "string"
          ? { email: emailOrData, password: password! }
          : emailOrData;

      const { data, error } = await useFetch("/api/auth/login", {
        method: "POST",
        body: credentials,
      });

      if (error.value) {
        throw new Error(error.value.message || "Login failed");
      }

      // Session is set by the server endpoint
      // Fetch the updated session
      await session.fetch();

      return data.value;
    } catch (error: any) {
      throw new Error(error.message || "Login failed");
    }
  };

  /**
   * Logout current user
   */
  const logout = async () => {
    try {
      await $fetch("/api/auth/logout", {
        method: "POST",
      });

      // Clear the session
      await session.clear();
    } catch (error: any) {
      // Even if the server call fails, clear local session
      await session.clear();
      throw new Error(error.message || "Logout failed");
    }
  };

  /**
   * Register a new user
   */
  const register = async (userData: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
  }) => {
    try {
      const { data, error } = await useFetch("/api/auth/register", {
        method: "POST",
        body: userData,
      });

      if (error.value) {
        throw new Error(error.value.message || "Registration failed");
      }

      return data.value;
    } catch (error: any) {
      throw new Error(error.message || "Registration failed");
    }
  };

  /**
   * Request password reset email
   * (Wrapper around useDirectusUser for convenience)
   */
  const requestPasswordReset = async (email: string) => {
    const { requestPasswordReset: resetRequest } = useDirectusUser();
    return await resetRequest(email);
  };

  /**
   * Reset password with token
   * (Wrapper around useDirectusUser for convenience)
   */
  const resetPassword = async (token: string, password: string) => {
    const { resetPassword: reset } = useDirectusUser();
    return await reset(token, password);
  };

  /**
   * Refresh current user session with fresh data from Directus
   */
  const refreshUser = async () => {
    try {
      // Call the refresh endpoint to get fresh user data from Directus
      await $fetch("/api/auth/refresh-session", {
        method: "POST",
      });

      // Fetch the updated session
      await session.fetch();
      return session.user.value;
    } catch (error: any) {
      // Fallback to just refreshing the session
      await session.fetch();
      return session.user.value;
    }
  };

  return {
    // State
    user,
    loggedIn,

    // Actions
    login,
    logout,
    register,
    refreshUser,

    // Password management (delegated to useDirectusUser)
    requestPasswordReset,
    resetPassword,
  };
};

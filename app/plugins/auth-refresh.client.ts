/**
 * Auto-refresh plugin for authentication tokens
 *
 * This plugin monitors the user's session and automatically refreshes
 * the access token to keep users logged in indefinitely.
 *
 * Behavior:
 * - Proactively refreshes token every 10 minutes
 * - Also checks token expiration and refreshes if less than 5 minutes remain
 * - Handles errors gracefully and redirects to login if refresh fails
 * - Keeps users logged in even when idle
 */

export default defineNuxtPlugin(() => {
  const session = useUserSession();
  const { loggedIn, fetch: fetchSession, clear, data } = session;
  const router = useRouter();

  let checkInterval: ReturnType<typeof setInterval> | null = null;
  let proactiveRefreshInterval: ReturnType<typeof setInterval> | null = null;
  let isRefreshing = false;

  const refreshToken = async () => {
    if (isRefreshing) {
      console.log('[auth-refresh] Already refreshing, skipping...');
      return;
    }

    try {
      isRefreshing = true;
      console.log('[auth-refresh] Refreshing token...');

      const response = await $fetch('/api/auth/refresh', {
        method: 'POST',
      });

      if (response.success) {
        console.log('[auth-refresh] Token refreshed successfully');
        await fetchSession(); // Fetch updated session
      } else {
        throw new Error('Token refresh failed');
      }
    } catch (error) {
      console.error('[auth-refresh] Failed to refresh token:', error);

      // If refresh fails, clear session and redirect to login
      await clear();

      // Redirect to login page
      await router.push('/auth/login');
    } finally {
      isRefreshing = false;
    }
  };

  const checkAndRefreshToken = async () => {
    // Skip if not logged in
    if (!loggedIn.value) {
      return;
    }

    try {
      // Fetch current session to get expiration time
      await fetchSession();

      // Get expiration time from session data (data may be undefined during hydration)
      const expiresAt = (data?.value as any)?.expiresAt;

      if (!expiresAt) {
        console.warn('[auth-refresh] No expiration time found in session');
        return;
      }

      const now = Date.now();
      const timeUntilExpiry = expiresAt - now;
      const minutesUntilExpiry = Math.floor(timeUntilExpiry / 60000);

      console.log(`[auth-refresh] Token expires in ${minutesUntilExpiry} minutes`);

      // Refresh if less than 5 minutes until expiry
      if (timeUntilExpiry < 5 * 60 * 1000) {
        console.log('[auth-refresh] Token expiring soon, refreshing immediately...');
        await refreshToken();
      }
    } catch (error) {
      console.error('[auth-refresh] Error checking token expiration:', error);
    }
  };

  // Start monitoring when logged in
  watch(loggedIn, (isLoggedIn) => {
    if (isLoggedIn) {
      console.log('[auth-refresh] Starting token refresh monitoring');

      // Check immediately on login
      checkAndRefreshToken();

      // Check every minute for expiration
      if (!checkInterval) {
        checkInterval = setInterval(checkAndRefreshToken, 60 * 1000); // Check every minute
      }

      // Proactively refresh every 10 minutes to keep session alive
      if (!proactiveRefreshInterval) {
        proactiveRefreshInterval = setInterval(() => {
          console.log('[auth-refresh] Proactive refresh (10-minute interval)');
          refreshToken();
        }, 10 * 60 * 1000); // Refresh every 10 minutes
      }
    } else {
      // Stop monitoring when logged out
      console.log('[auth-refresh] Stopping token refresh monitoring');

      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }

      if (proactiveRefreshInterval) {
        clearInterval(proactiveRefreshInterval);
        proactiveRefreshInterval = null;
      }
    }
  }, { immediate: true });

  // Cleanup on app unmount
  if (import.meta.client) {
    window.addEventListener('beforeunload', () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      if (proactiveRefreshInterval) {
        clearInterval(proactiveRefreshInterval);
      }
    });
  }
});

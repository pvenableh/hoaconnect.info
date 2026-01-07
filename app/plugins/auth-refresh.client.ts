/**
 * Auto-refresh plugin for authentication tokens
 *
 * This plugin monitors the user's session and automatically refreshes
 * the access token to keep users logged in indefinitely.
 *
 * Behavior:
 * - Proactively refreshes token every 10 minutes
 * - Also checks token expiration and refreshes if less than 5 minutes remain
 * - Refreshes token when user returns to tab (visibility change)
 * - Handles errors gracefully and redirects to login if refresh fails
 * - Keeps users logged in even when idle
 */

// Enable debug logging only in development
const DEBUG = process.env.NODE_ENV !== 'production';
const log = (message: string) => DEBUG && console.log(`[auth-refresh] ${message}`);

export default defineNuxtPlugin(() => {
  const { loggedIn, fetch: fetchSession, clear, session } = useUserSession();
  const router = useRouter();

  let checkInterval: ReturnType<typeof setInterval> | null = null;
  let proactiveRefreshInterval: ReturnType<typeof setInterval> | null = null;
  let isRefreshing = false;
  let visibilityHandler: (() => void) | null = null;
  let initialCheckTimeout: ReturnType<typeof setTimeout> | null = null;

  // Track if we're in the initial login transition to avoid redundant fetches
  const isInitialLoginTransition = ref(false);

  const refreshToken = async () => {
    if (isRefreshing) return;

    try {
      isRefreshing = true;
      log('Refreshing token...');

      const response = await $fetch('/api/auth/refresh', {
        method: 'POST',
      });

      if (response.success) {
        log('Token refreshed successfully');
        await fetchSession();
      } else {
        throw new Error('Token refresh failed');
      }
    } catch (error) {
      console.error('[auth-refresh] Failed to refresh token:', error);
      await clear();
      await router.push('/auth/login');
    } finally {
      isRefreshing = false;
    }
  };

  const checkAndRefreshToken = async () => {
    if (!loggedIn.value) return;

    try {
      await fetchSession();
      const expiresAt = session.value?.expiresAt;

      if (!expiresAt) {
        // Trigger refresh to establish expiration time
        await refreshToken();
        return;
      }

      const timeUntilExpiry = expiresAt - Date.now();

      // Refresh if less than 5 minutes until expiry
      if (timeUntilExpiry < 5 * 60 * 1000) {
        log('Token expiring soon, refreshing...');
        await refreshToken();
      }
    } catch (error) {
      console.error('[auth-refresh] Error checking token:', error);
    }
  };

  // Start monitoring when logged in
  watch(loggedIn, (isLoggedIn, wasLoggedIn) => {
    if (isLoggedIn) {
      log('Starting token refresh monitoring');

      if (initialCheckTimeout) {
        clearTimeout(initialCheckTimeout);
        initialCheckTimeout = null;
      }

      const isNewLogin = !wasLoggedIn;
      if (isNewLogin) {
        isInitialLoginTransition.value = true;
        initialCheckTimeout = setTimeout(() => {
          isInitialLoginTransition.value = false;
          checkAndRefreshToken();
        }, 3000);
      } else {
        checkAndRefreshToken();
      }

      // Check every minute for expiration
      if (!checkInterval) {
        checkInterval = setInterval(checkAndRefreshToken, 60 * 1000);
      }

      // Proactively refresh every 10 minutes
      if (!proactiveRefreshInterval) {
        proactiveRefreshInterval = setInterval(refreshToken, 10 * 60 * 1000);
      }

      // Refresh on tab visibility change
      if (!visibilityHandler) {
        visibilityHandler = () => {
          if (document.visibilityState === 'visible' && loggedIn.value && !isInitialLoginTransition.value) {
            checkAndRefreshToken();
          }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
      }
    } else {
      log('Stopping token refresh monitoring');

      if (initialCheckTimeout) {
        clearTimeout(initialCheckTimeout);
        initialCheckTimeout = null;
      }

      if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
      }

      if (proactiveRefreshInterval) {
        clearInterval(proactiveRefreshInterval);
        proactiveRefreshInterval = null;
      }

      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = null;
      }

      isInitialLoginTransition.value = false;
    }
  }, { immediate: true });

  // Cleanup on app unmount
  if (import.meta.client) {
    window.addEventListener('beforeunload', () => {
      if (initialCheckTimeout) clearTimeout(initialCheckTimeout);
      if (checkInterval) clearInterval(checkInterval);
      if (proactiveRefreshInterval) clearInterval(proactiveRefreshInterval);
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
    });
  }
});

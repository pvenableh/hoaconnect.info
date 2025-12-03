// middleware/01.cross-domain-auth.global.ts
// Handles incoming cross-domain authentication tokens early in the middleware chain
// The "01." prefix ensures this runs first among global middleware

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Only run on client side
  if (!import.meta.client) return;

  const authToken = to.query._auth_token as string | undefined;

  if (!authToken) {
    return;
  }

  console.log('[cross-domain-auth] Found auth token, verifying...');

  try {
    // Verify the token and establish session
    const result = await $fetch('/api/auth/cross-domain-verify', {
      method: 'POST',
      body: { token: authToken },
    });

    if (result?.success) {
      console.log('[cross-domain-auth] Session established successfully');

      // Refresh the user session state
      const { fetch: fetchSession } = useUserSession();
      await fetchSession();

      // Build clean path without the auth token
      const cleanQuery = { ...to.query };
      delete cleanQuery._auth_token;

      // Redirect to the same path without the token
      return navigateTo({
        path: to.path,
        query: Object.keys(cleanQuery).length > 0 ? cleanQuery : undefined,
        hash: to.hash,
      }, { replace: true });
    }
  } catch (error) {
    console.error('[cross-domain-auth] Failed to verify token:', error);

    // Remove invalid token from URL and continue
    const cleanQuery = { ...to.query };
    delete cleanQuery._auth_token;

    return navigateTo({
      path: to.path,
      query: Object.keys(cleanQuery).length > 0 ? cleanQuery : undefined,
      hash: to.hash,
    }, { replace: true });
  }
});

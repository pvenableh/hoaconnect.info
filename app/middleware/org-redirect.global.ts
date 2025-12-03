// middleware/org-redirect.global.ts
// Redirects logged-in users from main pages to their organization's slug path or custom domain
// Skips redirect on home page to allow viewing main domain marketing content

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Only run on client side
  if (!import.meta.client) return;

  const { loggedIn } = useUserSession();

  // Skip if not logged in
  if (!loggedIn.value) return;

  // Skip redirect for auth pages, setup pages, and other public routes
  const skipPaths = [
    '/auth/',
    '/setup',
    '/api/',
  ];

  if (skipPaths.some(path => to.path.startsWith(path))) {
    return;
  }

  // Skip redirect on home page - allow logged-in users to view main domain
  if (to.path === '/') {
    return;
  }

  // Skip if already on a slug route (org page)
  if (to.params.slug) {
    return;
  }

  // Get user's selected organization
  try {
    const { currentOrg } = await useSelectedOrg();

    if (!currentOrg.value?.organization) {
      // User has no organization, let them stay on main pages
      return;
    }

    const org = currentOrg.value.organization;

    if (!org.slug) {
      // No valid slug to redirect to
      return;
    }

    // Check if organization has a verified custom domain
    if (org.custom_domain && org.domain_verified) {
      const currentHost = window.location.hostname;

      // Only redirect if we're not already on the custom domain
      if (currentHost !== org.custom_domain) {
        const targetPath = to.path === '/' ? '' : to.path;
        const protocol = window.location.protocol;

        // Generate cross-domain auth token before redirecting
        try {
          const tokenResponse = await $fetch('/api/auth/cross-domain-token', {
            method: 'POST',
            body: { targetDomain: org.custom_domain },
          });

          // Build URL with auth token for session transfer
          const customDomainUrl = new URL(`${protocol}//${org.custom_domain}${targetPath}`);
          if (tokenResponse?.token) {
            customDomainUrl.searchParams.set('_auth_token', tokenResponse.token);
          }

          console.log('[org-redirect] Redirecting to custom domain with auth token');
          return navigateTo(customDomainUrl.toString(), { external: true });
        } catch (tokenError) {
          // If token generation fails, redirect anyway (user will need to re-login)
          console.warn('[org-redirect] Failed to generate cross-domain token:', tokenError);
          const customDomainUrl = `${protocol}//${org.custom_domain}${targetPath}`;
          return navigateTo(customDomainUrl, { external: true });
        }
      }

      // Already on custom domain, no redirect needed
      return;
    }

    // No custom domain, redirect to the org's slug path
    // Preserve the current path under the org slug
    const targetPath = to.path === '/' ? `/${org.slug}` : `/${org.slug}${to.path}`;
    return navigateTo(targetPath);
  } catch (error) {
    // If there's an error fetching org data, don't redirect
    console.error('[org-redirect] Error fetching organization:', error);
    return;
  }
});

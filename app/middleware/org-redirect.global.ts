// middleware/org-redirect.global.ts
// Redirects logged-in users from main domain to their organization's domain

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Only run on client side
  if (!import.meta.client) return;

  const { loggedIn } = useUserSession();
  const config = useRuntimeConfig();

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

  // Get current domain
  const currentDomain = window.location.hostname;

  // Define main domains
  const mainDomains = [
    config.public.mainDomain,
    `www.${config.public.mainDomain}`,
    'localhost',
    '127.0.0.1',
  ];

  // Only redirect if on main domain
  const isOnMainDomain = mainDomains.includes(currentDomain);
  if (!isOnMainDomain) return;

  // Get user's selected organization
  try {
    const { currentOrg } = await useSelectedOrg();

    if (!currentOrg.value?.organization) {
      // User has no organization, let them stay on main domain
      return;
    }

    const org = currentOrg.value.organization;

    // Build the target URL
    let targetDomain: string;

    if (org.custom_domain && org.domain_verified) {
      // Use verified custom domain
      targetDomain = org.custom_domain;
    } else if (org.slug) {
      // Use slug subdomain
      targetDomain = `${org.slug}.${config.public.mainDomain}`;
    } else {
      // No valid domain to redirect to
      return;
    }

    // Don't redirect if already on target domain (shouldn't happen, but safety check)
    if (currentDomain === targetDomain) return;

    // Build the full redirect URL preserving the path
    const protocol = window.location.protocol;
    const port = window.location.port;
    const portSuffix = port && port !== '80' && port !== '443' ? `:${port}` : '';

    // For localhost development, use port for subdomain simulation
    let redirectUrl: string;
    if (currentDomain === 'localhost' || currentDomain === '127.0.0.1') {
      // In development, we can't actually redirect to subdomains
      // Instead, redirect to the slug page within the app
      return navigateTo(`/${org.slug}${to.path === '/' ? '' : to.path}`);
    } else {
      redirectUrl = `${protocol}//${targetDomain}${portSuffix}${to.fullPath}`;
    }

    // Perform external redirect
    return navigateTo(redirectUrl, { external: true });
  } catch (error) {
    // If there's an error fetching org data, don't redirect
    console.error('[org-redirect] Error fetching organization:', error);
    return;
  }
});

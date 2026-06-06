// middleware/org-redirect.global.ts
// Redirects logged-in users from main pages to their organization's slug path

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Only run on client side
  if (!import.meta.client) return;

  const { loggedIn } = useUserSession();

  // Skip if not logged in
  if (!loggedIn.value) return;

  // Skip redirect for auth pages, setup pages, account page, and other public routes
  // Account page lives on main domain since user accounts are user-specific, not org-specific
  const skipPaths = [
    '/auth/',
    '/setup',
    '/api/',
    '/account',
    '/ui-kit', // design system showcase (main-domain, no org context)
  ];

  if (skipPaths.some(path => to.path.startsWith(path))) {
    return;
  }

  // Marketing split: the app root no longer shows platform marketing, so we no
  // longer skip '/' for logged-in users — fall through and redirect them to
  // their org's slug path like any other non-slug route
  // (docs/plan-marketing-split.md §3.2). The index.vue page middleware handles
  // logged-out visitors (and SSR, where this client-only middleware doesn't run).

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

    // Skip if path already starts with the org slug (prevent redirect loop)
    if (to.path.startsWith(`/${org.slug}/`) || to.path === `/${org.slug}`) {
      return;
    }

    // Redirect to the org's slug path
    // Preserve the current path under the org slug
    const targetPath = to.path === '/' ? `/${org.slug}` : `/${org.slug}${to.path}`;
    return navigateTo(targetPath);
  } catch (error) {
    // If there's an error fetching org data, don't redirect
    console.error('[org-redirect] Error fetching organization:', error);
    return;
  }
});

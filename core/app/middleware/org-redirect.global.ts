// middleware/org-redirect.global.ts
// Redirects logged-in users from main pages to their organization's slug path

import { isMarketingHost } from "#core/shared/domains/host";

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Only run on client side
  if (!import.meta.client) return;

  const { loggedIn } = useUserSession();

  // Skip if not logged in
  if (!loggedIn.value) return;

  // Skip on custom domains. The host dictates the tenant there; redirecting to
  // the user's SELECTED org slug would render a different tenant's content on
  // this domain (e.g. 605lincolnroad.com/1033-lenox). domain-detector.global
  // sets isCustomDomain from the request Host before this middleware runs.
  const isCustomDomain = useState<boolean>("isCustomDomain", () => false);
  if (isCustomDomain.value) return;

  // Skip on the marketing host. Its apex is the platform's public front door and
  // is served by this same deployment, so without this a signed-in visitor could
  // never reach hoaconnect.info — they'd be bounced straight into their org, and
  // the org lookup would churn on every marketing page view.
  const host = import.meta.client
    ? window.location.host
    : useRequestURL({ xForwardedHost: true }).host;
  if (isMarketingHost(host, useRuntimeConfig().public.mainDomain)) return;

  // Skip redirect for auth pages, setup pages, account page, and other public routes
  // Account page lives on main domain since user accounts are user-specific, not org-specific
  const skipPaths = [
    '/auth/',
    '/setup',
    '/api/',
    '/account',
    '/ui-kit', // design system showcase (main-domain, no org context)
    '/approve', // public tokenized milestone-approval link
    // Main-domain billing screens. Both are reached by a logged-in user WITH a
    // selected org, so without these they get slug-prefixed into 404s — and the
    // subscription middleware's own redirect target was one of them, which made
    // the blocked-subscription screen unreachable by the exact users it exists
    // for. Found by walking a real transition into its grace window.
    '/subscription-expired',
    '/settings/subscription',
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

    // Redirect to the org's slug path. The clean org root IS the dashboard, so
    // the slug-agnostic `/` and `/dashboard` entry points both collapse to it
    // (no `/{slug}/dashboard` — that route no longer exists).
    const targetPath =
      to.path === '/' || to.path === '/dashboard'
        ? `/${org.slug}`
        : `/${org.slug}${to.path}`;
    return navigateTo(targetPath);
  } catch (error) {
    // If there's an error fetching org data, don't redirect
    console.error('[org-redirect] Error fetching organization:', error);
    return;
  }
});

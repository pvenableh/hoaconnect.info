// middleware/org-redirect.global.ts
// Redirects logged-in users from main pages to their organization's slug path

import { isMarketingHost } from "#core/shared/domains/host";
import { sessionOrgRedirect } from "#core/shared/domains/org-routes";

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

    // One shared description of the page tree decides this — the same one the
    // custom-domain middleware reads. It returns null for "leave this route
    // alone", which covers the org's own slug (so this can't loop), the
    // platform's own pages, and anything with no org twin.
    //
    // This used to be a denylist that prefixed every unlisted path with the
    // slug, which meant a main-domain page with no `/{slug}` twin became a 404
    // for every signed-in user who had an org. `/organizations`, `/members` and
    // `/units` were all reachable-then-broken that way. An allowlist fails the
    // other direction: forget to add a page and it simply does not redirect.
    const targetPath = sessionOrgRedirect(to.path, org.slug);
    if (!targetPath || targetPath === to.path) return;
    return navigateTo(targetPath);
  } catch (error) {
    // If there's an error fetching org data, don't redirect
    console.error('[org-redirect] Error fetching organization:', error);
    return;
  }
});

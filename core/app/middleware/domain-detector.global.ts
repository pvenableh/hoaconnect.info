// middleware/domain-detector.global.ts
// Detects path-based slugs to load organization context, and flags whether the
// current request arrived on one of the org's own verified custom domains
// (e.g. 605lincolnroad.com) rather than the main app host.
//
// `isCustomDomain` is derived from the request HOST ONLY — never from the route
// or from whether an org is loaded. app.hoaconnect.info/605-lincoln is the main
// host serving a slug, NOT a custom domain, and callers that conflate the two
// end up doing cross-domain navigations for in-app links.
import { orgScopedRedirect } from "#core/shared/domains/org-routes";

export default defineNuxtRouteMiddleware(async (to) => {
  const { activeHoa, fetchActiveHoa, clearActiveHoa } = useActiveHoa();
  const isCustomDomainState = useState("isCustomDomain", () => false);

  // Resolve the request Host once — used both by the custom-domain slug guard
  // below and to decide main host vs custom domain for the no-slug root.
  const host = (
    import.meta.client
      ? window.location.host
      : useRequestURL({ xForwardedHost: true }).host
  )
    .toLowerCase()
    .replace(/:\d+$/, "");
  const md = (useRuntimeConfig().public.mainDomain as string | undefined)
    ?.toLowerCase()
    ?.replace(/:\d+$/, "");

  const isMainHost =
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    !md ||
    host === md ||
    host === `www.${md}` ||
    host.endsWith(`.${md}`);

  // Set before any early return, so every route (including reserved slugs)
  // sees a host-accurate flag.
  isCustomDomainState.value = !isMainHost;

  // Slug route (e.g. /my-org or /my-org/dashboard) — load org context.
  const slug = to.params.slug as string | undefined;
  if (slug) {
    const reserved = ["www", "app", "api", "admin"];
    if (reserved.includes(slug)) return;

    // Tenant isolation: a verified CUSTOM DOMAIN may only serve its own org's
    // slug. If the route slug isn't the host's bound org, redirect to that
    // domain's own org root — one tenant's content must never render on
    // another's domain (e.g. 605lincolnroad.com/1033-lenox). The main app host
    // serves every slug. Runs SSR + client, so the redirect happens with no
    // content flash. Fails open if the host can't be resolved.
    if (!isMainHost) {
      const bound = await $fetch<{ slug?: string } | null>("/api/hoa/by-domain", {
        query: { host },
      }).catch(() => null);
      if (bound?.slug && bound.slug !== slug) {
        return navigateTo(`/${bound.slug}`, { replace: true });
      }
    }

    if (!activeHoa.value || activeHoa.value.slug !== slug) {
      await fetchActiveHoa(slug);
    }
    return;
  }

  // No slug. On the main app host there's no org context to keep; on a custom
  // domain the clean root (e.g. www.605lincolnroad.com/) must NOT be treated as
  // the main app host (which would redirect it to login) — index.vue resolves
  // the org by host and renders its public landing.
  if (isMainHost) {
    if (activeHoa.value) clearActiveHoa();
  } else {
    // Custom domain on a non-root, non-slug route (e.g. 605lincolnroad.com/auth/login).
    // The root would have been rewritten to /{slug} (handled above), but auth
    // pages aren't — so resolve the org by host to give branding (the auth
    // shell, etc.) the tenant's identity instead of the generic HOA Connect mark.
    //
    // On a custom domain activeHoa is ALWAYS the host's org: the slug branch
    // above bounces a foreign slug before it can load, and this branch only ever
    // resolves by host. So its slug is a safe stand-in for the host org, and
    // skipping the lookup when it's already loaded keeps client-side navigation
    // off the network.
    let hostSlug = activeHoa.value?.slug ?? null;
    if (!hostSlug) {
      try {
        const resolved = await $fetch<{ slug?: string } | null>(
          "/api/hoa/by-domain",
          { query: { host } }
        );
        hostSlug = resolved?.slug ?? null;
        if (hostSlug) await fetchActiveHoa(hostSlug);
      } catch {
        // Unmatched/unverified host — leave activeHoa null; branding falls back.
      }
    }

    // Pull the org-scoped top-level routes onto the host's org. Without this a
    // custom domain renders the HOST org's branding around the SESSION's
    // selected-org data — /admin/members on 605lincolnroad.com showing 605
    // Lincoln in the meta and Harborview in the payload. Not a leak, but the
    // page misrepresents which community it is. Paths with no org meaning
    // (/auth/*, /account, /billing/*) return null and stay put; so does a path
    // already on this slug, so this can't loop. Runs SSR + client, so the
    // redirect happens with no content flash.
    const scoped = orgScopedRedirect(to.path, hostSlug);
    if (scoped) {
      return navigateTo(
        { path: scoped, query: to.query, hash: to.hash },
        { replace: true }
      );
    }
  }
});

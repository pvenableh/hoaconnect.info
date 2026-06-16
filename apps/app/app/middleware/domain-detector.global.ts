// middleware/domain-detector.global.ts
// Detects path-based slugs to load organization context, and flags whether the
// current request is on the main app host vs a custom domain. index.vue's root
// uses isMainDomain to decide between "redirect into the app" (main host) and
// "render the org public landing" (custom domain).
export default defineNuxtRouteMiddleware(async (to) => {
  const { activeHoa, fetchActiveHoa, clearActiveHoa } = useActiveHoa();
  const isMainDomainState = useState("isMainDomain", () => true);

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
    isMainDomainState.value = false;
    return;
  }

  // No slug. Decide main host vs custom domain from the request Host, so the
  // custom-domain clean root (e.g. www.605lincolnroad.com/) is NOT treated as
  // the main app host (which would redirect it to login). index.vue then
  // resolves the org by host and renders its public landing.
  if (isMainHost) {
    if (activeHoa.value) clearActiveHoa();
    isMainDomainState.value = true;
  } else {
    isMainDomainState.value = false;
    // Custom domain on a non-root, non-slug route (e.g. 605lincolnroad.com/auth/login).
    // The root would have been rewritten to /{slug} (handled above), but auth
    // pages aren't — so resolve the org by host to give branding (the auth
    // shell, etc.) the tenant's identity instead of the generic HOA Connect mark.
    if (!activeHoa.value) {
      try {
        const resolved = await $fetch<{ slug?: string } | null>(
          "/api/hoa/by-domain",
          { query: { host } }
        );
        if (resolved?.slug) await fetchActiveHoa(resolved.slug);
      } catch {
        // Unmatched/unverified host — leave activeHoa null; branding falls back.
      }
    }
  }
});

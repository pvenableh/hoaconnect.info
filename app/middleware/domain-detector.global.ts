// middleware/domain-detector.global.ts
// Detects path-based slugs to load organization context, and flags whether the
// current request is on the main app host vs a custom domain. index.vue's root
// uses isMainDomain to decide between "redirect into the app" (main host) and
// "render the org public landing" (custom domain).
export default defineNuxtRouteMiddleware(async (to) => {
  const { activeHoa, fetchActiveHoa, clearActiveHoa } = useActiveHoa();
  const isMainDomainState = useState("isMainDomain", () => true);

  // Slug route (e.g. /my-org or /my-org/dashboard) — load org context.
  const slug = to.params.slug as string | undefined;
  if (slug) {
    const reserved = ["www", "app", "api", "admin"];
    if (reserved.includes(slug)) return;
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

  if (isMainHost) {
    if (activeHoa.value) clearActiveHoa();
    isMainDomainState.value = true;
  } else {
    isMainDomainState.value = false;
  }
});

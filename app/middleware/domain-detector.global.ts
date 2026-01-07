// middleware/domain-detector.global.ts
// Detects custom domains and path-based slugs to load organization context
// Performance optimized with early returns and cached state

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Early return: Skip for static assets and API routes
  const path = to.path;
  if (path.startsWith("/_nuxt/") || path.startsWith("/api/") || path.includes(".")) {
    return;
  }

  const { activeHoa, fetchActiveHoa, fetchActiveHoaByDomain, clearActiveHoa } = useActiveHoa();
  const config = useRuntimeConfig();

  // Check if we're on a slug route (e.g., /my-org or /my-org/dashboard)
  const slug = to.params.slug as string | undefined;

  // Cache hostname detection result in state to avoid repeated computation
  const hostnameState = useState<string>("currentHostname", () => "");
  const isCustomDomainState = useState("isCustomDomain", () => false);
  const isMainDomainState = useState("isMainDomain", () => true);

  // Only compute hostname if not already cached or on first load
  let currentHostname = hostnameState.value;
  if (!currentHostname) {
    if (import.meta.server) {
      const event = useRequestEvent();
      const host = event?.node?.req?.headers?.host || "";
      currentHostname = host.split(":")[0];
    } else if (import.meta.client) {
      currentHostname = window.location.hostname;
    }
    hostnameState.value = currentHostname;
  }

  // Early return: Skip domain detection if no hostname
  if (!currentHostname) {
    return;
  }

  // Determine if we're on a custom domain (not the main domain)
  const mainDomain = config.public.mainDomain || "";
  let isOnCustomDomain = false;

  if (mainDomain) {
    const normalizedHostname = currentHostname.replace(/^www\./, "");
    const normalizedMainDomain = mainDomain.replace(/^www\./, "");
    isOnCustomDomain = normalizedHostname !== normalizedMainDomain && normalizedHostname !== "localhost";
  }

  // Handle custom domain detection
  if (isOnCustomDomain && !slug) {
    // Early return: Skip fetch if already loaded for this domain
    if (activeHoa.value?.custom_domain === currentHostname) {
      isMainDomainState.value = false;
      isCustomDomainState.value = true;
      return;
    }

    await fetchActiveHoaByDomain(currentHostname);
    isMainDomainState.value = false;
    isCustomDomainState.value = true;
    return;
  }

  // Handle slug-based routing
  if (slug) {
    // Early return: Skip fetch if already loaded for this slug
    if (activeHoa.value?.slug === slug) {
      isMainDomainState.value = false;
      isCustomDomainState.value = false;
      return;
    }

    await fetchActiveHoa(slug);
    isMainDomainState.value = false;
    isCustomDomainState.value = false;
    return;
  }

  // On main domain without slug - clear active HOA if set
  if (!isOnCustomDomain && !slug && activeHoa.value) {
    clearActiveHoa();
  }

  // Set isMainDomain state to true when on main domain without slug
  isMainDomainState.value = true;
  isCustomDomainState.value = false;
});

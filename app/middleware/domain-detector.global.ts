// middleware/domain-detector.global.ts
// Detects custom domains and path-based slugs to load organization context
export default defineNuxtRouteMiddleware(async (to, from) => {
  const { activeHoa, fetchActiveHoa, fetchActiveHoaByDomain, clearActiveHoa } = useActiveHoa();
  const config = useRuntimeConfig();

  // Check if we're on a slug route (e.g., /my-org or /my-org/dashboard)
  const slug = to.params.slug as string | undefined;

  // Detect custom domain by comparing hostname to main domain
  let isOnCustomDomain = false;
  let currentHostname = "";

  if (import.meta.server) {
    // Server-side: get hostname from request headers
    const event = useRequestEvent();
    const host = event?.node?.req?.headers?.host || "";
    currentHostname = host.split(":")[0]; // Remove port if present
  } else if (import.meta.client) {
    // Client-side: get hostname from window.location
    currentHostname = window.location.hostname;
  }

  // Determine if we're on a custom domain (not the main domain)
  const mainDomain = config.public.mainDomain || "";
  if (currentHostname && mainDomain) {
    // Check if hostname is different from main domain
    // Account for www prefix variations
    const normalizedHostname = currentHostname.replace(/^www\./, "");
    const normalizedMainDomain = mainDomain.replace(/^www\./, "");
    isOnCustomDomain = normalizedHostname !== normalizedMainDomain && normalizedHostname !== "localhost";
  }

  // Handle custom domain detection
  if (isOnCustomDomain && !slug) {
    // On a custom domain without a slug - fetch organization by domain
    if (!activeHoa.value || activeHoa.value.custom_domain !== currentHostname) {
      await fetchActiveHoaByDomain(currentHostname);
    }
    // Update state to reflect we're not on main domain
    const isMainDomainState = useState("isMainDomain", () => false);
    isMainDomainState.value = false;
    const isCustomDomainState = useState("isCustomDomain", () => true);
    isCustomDomainState.value = true;
    return;
  }

  // Handle slug-based routing
  if (slug) {
    // Fetch HOA by slug if we don't have it loaded or it's a different org
    if (!activeHoa.value || activeHoa.value.slug !== slug) {
      await fetchActiveHoa(slug);
    }
    // Set isMainDomain state based on whether we're on a slug route
    const isMainDomainState = useState("isMainDomain", () => false);
    isMainDomainState.value = false;
    const isCustomDomainState = useState("isCustomDomain", () => false);
    isCustomDomainState.value = false;
    return;
  }

  // On main domain without slug - clear active HOA if set
  if (!isOnCustomDomain && !slug && activeHoa.value) {
    clearActiveHoa();
  }

  // Set isMainDomain state to true when on main domain without slug
  const isMainDomainState = useState("isMainDomain", () => true);
  isMainDomainState.value = true;
  const isCustomDomainState = useState("isCustomDomain", () => false);
  isCustomDomainState.value = false;
});

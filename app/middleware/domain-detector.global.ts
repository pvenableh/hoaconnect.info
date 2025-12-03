// middleware/domain-detector.global.ts
// Simplified middleware - uses path-based routing instead of subdomains
export default defineNuxtRouteMiddleware(async (to, from) => {
  const { activeHoa, fetchActiveHoa, clearActiveHoa } = useActiveHoa();

  // Check if we're on a slug route (e.g., /my-org or /my-org/dashboard)
  const slug = to.params.slug as string | undefined;

  // Only fetch HOA data on client side for slug routes
  if (import.meta.client && slug) {
    // Fetch HOA by slug if we don't have it loaded or it's a different org
    if (!activeHoa.value || activeHoa.value.slug !== slug) {
      await fetchActiveHoa(slug);
    }
  } else if (import.meta.client && !slug && activeHoa.value) {
    // Clear active HOA when navigating away from org pages
    clearActiveHoa();
  }

  // Set isMainDomain state based on whether we're on a slug route
  const isMainDomainState = useState("isMainDomain", () => !slug);
  isMainDomainState.value = !slug;
});

// middleware/domain-detector.global.ts
// Detects path-based slugs to load organization context (subdomain-only)
export default defineNuxtRouteMiddleware(async (to, from) => {
  const { activeHoa, fetchActiveHoa, clearActiveHoa } = useActiveHoa();

  // Check if we're on a slug route (e.g., /my-org or /my-org/dashboard)
  const slug = to.params.slug as string | undefined;

  // Handle slug-based routing
  if (slug) {
    // Guard against reserved subdomains
    const reserved = ['www', 'app', 'api', 'admin'];
    if (reserved.includes(slug)) return;

    // Fetch HOA by slug if we don't have it loaded or it's a different org
    if (!activeHoa.value || activeHoa.value.slug !== slug) {
      await fetchActiveHoa(slug);
    }
    // Set isMainDomain state based on whether we're on a slug route
    const isMainDomainState = useState("isMainDomain", () => false);
    isMainDomainState.value = false;
    return;
  }

  // On main domain without slug - clear active HOA if set
  if (!slug && activeHoa.value) {
    clearActiveHoa();
  }

  // Set isMainDomain state to true when on main domain without slug
  const isMainDomainState = useState("isMainDomain", () => true);
  isMainDomainState.value = true;
});

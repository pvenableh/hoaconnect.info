// middleware/domain-detector.global.ts
export default defineNuxtRouteMiddleware(async (to, from) => {
  const config = useRuntimeConfig();
  const { activeHoa, fetchActiveHoa } = useActiveHoa();

  // Get domain from server or client
  const domain = import.meta.server
    ? useRequestURL().hostname
    : window.location.hostname;

  // Check if main domain
  const mainDomains = [
    config.public.mainDomain,
    `www.${config.public.mainDomain}`,
    "localhost",
    "127.0.0.1",
  ];

  const isMainDomain = mainDomains.includes(domain);

  // Store domain type (set on both server and client for proper SSR)
  const isMainDomainState = useState("isMainDomain", () => isMainDomain);
  isMainDomainState.value = isMainDomain;

  // Only fetch HOA data on client side
  if (import.meta.client) {
    // Check if it's a subdomain of main domain (e.g., myorg.property.huestudios.com)
    const isSubdomainOfMain =
      !isMainDomain &&
      config.public.mainDomain &&
      domain.endsWith(`.${config.public.mainDomain}`);

    // Fetch HOA if custom domain or subdomain
    if (!isMainDomain && !activeHoa.value) {
      let slug = null;

      // Extract slug from subdomain if applicable
      if (isSubdomainOfMain) {
        slug = domain.replace(`.${config.public.mainDomain}`, "");
      }

      await fetchActiveHoa(slug);

      // Redirect to main if no HOA found
      if (!activeHoa.value) {
        return navigateTo(`https://${config.public.mainDomain}`, {
          external: true,
        });
      }
    }
  }
});

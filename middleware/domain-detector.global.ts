// middleware/domain-detector.global.ts
export default defineNuxtRouteMiddleware(async (to, from) => {
  // Only run on client
  if (import.meta.server) return;

  const config = useRuntimeConfig();
  const { activeHoa, fetchActiveHoa } = useActiveHoa();

  const domain = window.location.hostname;

  // Check if main domain
  const mainDomains = [
    config.public.mainDomain,
    `www.${config.public.mainDomain}`,
    "localhost",
    "127.0.0.1",
  ];

  const isMainDomain = mainDomains.includes(domain);

  // Fetch HOA if custom domain
  if (!isMainDomain && !activeHoa.value) {
    await fetchActiveHoa();

    // Redirect to main if no HOA found
    if (!activeHoa.value) {
      return navigateTo(`https://${config.public.mainDomain}`, {
        external: true,
      });
    }
  }

  // Store domain type
  useState("isMainDomain", () => isMainDomain);
});

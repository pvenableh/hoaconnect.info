// composables/useActiveHoa.ts
export const useActiveHoa = () => {
  const activeHoa = useState<any>("activeHoa", () => null);
  const isMainDomain = useState("isMainDomain", () => false);
  const isLoading = useState("hoaLoading", () => false);
  const config = useRuntimeConfig();

  const fetchActiveHoa = async (slug?: string | null) => {
    // Only fetch if we haven't already loaded
    if (activeHoa.value && !slug) {
      return activeHoa.value;
    }

    isLoading.value = true;

    // Get domain OUTSIDE the try block so it's accessible in catch
    const domain = process.server
      ? useRequestHeaders().host?.split(":")[0] || ""
      : window.location.hostname;

    try {
      // Define main domains
      const mainDomains = [
        config.public.mainDomain,
        `www.${config.public.mainDomain}`,
        "localhost",
        "127.0.0.1",
      ];

      // Check if this is the main domain
      if (mainDomains.includes(domain)) {
        isMainDomain.value = true;
        activeHoa.value = null;
        isLoading.value = false;
        return null;
      }

      // Use the unified find endpoint that handles both slug and custom domain
      const query: Record<string, string> = {};

      if (slug) {
        // If we have a slug (subdomain), use that
        query.slug = slug;
      } else {
        // Otherwise, use the full domain for custom domain lookup
        query.domain = domain;
      }

      const response = await $fetch("/api/hoa/find", {
        query,
      });

      if (response) {
        activeHoa.value = response;
        isMainDomain.value = false;
      } else {
        activeHoa.value = null;
        isMainDomain.value = true;
      }

      return activeHoa.value;
    } catch (error) {
      console.error(
        "No HOA found for",
        slug ? `slug: ${slug}` : `domain: ${domain}`
      );
      activeHoa.value = null;
      isMainDomain.value = true;
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  const clearActiveHoa = () => {
    activeHoa.value = null;
    isMainDomain.value = false;
  };

  return {
    activeHoa: computed(() => activeHoa.value),
    isMainDomain: computed(() => isMainDomain.value),
    isLoading: computed(() => isLoading.value),
    fetchActiveHoa,
    clearActiveHoa,
  };
};

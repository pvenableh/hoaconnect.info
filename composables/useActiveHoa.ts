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

      // Fetch HOA by slug or custom domain
      let response;

      if (slug) {
        // Fetch by slug (subdomain of main domain)
        response = await $fetch("/api/hoa/by-slug", {
          query: { slug },
        });
      } else {
        // Fetch by custom domain
        response = await $fetch("/api/hoa/by-domain", {
          query: { domain },
        });
      }

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

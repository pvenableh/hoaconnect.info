// composables/useActiveHoa.ts
// Supports both path-based routing (slug) and custom domain detection
export const useActiveHoa = () => {
  const activeHoa = useState<any>("activeHoa", () => null);
  const isMainDomain = useState("isMainDomain", () => true);
  const isCustomDomain = useState("isCustomDomain", () => false);
  const isLoading = useState("hoaLoading", () => false);

  const fetchActiveHoa = async (slug?: string | null) => {
    // If no slug provided, clear and return
    if (!slug) {
      activeHoa.value = null;
      isMainDomain.value = true;
      return null;
    }

    // Only fetch if we haven't already loaded this slug
    if (activeHoa.value?.slug === slug) {
      return activeHoa.value;
    }

    isLoading.value = true;

    try {
      const response = await $fetch("/api/hoa/find", {
        query: { slug },
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
      console.error("No HOA found for slug:", slug);
      activeHoa.value = null;
      isMainDomain.value = true;
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  // Fetch organization by custom domain
  const fetchActiveHoaByDomain = async (domain: string) => {
    // Only fetch if we haven't already loaded this domain
    if (activeHoa.value?.custom_domain === domain) {
      return activeHoa.value;
    }

    isLoading.value = true;

    try {
      const response = await $fetch("/api/hoa/find", {
        query: { domain },
      });

      if (response) {
        activeHoa.value = response;
        isMainDomain.value = false;
        isCustomDomain.value = true;
      } else {
        activeHoa.value = null;
        isMainDomain.value = true;
        isCustomDomain.value = false;
      }

      return activeHoa.value;
    } catch (error) {
      console.error("No HOA found for domain:", domain);
      activeHoa.value = null;
      isMainDomain.value = true;
      isCustomDomain.value = false;
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  const clearActiveHoa = () => {
    activeHoa.value = null;
    isMainDomain.value = true;
    isCustomDomain.value = false;
  };

  return {
    activeHoa: computed(() => activeHoa.value),
    isMainDomain: computed(() => isMainDomain.value),
    isCustomDomain: computed(() => isCustomDomain.value),
    isLoading: computed(() => isLoading.value),
    fetchActiveHoa,
    fetchActiveHoaByDomain,
    clearActiveHoa,
  };
};

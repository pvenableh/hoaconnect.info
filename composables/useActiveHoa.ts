// composables/useActiveHoa.ts
export const useActiveHoa = () => {
  const activeHoa = useState<any>("activeHoa", () => null);
  const isLoading = useState("hoaLoading", () => false);
  const config = useRuntimeConfig();

  const fetchActiveHoa = async () => {
    if (import.meta.client && !activeHoa.value && !isLoading.value) {
      isLoading.value = true;

      const domain = window.location.hostname;

      // Skip main domains
      const mainDomains = [
        config.public.mainDomain,
        `www.${config.public.mainDomain}`,
        "localhost",
        "127.0.0.1",
      ];

      if (mainDomains.includes(domain)) {
        isLoading.value = false;
        return null;
      }

      // Fetch HOA by domain
      try {
        const response = await $fetch("/api/hoa/by-domain", {
          query: { domain },
        });
        activeHoa.value = response;
      } catch (error) {
        console.error("No HOA found for domain:", domain);
        activeHoa.value = null;
      } finally {
        isLoading.value = false;
      }
    }

    return activeHoa.value;
  };

  const clearActiveHoa = () => {
    activeHoa.value = null;
  };

  return {
    activeHoa: computed(() => activeHoa.value),
    isLoading: computed(() => isLoading.value),
    fetchActiveHoa,
    clearActiveHoa,
  };
};

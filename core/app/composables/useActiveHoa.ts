// composables/useActiveHoa.ts
// Supports path-based routing (slug) for organization context
export const useActiveHoa = () => {
  const activeHoa = useState<any>("activeHoa", () => null);
  const isMainDomain = useState("isMainDomain", () => true);
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

  const clearActiveHoa = () => {
    activeHoa.value = null;
    isMainDomain.value = true;
  };

  /**
   * Shallow-merge fresh fields into the cached active org so anything reading
   * `activeHoa` (the dock, nav, module gates) updates without a route change or
   * reload. No-op when no org is loaded; ignored when `patch.id` names a
   * different org than the one in context. Pass only the fields you changed —
   * merging a whole settings-page payload could clobber server-side expansions.
   */
  const patchActiveHoa = (patch: Record<string, any> | null | undefined) => {
    if (!patch || !activeHoa.value) return;
    if (patch.id && activeHoa.value.id && patch.id !== activeHoa.value.id) return;
    activeHoa.value = { ...activeHoa.value, ...patch };
  };

  return {
    activeHoa: computed(() => activeHoa.value),
    isMainDomain: computed(() => isMainDomain.value),
    isLoading: computed(() => isLoading.value),
    fetchActiveHoa,
    clearActiveHoa,
    patchActiveHoa,
  };
};

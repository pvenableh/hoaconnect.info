// core/app/composables/useBoundOrg.ts
// Single-building binding for bespoke apps. A bespoke site serves exactly ONE
// organization, identified by NUXT_PUBLIC_ORG_SLUG (runtimeConfig.public
// .lockedOrgSlug). There is no org-picker: this composable resolves that one org
// (public, no auth needed) by reusing the same /api/hoa/find route the
// multi-tenant app uses for slug routing.
//
// In the multi-tenant app (apps/app) lockedOrgSlug is empty, so `isBound` is
// false and nothing here changes existing behavior — apps/app never calls it.
export const useBoundOrg = () => {
  const config = useRuntimeConfig();
  const boundSlug = (config.public.lockedOrgSlug as string) || "";
  const { activeHoa, fetchActiveHoa } = useActiveHoa();

  const isBound = computed(() => !!boundSlug);

  /**
   * Resolve and cache the bound org. Falls back to resolving by the request
   * Host (custom domain) when no slug is configured, so a bespoke app can be
   * bound either by env (NUXT_PUBLIC_ORG_SLUG) or purely by its domain.
   * Returns null when neither yields an org.
   */
  const ensure = async () => {
    if (boundSlug) {
      if (activeHoa.value?.slug === boundSlug) return activeHoa.value;
      return await fetchActiveHoa(boundSlug);
    }
    // No explicit slug — resolve by domain (custom-domain bespoke deploy).
    if (activeHoa.value) return activeHoa.value;
    try {
      const byDomain = await $fetch("/api/hoa/by-domain");
      if (byDomain?.slug) return await fetchActiveHoa(byDomain.slug);
    } catch {
      // No domain binding available (e.g. localhost without slug) — caller
      // should set NUXT_PUBLIC_ORG_SLUG for local dev.
    }
    return null;
  };

  return {
    boundSlug,
    isBound,
    org: activeHoa,
    ensure,
  };
};

// Composable for organization-aware navigation
// Handles path generation that respects org slug context and custom domains

export const useOrgNavigation = () => {
  const route = useRoute();
  const { isCustomDomain } = useActiveHoa();

  // Get current org slug from route params
  const orgSlug = computed(() => route.params.slug as string | undefined);

  // Check if we're currently in an org-scoped route
  // On custom domains, we're always in org context even without a slug in the URL
  const isOrgRoute = computed(() => !!orgSlug.value || isCustomDomain.value);

  /**
   * Build an org-aware path
   * On custom domains: paths don't need slug prefix (domain IS the org context)
   * On main domain with slug route: prefix paths with the org slug
   * Otherwise: return the path as-is
   */
  const buildOrgPath = (path: string): string => {
    // On custom domains, never add slug prefix - the domain is the org context
    if (isCustomDomain.value) {
      // Ensure path starts with /
      return path.startsWith('/') ? path : `/${path}`;
    }

    if (!orgSlug.value) {
      return path;
    }

    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    // Don't double-prefix if path already starts with the slug
    if (normalizedPath.startsWith(`/${orgSlug.value}/`) || normalizedPath === `/${orgSlug.value}`) {
      return normalizedPath;
    }

    return `/${orgSlug.value}${normalizedPath}`;
  };

  /**
   * Navigate to an org-aware path
   */
  const navigateToOrg = (path: string) => {
    return navigateTo(buildOrgPath(path));
  };

  return {
    orgSlug,
    isOrgRoute,
    isCustomDomain,
    buildOrgPath,
    navigateToOrg,
  };
};

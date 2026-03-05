// Composable for organization-aware navigation
// Handles path generation that respects org slug context

export const useOrgNavigation = () => {
  const route = useRoute();

  // Get current org slug from route params
  const orgSlug = computed(() => route.params.slug as string | undefined);

  // Check if we're currently in an org-scoped route
  const isOrgRoute = computed(() => !!orgSlug.value);

  /**
   * Build an org-aware path
   * With slug route: prefix paths with the org slug
   * Otherwise: return the path as-is
   */
  const buildOrgPath = (path: string): string => {
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
    buildOrgPath,
    navigateToOrg,
  };
};

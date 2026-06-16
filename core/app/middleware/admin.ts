/**
 * Admin middleware - protects admin-only routes
 * Allows access to users with admin roles:
 * - App Administrator: Full system-wide admin access
 * - HOA Admin: Organization-level admin access (can manage all admin content and features)
 * Regular members will be redirected to the documents page
 *
 * SECURITY: This middleware checks admin access for the CURRENT domain/organization
 * being viewed, not just the user's selected organization. This prevents users
 * who are admins of Org A from accessing admin routes on Org B's domain.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession();
  const { user } = useDirectusAuth();
  const { activeHoa } = useActiveHoa();

  // First check if user is logged in
  if (!loggedIn.value) {
    const redirectPath =
      to.fullPath !== "/dashboard"
        ? `?redirect=${encodeURIComponent(to.fullPath)}`
        : "";
    return navigateTo(`/auth/login${redirectPath}`);
  }

  // Get user's role in current organization
  if (user.value) {
    // Ensure useSelectedOrg is called to populate memberships state
    const { isAdmin, currentOrg } = await useSelectedOrg();

    // Determine if we're on an org-specific context (slug route)
    const isOnOrgContext = !!to.params.slug;

    // If on an org-specific context, check admin access for THAT org specifically
    if (isOnOrgContext) {
      const { isAdminOfCurrentDomain, isMemberOfCurrentDomain } =
        useCurrentDomainAccess();

      // If user is not an admin of the current domain's organization, deny access
      if (!isAdminOfCurrentDomain.value) {
        // Get the slug for redirect - prefer route param, then activeHoa
        const slug =
          (to.params.slug as string) || activeHoa.value?.slug || null;

        // If user is at least a member, redirect to documents
        if (isMemberOfCurrentDomain.value && slug) {
          return navigateTo(`/${slug}/documents`);
        }

        // If user is not a member at all, redirect to the org's public page or home
        if (slug) {
          return navigateTo(`/${slug}`);
        }

        // Fallback to home if no slug available
        return navigateTo("/");
      }
    } else {
      // On main domain (e.g., /dashboard route without org context)
      // Use the original selectedOrg logic
      if (!isAdmin.value) {
        const slug = currentOrg.value?.organization?.slug;
        if (slug) {
          return navigateTo(`/${slug}/documents`);
        }
        return navigateTo("/dashboard");
      }
    }
  }
});

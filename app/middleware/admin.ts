/**
 * Admin middleware - protects admin-only routes
 * Only allows access to users with admin roles (App Administrator or HOA Admin)
 * Regular members will be redirected to the documents page
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession();
  const { user } = useDirectusAuth();

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
    const { isAdmin, currentOrg } = await useSelectedOrg();

    // If not an admin, redirect to documents page (front-facing content)
    if (!isAdmin.value) {
      // Get org slug for redirect
      const slug = currentOrg.value?.organization?.slug;
      if (slug) {
        return navigateTo(`/${slug}/documents`);
      }
      // Fallback to dashboard if no org slug
      return navigateTo("/dashboard");
    }
  }
});

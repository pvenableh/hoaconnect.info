/**
 * admin-or-board middleware — protects routes that admins AND active board
 * members may view (e.g. the unit detail / resident records page). Mirrors the
 * `admin` middleware but additionally admits board members of the current
 * domain's organization. Regular members are redirected to documents.
 *
 * Data on these pages is still authorized server-side (see
 * server/api/hoa/units/records) — this only gates page access.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession();
  const { user } = useDirectusAuth();
  const { activeHoa } = useActiveHoa();

  if (!loggedIn.value) {
    const redirectPath =
      to.fullPath !== "/dashboard" ? `?redirect=${encodeURIComponent(to.fullPath)}` : "";
    return navigateTo(`/auth/login${redirectPath}`);
  }

  if (!user.value) return;

  // Populate memberships state (consumed by useCurrentDomainAccess).
  const { isAdmin, currentOrg, isBoardMember } = await useSelectedOrg();

  const isOnOrgContext = !!to.params.slug;

  if (isOnOrgContext) {
    const { isAdminOfCurrentDomain, isBoardMemberOfCurrentDomain, isMemberOfCurrentDomain } =
      useCurrentDomainAccess();

    if (isAdminOfCurrentDomain.value || isBoardMemberOfCurrentDomain.value) return;

    const slug = (to.params.slug as string) || activeHoa.value?.slug || null;
    if (isMemberOfCurrentDomain.value && slug) return navigateTo(`/${slug}/documents`);
    if (slug) return navigateTo(`/${slug}`);
    return navigateTo("/");
  }

  // Main domain (no slug) — fall back to selected-org role.
  if (!isAdmin.value && !isBoardMember.value) {
    const slug = currentOrg.value?.organization?.slug;
    return navigateTo(slug ? `/${slug}/documents` : "/dashboard");
  }
});

/**
 * manager middleware — gates the property-manager portal (/[slug]/manage/*).
 *
 * Admits org admins (full access) and property managers of the current domain's
 * organization. When a page declares `meta.managerCapability`, a property
 * manager must additionally hold that grant (manager_permissions[...]). Everyone
 * else is redirected. Sensitive writes are still authorized server-side; this
 * only gates page access.
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
  await useSelectedOrg();

  const {
    isAdminOfCurrentDomain,
    isPropertyManagerOfCurrentDomain,
    isMemberOfCurrentDomain,
    managerCan,
  } = useCurrentDomainAccess();

  const capability = (to.meta.managerCapability as
    | "inquiries"
    | "violations"
    | "directory"
    | "documents"
    | "communications"
    | undefined) || null;

  if (isAdminOfCurrentDomain.value) return;
  if (
    isPropertyManagerOfCurrentDomain.value &&
    (!capability || managerCan(capability))
  ) {
    return;
  }

  const slug = (to.params.slug as string) || activeHoa.value?.slug || null;
  if (isMemberOfCurrentDomain.value && slug) return navigateTo(`/${slug}/documents`);
  if (slug) return navigateTo(`/${slug}`);
  return navigateTo("/");
});

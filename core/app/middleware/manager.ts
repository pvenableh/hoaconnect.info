/**
 * manager middleware — gates the property-manager portal (/[slug]/manage/*).
 *
 * Admits org admins (full access) and anyone who can work an area here — the
 * area a page names in `meta.managerCapability`, or any area for the portal
 * root. The manager hat alone opens nothing (docs/spec-capability-nav.md).
 * Everyone else is redirected. Sensitive writes are still authorized
 * server-side; this only gates page access.
 */
import { AREA_KEYS, type AreaKey } from "#core/shared/transition/grants";

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

  // Populate memberships state (consumed by useCurrentDomainAccess), then the
  // server's RoleContext, which it prefers.
  await useSelectedOrg();
  await useRoleContext().load();

  const { isAdminOfCurrentDomain, isMemberOfCurrentDomain, canWorkArea } = useCurrentDomainAccess();

  const capability = (to.meta.managerCapability as AreaKey | undefined) || null;

  if (isAdminOfCurrentDomain.value) return;
  if (capability ? canWorkArea(capability) : AREA_KEYS.some((k) => canWorkArea(k))) return;

  const slug = (to.params.slug as string) || activeHoa.value?.slug || null;
  if (isMemberOfCurrentDomain.value && slug) return navigateTo(`/${slug}/documents`);
  if (slug) return navigateTo(`/${slug}`);
  return navigateTo("/");
});

/**
 * manager middleware — gates the property-manager portal (/[slug]/manage/*).
 *
 * Admits org admins (full access) and anyone who can work an area here — the
 * area a page names in `meta.managerCapability` (a list: any one of them), or
 * any area for the portal root. The manager hat alone opens nothing (docs/spec-capability-nav.md).
 * Everyone else is redirected. Sensitive writes are still authorized
 * server-side; this only gates page access.
 */
import { AREA_KEYS, type AreaKey } from "#core/shared/transition/grants";
import { nonMemberAdminNavigation } from "#core/app/composables/nonMemberAdminNavigation";

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
  const selected = await useSelectedOrg();
  await useRoleContext().load();

  const { isAdminOfCurrentDomain, isMemberOfCurrentDomain, canWorkArea } = useCurrentDomainAccess();

  const named = to.meta.managerCapability as AreaKey | readonly AreaKey[] | undefined;
  const capabilities: readonly AreaKey[] = !named ? [] : typeof named === "string" ? [named] : named;

  // An admin who isn't a member here is an App Administrator: the portal reads
  // the selected community, so send them to the same page in their own.
  if (isAdminOfCurrentDomain.value) return nonMemberAdminNavigation(to, selected, "page");
  if ((capabilities.length ? capabilities : AREA_KEYS).some((k) => canWorkArea(k))) return;

  const slug = (to.params.slug as string) || activeHoa.value?.slug || null;
  if (isMemberOfCurrentDomain.value && slug) return navigateTo(`/${slug}/documents`);
  if (slug) return navigateTo(`/${slug}`);
  return navigateTo("/");
});

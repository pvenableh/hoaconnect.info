/**
 * nav-gate — admits a page when any registry entry covering its route meets
 * its access needs (docs/spec-capability-nav.md). For pages a non-admin may
 * open through a capability or an area: Money (money:read) and Projects
 * (admin, or a manager with the `projects` area).
 *
 * Module toggles are module.global's job. Data is still authorized by the
 * server; this only decides whether the page opens. Denials redirect as the
 * `admin` middleware does.
 */
import { routeAllowed } from "#core/shared/nav/registry";

export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn } = useUserSession();
  const { user } = useDirectusAuth();
  const { activeHoa } = useActiveHoa();

  if (!loggedIn.value) {
    const redirectPath = to.fullPath !== "/dashboard" ? `?redirect=${encodeURIComponent(to.fullPath)}` : "";
    return navigateTo(`/auth/login${redirectPath}`);
  }
  if (!user.value) return;

  const slug = (to.params.slug as string) || activeHoa.value?.slug || null;
  if (!to.params.slug) return navigateTo(slug ? `/${slug}` : "/dashboard");

  // Memberships first (useCurrentDomainAccess reads them), then the server
  // context, which carries the capabilities.
  await useSelectedOrg();
  const nav = useNavContext();
  await nav.ready();

  const rel = to.path.replace(new RegExp(`^/${to.params.slug}`), "") || "/";
  if (routeAllowed(rel, nav.ctx.value)) return;

  const { isMemberOfCurrentDomain } = useCurrentDomainAccess();
  if (isMemberOfCurrentDomain.value && slug) return navigateTo(`/${slug}/documents`);
  if (slug) return navigateTo(`/${slug}`);
  return navigateTo("/");
});

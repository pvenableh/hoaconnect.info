/**
 * The App Admin non-member redirect shared by the admin, admin-or-board and
 * manager middleware.
 *
 * An admin of the community in the URL who holds no membership there is an
 * App Administrator. The selected community follows the URL only for a member
 * (useSelectedOrg STEP 3.5, org-slug-sync), and these pages read the selected
 * one, so they would show (and save) the admin's own community under this
 * one's URL. Send them to the same page in their own community instead (query
 * and hash kept); look at other communities through the operator console.
 *
 * Call only after the guard has admitted the user on an org (slug) route,
 * passing the useSelectedOrg() state the middleware already awaited. Returns
 * the navigation to return from the middleware, or undefined to stay.
 */
import type { RouteLocationNormalized } from "vue-router";
import { toast } from "vue-sonner";
import { nonMemberAdminNotice, nonMemberAdminRedirect } from "#core/shared/domains/org-routes";

type SelectedOrgState = Pick<
  Awaited<ReturnType<typeof useSelectedOrg>>,
  "currentOrg" | "memberships" | "isLoading"
>;

export function nonMemberAdminNavigation(
  to: RouteLocationNormalized,
  { currentOrg, memberships, isLoading }: SelectedOrgState,
  pageLabel = "admin page"
) {
  const slug = to.params.slug as string | undefined;
  if (!slug || isLoading.value) return;
  const list = memberships.value as any[];
  if (list.some((m: any) => m?.organization?.slug === slug)) return;

  const own = currentOrg.value?.organization;
  if (import.meta.client) toast.info(nonMemberAdminNotice(slug, own, pageLabel));
  return navigateTo(nonMemberAdminRedirect(to.fullPath, slug, own?.slug));
}

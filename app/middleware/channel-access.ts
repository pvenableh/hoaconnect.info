/**
 * channel-access middleware (Phase 8, Track A/B) — gates the channels pages.
 *
 * Channels is an internal admin/board tool, but a regular member can be invited
 * into a single channel (a hoa_channel_members row). So this admits, for the
 * current domain's org: admins, active board members, AND any user who has at
 * least one channel membership. Everyone else is redirected to the org home.
 *
 * Kept separate from `admin-or-board` so the broader channel-member admission
 * doesn't leak into other admin-or-board pages (e.g. unit records).
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

  const slug = (to.params.slug as string) || activeHoa.value?.slug || null;

  const { isAdminOfCurrentDomain, isBoardMemberOfCurrentDomain } =
    useCurrentDomainAccess();
  if (isAdminOfCurrentDomain.value || isBoardMemberOfCurrentDomain.value) return;

  // Regular member invited into a channel?
  const { hasChannelMembership, refresh } = useChannelAccess();
  await refresh();
  if (hasChannelMembership.value) return;

  return navigateTo(slug ? `/${slug}` : "/");
});

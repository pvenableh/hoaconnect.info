// useDockApps — what the dock shows, for every surface that shows it: the
// floating dock (md and up) and the App Library grid the Nav opens below md.
// One source, so the grid can never list, colour or badge an app differently
// from the dock it stands in for.
import { badgeCountsFor, type AppDef, type HSL } from "#core/app/composables/useAppNav";

export function useDockApps() {
  const route = useRoute();
  const { palette, appsFor, accentsForApps, activeKeyFor, go } = useAppNav();
  const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
  const { isPreviewingMember } = useViewAs();

  // Both surfaces render only on an org route, where "admin" means admin of
  // the org being VIEWED — never the selected org's role.
  const isOnOrgPage = computed(() => !!route.params.slug);
  const showAdminUI = computed(
    () => isOnOrgPage.value && !isPreviewingMember.value && isAdminOfCurrentDomain.value
  );

  const apps = computed<AppDef[]>(() => appsFor(showAdminUI.value));
  const accents = computed<HSL[]>(() => accentsForApps(apps.value, palette.value));
  const activeKey = computed(() => activeKeyFor(apps.value));
  const activeIndex = computed(() => apps.value.findIndex((a) => a.key === activeKey.value));

  // Per-app unread badges (best-effort). The mapping lives in useAppNav
  // (badgeCountsFor) so no two surfaces can drift.
  const { notifications } = useNotifications();
  const channelUnread = useChannelUnread();
  channelUnread.watchLive();
  onMounted(() => channelUnread.refresh());
  const sendingEmails = useSendingEmails();
  sendingEmails.watchLive(showAdminUI);
  const badges = computed<Record<string, number>>(() =>
    badgeCountsFor(notifications.value, channelUnread.total.value, showAdminUI.value ? sendingEmails.count.value : 0)
  );
  const totalUnread = computed(() =>
    apps.value.reduce((n, a) => n + (badges.value[a.key] || 0), 0)
  );

  const accentVars = (a: HSL | undefined) =>
    (a ? { "--c-h": String(a.h), "--c-s": `${a.s}%`, "--c-l": `${a.l}%` } : {}) as Record<string, string>;

  return { isOnOrgPage, showAdminUI, apps, accents, activeKey, activeIndex, badges, totalUnread, accentVars, go };
}

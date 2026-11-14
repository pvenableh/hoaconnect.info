// useDockApps — what the dock shows, for every surface that shows it: the
// floating dock (md and up) and the App Library grid the Nav opens below md.
// One source, so the grid can never list, colour or badge an app differently
// from the dock it stands in for.
//
// The apps are the nav registry's entries for this person's layout
// (useNavContext; docs/spec-capability-nav.md): an admin's sections, a
// manager's queue and areas, or the member apps — each filtered by what it
// needs, so nobody is offered an app they cannot open.
import { badgeCountsFor, toAppDef, type AppDef, type HSL } from "#core/app/composables/useAppNav";

export function useDockApps() {
  const { palette, accentsForApps, activeKeyFor, go } = useAppNav();
  const nav = useNavContext();

  const isOnOrgPage = nav.isOnOrgPage;
  // Both surfaces render only on an org route, where "admin" means admin of
  // the org being VIEWED — never the selected org's role.
  const showAdminUI = computed(() => isOnOrgPage.value && nav.layout.value === "admin");

  const apps = computed<AppDef[]>(() => nav.entries.value.map(toAppDef));
  const accents = computed<HSL[]>(() => accentsForApps(apps.value, palette.value));
  const activeKey = computed(() => activeKeyFor(apps.value));
  const activeIndex = computed(() => apps.value.findIndex((a) => a.key === activeKey.value));

  // Capabilities (a board seat's Money) and the hat arrive with the server
  // context; ask for it once the dock is on screen.
  onMounted(() => void nav.ready());

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

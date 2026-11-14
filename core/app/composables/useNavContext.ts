/**
 * useNavContext — the NavContext for the org being VIEWED, and the layout it
 * gets (docs/spec-capability-nav.md). Every nav surface and the nav-gate
 * middleware read the registry through this, so they all ask the same question.
 *
 * Synchronous: route middleware and the dock render before any fetch. Admin,
 * areas and residency come from useCurrentDomainAccess (the resolver over the
 * cached membership, or the server context once loaded). Capabilities and the
 * manager hat need the server context; until it arrives for this org they are
 * empty, so a board seat's Money slot appears when it lands. `ready()` loads it.
 */
import type { Capability } from "#core/shared/permissions";
import { AREA_KEYS, type AreaKey } from "#core/shared/transition/grants";
import {
  layoutFor,
  navEntriesFor,
  previewContext,
  type NavContext,
  type NavEntry,
  type NavLayoutId,
} from "#core/shared/nav/registry";

export function useNavContext() {
  const route = useRoute();
  const access = useCurrentDomainAccess();
  const { isEnabled } = useModules();
  const { activeHoa } = useActiveHoa();
  const { isPreviewingMember } = useViewAs();
  const role = useRoleContext();

  const isOnOrgPage = computed(() => !!route.params.slug);

  // The server context counts only for the org on screen: the selected org can
  // lag behind the slug for a visitor who is not a member here.
  const server = computed(() => {
    const ctx = role.context.value;
    return ctx && ctx.orgId && ctx.orgId === access.currentDomainOrgId.value ? ctx : null;
  });
  const capabilities = computed<Capability[]>(() => (server.value ? role.capabilities.value : []));

  const base = computed<NavContext>(() => ({
    admin: access.isAdminOfCurrentDomain.value,
    capabilities: capabilities.value,
    canWork: (k: AreaKey) => access.canWorkArea(k),
    residency: access.currentDomainResidency.value,
    isEnabled,
    orgFlag: (flag: string) => (activeHoa.value as Record<string, unknown> | null)?.[flag] !== false,
  }));

  const previewing = computed(() => isPreviewingMember.value && base.value.admin);
  /** What the person can do here; an admin previewing gets the member's view. */
  const ctx = computed<NavContext>(() => (previewing.value ? previewContext(base.value) : base.value));

  const managerHat = computed(() => !previewing.value && access.hasManagerHat.value);
  const anyArea = computed(() => AREA_KEYS.some((k) => ctx.value.canWork(k)));

  const layout = computed<NavLayoutId>(() =>
    layoutFor({ admin: ctx.value.admin, anyArea: anyArea.value, previewing: previewing.value })
  );

  /** The dock's entries: only on an org page. */
  const entries = computed<NavEntry[]>(() =>
    isOnOrgPage.value ? navEntriesFor(layout.value, ctx.value, { managerHat: managerHat.value }) : []
  );

  /** Load the server context (capabilities, the hat) for the selected org. */
  const ready = () => role.load();

  return { isOnOrgPage, ctx, layout, entries, managerHat, anyArea, previewing, ready };
}

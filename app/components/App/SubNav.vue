<!--
  Secondary sub-navigation: the ACTIVE section's child pages as a sticky pill bar
  under the top header (e.g. inside People: Members · Units · Board · Teams ·
  Vendors). The floating dock carries the top-level sections and has no room for
  their children, so this bar is where "where am I inside this section" lives.

  It rides the SAME sliding thumb as AppSegmentedControl, so moving between
  sub-pages and switching tabs within a page look and feel identical — the
  selected thing is always the same capsule, travelling the same way.
-->
<template>
  <nav
    v-if="links.length"
    ref="trackEl"
    class="app-subnav glass-bar sticky top-0 z-30 border-b t-border"
    aria-label="Section"
  >
    <!-- The bar is full-bleed so the glass spans the window, but its CONTENT
         sits on the same column as the page below it — otherwise the first pill
         and the page title are on two different left edges. -->
    <div class="app-subnav__scroll" :class="pageWide ? 'max-w-7xl' : 'max-w-6xl'">
      <span class="app-subnav__thumb glass-active-thumb" :style="thumbStyle" aria-hidden="true" />
      <NuxtLink
        v-for="(link, i) in links"
        :key="link.path"
        :ref="setItemRef(i)"
        :to="buildOrgPath(link.path)"
        class="app-subnav__pill"
        :class="{ 'app-subnav__pill--active': isLinkActive(link.path) }"
        :aria-current="isLinkActive(link.path) ? 'page' : undefined"
      >
        <Icon :name="'i-lucide-' + link.icon" class="w-4 h-4 shrink-0" />
        <span class="whitespace-nowrap">{{ link.label }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
// NO top-level await in this component, deliberately. `useSlidingThumb` registers
// lifecycle hooks, and a composable that does so has to be called before any
// await in setup or it runs without an active component instance — which took
// every workspace page to a 500 the first time this bar was rewritten. The admin
// check therefore uses the synchronous domain-access composable instead of
// awaiting useSelectedOrg().
const route = useRoute();
const { appsFor, activeKeyFor } = useAppNav();
const { sectionLinksFor, isLinkActive, buildOrgPath } = useSectionNav();
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const { isPreviewingMember } = useViewAs();
// Published by PageContainer so this bar tracks the page's own column width.
const { pageWide } = usePageWidth();

// The bar only makes sense on an org route: every link it renders is org-scoped
// through buildOrgPath.
const isOnOrgPage = computed(() => !!route.params.slug);
const showAdminUI = computed(
  () => isOnOrgPage.value && !isPreviewingMember.value && isAdminOfCurrentDomain.value
);

const apps = computed(() => appsFor(showAdminUI.value));
const activeKey = computed(() => activeKeyFor(apps.value));
const links = computed(() =>
  showAdminUI.value ? sectionLinksFor(activeKey.value) : []
);

// -1 when no child page matches (a section root): the thumb fades out in place
// rather than snapping to the first pill and claiming that one is selected.
const activeIndex = computed(() =>
  links.value.findIndex((l) => isLinkActive(l.path))
);

const { trackEl, setItemRef, thumbStyle } = useSlidingThumb(activeIndex, {
  watchSource: () => links.value.map((l) => l.label).join("|"),
});
</script>

<style scoped>
.app-subnav__scroll {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  /* Matches PageContainer's gutters (px-4 sm:px-6) so the pills line up with
     the page content, not with the window edge. */
  padding: 0.5rem 1rem;
  margin-inline: auto;
  width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}
@media (min-width: 640px) {
  .app-subnav__scroll {
    padding-inline: 1.5rem;
  }
}
.app-subnav__scroll::-webkit-scrollbar {
  display: none;
}

.app-subnav__thumb {
  position: absolute;
  top: 0.5rem;
  bottom: 0.5rem;
  left: 0;
  border-radius: 999px;
  transition:
    transform 400ms var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1)),
    width 400ms var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1)),
    opacity 200ms ease;
  pointer-events: none;
}

.app-subnav__pill {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text-tertiary);
  transition: color var(--motion-fast, 160ms) ease;
}
.app-subnav__pill:hover:not(.app-subnav__pill--active) {
  color: var(--theme-text-secondary);
}
.app-subnav__pill--active {
  color: var(--theme-text-primary);
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .app-subnav__thumb {
    transition: opacity 120ms ease;
  }
}
</style>

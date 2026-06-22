<!--
  Secondary sub-navigation bar for the MODERN theme (the floating dock has no
  room for sub-links). A sticky horizontal pill bar under the top header showing
  the ACTIVE section's child pages (e.g. inside People: Members · Units · Board ·
  Teams · Vendors). Classic/luxury get their sub-nav from the grouped sidebar
  instead, so auth.vue only mounts this for navStyle === 'dock'. Reads the active
  section from useAppNav and its links from useSectionNav (the shared source).
-->
<template>
  <nav
    v-if="links.length"
    class="app-subnav glass-bar sticky top-0 z-30 border-b t-border"
    aria-label="Section"
  >
    <div class="app-subnav__scroll flex items-center gap-1.5 px-4 py-2 overflow-x-auto">
      <NuxtLink
        v-for="link in links"
        :key="link.path"
        :to="buildOrgPath(link.path)"
        class="app-subnav__pill"
        :class="{ 'app-subnav__pill--active': isLinkActive(link.path) }"
      >
        <Icon :name="'i-lucide-' + link.icon" class="w-4 h-4 shrink-0" />
        <span class="whitespace-nowrap">{{ link.label }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
const route = useRoute();
const { user } = useDirectusAuth();
const { appsFor, activeKeyFor } = useAppNav();
const { sectionLinksFor, isLinkActive, buildOrgPath } = useSectionNav();

// Show admin sub-nav only when the admin UI is active for this org (mirrors
// App/Sidebar.vue / App/Nav.vue). Members' apps are leaf pages with no children.
const { isAdmin } = user.value
  ? await useSelectedOrg()
  : { isAdmin: ref(false) };
const { isAdminOfCurrentDomain } = useCurrentDomainAccess();
const { isPreviewingMember } = useViewAs();
const isOnOrgPage = computed(() => !!route.params.slug);
const showAdminUI = computed(() =>
  isPreviewingMember.value
    ? false
    : isOnOrgPage.value
    ? isAdminOfCurrentDomain.value
    : isAdmin.value
);

const apps = computed(() => appsFor(showAdminUI.value));
const activeKey = computed(() => activeKeyFor(apps.value));
const links = computed(() =>
  showAdminUI.value ? sectionLinksFor(activeKey.value) : []
);
</script>

<style scoped>
.app-subnav {
  /* Lifts the bar above page content; glass-bar (earnest-ui) gives the frost. */
  backdrop-filter: saturate(1.05) blur(8px);
}
.app-subnav__scroll {
  scrollbar-width: none;
}
.app-subnav__scroll::-webkit-scrollbar {
  display: none;
}

.app-subnav__pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text-secondary);
  transition: background-color 150ms ease, color 150ms ease;
}
.app-subnav__pill:hover {
  background: var(--theme-bg-subtle);
  color: var(--theme-text-primary);
}
.app-subnav__pill--active {
  background: color-mix(in srgb, var(--theme-accent-primary) 14%, transparent);
  color: var(--theme-accent-primary);
}
</style>

<script setup lang="ts">
// Phase 9: the building feed now lives as a tab inside the dashboard.
// This route is kept only as a back-compat redirect for old links / deep-links.
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { isAdmin } = await useSelectedOrg();
const { isEnabled } = useModules();

// Admins land on /[slug]/dashboard, members on the org home (/[slug]).
const base = buildOrgPath(isAdmin.value ? "/dashboard" : "/");

// If the feed module is enabled, deep-link straight to the Building tab.
// If it's disabled, module.global middleware already blocks /feed; this is a
// belt-and-suspenders fallback that just sends them to their dashboard.
await navigateTo(
  isEnabled("feed") ? { path: base, query: { tab: "building" } } : { path: base },
  { replace: true }
);
</script>

<template>
  <div />
</template>

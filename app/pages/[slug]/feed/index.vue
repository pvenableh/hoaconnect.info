<script setup lang="ts">
// Phase 9: the building feed now lives as a tab inside the dashboard.
// This route is kept only as a back-compat redirect for old links / deep-links.
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();

// The clean org root is the dashboard for everyone (role-aware), so the feed
// tab deep-links there for admins and members alike.
const base = buildOrgPath("/");

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

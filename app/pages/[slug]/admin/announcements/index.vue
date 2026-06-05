<script setup lang="ts">
// Phase 9: Announcements authoring is retired in favor of the Communications
// (email) system, which now offers an "Alert" type plus richer email types.
// Keep this admin route as a redirect for old links/bookmarks.
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
await navigateTo(buildOrgPath("/admin/communications"), { replace: true });
</script>

<template>
  <div />
</template>

<script setup lang="ts">
// Phase 9: the standalone Announcements system is retired. Community updates now
// live in the building feed (Dashboard → Building) and reach members via the
// Communications (email) system. Keep this route as a redirect for old links.
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
await navigateTo(buildOrgPath("/"), { replace: true });
</script>

<template>
  <div />
</template>

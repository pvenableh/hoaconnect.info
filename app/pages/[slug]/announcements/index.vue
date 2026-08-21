<script setup lang="ts">
// Phase 9: the standalone Announcements system is retired. Community updates now
// live in the building feed (Dashboard → Building) and reach members via the
// Communications (email) system. Keep this route as a redirect for old links,
// aimed at the same place every in-app announcements link now points.
//
// Mirrors /{slug}/feed: deep-link to the Building tab when the feed module is
// on, and fall back to the plain dashboard when it isn't, so a stale bookmark
// never lands on a tab that silently reverts to Overview.
//
// NOTE: this is the INDEX only. /{slug}/announcements/email/{ref} is a separate
// live route — the public "view this email on the web" page.
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { isEnabled } = useModules();

const base = buildOrgPath("/");
await navigateTo(
  isEnabled("feed") ? { path: base, query: { tab: "building" } } : { path: base },
  { replace: true }
);
</script>

<template>
  <div />
</template>

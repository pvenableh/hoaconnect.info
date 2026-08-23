<script setup lang="ts">
// Records section root. Never rendered in practice — `section-home` redirects it
// onto the section's first enabled child (normally `/admin/meetings`).
//
// This used to be a card grid listing the section's sub-pages. AppSubNav shows
// that same list as pills on every workspace page, from the same useSectionNav
// source, so the grid was a whole screen of clicking for a menu already on
// screen. The route stays because plenty of things still name it: typed URLs,
// bookmarks, org-redirect.global, and the custom-domain orgScopedRedirect map.
//
// The empty div below is what an org with every module in this section switched
// off falls through to — section-home declines to redirect rather than send it
// somewhere disabled.
definePageMeta({
  middleware: ["admin", "subscription", "section-home"],
  layout: "auth",
});
</script>

<template>
  <div />
</template>

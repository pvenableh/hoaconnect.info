<script setup lang="ts">
// Phase 9: the Email app was renamed to Communications. Redirect old links.
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const route = useRoute();
await navigateTo(route.fullPath.replace("/admin/email", "/admin/communications"), {
  replace: true,
});
</script>

<template>
  <div />
</template>

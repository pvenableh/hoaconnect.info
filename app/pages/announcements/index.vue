<script setup lang="ts">
// Phase 9: standalone Announcements retired. Redirect to home.
definePageMeta({
  middleware: ["auth"],
  layout: "auth",
});

await navigateTo("/", { replace: true });
</script>

<template>
  <div />
</template>

<script setup lang="ts">
// Phase 9: Announcements authoring retired in favor of Communications.
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

await navigateTo("/admin/communications", { replace: true });
</script>

<template>
  <div />
</template>

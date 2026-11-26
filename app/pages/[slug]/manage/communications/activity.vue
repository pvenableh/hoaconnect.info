<script setup lang="ts">
// Email activity, for whoever works the communications area (docs/spec-delegation.md).
definePageMeta({
  middleware: ["manager", "subscription"],
  layout: "auth",
  managerCapability: "communications",
});
</script>

<template>
  <PagesEmailActivityPage />
</template>

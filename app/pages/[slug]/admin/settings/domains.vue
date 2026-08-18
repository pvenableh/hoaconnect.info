<script setup lang="ts">
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});
</script>

<template>
  <PagesSettingsDomainsPage />
</template>

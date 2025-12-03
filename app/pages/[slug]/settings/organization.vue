<script setup lang="ts">
definePageMeta({
  middleware: "auth",
  layout: "auth",
});
</script>

<template>
  <SettingsOrganizationPage />
</template>

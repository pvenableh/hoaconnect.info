<script setup lang="ts">
// Vendors & management lives in the People hub. It renders the same page as the
// legacy /admin/settings/property-management route (kept for deep links), but on
// a People-area URL so the sidebar keeps People active instead of jumping to the
// Settings group (the old settings-prefixed URL collided with the Settings hub).
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});
</script>

<template>
  <PagesSettingsPropertyManagementPage />
</template>

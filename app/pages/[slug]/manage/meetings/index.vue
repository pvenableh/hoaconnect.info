<script setup lang="ts">
// Meetings for a property manager with the grant, or a helper or committee
// holding the area (docs/spec-delegation.md). The admin's page component; its
// reads and writes go through /api/org/meetings, which checks the area again.
definePageMeta({
  middleware: ["manager", "subscription"],
  layout: "auth",
  managerCapability: "meetings",
});
</script>

<template>
  <PagesMeetingsAdminPage />
</template>

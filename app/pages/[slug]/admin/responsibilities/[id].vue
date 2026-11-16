<script setup lang="ts">
// One job as a full page, for deep links (docs/spec-resource-scaffold.md). The
// same ResponsibilityPanel the register opens as a slide-over. Its middleware is
// the index's: tests/components/panel-registry.test.ts checks both, and that
// the nav registry gates this path as it gates /admin/responsibilities.
definePageMeta({
  middleware: ["nav-gate", "subscription"],
  layout: "auth",
});

const route = useRoute();
</script>

<template>
  <AppResourceRecordPage type="responsibility" :id="String(route.params.id)" />
</template>

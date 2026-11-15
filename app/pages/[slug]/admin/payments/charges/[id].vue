<script setup lang="ts">
// One charge as a full page, for deep links (docs/spec-resource-scaffold.md).
// The same ChargePanel the Charges index opens as a slide-over. Its middleware
// is the index's: tests/components/panel-registry.test.ts checks both, and
// that the nav registry gates this path as it gates /admin/payments.
definePageMeta({
  middleware: ["nav-gate", "subscription"],
  layout: "auth",
});

const route = useRoute();
</script>

<template>
  <AppResourceRecordPage type="charge" :id="String(route.params.id)" />
</template>

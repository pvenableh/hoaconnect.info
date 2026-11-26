<script setup lang="ts">
/**
 * Manager communications — reuses the admin email pages, under
 * /manage/communications (useCommsBase). Page access requires the
 * "communications" area, held by a manager grant or by a helper or committee
 * (docs/spec-delegation.md); every read and the send are authorized server-side
 * (requireAreaWork(..., "communications")).
 */
definePageMeta({
  middleware: ["manager", "subscription"],
  layout: "auth",
  managerCapability: "communications",
});
</script>

<template>
  <PagesEmailPage />
</template>

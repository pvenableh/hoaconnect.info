<script setup lang="ts">
// Admin AI-spend dashboard. Admins-only: the page + GET /api/org/ai-spend
// enforce it (a member or property manager who lands here sees an access-denied
// state, never the org's spend). Linked from the Reporting hub.
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});
</script>

<template>
  <PagesAdminAiSpendPage />
</template>

<script setup lang="ts">
// Admin activity dashboard. Reachable by org admins and Property Managers with
// the `activity` grant; the page + GET /api/org/activity enforce that (a member
// who lands here sees an access-denied state, never another resident's data).
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});
</script>

<template>
  <PagesAdminActivityPage />
</template>

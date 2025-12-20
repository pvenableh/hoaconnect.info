<script setup lang="ts">
/**
 * Root-level documents page - shows public documents view for all users
 * This is the public documents page accessible from the main navigation
 */
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});
</script>

<template>
  <!-- All logged-in users see the public documents view -->
  <PagesMemberDocumentsPage />
</template>

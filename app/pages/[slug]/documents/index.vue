<script setup lang="ts">
// All logged-in users see the same member documents view.
// The comment lives here, not in <template>: a leading comment node makes the
// page multi-root, which disables Nuxt's route transitions for it.
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});
</script>

<template>
  <PagesMemberDocumentsPage />
</template>

<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});
</script>

<template>
  <!-- All logged-in users see the public documents view -->
  <PagesMemberDocumentsPage />
</template>

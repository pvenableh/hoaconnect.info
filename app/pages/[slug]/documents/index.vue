<script setup lang="ts">
definePageMeta({
  middleware: "auth",
  layout: "auth",
});
</script>

<template>
  <!-- All logged-in users see the public documents view -->
  <PagesMemberDocumentsPage />
</template>

<script setup lang="ts">
// The Board Room. Admin/board business: the briefing names other people's
// arrears and other people's requests, and every endpoint under it gates the
// same way (`/api/ai/director/*` → org admins and seated board members).
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});
</script>

<template>
  <PagesBoardroomPage />
</template>

<script setup lang="ts">
/**
 * Manager communications — reuses the admin email composer. Page access requires
 * the "communications" grant; the send itself is authorized server-side
 * (send.post.ts → requireAdminOrManagerGrant(..., "communications")).
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

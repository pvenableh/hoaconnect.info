<script setup lang="ts">
definePageMeta({
  middleware: "guest", // Only accessible to non-logged-in users
  layout: "default",
});

useSeoMeta({
  title: "Set Up Your HOA",
  description: "Create your organization and start managing your HOA documents",
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <OrganizationSetupForm redirect-to="/dashboard" :beta-mode="true" />
  </div>
</template>

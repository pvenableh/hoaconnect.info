<script setup lang="ts">
definePageMeta({
  middleware: "guest", // Only accessible to non-logged-in users
  layout: "auth-blank",
});

// Chromeless (auth-blank) but a WORKSPACE surface: pin `theme-app` in the
// user's light/dark, as AuthShell does. (Was the deleted `default` layout's initTheme().)
useWorkspaceAppearance();

useSeoMeta({
  title: "Set Up Your HOA",
  description: "Create your organization and start managing your HOA documents",
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <OrganizationSetupForm redirect-to="/dashboard" :beta-mode="false" />
  </div>
</template>

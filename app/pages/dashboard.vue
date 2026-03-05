<script setup lang="ts">
import { LoadingOverlay } from "@/components/ui/loading-overlay";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { currentOrg, isLoading } = await useSelectedOrg();

// Track if we've already initiated a redirect to prevent multiple navigations
const hasRedirected = ref(false);

// Redirect to org-specific dashboard when org is available
// On main domain, redirect to /{slug}/dashboard
watch(
  [isLoading, () => currentOrg.value?.organization?.slug],
  ([loading, slug]) => {
    // Skip if still loading or already redirected
    if (loading || hasRedirected.value) {
      return;
    }

    // Redirect to org-specific dashboard if we have a slug
    if (slug) {
      hasRedirected.value = true;
      navigateTo(`/${slug}/dashboard`, { replace: true });
    }
  },
  { immediate: true }
);
</script>

<template>
  <!-- Show loading overlay while fetching org or during redirect -->
  <LoadingOverlay
    :show="isLoading || hasRedirected"
    message="Loading your dashboard..."
  />

  <!-- Show dashboard content when not loading and not redirecting -->
  <PagesDashboardPage
    v-if="!isLoading && !hasRedirected"
  />
</template>

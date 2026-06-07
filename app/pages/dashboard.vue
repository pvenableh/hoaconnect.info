<script setup lang="ts">
import { LoadingOverlay } from "@/components/ui/loading-overlay";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { currentOrg, isLoading } = await useSelectedOrg();

// Track if we've already initiated a redirect to prevent multiple navigations
const hasRedirected = ref(false);

// This non-slug `/dashboard` is just a slug-agnostic entry point — resolve the
// user's org and send them to its clean root (the org root IS the dashboard).
watch(
  [isLoading, () => currentOrg.value?.organization?.slug],
  ([loading, slug]) => {
    // Skip if still loading or already redirected
    if (loading || hasRedirected.value) {
      return;
    }

    // Redirect to the org's clean root if we have a slug
    if (slug) {
      hasRedirected.value = true;
      navigateTo(`/${slug}`, { replace: true });
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

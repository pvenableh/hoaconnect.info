<script setup lang="ts">
import { LoadingOverlay } from "@/components/ui/loading-overlay";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { currentOrg, isLoading } = await useSelectedOrg();
const { isCustomDomain } = useActiveHoa();

// Track if we've already initiated a redirect to prevent multiple navigations
const hasRedirected = ref(false);

// Redirect to org-specific dashboard when org is available
// On custom domains, don't redirect - /dashboard is the correct path
// On main domain, redirect to /{slug}/dashboard
// Use watch instead of watchEffect for more controlled execution
watch(
  [isLoading, () => currentOrg.value?.organization?.slug, isCustomDomain],
  ([loading, slug, customDomain]) => {
    // Skip if still loading, already redirected, or on custom domain
    if (loading || hasRedirected.value || customDomain) {
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

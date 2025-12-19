<script setup lang="ts">
import { LoadingOverlay } from "@/components/ui/loading-overlay";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { currentOrg, isLoading } = await useSelectedOrg();
const { isCustomDomain } = useActiveHoa();

// Redirect to org-specific dashboard when org is available
// On custom domains, don't redirect - /dashboard is the correct path
// On main domain, redirect to /{slug}/dashboard
watchEffect(() => {
  if (!isLoading.value && currentOrg.value?.organization?.slug) {
    // On custom domains, /dashboard is correct - no redirect needed
    if (!isCustomDomain.value) {
      const slug = currentOrg.value.organization.slug;
      navigateTo(`/${slug}/dashboard`, { replace: true });
    }
  }
});
</script>

<template>
  <!-- Show loading overlay while fetching org or redirecting (only on main domain) -->
  <LoadingOverlay
    :show="isLoading || (!isCustomDomain && !!currentOrg?.organization?.slug)"
    message="Loading your dashboard..."
  />

  <!-- Show dashboard content on custom domains or if no org to redirect to -->
  <PagesDashboardPage
    v-if="!isLoading && (isCustomDomain || !currentOrg?.organization?.slug)"
  />
</template>

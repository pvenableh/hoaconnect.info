<script setup lang="ts">
import { LoadingOverlay } from "@/components/ui/loading-overlay";

definePageMeta({
  middleware: "auth",
  layout: "auth",
});

const { currentOrg, isLoading } = await useSelectedOrg();

// Redirect to org-specific dashboard when org is available
watchEffect(() => {
  if (!isLoading.value && currentOrg.value?.organization?.slug) {
    const slug = currentOrg.value.organization.slug;
    navigateTo(`/${slug}/dashboard`, { replace: true });
  }
});
</script>

<template>
  <!-- Show loading overlay while fetching org or redirecting -->
  <LoadingOverlay
    :show="isLoading || !!currentOrg?.organization?.slug"
    message="Loading your dashboard..."
  />

  <!-- Show dashboard content only if no org to redirect to -->
  <PagesDashboardPage v-if="!isLoading && !currentOrg?.organization?.slug" />
</template>

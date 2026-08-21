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

<!-- One root, deliberately. These were two sibling roots with complementary
     conditions — `:show="isLoading || hasRedirected"` on one and the exact
     negation as a `v-if` on the other — which made the page multi-root and
     silently disabled Nuxt's route transitions for it. As a v-if/v-else pair
     the states are mutually exclusive by construction rather than by two
     expressions that have to be kept in agreement, and the overlay no longer
     needs a `show` prop that restated its own mount condition. -->
<template>
  <LoadingOverlay
    v-if="isLoading || hasRedirected"
    message="Loading your dashboard..."
  />

  <!-- Only reached when the user has no org to redirect to. -->
  <PagesDashboardPage v-else />
</template>

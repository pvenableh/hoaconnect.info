<script setup lang="ts">
const { user } = useDirectusAuth();

// Only fetch org data if user is logged in
const { currentOrg } = user.value
  ? await useSelectedOrg()
  : { currentOrg: ref(null) };
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col">
    <AppNav />
    <!-- Subscription warning banner -->
    <SubscriptionBanner
      v-if="currentOrg?.organization"
      :subscription-status="currentOrg.organization.subscription_status"
      :trial-ends-at="currentOrg.organization.trial_ends_at"
      :organization-name="currentOrg.organization.name"
    />
    <main class="flex-1">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
// Always initialize useSelectedOrg - it handles the case when user is not logged in
// This ensures the org data is ready when the user logs in
const { currentOrg } = await useSelectedOrg();
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
      :is-free-account="currentOrg.organization.is_free_account"
    />
    <main class="flex-1">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
const { user } = useDirectusAuth();

// Always initialize useSelectedOrg - it handles the case when user is not logged in
// This ensures the org data is ready when the user logs in
const { currentOrg, isAdmin, isBoardMember, memberType, selectedOrgId } =
  await useSelectedOrg();

// Unified notification system
const { fetchNotifications, notifications } = useNotifications();

// Build audience filter based on member type and role
const audienceFilter = computed(() => {
  const audiences: string[] = ["all"];

  if (memberType.value === "owner") {
    audiences.push("owners");
  } else if (memberType.value === "tenant") {
    audiences.push("tenants");
  }

  if (isBoardMember.value || isAdmin.value) {
    audiences.push("board members");
  }

  return audiences;
});

// Fetch notifications on mount and when org changes
const loadNotifications = async () => {
  if (!user.value || !selectedOrgId.value) return;

  try {
    await fetchNotifications(audienceFilter.value);
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
  }
};

// Watch for org changes
watch(
  () => selectedOrgId.value,
  () => {
    loadNotifications();
  }
);

onMounted(() => {
  loadNotifications();
});
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

    <!-- Global Notification Components -->
    <ClientOnly>
      <NotificationSheet />
      <NotificationToast
        v-if="notifications.length > 0"
        :initial-delay="1500"
        :max-title-length="50"
      />
    </ClientOnly>
  </div>
</template>

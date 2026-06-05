<script setup lang="ts">
const { user } = useDirectusAuth();

// Apply the app theme class on <html> during SSR so the first paint already
// matches the app's default (modern) theme — prevents the flash of an unthemed/
// classic background on refresh. The class is reactive and includes Tailwind's
// `dark` class, so dark mode is preserved; initTheme() then syncs the user's
// saved preference on the client.
const { initTheme, themeState } = useTheme();
const htmlThemeClass = computed(() => {
  const base = `theme-${themeState.style}-${themeState.mode}`;
  return themeState.mode === "dark" ? `${base} dark` : base;
});
useHead({ htmlAttrs: { class: htmlThemeClass } });
onMounted(() => initTheme());

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
    <!-- Slim breadcrumb row beneath the header (hidden on root pages) -->
    <AppBreadcrumbs />
    <!-- Subscription warning banner -->
    <SubscriptionBanner
      v-if="currentOrg?.organization"
      :subscription-status="currentOrg.organization.subscription_status"
      :trial-ends-at="currentOrg.organization.trial_ends_at"
      :organization-name="currentOrg.organization.name"
      :is-free-account="currentOrg.organization.is_free_account"
    />
    <main class="flex-1 pb-28">
      <slot />
    </main>
    <AppFooter />

    <!-- Floating app dock (macOS-style); additive alongside the top nav -->
    <ClientOnly>
      <AppDock />
    </ClientOnly>

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

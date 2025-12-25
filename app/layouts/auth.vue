<script setup lang="ts">
import type { HoaAnnouncement } from "~~/types/directus";

const { user } = useDirectusAuth();

// Always initialize useSelectedOrg - it handles the case when user is not logged in
// This ensures the org data is ready when the user logs in
const { currentOrg, isAdmin, isBoardMember, memberType, selectedOrgId } =
  await useSelectedOrg();

// Announcement system
const { fetchAnnouncements } = useAnnouncements();
const announcements = ref<HoaAnnouncement[]>([]);

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

// Fetch announcements on mount and when org changes
const loadAnnouncements = async () => {
  if (!user.value || !selectedOrgId.value) return;

  try {
    const fetched = await fetchAnnouncements(audienceFilter.value);
    announcements.value = fetched;
  } catch (error) {
    console.error("Failed to fetch announcements:", error);
  }
};

// Watch for org changes
watch(
  () => selectedOrgId.value,
  () => {
    loadAnnouncements();
  }
);

onMounted(() => {
  loadAnnouncements();
});
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col">
    <AppNav :announcements="announcements" />
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

    <!-- Global Announcement Components -->
    <ClientOnly>
      <AnnouncementSheet />
      <AnnouncementToast
        v-if="announcements.length > 0"
        :announcements="announcements"
        :initial-delay="1500"
        :max-title-length="50"
      />
    </ClientOnly>
  </div>
</template>

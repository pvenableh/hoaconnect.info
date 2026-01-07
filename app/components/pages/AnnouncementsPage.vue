<script setup lang="ts">
import type { HoaAnnouncement } from "~~/types/directus";

const { list: listAnnouncements } = useDirectusItems("hoa_announcements");
const { buildOrgPath } = useOrgNavigation();

// Get organization and member info
const { currentOrg, selectedOrgId, isLoading, isAdmin, isBoardMember, memberType } = await useSelectedOrg();

const organization = computed(() => currentOrg.value?.organization || null);
const orgId = computed(() => selectedOrgId.value);

// Build audience filter based on member type and role
const audienceFilter = computed(() => {
  const audiences: string[] = ["all"];

  // Add member type specific audience
  if (memberType.value === "owner") {
    audiences.push("owners");
  } else if (memberType.value === "tenant") {
    audiences.push("tenants");
  }

  // Board members can see board announcements
  if (isBoardMember.value || isAdmin.value) {
    audiences.push("board members");
  }

  return audiences;
});

// Fetch announcements visible to this member
const { data: announcements, pending } = await useAsyncData(
  `member-announcements-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];

    try {
      const now = new Date().toISOString();
      const result = (await listAnnouncements({
        fields: [
          "id",
          "title",
          "content",
          "status",
          "announcement_type",
          "target_audience",
          "publish_date",
          "expiry_date",
          "is_pinned",
          "date_created",
        ],
        filter: {
          organization: { _eq: orgId.value },
          status: { _eq: "published" },
          target_audience: { _in: audienceFilter.value },
          _or: [
            { expiry_date: { _null: true } },
            { expiry_date: { _gte: now } },
          ],
        },
        sort: ["-is_pinned", "-publish_date", "-date_created"],
      })) as HoaAnnouncement[];

      return result || [];
    } catch (error) {
      console.error("Error fetching announcements:", error);
      return [];
    }
  },
  {
    watch: [orgId, audienceFilter],
    server: false,
  }
);

// Type options for display
const getTypeInfo = (type: string | null | undefined) => {
  const types: Record<string, { icon: string; color: string; label: string }> = {
    urgent: { icon: "alert-triangle", color: "text-red-600 bg-red-50 border-red-200", label: "Urgent" },
    maintenance: { icon: "wrench", color: "text-amber-600 bg-amber-50 border-amber-200", label: "Maintenance" },
    event: { icon: "calendar", color: "text-blue-600 bg-blue-50 border-blue-200", label: "Event" },
    reminder: { icon: "bell", color: "text-purple-600 bg-purple-50 border-purple-200", label: "Reminder" },
    general: { icon: "megaphone", color: "t-text-secondary t-bg-subtle t-border", label: "General" },
  };
  return types[type || "general"] || types.general;
};

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Separate pinned and regular announcements for different display
const pinnedAnnouncements = computed(() => {
  return announcements.value?.filter((a) => a.is_pinned) || [];
});

const regularAnnouncements = computed(() => {
  return announcements.value?.filter((a) => !a.is_pinned) || [];
});

useSeoMeta({
  title: "Announcements",
  description: "Community announcements and updates",
});
</script>

<template>
  <div class="min-h-screen t-bg t-text">
    <!-- Page Header Section -->
    <div class="t-bg-alt border-b t-border-divider">
      <div class="max-w-6xl mx-auto px-6 py-12">
        <div class="flex items-center justify-between">
          <div>
            <p class="t-label t-text-accent mb-3 tracking-widest">Community Updates</p>
            <h1 class="text-4xl t-heading font-light tracking-wide mb-3">Announcements</h1>
            <p class="t-text-secondary text-lg">
              Stay informed with the latest news and updates from your community
            </p>
          </div>
          <Button
            v-if="isAdmin"
            as-child
            variant="outline"
            class="t-border hover:t-bg-subtle"
          >
            <NuxtLink :to="buildOrgPath('/admin/announcements')">
              <Icon name="lucide:settings" class="w-4 h-4 mr-2" />
              Manage
            </NuxtLink>
          </Button>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-6xl mx-auto px-6 py-10">
      <!-- Loading State -->
      <div v-if="isLoading || pending" class="text-center py-16">
        <div class="t-bg-elevated rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6 shadow-sm">
          <Icon
            name="lucide:loader-2"
            class="w-8 h-8 animate-spin t-text-accent"
          />
        </div>
        <p class="t-text-secondary">Loading announcements...</p>
      </div>

      <!-- No Organization State -->
      <div v-else-if="!organization" class="text-center py-16">
        <Alert variant="destructive" class="max-w-md mx-auto">
          <Icon name="lucide:alert-circle" class="w-4 h-4" />
          <AlertTitle>No Organization Found</AlertTitle>
          <AlertDescription>
            You are not associated with any HOA organization.
          </AlertDescription>
        </Alert>
      </div>

      <!-- Announcements Grid -->
      <div v-else>
        <!-- Pinned Announcements Section -->
        <div v-if="pinnedAnnouncements && pinnedAnnouncements.length > 0" class="mb-10">
          <h2 class="t-heading text-xl font-light tracking-wide mb-6 flex items-center gap-3">
            <Icon name="lucide:pin" class="w-5 h-5 t-text-accent" />
            Pinned
          </h2>
          <div class="grid gap-6 md:grid-cols-2">
            <div
              v-for="announcement in pinnedAnnouncements"
              :key="announcement.id"
              class="t-bg-elevated rounded-xl border-2 t-border-accent overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <!-- Type indicator bar -->
              <div
                class="h-1"
                :class="{
                  'bg-red-500': announcement.announcement_type === 'urgent',
                  'bg-amber-500': announcement.announcement_type === 'maintenance',
                  'bg-blue-500': announcement.announcement_type === 'event',
                  'bg-purple-500': announcement.announcement_type === 'reminder',
                  't-bg-accent': announcement.announcement_type === 'general' || !announcement.announcement_type,
                }"
              />
              <div class="p-6">
                <!-- Header -->
                <div class="flex items-start gap-4 mb-4">
                  <div
                    class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    :class="getTypeInfo(announcement.announcement_type).color"
                  >
                    <Icon
                      :name="'lucide:' + getTypeInfo(announcement.announcement_type).icon"
                      class="w-6 h-6"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="t-heading text-lg font-medium tracking-wide mb-1 truncate">
                      {{ announcement.title }}
                    </h3>
                    <div class="flex items-center gap-2 text-sm t-text-muted">
                      <span
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                        :class="getTypeInfo(announcement.announcement_type).color"
                      >
                        {{ getTypeInfo(announcement.announcement_type).label }}
                      </span>
                      <span class="opacity-50">·</span>
                      <span>{{ formatDate(announcement.publish_date || announcement.date_created) }}</span>
                    </div>
                  </div>
                </div>
                <!-- Content -->
                <div
                  v-if="announcement.content"
                  class="prose prose-stone prose-sm max-w-none t-text-secondary line-clamp-3"
                  v-html="announcement.content"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Regular Announcements Section -->
        <div v-if="regularAnnouncements && regularAnnouncements.length > 0">
          <h2 class="t-heading text-xl font-light tracking-wide mb-6 flex items-center gap-3">
            <Icon name="lucide:megaphone" class="w-5 h-5 t-text-accent" />
            Recent Updates
          </h2>
          <div class="grid gap-4">
            <div
              v-for="announcement in regularAnnouncements"
              :key="announcement.id"
              class="t-bg-elevated rounded-xl border t-border overflow-hidden hover:shadow-sm transition-shadow"
              :class="{
                'border-red-300': announcement.announcement_type === 'urgent',
              }"
            >
              <div class="flex">
                <!-- Type indicator sidebar -->
                <div
                  class="w-1.5 flex-shrink-0"
                  :class="{
                    'bg-red-500': announcement.announcement_type === 'urgent',
                    'bg-amber-500': announcement.announcement_type === 'maintenance',
                    'bg-blue-500': announcement.announcement_type === 'event',
                    'bg-purple-500': announcement.announcement_type === 'reminder',
                    't-bg-accent': announcement.announcement_type === 'general' || !announcement.announcement_type,
                  }"
                />

                <div class="flex-1 p-6">
                  <!-- Header -->
                  <div class="flex items-start gap-4 mb-3">
                    <div
                      class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      :class="getTypeInfo(announcement.announcement_type).color"
                    >
                      <Icon
                        :name="'lucide:' + getTypeInfo(announcement.announcement_type).icon"
                        class="w-5 h-5"
                      />
                    </div>
                    <div class="flex-1 min-w-0">
                      <h3 class="t-heading font-medium text-lg tracking-wide mb-1">
                        {{ announcement.title }}
                      </h3>
                      <div class="flex items-center gap-2 text-sm t-text-muted">
                        <span
                          class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                          :class="getTypeInfo(announcement.announcement_type).color"
                        >
                          {{ getTypeInfo(announcement.announcement_type).label }}
                        </span>
                        <span class="opacity-50">·</span>
                        <span>{{ formatDate(announcement.publish_date || announcement.date_created) }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Content -->
                  <div
                    v-if="announcement.content"
                    class="prose prose-stone prose-sm max-w-none t-text-secondary"
                    v-html="announcement.content"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-if="!announcements || announcements.length === 0"
          class="text-center py-20"
        >
          <div class="w-20 h-20 rounded-2xl t-bg-subtle flex items-center justify-center mx-auto mb-6">
            <Icon
              name="lucide:megaphone"
              class="w-10 h-10 t-text-muted"
            />
          </div>
          <h3 class="t-heading text-xl font-light tracking-wide mb-2">No Announcements</h3>
          <p class="t-text-muted max-w-sm mx-auto">
            There are no announcements to display at this time. Check back later for community updates.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

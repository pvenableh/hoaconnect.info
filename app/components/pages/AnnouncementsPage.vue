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
    general: { icon: "megaphone", color: "text-stone-600 bg-stone-50 border-stone-200", label: "General" },
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

useSeoMeta({
  title: "Announcements",
  description: "Community announcements and updates",
});
</script>

<template>
  <div class="min-h-screen bg-stone-50">
    <div class="p-6">
      <div class="max-w-4xl mx-auto">
        <div class="mb-8">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-3xl font-bold mb-2">Announcements</h1>
              <p class="text-stone-600">
                Stay updated with the latest community news
              </p>
            </div>
            <Button
              v-if="isAdmin"
              as-child
              variant="outline"
            >
              <NuxtLink :to="buildOrgPath('/admin/announcements')">
                <Icon name="lucide:settings" class="w-4 h-4 mr-2" />
                Manage
              </NuxtLink>
            </Button>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading || pending" class="text-center py-12">
          <Icon
            name="lucide:loader-2"
            class="w-8 h-8 animate-spin mx-auto mb-4"
          />
          <p class="text-sm text-stone-600">Loading announcements...</p>
        </div>

        <!-- No Organization State -->
        <div v-else-if="!organization" class="text-center py-12">
          <Alert variant="destructive" class="max-w-md mx-auto">
            <Icon name="lucide:alert-circle" class="w-4 h-4" />
            <AlertTitle>No Organization Found</AlertTitle>
            <AlertDescription>
              You are not associated with any HOA organization.
            </AlertDescription>
          </Alert>
        </div>

        <!-- Announcements List -->
        <div v-else class="space-y-4">
          <div
            v-if="announcements && announcements.length > 0"
            class="space-y-4"
          >
            <Card
              v-for="announcement in announcements"
              :key="announcement.id"
              class="overflow-hidden"
              :class="{
                'border-red-300 bg-red-50/30': announcement.announcement_type === 'urgent',
                'ring-2 ring-amber-300': announcement.is_pinned,
              }"
            >
              <CardContent class="p-0">
                <div class="flex">
                  <!-- Type indicator sidebar -->
                  <div
                    class="w-1.5 flex-shrink-0"
                    :class="{
                      'bg-red-500': announcement.announcement_type === 'urgent',
                      'bg-amber-500': announcement.announcement_type === 'maintenance',
                      'bg-blue-500': announcement.announcement_type === 'event',
                      'bg-purple-500': announcement.announcement_type === 'reminder',
                      'bg-stone-400': announcement.announcement_type === 'general' || !announcement.announcement_type,
                    }"
                  />

                  <div class="flex-1 p-6">
                    <!-- Header -->
                    <div class="flex items-start justify-between gap-4 mb-3">
                      <div class="flex items-center gap-3">
                        <div
                          class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          :class="getTypeInfo(announcement.announcement_type).color"
                        >
                          <Icon
                            :name="'lucide:' + getTypeInfo(announcement.announcement_type).icon"
                            class="w-5 h-5"
                          />
                        </div>
                        <div>
                          <div class="flex items-center gap-2">
                            <h3 class="font-semibold text-lg">
                              {{ announcement.title }}
                            </h3>
                            <span
                              v-if="announcement.is_pinned"
                              class="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"
                            >
                              <Icon name="lucide:pin" class="w-3 h-3" />
                              Pinned
                            </span>
                          </div>
                          <div class="flex items-center gap-2 text-sm text-stone-500 mt-0.5">
                            <span
                              class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                              :class="getTypeInfo(announcement.announcement_type).color"
                            >
                              {{ getTypeInfo(announcement.announcement_type).label }}
                            </span>
                            <span class="text-stone-300">|</span>
                            <span>
                              {{ formatDate(announcement.publish_date || announcement.date_created) }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Content -->
                    <div
                      v-if="announcement.content"
                      class="prose prose-stone prose-sm max-w-none"
                      v-html="announcement.content"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Empty State -->
          <div
            v-else
            class="text-center py-16"
          >
            <div class="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
              <Icon
                name="lucide:megaphone"
                class="w-8 h-8 text-stone-400"
              />
            </div>
            <h3 class="font-medium text-stone-900 mb-1">No announcements</h3>
            <p class="text-sm text-stone-500">
              There are no announcements to display at this time.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

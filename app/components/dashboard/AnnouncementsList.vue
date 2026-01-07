<script setup lang="ts">
import type { HoaAnnouncement } from "~~/types/directus"

const props = defineProps<{
  announcements: HoaAnnouncement[]
  maxItems?: number
}>()

const displayedAnnouncements = computed(() => {
  const max = props.maxItems || 5
  return props.announcements.slice(0, max)
})

const getTypeIcon = (type: string | null | undefined) => {
  const icons: Record<string, string> = {
    urgent: "heroicons:exclamation-triangle",
    maintenance: "heroicons:wrench-screwdriver",
    event: "heroicons:calendar",
    reminder: "heroicons:bell",
    general: "heroicons:megaphone",
  }
  return icons[type || "general"] || icons.general
}

const getTypeColor = (type: string | null | undefined) => {
  const colors: Record<string, string> = {
    urgent: "text-red-600 bg-red-50",
    maintenance: "text-amber-600 bg-amber-50",
    event: "text-blue-600 bg-blue-50",
    reminder: "text-purple-600 bg-purple-50",
    general: "t-text-secondary t-bg-subtle",
  }
  return colors[type || "general"] || colors.general
}

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return ""
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <div>
          <CardTitle class="text-base">Announcements</CardTitle>
          <CardDescription>Latest community updates</CardDescription>
        </div>
        <Icon name="heroicons:megaphone" class="h-5 w-5 text-muted-foreground" />
      </div>
    </CardHeader>
    <CardContent>
      <div v-if="displayedAnnouncements.length > 0" class="space-y-3">
        <div
          v-for="announcement in displayedAnnouncements"
          :key="announcement.id"
          class="flex items-start gap-3 p-3 rounded-lg border"
          :class="{ 'border-red-200 bg-red-50/50': announcement.announcement_type === 'urgent' }"
        >
          <div
            class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
            :class="getTypeColor(announcement.announcement_type)"
          >
            <Icon :name="getTypeIcon(announcement.announcement_type)" class="h-4 w-4" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h4 class="font-medium text-sm truncate">{{ announcement.title }}</h4>
              <span
                v-if="announcement.is_pinned"
                class="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded"
              >
                Pinned
              </span>
            </div>
            <p
              v-if="announcement.content"
              class="text-xs text-muted-foreground line-clamp-2 mt-1"
              v-html="announcement.content"
            />
            <p class="text-xs text-muted-foreground mt-1">
              {{ formatDate(announcement.publish_date || announcement.date_created) }}
            </p>
          </div>
        </div>
      </div>
      <div v-else class="py-8 text-center text-muted-foreground">
        <Icon name="heroicons:megaphone" class="h-12 w-12 mx-auto mb-3 opacity-20" />
        <p class="text-sm">No announcements yet</p>
      </div>
    </CardContent>
  </Card>
</template>

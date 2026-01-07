<script setup lang="ts">
import type { HoaEmail } from "~~/types/directus"

const props = defineProps<{
  emails: HoaEmail[]
  maxItems?: number
}>()

const displayedEmails = computed(() => {
  const max = props.maxItems || 5
  return props.emails.slice(0, max)
})

const getStatusColor = (status: string | null | undefined) => {
  const colors: Record<string, string> = {
    sent: "bg-green-100 text-green-700",
    sending: "bg-blue-100 text-blue-700",
    scheduled: "bg-amber-100 text-amber-700",
    draft: "t-bg-subtle t-text-secondary",
    failed: "bg-red-100 text-red-700",
  }
  return colors[status || "draft"] || colors.draft
}

const getTypeIcon = (type: string | null | undefined) => {
  const icons: Record<string, string> = {
    newsletter: "heroicons:newspaper",
    announcement: "heroicons:megaphone",
    reminder: "heroicons:bell",
    notice: "heroicons:information-circle",
    basic: "heroicons:envelope",
  }
  return icons[type || "basic"] || icons.basic
}

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return ""
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
</script>

<template>
  <Card>
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <div>
          <CardTitle class="text-base">Recent Emails</CardTitle>
          <CardDescription>Latest email communications</CardDescription>
        </div>
        <Icon name="heroicons:envelope" class="h-5 w-5 text-muted-foreground" />
      </div>
    </CardHeader>
    <CardContent>
      <div v-if="displayedEmails.length > 0" class="space-y-3">
        <div
          v-for="email in displayedEmails"
          :key="email.id"
          class="flex items-start gap-3 p-3 rounded-lg border hover:t-bg-subtle transition-colors"
        >
          <div class="flex-shrink-0 w-8 h-8 rounded-full t-bg-subtle flex items-center justify-center">
            <Icon :name="getTypeIcon(email.email_type)" class="h-4 w-4 t-text-secondary" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h4 class="font-medium text-sm truncate">{{ email.subject }}</h4>
              <span
                class="text-xs px-1.5 py-0.5 rounded capitalize"
                :class="getStatusColor(email.status)"
              >
                {{ email.status }}
              </span>
            </div>
            <div class="flex items-center gap-2 mt-1">
              <p class="text-xs text-muted-foreground">
                {{ email.recipient_count || 0 }} recipients
              </p>
              <span class="text-muted-foreground">•</span>
              <p class="text-xs text-muted-foreground">
                {{ formatDate(email.sent_at || email.date_created) }}
              </p>
            </div>
            <div v-if="email.delivered_count !== undefined" class="flex items-center gap-2 mt-1">
              <span class="text-xs text-green-600">{{ email.delivered_count }} delivered</span>
              <span v-if="email.failed_count" class="text-xs text-red-600">{{ email.failed_count }} failed</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="py-8 text-center text-muted-foreground">
        <Icon name="heroicons:envelope" class="h-12 w-12 mx-auto mb-3 opacity-20" />
        <p class="text-sm">No emails sent yet</p>
      </div>
    </CardContent>
  </Card>
</template>

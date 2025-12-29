<script setup lang="ts">
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { UnifiedNotification } from "~/composables/useNotifications";
import type { HoaAnnouncement } from "~~/types/directus";

const config = useRuntimeConfig();
const router = useRouter();
const { buildOrgPath } = useOrgNavigation();

const {
  selectedNotification,
  isSheetOpen,
  closeNotification,
  getNotificationStyle,
  formatDate,
} = useNotifications();

// Site domains for internal link detection
const siteDomains = computed(() => {
  const domains = [config.public.siteUrl, config.public.appUrl].filter(Boolean);
  if (import.meta.dev) {
    domains.push("http://localhost:3000", "https://localhost:3000");
  }
  return domains as string[];
});

// Check if a link is internal
const isInternalLink = (url: string | null | undefined): boolean => {
  if (!url) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const linkUrl = new URL(url);
    return siteDomains.value.some((domain) => {
      try {
        return linkUrl.host === new URL(domain).host;
      } catch {
        return false;
      }
    });
  } catch {
    return true;
  }
};

// Handle navigation to channel
const navigateToChannel = () => {
  if (!selectedNotification.value) return;
  const channelId = selectedNotification.value.metadata.channelId;
  const messageId = selectedNotification.value.metadata.messageId;
  if (channelId) {
    const path = buildOrgPath(`/admin/channels/${channelId}${messageId ? `#message-${messageId}` : ""}`);
    closeNotification();
    router.push(path);
  }
};

// Handle sheet close
const handleOpenChange = (open: boolean) => {
  if (!open) {
    closeNotification();
  }
};

// Get button attrs for announcements
const getButtonAttrs = computed(() => {
  if (!selectedNotification.value || selectedNotification.value.type !== "announcement") {
    return null;
  }
  const announcement = selectedNotification.value.originalData as HoaAnnouncement;
  if (!announcement.button_link) return null;

  const isExternal =
    announcement.external_link || !isInternalLink(announcement.button_link);
  return {
    href: announcement.button_link,
    target: isExternal ? "_blank" : undefined,
    rel: isExternal ? "noopener noreferrer" : undefined,
  };
});

// Check if announcement expires soon
const expiresSoon = computed(() => {
  if (!selectedNotification.value || selectedNotification.value.type !== "announcement") {
    return false;
  }
  const expiryDate = selectedNotification.value.metadata.expiryDate;
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate);
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  return expiry <= threeDaysFromNow && expiry > now;
});

// Format full date
const formatFullDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};
</script>

<template>
  <Sheet :open="isSheetOpen" @update:open="handleOpenChange">
    <SheetContent side="right" class="w-full sm:max-w-lg overflow-y-auto">
      <template v-if="selectedNotification">
        <SheetHeader class="space-y-4">
          <!-- Type Badge -->
          <div class="flex items-center gap-2">
            <div
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
              :class="[
                getNotificationStyle(selectedNotification).bg,
                getNotificationStyle(selectedNotification).text,
              ]"
            >
              <Icon
                :name="'lucide:' + getNotificationStyle(selectedNotification).icon"
                class="w-4 h-4"
              />
              <template v-if="selectedNotification.type === 'announcement'">
                {{ selectedNotification.metadata.announcementType === 'urgent' ? 'Urgent' :
                   selectedNotification.metadata.announcementType === 'maintenance' ? 'Maintenance' :
                   selectedNotification.metadata.announcementType === 'event' ? 'Event' :
                   selectedNotification.metadata.announcementType === 'reminder' ? 'Reminder' : 'Announcement' }}
              </template>
              <template v-else-if="selectedNotification.type === 'mention'">
                Mention
              </template>
              <template v-else>
                Email
              </template>
            </div>

            <!-- Pinned Badge for announcements -->
            <span
              v-if="selectedNotification.type === 'announcement' && selectedNotification.metadata.isPinned"
              class="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"
            >
              <Icon name="lucide:pin" class="w-3 h-3" />
              Pinned
            </span>

            <!-- Urgent Badge -->
            <span
              v-if="selectedNotification.priority === 'urgent'"
              class="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full"
            >
              Urgent
            </span>
          </div>

          <SheetTitle class="text-xl font-semibold text-left">
            {{ selectedNotification.title }}
          </SheetTitle>

          <SheetDescription class="sr-only">
            Notification details
          </SheetDescription>

          <!-- Meta Info -->
          <div class="flex flex-wrap items-center gap-3 text-sm text-stone-500">
            <span class="flex items-center gap-1">
              <Icon name="lucide:calendar" class="w-4 h-4" />
              {{ formatFullDate(selectedNotification.date) }}
            </span>

            <!-- Expiry for announcements -->
            <span
              v-if="selectedNotification.type === 'announcement' && selectedNotification.metadata.expiryDate"
              class="flex items-center gap-1"
              :class="{ 'text-orange-600': expiresSoon }"
            >
              <Icon name="lucide:clock" class="w-4 h-4" />
              Expires {{ formatFullDate(selectedNotification.metadata.expiryDate) }}
              <span v-if="expiresSoon" class="font-medium">(soon)</span>
            </span>

            <!-- Channel for mentions -->
            <span
              v-if="selectedNotification.type === 'mention' && selectedNotification.metadata.channelName"
              class="flex items-center gap-1"
            >
              <Icon name="lucide:hash" class="w-4 h-4" />
              {{ selectedNotification.metadata.channelName }}
            </span>
          </div>
        </SheetHeader>

        <!-- Content -->
        <div class="mt-6">
          <!-- Announcement Content -->
          <template v-if="selectedNotification.type === 'announcement'">
            <div
              v-if="selectedNotification.content"
              class="prose prose-stone prose-sm max-w-none"
              v-html="selectedNotification.content"
            />

            <!-- CTA Button -->
            <div
              v-if="selectedNotification.metadata.buttonText && selectedNotification.metadata.buttonLink"
              class="mt-6 pt-6 border-t border-stone-100"
            >
              <a
                v-if="getButtonAttrs"
                v-bind="getButtonAttrs"
                class="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
                @click="closeNotification"
              >
                {{ selectedNotification.metadata.buttonText }}
                <Icon
                  v-if="getButtonAttrs.target === '_blank'"
                  name="lucide:external-link"
                  class="w-4 h-4"
                />
                <Icon v-else name="lucide:arrow-right" class="w-4 h-4" />
              </a>
            </div>
          </template>

          <!-- Mention Content -->
          <template v-else-if="selectedNotification.type === 'mention'">
            <div class="p-4 bg-stone-50 rounded-lg">
              <p class="text-sm text-stone-600 mb-2">
                <strong>{{ selectedNotification.metadata.mentionedBy?.name || 'Someone' }}</strong>
                mentioned you:
              </p>
              <p
                v-if="selectedNotification.content"
                class="text-stone-900"
              >
                "{{ selectedNotification.content }}..."
              </p>
            </div>

            <div class="mt-6 pt-6 border-t border-stone-100">
              <button
                @click="navigateToChannel"
                class="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                Go to channel
                <Icon name="lucide:arrow-right" class="w-4 h-4" />
              </button>
            </div>
          </template>

          <!-- Email Content -->
          <template v-else-if="selectedNotification.type === 'email'">
            <div class="p-4 bg-stone-50 rounded-lg">
              <p class="text-sm text-stone-600 mb-2">
                <strong>{{ selectedNotification.subtitle }}</strong>
              </p>
              <p v-if="selectedNotification.content" class="text-stone-900">
                {{ selectedNotification.content }}
              </p>
              <p v-else class="text-stone-500 italic">
                This email was sent to your inbox.
              </p>
            </div>

            <p class="mt-4 text-sm text-stone-500">
              Check your email inbox for the full message.
            </p>
          </template>
        </div>

        <!-- Urgent Warning Banner -->
        <div
          v-if="selectedNotification.priority === 'urgent'"
          class="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <div class="flex items-start gap-3">
            <Icon
              name="lucide:alert-triangle"
              class="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
            />
            <div>
              <p class="font-medium text-red-800">Urgent Notice</p>
              <p class="text-sm text-red-700 mt-1">
                This notification requires your immediate attention.
              </p>
            </div>
          </div>
        </div>
      </template>
    </SheetContent>
  </Sheet>
</template>

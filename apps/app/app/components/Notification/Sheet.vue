<script setup lang="ts">
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { UnifiedNotification } from "#core/app/composables/useNotifications";
import type { HoaAnnouncement } from "#core/types/directus";
import { notificationTargetPath } from "#core/shared/notifications/grouping";

const config = useRuntimeConfig();
const router = useRouter();
const { buildOrgPath } = useOrgNavigation();

const {
  selectedNotification,
  isSheetOpen,
  closeNotification,
  getNotificationStyle,
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

// Single deep-link action — the org-relative target is resolved by the shared
// pure resolver (kept in sync with the bell's click-through), then wrapped with
// buildOrgPath. Replaces the former per-type navigate helpers.
const targetPath = computed(() =>
  selectedNotification.value ? notificationTargetPath(selectedNotification.value) : null
);
const goToTarget = () => {
  if (!targetPath.value) return;
  const path = buildOrgPath(targetPath.value);
  closeNotification();
  router.push(path);
};

// Per-type CTA label (the action button text differs, the handler is shared).
const ctaLabel = computed(() => {
  switch (selectedNotification.value?.type) {
    case "mention":
      return "Go to channel";
    case "meeting":
      return "View meeting";
    case "payment":
      return "View payment";
    case "document":
      return "View document";
    case "membership":
      return "View directory";
    case "request":
      return "View request";
    case "task":
      return "View task";
    case "comment":
      return "View conversation";
    default:
      return "View";
  }
});

// Format a currency amount
const formatAmount = (amount: number | undefined): string => {
  if (amount == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

// Handle sheet close
const handleOpenChange = (open: boolean) => {
  if (!open) {
    closeNotification();
  }
};

// Get button attrs for announcements (external CTA link on the announcement)
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
    <SheetContent side="right" class="w-full sm:max-w-lg overflow-y-auto t-bg t-text">
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
              <template v-else-if="selectedNotification.type === 'email'">
                Email
              </template>
              <template v-else>
                {{ selectedNotification.subtitle || 'Meeting' }}
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

          <SheetTitle class="text-xl font-semibold text-left t-text">
            {{ selectedNotification.title }}
          </SheetTitle>

          <SheetDescription class="sr-only">
            Notification details
          </SheetDescription>

          <!-- Meta Info -->
          <div class="flex flex-wrap items-center gap-3 text-sm t-text-muted">
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
              class="prose prose-stone dark:prose-invert prose-sm max-w-none"
              v-html="selectedNotification.content"
            />

            <!-- CTA Button (announcement's own external/internal link) -->
            <div
              v-if="selectedNotification.metadata.buttonText && selectedNotification.metadata.buttonLink"
              class="mt-6 pt-6 border-t t-border-divider"
            >
              <a
                v-if="getButtonAttrs"
                v-bind="getButtonAttrs"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
                style="background: var(--theme-accent-primary)"
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
            <div class="p-4 t-bg-subtle rounded-lg">
              <p class="text-sm t-text-secondary mb-2">
                <strong>{{ selectedNotification.metadata.mentionedBy?.name || 'Someone' }}</strong>
                mentioned you:
              </p>
              <p v-if="selectedNotification.content" class="t-text">
                "{{ selectedNotification.content }}..."
              </p>
            </div>
          </template>

          <!-- Email Content -->
          <template v-else-if="selectedNotification.type === 'email'">
            <div class="p-4 t-bg-subtle rounded-lg">
              <p class="text-sm t-text-secondary mb-2">
                <strong>{{ selectedNotification.subtitle }}</strong>
              </p>
              <p v-if="selectedNotification.content" class="t-text">
                {{ selectedNotification.content }}
              </p>
              <p v-else class="t-text-muted italic">
                This email was sent to your inbox.
              </p>
            </div>

            <p class="mt-4 text-sm t-text-muted">
              Check your email inbox for the full message.
            </p>
          </template>

          <!-- Meeting Content -->
          <template v-else-if="selectedNotification.type === 'meeting'">
            <div
              v-if="selectedNotification.content"
              class="prose prose-stone dark:prose-invert prose-sm max-w-none"
              v-html="selectedNotification.content"
            />
            <p v-else class="t-text-muted italic">
              A new meeting has been posted for your community.
            </p>
          </template>

          <!-- Payment Content -->
          <template v-else-if="selectedNotification.type === 'payment'">
            <div class="p-4 t-bg-subtle rounded-lg space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm t-text-muted">Amount due</span>
                <span class="text-lg font-semibold t-text">
                  {{ formatAmount(selectedNotification.metadata.amount) }}
                </span>
              </div>
              <div
                v-if="selectedNotification.metadata.dueDate"
                class="flex items-center justify-between"
              >
                <span class="text-sm t-text-muted">Due</span>
                <span class="text-sm t-text-secondary">
                  {{ formatFullDate(selectedNotification.metadata.dueDate) }}
                </span>
              </div>
              <p
                v-if="selectedNotification.content"
                class="text-sm t-text-secondary pt-2 border-t t-border-divider"
              >
                {{ selectedNotification.content }}
              </p>
            </div>
          </template>

          <!-- Document Content -->
          <template v-else-if="selectedNotification.type === 'document'">
            <p class="t-text-secondary">
              A new document is available in your community library.
            </p>
          </template>

          <!-- Membership Content -->
          <template v-else-if="selectedNotification.type === 'membership'">
            <div class="p-4 t-bg-subtle rounded-lg">
              <p class="t-text">
                {{ selectedNotification.title }}
              </p>
              <p
                v-if="selectedNotification.content"
                class="text-sm t-text-muted mt-1"
              >
                {{ selectedNotification.content }}
              </p>
            </div>
          </template>

          <!-- Request Content -->
          <template v-else-if="selectedNotification.type === 'request'">
            <div v-if="selectedNotification.content" class="t-text-secondary">
              {{ selectedNotification.content }}
            </div>
            <p v-else class="t-text-muted italic">
              A request needs your attention.
            </p>
          </template>

          <!-- Task Content -->
          <template v-else-if="selectedNotification.type === 'task'">
            <div v-if="selectedNotification.content" class="t-text-secondary">
              {{ selectedNotification.content }}
            </div>
            <p v-else class="t-text-muted italic">
              A task is assigned to you.
            </p>
          </template>

          <!-- Comment Content -->
          <template v-else-if="selectedNotification.type === 'comment'">
            <div class="p-4 t-bg-subtle rounded-lg">
              <p v-if="selectedNotification.content" class="t-text">
                "{{ selectedNotification.content }}…"
              </p>
              <p v-else class="t-text-muted italic">New comment on a thread you follow.</p>
            </div>
          </template>

          <!-- Shared deep-link action (every type with a resolvable target) -->
          <div v-if="targetPath" class="mt-6 pt-6 border-t t-border-divider">
            <button
              @click="goToTarget"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
              style="background: var(--theme-accent-primary)"
            >
              {{ ctaLabel }}
              <Icon name="lucide:arrow-right" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Urgent Warning Banner -->
        <div
          v-if="selectedNotification.priority === 'urgent'"
          class="mt-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg"
        >
          <div class="flex items-start gap-3">
            <Icon
              name="lucide:alert-triangle"
              class="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
            />
            <div>
              <p class="font-medium text-red-800 dark:text-red-300">Urgent Notice</p>
              <p class="text-sm text-red-700 dark:text-red-400 mt-1">
                This notification requires your immediate attention.
              </p>
            </div>
          </div>
        </div>
      </template>
    </SheetContent>
  </Sheet>
</template>

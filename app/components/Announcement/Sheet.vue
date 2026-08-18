<script setup lang="ts">
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const config = useRuntimeConfig();

const {
  selectedAnnouncement,
  isSheetOpen,
  closeAnnouncement,
  getTypeClasses,
  formatDate,
  expiresSoon,
} = useAnnouncements();

// Site domains for internal link detection
const siteDomains = computed(() => {
  const domains = [
    config.public.siteUrl,
    config.public.appUrl,
  ].filter(Boolean);

  // Add localhost for development
  if (import.meta.dev) {
    domains.push("http://localhost:3000");
    domains.push("https://localhost:3000");
  }

  return domains as string[];
});

// Check if a link is internal
const isInternalLink = (url: string | null | undefined): boolean => {
  if (!url) return false;

  // Relative paths are internal
  if (url.startsWith("/") && !url.startsWith("//")) {
    return true;
  }

  // Check against site domains
  try {
    const linkUrl = new URL(url);
    return siteDomains.value.some((domain) => {
      try {
        const domainUrl = new URL(domain);
        return linkUrl.host === domainUrl.host;
      } catch {
        return false;
      }
    });
  } catch {
    // If URL parsing fails, treat as internal
    return true;
  }
};

// Get button link attributes
const getButtonAttrs = computed(() => {
  const announcement = selectedAnnouncement.value;
  if (!announcement?.button_link) return null;

  const isExternal = announcement.external_link || !isInternalLink(announcement.button_link);

  return {
    href: announcement.button_link,
    target: isExternal ? "_blank" : undefined,
    rel: isExternal ? "noopener noreferrer" : undefined,
  };
});

// Handle sheet close
const handleClose = () => {
  closeAnnouncement();
};

// Handle open change from sheet component
const handleOpenChange = (open: boolean) => {
  if (!open) {
    closeAnnouncement();
  }
};
</script>

<template>
  <Sheet :open="isSheetOpen" @update:open="handleOpenChange">
    <SheetContent
      side="right"
      class="w-full sm:max-w-lg overflow-y-auto"
    >
      <template v-if="selectedAnnouncement">
        <SheetHeader class="space-y-4">
          <!-- Type Badge -->
          <div class="flex items-center gap-2">
            <div
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
              :class="[
                getTypeClasses(selectedAnnouncement.announcement_type).bg,
                getTypeClasses(selectedAnnouncement.announcement_type).text,
              ]"
            >
              <Icon
                :name="'lucide:' + getTypeClasses(selectedAnnouncement.announcement_type).icon"
                class="w-4 h-4"
              />
              {{ getTypeClasses(selectedAnnouncement.announcement_type).label }}
            </div>

            <!-- Pinned Badge -->
            <span
              v-if="selectedAnnouncement.is_pinned"
              class="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full"
            >
              <Icon name="lucide:pin" class="w-3 h-3" />
              Pinned
            </span>
          </div>

          <SheetTitle class="text-xl font-semibold text-left">
            {{ selectedAnnouncement.title }}
          </SheetTitle>

          <SheetDescription class="sr-only">
            Announcement details
          </SheetDescription>

          <!-- Meta Info -->
          <div class="flex flex-wrap items-center gap-3 text-sm text-stone-500">
            <span class="flex items-center gap-1">
              <Icon name="lucide:calendar" class="w-4 h-4" />
              {{ formatDate(selectedAnnouncement.publish_date || selectedAnnouncement.date_created) }}
            </span>

            <span
              v-if="selectedAnnouncement.expiry_date"
              class="flex items-center gap-1"
              :class="{ 'text-orange-600': expiresSoon(selectedAnnouncement) }"
            >
              <Icon name="lucide:clock" class="w-4 h-4" />
              Expires {{ formatDate(selectedAnnouncement.expiry_date) }}
              <span v-if="expiresSoon(selectedAnnouncement)" class="font-medium">
                (soon)
              </span>
            </span>
          </div>
        </SheetHeader>

        <!-- Content -->
        <div class="mt-6">
          <div
            v-if="selectedAnnouncement.content"
            class="prose prose-stone prose-sm max-w-none"
            v-html="selectedAnnouncement.content"
          />

          <!-- CTA Button -->
          <div
            v-if="selectedAnnouncement.button_text && selectedAnnouncement.button_link"
            class="mt-6 pt-6 border-t border-stone-100"
          >
            <a
              v-if="getButtonAttrs"
              v-bind="getButtonAttrs"
              class="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
              @click="handleClose"
            >
              {{ selectedAnnouncement.button_text }}
              <Icon
                v-if="getButtonAttrs.target === '_blank'"
                name="lucide:external-link"
                class="w-4 h-4"
              />
              <Icon
                v-else
                name="lucide:arrow-right"
                class="w-4 h-4"
              />
            </a>
          </div>
        </div>

        <!-- Urgent Warning Banner -->
        <div
          v-if="selectedAnnouncement.announcement_type === 'urgent'"
          class="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg"
        >
          <div class="flex items-start gap-3">
            <Icon name="lucide:alert-triangle" class="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p class="font-medium text-red-800">Urgent Notice</p>
              <p class="text-sm text-red-700 mt-1">
                This announcement requires your immediate attention.
              </p>
            </div>
          </div>
        </div>
      </template>
    </SheetContent>
  </Sheet>
</template>

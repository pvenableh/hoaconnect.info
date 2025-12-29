<script setup lang="ts">
import { toast } from "vue-sonner";
import type { HoaAnnouncement } from "~~/types/directus";

const props = withDefaults(
  defineProps<{
    announcements?: HoaAnnouncement[];
    initialDelay?: number;
    maxTitleLength?: number;
    staggerDelay?: number;
    maxToasts?: number;
  }>(),
  {
    announcements: () => [],
    initialDelay: 1500,
    maxTitleLength: 50,
    staggerDelay: 300,
    maxToasts: 3,
  }
);

const {
  getUnseenAnnouncements,
  isSeen,
  markAsSeen,
  openAnnouncement,
  getTypeClasses,
} = useAnnouncements();

// Track which toasts have been shown this session
const shownToastIds = ref<Set<string>>(new Set());

// Truncate title if too long
const truncateTitle = (title: string | null | undefined, maxLength: number): string => {
  if (!title) return "New Announcement";
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength - 3) + "...";
};

// Get toast icon based on type
const getToastIcon = (type: string | null | undefined) => {
  const icons: Record<string, string> = {
    urgent: "alert-triangle",
    maintenance: "wrench",
    event: "calendar",
    reminder: "bell",
    general: "megaphone",
  };
  return icons[type || "general"] || icons.general;
};

// Show toast for an announcement
const showAnnouncementToast = (announcement: HoaAnnouncement) => {
  // Skip if already shown this session or already seen
  if (shownToastIds.value.has(announcement.id) || isSeen(announcement.id)) {
    return;
  }

  // Skip if show_toast is explicitly false
  if (announcement.show_toast === false) {
    return;
  }

  shownToastIds.value.add(announcement.id);

  const typeClasses = getTypeClasses(announcement.announcement_type);
  const isUrgent = announcement.announcement_type === "urgent";

  toast(truncateTitle(announcement.title, props.maxTitleLength), {
    description: typeClasses.label,
    duration: isUrgent ? 10000 : 5000,
    action: {
      label: "View",
      onClick: () => {
        openAnnouncement(announcement);
      },
    },
    onDismiss: () => {
      markAsSeen(announcement.id);
    },
    onAutoClose: () => {
      markAsSeen(announcement.id);
    },
  });
};

// Show toasts for unseen announcements
const showToasts = () => {
  const unseen = getUnseenAnnouncements(props.announcements)
    .filter((a) => a.show_toast !== false)
    .slice(0, props.maxToasts);

  unseen.forEach((announcement, index) => {
    setTimeout(() => {
      showAnnouncementToast(announcement);
    }, props.staggerDelay * index);
  });
};

// Watch for new announcements
watch(
  () => props.announcements,
  (newAnnouncements, oldAnnouncements) => {
    // Only show toasts for truly new announcements (not on initial load)
    if (oldAnnouncements && oldAnnouncements.length > 0) {
      const oldIds = new Set(oldAnnouncements.map((a) => a.id));
      const newOnes = newAnnouncements.filter((a) => !oldIds.has(a.id));

      newOnes.slice(0, props.maxToasts).forEach((announcement, index) => {
        setTimeout(() => {
          showAnnouncementToast(announcement);
        }, props.staggerDelay * index);
      });
    }
  },
  { deep: true }
);

// Show initial toasts after delay
onMounted(() => {
  if (props.announcements.length > 0) {
    setTimeout(() => {
      showToasts();
    }, props.initialDelay);
  }
});
</script>

<template>
  <!-- This is a non-rendering component that handles toast logic -->
</template>

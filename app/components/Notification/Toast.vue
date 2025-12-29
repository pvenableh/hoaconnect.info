<script setup lang="ts">
import { toast } from "vue-sonner";
import type { UnifiedNotification } from "~/composables/useNotifications";

const props = withDefaults(
  defineProps<{
    initialDelay?: number;
    maxTitleLength?: number;
    staggerDelay?: number;
    maxToasts?: number;
  }>(),
  {
    initialDelay: 1500,
    maxTitleLength: 50,
    staggerDelay: 300,
    maxToasts: 3,
  }
);

const {
  notifications,
  openNotification,
  markAsSeen,
  getNotificationStyle,
} = useNotifications();

// Track which toasts have been shown this session
const shownToastIds = ref<Set<string>>(new Set());

// Truncate title if too long
const truncateTitle = (title: string, maxLength: number): string => {
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength - 3) + "...";
};

// Show toast for a notification
const showNotificationToast = (notification: UnifiedNotification) => {
  // Skip if already shown this session or already read
  if (shownToastIds.value.has(notification.id) || notification.isRead) {
    return;
  }

  // Skip if it's an announcement with show_toast = false
  if (notification.type === "announcement") {
    const original = notification.originalData as any;
    if (original?.show_toast === false) return;
  }

  shownToastIds.value.add(notification.id);

  const style = getNotificationStyle(notification);
  const isUrgent = notification.priority === "urgent";

  // Get description based on type
  let description = notification.subtitle || "";
  if (notification.type === "mention") {
    description = `in ${notification.metadata.channelName || "a channel"}`;
  }

  toast(truncateTitle(notification.title, props.maxTitleLength), {
    description,
    duration: isUrgent ? 10000 : 5000,
    action: {
      label: "View",
      onClick: () => {
        openNotification(notification);
      },
    },
    onDismiss: () => {
      markAsSeen(notification);
    },
    onAutoClose: () => {
      markAsSeen(notification);
    },
  });
};

// Get unseen notifications that should show toasts
const getToastableNotifications = () => {
  return notifications.value.filter((n) => {
    if (n.isRead) return false;
    if (shownToastIds.value.has(n.id)) return false;

    // For announcements, check show_toast flag
    if (n.type === "announcement") {
      const original = n.originalData as any;
      if (original?.show_toast === false) return false;
    }

    return true;
  });
};

// Show toasts for unseen notifications
const showToasts = () => {
  const toastable = getToastableNotifications().slice(0, props.maxToasts);

  toastable.forEach((notification, index) => {
    setTimeout(() => {
      showNotificationToast(notification);
    }, props.staggerDelay * index);
  });
};

// Watch for new notifications
watch(
  () => notifications.value,
  (newNotifications, oldNotifications) => {
    // Only show toasts for truly new notifications (not on initial load)
    if (oldNotifications && oldNotifications.length > 0) {
      const oldIds = new Set(oldNotifications.map((n) => n.id));
      const newOnes = newNotifications.filter((n) => !oldIds.has(n.id) && !n.isRead);

      newOnes.slice(0, props.maxToasts).forEach((notification, index) => {
        setTimeout(() => {
          showNotificationToast(notification);
        }, props.staggerDelay * index);
      });
    }
  },
  { deep: true }
);

// Show initial toasts after delay
onMounted(() => {
  if (notifications.value.length > 0) {
    setTimeout(() => {
      showToasts();
    }, props.initialDelay);
  }
});
</script>

<template>
  <!-- This is a non-rendering component that handles toast logic -->
</template>

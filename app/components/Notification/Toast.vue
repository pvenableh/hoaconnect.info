<script setup lang="ts">
import { toast } from "vue-sonner";
import type { UnifiedNotification } from "#core/app/composables/useNotifications";

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

const bell = useNotifications();
const {
  notifications,
  openNotification,
  markAsSeen,
  getNotificationStyle,
} = bell;

// The v2 bell hands us the row that just ARRIVED over the socket. That single
// signal replaces two pieces of guesswork the aggregator needed: diffing the
// list to work out what was new, and toasting the unread backlog on mount.
//
// The backlog one mattered more than it looks. Read state used to be per-device
// localStorage, so "unread" often just meant "new browser"; now it is durable,
// and toasting three real unread rows on every page load would be nagging, not
// notifying. Under v2 a toast means "this happened while you were looking".
const lastIncoming = "lastIncoming" in bell ? (bell as any).lastIncoming : null;
const isV2 = !!lastIncoming;

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
    // Legacy only. Under v2, "read" archives a durable row, and a toast that
    // times out unwatched is not evidence the member read anything — it is
    // evidence they were elsewhere. Only opening it counts.
    ...(isV2
      ? {}
      : {
          onDismiss: () => markAsSeen(notification),
          onAutoClose: () => markAsSeen(notification),
        }),
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

if (isV2) {
  // One toast per genuinely new row, announced by the store itself.
  watch(lastIncoming, (row: { id?: string } | null) => {
    if (!row?.id) return;
    const match = notifications.value.find((n) => n.id === String(row.id));
    if (match) showNotificationToast(match);
  });
} else {
  // Legacy: infer arrivals by diffing the list, and toast the backlog on mount.
  watch(
    () => notifications.value,
    (newNotifications, oldNotifications) => {
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

  onMounted(() => {
    if (notifications.value.length > 0) {
      setTimeout(() => {
        showToasts();
      }, props.initialDelay);
    }
  });
}
</script>

<template>
  <!-- This is a non-rendering component that handles toast logic -->
</template>

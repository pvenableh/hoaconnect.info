// composables/useNotifications.ts
/**
 * useNotifications - the member's bell, over `directus_notifications`
 *
 * One source: the durable rows the server writes when something happens. This
 * composable is a thin presentation layer over `useDirectusNotifications`,
 * which holds the list, the archived history and the live subscription on the
 * shared WebSocket.
 *
 * It survives from an earlier design that scanned ten collections on every open
 * and kept "seen" in localStorage; `UnifiedNotification` is that design's shape,
 * kept because `Bell`, `Sheet` and `Toast` speak it and the row already arrives
 * in it.
 *
 * Provides:
 * - The unified notification list with type indicators
 * - Total unread count, and counts per type
 * - Global state for the selected notification (sheet)
 * - The archived tab: history, paging, and mark-as-unread
 */

import type {
  HoaAnnouncement,
  HoaChannelMention,
  HoaEmailRecipient,
  HoaMeeting,
  HoaDocument,
  HoaMember,
  PaymentRequest,
} from "#core/types/directus";

// Notification types
export type NotificationType =
  | "announcement"
  | "mention"
  | "email"
  | "meeting"
  | "payment"
  | "document"
  | "membership"
  | "comment"
  | "request"
  | "task";

// Unified notification interface
export interface UnifiedNotification {
  id: string;
  type: NotificationType;
  title: string;
  subtitle?: string;
  content?: string;
  date: string;
  isRead: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
  metadata: {
    // Announcement specific
    announcementType?: string;
    isPinned?: boolean;
    expiryDate?: string;
    buttonText?: string;
    buttonLink?: string;
    // Mention specific
    channelId?: string;
    channelName?: string;
    messageId?: string;
    mentionedBy?: { id: string; name: string };
    // Email specific
    emailId?: string;
    emailType?: string;
    isUrgent?: boolean;
    // Meeting specific
    meetingId?: string;
    meetingType?: string;
    meetingDate?: string;
    // Payment specific
    paymentId?: string;
    paymentRequestType?: string;
    amount?: number;
    dueDate?: string;
    // Document specific
    documentId?: string;
    documentCategory?: string;
    // Membership specific
    memberId?: string;
    memberStatus?: string;
    // Comment specific
    commentId?: string;
    commentTargetCollection?: string;
    commentTargetId?: string;
    // Request specific
    requestId?: string;
    requestType?: string;
    requestStatus?: string;
    // Task specific
    taskId?: string;
    taskStatus?: string;
    taskPriority?: string;
    projectId?: string;
  };
  // Original data for detail view
  originalData:
    | HoaAnnouncement
    | HoaChannelMention
    | HoaEmailRecipient
    | HoaMeeting
    | PaymentRequest
    | HoaDocument
    | HoaMember
    | Record<string, any>;
}

// ── Presentation ─────────────────────────────────────────────────────────────
// Pure functions of one notification. Module-level rather than per-call: the
// three surfaces share them and none of them owns the styling.

// Get icon and color for notification type
const getNotificationStyle = (notification: UnifiedNotification) => {
  if (notification.type === "announcement") {
    const typeStyles: Record<
      string,
      { bg: string; text: string; icon: string }
    > = {
      urgent: {
        bg: "bg-red-50",
        text: "text-red-700",
        icon: "alert-triangle",
      },
      maintenance: {
        bg: "bg-amber-50",
        text: "text-amber-700",
        icon: "wrench",
      },
      event: { bg: "bg-blue-50", text: "text-blue-700", icon: "calendar" },
      reminder: { bg: "bg-purple-50", text: "text-purple-700", icon: "bell" },
      general: {
        bg: "t-bg-subtle",
        text: "t-text-secondary",
        icon: "megaphone",
      },
    };
    return (
      typeStyles[notification.metadata.announcementType || "general"] ||
      typeStyles.general
    );
  }

  if (notification.type === "mention") {
    return { bg: "bg-blue-50", text: "text-blue-700", icon: "at-sign" };
  }

  if (notification.type === "email") {
    return notification.metadata.isUrgent
      ? { bg: "bg-red-50", text: "text-red-700", icon: "mail" }
      : { bg: "bg-green-50", text: "text-green-700", icon: "mail" };
  }

  if (notification.type === "meeting") {
    return { bg: "bg-violet-50", text: "text-violet-700", icon: "users" };
  }

  if (notification.type === "payment") {
    return notification.priority === "urgent"
      ? { bg: "bg-red-50", text: "text-red-700", icon: "credit-card" }
      : { bg: "bg-emerald-50", text: "text-emerald-700", icon: "credit-card" };
  }

  if (notification.type === "document") {
    return { bg: "bg-sky-50", text: "text-sky-700", icon: "file-text" };
  }

  if (notification.type === "membership") {
    return { bg: "bg-indigo-50", text: "text-indigo-700", icon: "user-plus" };
  }

  if (notification.type === "comment") {
    return { bg: "t-bg-subtle", text: "t-text-secondary", icon: "message-circle" };
  }

  if (notification.type === "request") {
    return notification.priority === "urgent"
      ? { bg: "bg-red-50", text: "text-red-700", icon: "clipboard-list" }
      : { bg: "bg-amber-50", text: "text-amber-700", icon: "clipboard-list" };
  }

  if (notification.type === "task") {
    return notification.priority === "urgent"
      ? { bg: "bg-red-50", text: "text-red-700", icon: "check-circle" }
      : { bg: "bg-violet-50", text: "text-violet-700", icon: "check-circle" };
  }

  return { bg: "t-bg-subtle", text: "t-text-secondary", icon: "bell" };
};

// Format date for display
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

// Global state
const selectedNotification = ref<UnifiedNotification | null>(null);
const isSheetOpen = ref(false);

/**
 * The bell.
 *
 * `useDirectusNotifications` is the store; this is the shape the three surfaces
 * consume. What a member gets from it:
 *
 * - Read state is a row status, not a localStorage key, so reading on a laptop
 *   clears the badge on a phone.
 * - The list arrives live over one socket instead of on every open.
 * - `clearSeenNotifications` has nothing left to clear — read state is no longer
 *   local — so it is a documented no-op rather than a removed method.
 */
export const useNotifications = () => {
  const store = useDirectusNotifications();

  const list = computed(() => store.notifications.value as unknown as UnifiedNotification[]);

  const markAsSeen = async (notification: UnifiedNotification) => {
    if (!notification?.id) return;
    await store.markAsRead(String(notification.id));
  };

  const openNotification = (notification: UnifiedNotification) => {
    selectedNotification.value = notification;
    isSheetOpen.value = true;
    void markAsSeen(notification);
  };

  const closeNotification = () => {
    isSheetOpen.value = false;
    setTimeout(() => {
      selectedNotification.value = null;
    }, 300);
  };

  return {
    // State
    notifications: list,
    isLoading: store.isLoading,
    selectedNotification: readonly(selectedNotification),
    isSheetOpen: readonly(isSheetOpen),

    // Actions
    // The audience filter is accepted and ignored: the server decided who each
    // row was for when it wrote it, so there is nothing left for the client to
    // filter by. Kept in the signature so the two layouts that pass one don't
    // have to change.
    fetchNotifications: async (_audienceFilter?: string[]) => {
      await store.refresh(true);
      return list.value;
    },
    markAsSeen,
    markAllAsSeen: () => store.markAllAsRead(),
    openNotification,
    closeNotification,
    /** No-op: read state lives on the row now, not in this browser. */
    clearSeenNotifications: () => {},

    // Computed
    getUnseenCount: store.unreadCount,
    getUnseenCountByType: (type: NotificationType) => store.countsByType.value[type] ?? 0,
    getNotificationsByType: (type: NotificationType) =>
      list.value.filter((n) => n.type === type),

    // Helpers
    getNotificationStyle,
    formatDate,

    // The archived tab: read notifications are archived rather than deleted,
    // so there is a history to page through.
    archivedNotifications: store.archivedNotifications,
    isLoadingArchived: store.isLoadingArchived,
    archivedHasMore: store.archivedHasMore,
    fetchArchived: store.fetchArchived,
    loadMoreArchived: store.loadMoreArchived,
    markAsUnread: store.markAsUnread,
    isConnected: store.isConnected,
    lastIncoming: store.lastIncoming,
  };
};
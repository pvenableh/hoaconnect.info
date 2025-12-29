// composables/useNotifications.ts
/**
 * useNotifications - Unified notification system composable
 *
 * Aggregates notifications from multiple sources:
 * - Announcements (hoa_announcements)
 * - Channel mentions (hoa_channel_mentions)
 * - Emails (hoa_emails via hoa_email_recipients)
 *
 * Provides:
 * - Unified notification list with type indicators
 * - Total unseen count across all types
 * - Type-specific filtering
 * - Global state for selected notification (sheet)
 */

import type {
  HoaAnnouncement,
  HoaChannelMention,
  HoaEmail,
  HoaEmailRecipient,
  HoaChannelMessage,
  HoaChannel,
  DirectusUser,
} from "~~/types/directus";

// Notification types
export type NotificationType = "announcement" | "mention" | "email";

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
  };
  // Original data for detail view
  originalData: HoaAnnouncement | HoaChannelMention | HoaEmailRecipient;
}

// Storage key prefix for seen tracking
const STORAGE_KEY_PREFIX = "hoa-notifications";

// Global state
const selectedNotification = ref<UnifiedNotification | null>(null);
const isSheetOpen = ref(false);
const notifications = ref<UnifiedNotification[]>([]);
const isLoading = ref(false);

export const useNotifications = () => {
  const { user } = useDirectusAuth();
  const { list: listAnnouncements } = useDirectusItems("hoa_announcements");
  const { list: listMentions, update: updateMention } =
    useDirectusItems("hoa_channel_mentions");
  const { list: listEmailRecipients } = useDirectusItems(
    "hoa_email_recipients"
  );

  // Access shared state from useSelectedOrg
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);

  // Storage key with org ID
  const getStorageKey = (type: string) =>
    `${STORAGE_KEY_PREFIX}-${type}-${selectedOrgId.value || "default"}`;

  // Get seen IDs from localStorage
  const getSeenIds = (type: NotificationType): string[] => {
    if (!import.meta.client) return [];
    try {
      const stored = localStorage.getItem(getStorageKey(type));
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  // Save seen IDs to localStorage
  const saveSeenIds = (type: NotificationType, ids: string[]) => {
    if (!import.meta.client) return;
    try {
      localStorage.setItem(getStorageKey(type), JSON.stringify(ids));
    } catch (error) {
      console.error(`Failed to save seen ${type}:`, error);
    }
  };

  // Mark notification as seen
  const markAsSeen = async (notification: UnifiedNotification) => {
    // Update local storage for client-side tracking
    const seenIds = getSeenIds(notification.type);
    if (!seenIds.includes(notification.id)) {
      saveSeenIds(notification.type, [...seenIds, notification.id]);
    }

    // For mentions, also update the server-side is_read flag
    if (notification.type === "mention") {
      try {
        await updateMention(notification.id, { is_read: true });
      } catch (error) {
        console.error("Failed to mark mention as read:", error);
      }
    }

    // Update local state
    const idx = notifications.value.findIndex((n) => n.id === notification.id);
    if (idx !== -1) {
      notifications.value[idx] = { ...notifications.value[idx], isRead: true };
    }
  };

  // Mark all notifications as seen
  const markAllAsSeen = async () => {
    const unread = notifications.value.filter((n) => !n.isRead);

    // Group by type for efficient updates
    const byType = unread.reduce(
      (acc, n) => {
        if (!acc[n.type]) acc[n.type] = [];
        acc[n.type].push(n);
        return acc;
      },
      {} as Record<NotificationType, UnifiedNotification[]>
    );

    // Update localStorage for each type
    for (const [type, items] of Object.entries(byType)) {
      const seenIds = getSeenIds(type as NotificationType);
      const newIds = items.map((n) => n.id).filter((id) => !seenIds.includes(id));
      if (newIds.length > 0) {
        saveSeenIds(type as NotificationType, [...seenIds, ...newIds]);
      }
    }

    // Update mentions on server
    if (byType.mention?.length) {
      try {
        await Promise.all(
          byType.mention.map((n) => updateMention(n.id, { is_read: true }))
        );
      } catch (error) {
        console.error("Failed to mark mentions as read:", error);
      }
    }

    // Update local state
    notifications.value = notifications.value.map((n) => ({
      ...n,
      isRead: true,
    }));
  };

  // Check if notification is seen
  const isSeen = (id: string, type: NotificationType): boolean => {
    return getSeenIds(type).includes(id);
  };

  // Transform announcement to unified notification
  const transformAnnouncement = (
    announcement: HoaAnnouncement
  ): UnifiedNotification => {
    const isRead = isSeen(announcement.id, "announcement");
    const priority =
      announcement.announcement_type === "urgent" ? "urgent" : "normal";

    return {
      id: announcement.id,
      type: "announcement",
      title: announcement.title || "Announcement",
      subtitle: getAnnouncementTypeLabel(announcement.announcement_type),
      content: announcement.content || undefined,
      date: announcement.publish_date || announcement.date_created || "",
      isRead,
      priority,
      metadata: {
        announcementType: announcement.announcement_type || "general",
        isPinned: announcement.is_pinned || false,
        expiryDate: announcement.expiry_date || undefined,
        buttonText: announcement.button_text || undefined,
        buttonLink: announcement.button_link || undefined,
      },
      originalData: announcement,
    };
  };

  // Transform mention to unified notification
  const transformMention = (
    mention: HoaChannelMention & {
      message?: HoaChannelMessage;
      channel?: HoaChannel;
      mentioned_by?: DirectusUser;
    }
  ): UnifiedNotification => {
    const isRead = mention.is_read || isSeen(mention.id, "mention");
    const mentionedByUser = mention.mentioned_by as DirectusUser | undefined;
    const channel = mention.channel as HoaChannel | undefined;
    const message = mention.message as HoaChannelMessage | undefined;

    const mentionedByName = mentionedByUser
      ? `${mentionedByUser.first_name || ""} ${mentionedByUser.last_name || ""}`.trim() ||
        "Someone"
      : "Someone";

    return {
      id: mention.id,
      type: "mention",
      title: `${mentionedByName} mentioned you`,
      subtitle: channel?.name ? `in #${channel.name}` : "in a channel",
      content: message?.content
        ? stripHtml(message.content).substring(0, 100)
        : undefined,
      date: mention.date_created || "",
      isRead,
      priority: "high",
      metadata: {
        channelId:
          typeof mention.channel === "string"
            ? mention.channel
            : mention.channel?.id,
        channelName: channel?.name,
        messageId:
          typeof mention.message === "string"
            ? mention.message
            : mention.message?.id,
        mentionedBy: mentionedByUser
          ? { id: mentionedByUser.id, name: mentionedByName }
          : undefined,
      },
      originalData: mention,
    };
  };

  // Transform email recipient to unified notification
  const transformEmailRecipient = (
    recipient: HoaEmailRecipient & { email?: HoaEmail }
  ): UnifiedNotification => {
    const isRead = isSeen(recipient.id, "email");
    const email = recipient.email as HoaEmail | undefined;

    return {
      id: recipient.id,
      type: "email",
      title: email?.subject || "New Email",
      subtitle: email?.email_type
        ? capitalizeFirst(email.email_type)
        : "Message",
      content: email?.subtitle || undefined,
      date: recipient.sent_at || email?.sent_at || "",
      isRead,
      priority: email?.urgent ? "urgent" : "normal",
      metadata: {
        emailId: typeof recipient.email === "string" ? recipient.email : email?.id,
        emailType: email?.email_type,
        isUrgent: email?.urgent || false,
      },
      originalData: recipient,
    };
  };

  // Fetch all notifications
  const fetchNotifications = async (audienceFilter: string[] = ["all"]) => {
    if (!selectedOrgId.value || !user.value?.id) return [];

    isLoading.value = true;
    const allNotifications: UnifiedNotification[] = [];

    try {
      // Fetch announcements
      const now = new Date().toISOString();
      const announcements = (await listAnnouncements({
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
          "button_text",
          "button_link",
          "external_link",
          "show_toast",
        ],
        filter: {
          organization: { _eq: selectedOrgId.value },
          status: { _eq: "published" },
          target_audience: { _in: audienceFilter },
          _or: [
            { expiry_date: { _null: true } },
            { expiry_date: { _gte: now } },
          ],
        },
        sort: ["-is_pinned", "-publish_date", "-date_created"],
      })) as HoaAnnouncement[];

      allNotifications.push(...announcements.map(transformAnnouncement));

      // Fetch unread mentions for current user
      const mentions = (await listMentions({
        fields: [
          "id",
          "is_read",
          "date_created",
          "message.id",
          "message.content",
          "message.date_created",
          "channel.id",
          "channel.name",
          "mentioned_by.id",
          "mentioned_by.first_name",
          "mentioned_by.last_name",
        ],
        filter: {
          mentioned_user: { _eq: user.value.id },
        },
        sort: ["-date_created"],
        limit: 50,
      })) as (HoaChannelMention & {
        message?: HoaChannelMessage;
        channel?: HoaChannel;
        mentioned_by?: DirectusUser;
      })[];

      allNotifications.push(...mentions.map(transformMention));

      // Fetch recent emails sent to current user
      const userEmail = user.value.email;
      if (userEmail) {
        const emailRecipients = (await listEmailRecipients({
          fields: [
            "id",
            "recipient_email",
            "status",
            "sent_at",
            "email.id",
            "email.subject",
            "email.subtitle",
            "email.email_type",
            "email.urgent",
            "email.sent_at",
            "email.organization",
          ],
          filter: {
            recipient_email: { _eq: userEmail },
            status: { _in: ["sent", "delivered"] },
            email: {
              organization: { _eq: selectedOrgId.value },
            },
          },
          sort: ["-sent_at"],
          limit: 20,
        })) as (HoaEmailRecipient & { email?: HoaEmail })[];

        allNotifications.push(...emailRecipients.map(transformEmailRecipient));
      }

      // Sort all notifications by date (newest first)
      allNotifications.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      notifications.value = allNotifications;
      return allNotifications;
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
      return [];
    } finally {
      isLoading.value = false;
    }
  };

  // Get unseen count
  const getUnseenCount = computed(() => {
    return notifications.value.filter((n) => !n.isRead).length;
  });

  // Get unseen count by type
  const getUnseenCountByType = (type: NotificationType) => {
    return notifications.value.filter((n) => n.type === type && !n.isRead)
      .length;
  };

  // Get notifications by type
  const getNotificationsByType = (type: NotificationType) => {
    return notifications.value.filter((n) => n.type === type);
  };

  // Open notification in sheet
  const openNotification = (notification: UnifiedNotification) => {
    selectedNotification.value = notification;
    isSheetOpen.value = true;
    markAsSeen(notification);
  };

  // Close sheet
  const closeNotification = () => {
    isSheetOpen.value = false;
    setTimeout(() => {
      selectedNotification.value = null;
    }, 300);
  };

  // Clear all seen notifications (for testing)
  const clearSeenNotifications = () => {
    if (!import.meta.client) return;
    localStorage.removeItem(getStorageKey("announcement"));
    localStorage.removeItem(getStorageKey("mention"));
    localStorage.removeItem(getStorageKey("email"));
  };

  // Helper functions
  const getAnnouncementTypeLabel = (type: string | null | undefined): string => {
    const labels: Record<string, string> = {
      urgent: "Urgent",
      maintenance: "Maintenance",
      event: "Event",
      reminder: "Reminder",
      general: "General",
    };
    return labels[type || "general"] || "General";
  };

  const stripHtml = (html: string): string => {
    return html.replace(/<[^>]*>/g, "").trim();
  };

  const capitalizeFirst = (str: string): string => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

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
          bg: "bg-stone-50",
          text: "text-stone-700",
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

    return { bg: "bg-stone-50", text: "text-stone-700", icon: "bell" };
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

  return {
    // State
    notifications: readonly(notifications),
    isLoading: readonly(isLoading),
    selectedNotification: readonly(selectedNotification),
    isSheetOpen: readonly(isSheetOpen),

    // Actions
    fetchNotifications,
    markAsSeen,
    markAllAsSeen,
    openNotification,
    closeNotification,
    clearSeenNotifications,

    // Computed
    getUnseenCount,
    getUnseenCountByType,
    getNotificationsByType,

    // Helpers
    getNotificationStyle,
    formatDate,
  };
};

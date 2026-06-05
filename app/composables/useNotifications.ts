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
  HoaMeeting,
  HoaDocument,
  HoaMember,
  PaymentRequest,
  DirectusUser,
} from "~~/types/directus";

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
  | "request";

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
  const { list: listMeetings } = useDirectusItems("hoa_meetings");
  const { list: listPaymentRequests } = useDirectusItems("payment_requests");
  const { list: listDocuments } = useDirectusItems("hoa_documents");
  const { list: listMembers } = useDirectusItems("hoa_members");
  const { list: listComments } = useDirectusItems("hoa_comments");
  const { list: listRequests } = useDirectusItems("hoa_requests");

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

  // Transform meeting to unified notification
  const MEETING_TYPE_LABELS: Record<string, string> = {
    board: "Board Meeting",
    annual: "Annual Meeting",
    special: "Special Meeting",
    committee: "Committee Meeting",
  };
  const transformMeeting = (meeting: HoaMeeting): UnifiedNotification => {
    const isRead = isSeen(meeting.id, "meeting");
    return {
      id: meeting.id,
      type: "meeting",
      title: meeting.title || "Meeting",
      subtitle: MEETING_TYPE_LABELS[meeting.type || "board"] || "Meeting",
      content: meeting.agenda || undefined,
      date: meeting.date_created || meeting.meeting_date || "",
      isRead,
      priority: "normal",
      metadata: {
        meetingId: meeting.id,
        meetingType: meeting.type || "board",
        meetingDate: meeting.meeting_date || undefined,
      },
      originalData: meeting,
    };
  };

  // Transform payment request to unified notification (member-facing)
  const PAYMENT_TYPE_LABELS: Record<string, string> = {
    monthly_dues: "Monthly Dues",
    assessment: "Assessment",
    late_fee: "Late Fee",
    other: "Payment",
  };
  const transformPayment = (
    payment: PaymentRequest
  ): UnifiedNotification => {
    const isRead = isSeen(payment.id, "payment");
    const isOverdue = payment.status === "overdue";
    return {
      id: payment.id,
      type: "payment",
      title: payment.title || "Payment Request",
      subtitle: PAYMENT_TYPE_LABELS[payment.request_type || "other"] || "Payment",
      content: payment.description || undefined,
      date: payment.due_date || payment.date_created || "",
      isRead,
      priority: isOverdue ? "urgent" : "high",
      metadata: {
        paymentId: payment.id,
        paymentRequestType: payment.request_type || "other",
        amount: payment.amount ?? undefined,
        dueDate: payment.due_date || undefined,
      },
      originalData: payment,
    };
  };

  // Transform document to unified notification (newly published docs)
  const transformDocument = (doc: HoaDocument): UnifiedNotification => {
    const isRead = isSeen(doc.id, "document");
    const category =
      typeof doc.document_category === "object" && doc.document_category
        ? doc.document_category.name
        : undefined;
    return {
      id: doc.id,
      type: "document",
      title: doc.title || "New Document",
      subtitle: category || "Document",
      content: undefined,
      date: doc.date_published || doc.date_created || "",
      isRead,
      priority: "normal",
      metadata: {
        documentId: doc.id,
        documentCategory: category || undefined,
      },
      originalData: doc,
    };
  };

  // Transform member to unified notification (membership activity, admin-facing)
  const transformMembership = (member: HoaMember): UnifiedNotification => {
    const isRead = isSeen(member.id, "membership");
    const name =
      `${member.first_name || ""} ${member.last_name || ""}`.trim() ||
      member.email ||
      "New member";
    const isPending = member.status === "pending";
    return {
      id: member.id,
      type: "membership",
      title: isPending ? `${name} requested to join` : `${name} joined`,
      subtitle: isPending ? "Pending approval" : "New member",
      content: member.email || undefined,
      date: member.date_created || "",
      isRead,
      priority: isPending ? "high" : "normal",
      metadata: {
        memberId: member.id,
        memberStatus: member.status || undefined,
      },
      originalData: member,
    };
  };

  // Transform a comment into a notification (thread participation)
  const TARGET_LABELS: Record<string, string> = {
    hoa_announcements: "an announcement",
    hoa_documents: "a document",
    hoa_meetings: "a meeting",
    hoa_requests: "a request",
    payment_requests: "a payment",
    hoa_comments: "a comment",
  };
  const transformComment = (comment: any): UnifiedNotification => {
    const isRead = isSeen(comment.id, "comment");
    const author = comment.user_created;
    const authorName =
      author && typeof author === "object"
        ? `${author.first_name || ""} ${author.last_name || ""}`.trim() || "Someone"
        : "Someone";
    const where = TARGET_LABELS[comment.target_collection] || "a discussion";
    return {
      id: comment.id,
      type: "comment",
      title: `${authorName} commented`,
      subtitle: `on ${where}`,
      content: comment.body ? stripHtml(comment.body).substring(0, 120) : undefined,
      date: comment.date_created || "",
      isRead,
      priority: "normal",
      metadata: {
        commentId: comment.id,
        commentTargetCollection: comment.target_collection,
        commentTargetId: comment.target_id,
      },
      originalData: comment,
    };
  };

  // Transform a request into a notification (new / assigned / status change)
  const transformRequest = (request: any): UnifiedNotification => {
    const isRead = isSeen(request.id, "request");
    return {
      id: request.id,
      type: "request",
      title: request.title || "Request",
      subtitle: `${capitalizeFirst(request.type || "request")} · ${capitalizeFirst(
        (request.status || "open").replace(/_/g, " ")
      )}`,
      content: request.description
        ? stripHtml(request.description).substring(0, 120)
        : undefined,
      date: request.date_updated || request.date_created || "",
      isRead,
      priority: request.priority === "urgent" ? "urgent" : "normal",
      metadata: {
        requestId: request.id,
        requestType: request.type || undefined,
        requestStatus: request.status || undefined,
      },
      originalData: request,
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

      // Fetch published meetings (audience-targeted). Isolated so a failure
      // here never drops the announcements/mentions/emails already collected.
      try {
        const meetingAudience = audienceFilter.map((a) =>
          a === "board members" ? "board_members" : a
        );
        const meetings = (await listMeetings({
          fields: [
            "id",
            "title",
            "type",
            "agenda",
            "meeting_date",
            "date_created",
            "is_published",
            "target_audience",
          ],
          filter: {
            organization: { _eq: selectedOrgId.value },
            is_published: { _eq: true },
            target_audience: { _in: meetingAudience },
          },
          sort: ["-date_created"],
          limit: 20,
        })) as HoaMeeting[];
        allNotifications.push(...meetings.map(transformMeeting));
      } catch (e) {
        console.warn("Failed to fetch meeting notifications:", e);
      }

      // Fetch outstanding payment requests for the current user (member-facing).
      // Isolated so a failure can't drop the rest.
      try {
        const payments = (await listPaymentRequests({
          fields: [
            "id",
            "title",
            "description",
            "request_type",
            "status",
            "amount",
            "due_date",
            "date_created",
          ],
          filter: {
            organization: { _eq: selectedOrgId.value },
            member: { user: { _eq: user.value.id } },
            status: { _in: ["active", "partially_paid", "overdue"] },
          },
          sort: ["-date_created"],
          limit: 20,
        })) as PaymentRequest[];
        allNotifications.push(...payments.map(transformPayment));
      } catch (e) {
        console.warn("Failed to fetch payment notifications:", e);
      }

      // Fetch recently published documents for the org. Isolated.
      try {
        const documents = (await listDocuments({
          fields: [
            "id",
            "title",
            "status",
            "date_published",
            "date_created",
            "document_category.id",
            "document_category.name",
          ],
          filter: {
            organization: { _eq: selectedOrgId.value },
            status: { _eq: "published" },
          },
          sort: ["-date_published", "-date_created"],
          limit: 15,
        })) as HoaDocument[];
        allNotifications.push(...documents.map(transformDocument));
      } catch (e) {
        console.warn("Failed to fetch document notifications:", e);
      }

      // Fetch pending membership requests for the org (admin-facing). Isolated.
      try {
        const members = (await listMembers({
          fields: [
            "id",
            "first_name",
            "last_name",
            "email",
            "status",
            "date_created",
          ],
          filter: {
            organization: { _eq: selectedOrgId.value },
            status: { _eq: "pending" },
          },
          sort: ["-date_created"],
          limit: 20,
        })) as HoaMember[];
        allNotifications.push(...members.map(transformMembership));
      } catch (e) {
        console.warn("Failed to fetch membership notifications:", e);
      }

      // Fetch requests assigned to or submitted by the current user. Isolated
      // (the hoa_requests collection may not exist until Phase 5 migration).
      try {
        const requests = (await listRequests({
          fields: [
            "id",
            "title",
            "type",
            "status",
            "priority",
            "description",
            "date_created",
            "date_updated",
          ],
          filter: {
            organization: { _eq: selectedOrgId.value },
            status: { _nin: ["closed"] },
            _or: [
              { assigned_to: { _eq: user.value.id } },
              { submitted_by: { _eq: user.value.id } },
            ],
          },
          sort: ["-date_updated"],
          limit: 20,
        })) as any[];
        allNotifications.push(...requests.map(transformRequest));
      } catch (e) {
        console.warn("Failed to fetch request notifications:", e);
      }

      // Fetch comments on threads the user participates in (authored a comment
      // on the same target), by others, excluding @mentions (those surface as
      // mentions). Isolated — hoa_comments may not exist until Phase 5.
      try {
        const myComments = (await listComments({
          fields: ["target_collection", "target_id"],
          filter: {
            organization: { _eq: selectedOrgId.value },
            user_created: { _eq: user.value.id },
            status: { _neq: "deleted" },
          },
          limit: 100,
        })) as any[];

        // Distinct target pairs the user participates in.
        const seenKeys = new Set<string>();
        const targetConds: any[] = [];
        for (const c of myComments) {
          const key = `${c.target_collection}::${c.target_id}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          targetConds.push({
            _and: [
              { target_collection: { _eq: c.target_collection } },
              { target_id: { _eq: c.target_id } },
            ],
          });
        }

        if (targetConds.length) {
          const others = (await listComments({
            fields: [
              "id",
              "body",
              "target_collection",
              "target_id",
              "date_created",
              "is_internal",
              "mentioned_users",
              "user_created.id",
              "user_created.first_name",
              "user_created.last_name",
            ],
            filter: {
              organization: { _eq: selectedOrgId.value },
              status: { _neq: "deleted" },
              is_internal: { _eq: false },
              user_created: { _neq: user.value.id },
              _or: targetConds,
            },
            sort: ["-date_created"],
            limit: 30,
          })) as any[];

          const fresh = others.filter(
            (c) => !(c.mentioned_users || []).includes(user.value!.id)
          );
          allNotifications.push(...fresh.map(transformComment));
        }
      } catch (e) {
        console.warn("Failed to fetch comment notifications:", e);
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
    localStorage.removeItem(getStorageKey("meeting"));
    localStorage.removeItem(getStorageKey("payment"));
    localStorage.removeItem(getStorageKey("document"));
    localStorage.removeItem(getStorageKey("membership"));
    localStorage.removeItem(getStorageKey("comment"));
    localStorage.removeItem(getStorageKey("request"));
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
      return { bg: "bg-slate-50", text: "text-slate-700", icon: "message-circle" };
    }

    if (notification.type === "request") {
      return notification.priority === "urgent"
        ? { bg: "bg-red-50", text: "text-red-700", icon: "clipboard-list" }
        : { bg: "bg-amber-50", text: "text-amber-700", icon: "clipboard-list" };
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

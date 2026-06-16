// composables/useEmailSystem.ts
/**
 * useEmailSystem - Email management composable for HOA organizations
 *
 * Provides functionality to:
 * - Create and manage email drafts
 * - Send emails to members (individual or bulk)
 * - Preview emails before sending
 * - View email history and statistics
 *
 * Usage:
 * const emailSystem = useEmailSystem()
 * await emailSystem.sendEmail({ ... })
 * await emailSystem.saveDraft({ ... })
 * const emails = await emailSystem.listEmails(orgId)
 */

import type { HoaEmail, HoaEmailRecipient, HoaMember } from "#core/types/directus";

export type EmailType = "basic" | "alert" | "newsletter" | "announcement" | "reminder" | "notice";

export interface EmailAttachmentInfo {
  id: string;
  filename: string;
  type: string;
  size: number;
}

export type EmailContentMode = "visual" | "mjml";

export interface EmailFormData {
  subject: string;
  content: string;
  emailType: EmailType;
  contentMode?: EmailContentMode;
  greeting?: string;
  salutation?: string;
  includeBoardFooter?: boolean;
  recipientIds: string[];
  attachmentIds?: string[];
  /** Per-send override of the org's default header line ("Official Communication of …"). */
  headerText?: string | null;
  /** Per-send override of the org's default footer building photo (Directus file id). */
  footerImageId?: string | null;
  /** CC entries — emails and/or group tokens (@board, @property_manager). */
  cc?: string[];
  /** BCC entries — emails and/or group tokens. */
  bcc?: string[];
}

export interface EmailSaveData {
  emailId?: string;
  organizationId: string;
  subject: string;
  content: string;
  emailType: EmailType;
  contentMode?: EmailContentMode;
  greeting?: string;
  salutation?: string;
  includeBoardFooter?: boolean;
  status?: "draft" | "scheduled";
  scheduledAt?: string;
  recurrenceRule?: "none" | "weekly" | "monthly";
  recipientFilter?: "all" | "owners" | "tenants" | "custom";
  recipientIds?: string[];
  attachmentIds?: string[];
  /** Per-send override of the org's default header line ("Official Communication of …"). */
  headerText?: string | null;
  /** Per-send override of the org's default footer building photo (Directus file id). */
  footerImageId?: string | null;
  /** CC entries — emails and/or group tokens (@board, @property_manager). */
  cc?: string[];
  /** BCC entries — emails and/or group tokens. */
  bcc?: string[];
}

export interface EmailSendData extends EmailFormData {
  organizationId: string;
  emailId?: string;
}

export interface EmailPreviewData {
  organizationId: string;
  subject: string;
  content: string;
  emailType: EmailType;
  contentMode?: EmailContentMode;
  greeting?: string;
  salutation?: string;
  includeBoardFooter?: boolean;
  attachmentIds?: string[];
  headerText?: string | null;
  footerImageId?: string | null;
}

export interface EmailListResponse {
  success: boolean;
  emails: HoaEmail[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface EmailSendResponse {
  success: boolean;
  emailId: string;
  stats: {
    total: number;
    delivered: number;
    failed: number;
  };
  recipients: Array<{
    memberId: string;
    email: string;
    status: "sent" | "failed";
    error?: string;
  }>;
}

export interface EmailPreviewResponse {
  success: boolean;
  html: string;
  organization: {
    id: string;
    name: string;
  };
  boardMemberCount: number;
  attachments?: EmailAttachmentInfo[];
}

export interface EmailTestData {
  organizationId: string;
  emailId: string; // Required - email must be saved as draft first
  testEmails: string[]; // Array of email addresses to send test to
  subject: string;
  content: string;
  emailType: EmailType;
  contentMode?: EmailContentMode;
  greeting?: string;
  salutation?: string;
  includeBoardFooter?: boolean;
  attachmentIds?: string[]; // File IDs from Directus to attach
  /** Per-send override of the org's default header line ("Official Communication of …"). */
  headerText?: string | null;
}

export interface EmailTestResult {
  email: string;
  success: boolean;
  messageId?: string | null;
  error?: string;
}

export interface EmailTestResponse {
  success: boolean;
  message: string;
  results: EmailTestResult[];
  details: {
    htmlLength: number;
    textLength: number;
    imagesProcessed: number;
    boardMembersIncluded: number;
    totalSent: number;
    totalFailed: number;
  };
}

// Email type display information
export const emailTypeOptions: Array<{
  value: EmailType;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: "basic",
    label: "Basic Email",
    description: "Simple communication for general updates",
    icon: "heroicons-outline:mail",
  },
  {
    value: "alert",
    label: "Alert",
    description: "Urgent, simple notice — the fastest way to reach members",
    icon: "heroicons-outline:exclamation",
  },
  {
    value: "newsletter",
    label: "Newsletter",
    description: "Regular updates and community news",
    icon: "heroicons-outline:newspaper",
  },
  {
    value: "announcement",
    label: "Announcement",
    description: "Important announcements requiring attention",
    icon: "heroicons-outline:speakerphone",
  },
  {
    value: "reminder",
    label: "Reminder",
    description: "Reminders for deadlines or events",
    icon: "heroicons-outline:bell",
  },
  {
    value: "notice",
    label: "Notice",
    description: "Official notices and formal communications",
    icon: "heroicons-outline:document-text",
  },
];

// Default salutations for each email type
export const defaultSalutations: Record<EmailType, string> = {
  basic: "Best regards",
  alert: "Sincerely",
  newsletter: "Warm regards",
  announcement: "Sincerely",
  reminder: "Thank you",
  notice: "Respectfully",
};

// Default greeting template - {{first_name}} will be replaced with recipient's name or org fallback
export const defaultGreeting = "Hello {{first_name}},";

// Merge field catalog for the composer's insert menu. Keep in sync with
// server/utils/email-merge.ts (MERGE_FIELDS). Tokens resolve per recipient at
// send time (vehicle/pet/parking use the recipient's first matching record).
export const mergeFieldGroups: Array<{
  group: string;
  fields: Array<{ token: string; label: string }>;
}> = [
  {
    group: "Resident",
    fields: [
      { token: "first_name", label: "First name" },
      { token: "last_name", label: "Last name" },
      { token: "full_name", label: "Full name" },
      { token: "email", label: "Email" },
      { token: "phone", label: "Phone" },
      { token: "member_type", label: "Owner/Tenant" },
      { token: "company", label: "Company" },
      { token: "outstanding_balance", label: "Balance due" },
      { token: "payment_status", label: "Payment status" },
      { token: "last_payment_amount", label: "Last payment" },
      { token: "last_payment_date", label: "Last payment date" },
    ],
  },
  {
    group: "Unit & Vehicle",
    fields: [
      { token: "unit", label: "Unit #" },
      { token: "vehicle", label: "Vehicle" },
      { token: "license_plate", label: "License plate" },
      { token: "parking_spot", label: "Parking spot #" },
    ],
  },
  {
    group: "Pet & Org",
    fields: [
      { token: "pet", label: "Pet name" },
      { token: "pet_type", label: "Pet type" },
      { token: "org_name", label: "Org name" },
      { token: "org_address", label: "Org address" },
      { token: "org_phone", label: "Org phone" },
    ],
  },
];

export const useEmailSystem = () => {
  const { loggedIn } = useUserSession();

  // Loading and error states
  const isLoading = ref(false);
  const isSending = ref(false);
  const error = ref<string | null>(null);

  /**
   * Helper to get fetch options with proper headers for SSR
   * During SSR, cookies need to be explicitly forwarded to internal API calls
   */
  const getFetchOptions = () => {
    const headers = useRequestHeaders(["cookie"]);
    return { headers };
  };

  /**
   * Send emails to selected members
   */
  const sendEmail = async (data: EmailSendData): Promise<EmailSendResponse> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    isSending.value = true;
    error.value = null;

    try {
      const response = await $fetch<EmailSendResponse>("/api/email/send", {
        method: "POST",
        body: data,
        ...getFetchOptions(),
      });

      return response;
    } catch (err: any) {
      error.value = err.data?.message || err.message || "Failed to send email";
      throw err;
    } finally {
      isSending.value = false;
    }
  };

  /**
   * Save email as draft or scheduled
   */
  const saveDraft = async (data: EmailSaveData): Promise<{ success: boolean; email: { id: string; status: string; subject: string } }> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    isLoading.value = true;
    error.value = null;

    try {
      const response = await $fetch("/api/email/save", {
        method: "POST",
        body: data,
        ...getFetchOptions(),
      });

      return response as { success: boolean; email: { id: string; status: string; subject: string } };
    } catch (err: any) {
      error.value = err.data?.message || err.message || "Failed to save draft";
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Generate email preview HTML
   */
  const previewEmail = async (data: EmailPreviewData): Promise<EmailPreviewResponse> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    isLoading.value = true;
    error.value = null;

    try {
      const response = await $fetch<EmailPreviewResponse>("/api/email/preview", {
        method: "POST",
        body: data,
        ...getFetchOptions(),
      });

      return response;
    } catch (err: any) {
      error.value = err.data?.message || err.message || "Failed to generate preview";
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Send a test email to verify rendering before sending to all recipients
   */
  const sendTestEmail = async (data: EmailTestData): Promise<EmailTestResponse> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    isSending.value = true;
    error.value = null;

    try {
      const response = await $fetch<EmailTestResponse>("/api/email/test", {
        method: "POST",
        body: data,
        ...getFetchOptions(),
      });

      return response;
    } catch (err: any) {
      error.value = err.data?.message || err.message || "Failed to send test email";
      throw err;
    } finally {
      isSending.value = false;
    }
  };

  /**
   * List emails for an organization
   */
  const listEmails = async (
    organizationId: string,
    options: { status?: string; page?: number; limit?: number } = {}
  ): Promise<EmailListResponse> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    isLoading.value = true;
    error.value = null;

    try {
      const params = new URLSearchParams({
        organizationId,
        ...(options.status && { status: options.status }),
        ...(options.page && { page: options.page.toString() }),
        ...(options.limit && { limit: options.limit.toString() }),
      });

      const response = await $fetch<EmailListResponse>(`/api/email/list?${params}`, {
        ...getFetchOptions(),
      });

      return response;
    } catch (err: any) {
      error.value = err.data?.message || err.message || "Failed to fetch emails";
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Get a single email by ID
   */
  const getEmail = async (
    id: string
  ): Promise<{ success: boolean; email: HoaEmail & { recipients: HoaEmailRecipient[] } }> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    isLoading.value = true;
    error.value = null;

    try {
      const response = await $fetch(`/api/email/${id}`, {
        ...getFetchOptions(),
      });
      return response as { success: boolean; email: HoaEmail & { recipients: HoaEmailRecipient[] } };
    } catch (err: any) {
      error.value = err.data?.message || err.message || "Failed to fetch email";
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Delete a draft email
   */
  const deleteEmail = async (id: string): Promise<{ success: boolean; message: string }> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    isLoading.value = true;
    error.value = null;

    try {
      const response = await $fetch(`/api/email/${id}`, {
        method: "DELETE",
        ...getFetchOptions(),
      });
      return response as { success: boolean; message: string };
    } catch (err: any) {
      error.value = err.data?.message || err.message || "Failed to delete email";
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Get email type display info
   */
  const getEmailTypeInfo = (type: EmailType) => {
    return emailTypeOptions.find((opt) => opt.value === type) || emailTypeOptions[0];
  };

  /**
   * Get email status display info
   */
  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; color: string; icon: string }> = {
      draft: { label: "Draft", color: "gray", icon: "heroicons-outline:pencil" },
      scheduled: { label: "Scheduled", color: "blue", icon: "heroicons-outline:clock" },
      sending: { label: "Sending", color: "yellow", icon: "heroicons-outline:refresh" },
      sent: { label: "Sent", color: "green", icon: "heroicons-outline:check-circle" },
      failed: { label: "Failed", color: "red", icon: "heroicons-outline:x-circle" },
    };
    return statusMap[status] || statusMap.draft;
  };

  /**
   * Format email statistics
   */
  const formatStats = (email: HoaEmail) => {
    const total = email.recipient_count || 0;
    const delivered = email.delivered_count || 0;
    const failed = email.failed_count || 0;
    const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;

    return {
      total,
      delivered,
      failed,
      deliveryRate,
      summary: `${delivered}/${total} delivered (${deliveryRate}%)`,
    };
  };

  return {
    // State
    isLoading: readonly(isLoading),
    isSending: readonly(isSending),
    error: readonly(error),

    // Actions
    sendEmail,
    sendTestEmail,
    saveDraft,
    previewEmail,
    listEmails,
    getEmail,
    deleteEmail,

    // Helpers
    getEmailTypeInfo,
    getStatusInfo,
    formatStats,

    // Constants
    emailTypeOptions,
    defaultSalutations,
    defaultGreeting,
    mergeFieldGroups,
  };
};

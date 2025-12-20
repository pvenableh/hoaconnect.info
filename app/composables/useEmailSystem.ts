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

import type { HoaEmail, HoaEmailRecipient, HoaMember } from "~~/types/directus";

export type EmailType = "basic" | "newsletter" | "announcement" | "reminder" | "notice";

export interface EmailFormData {
  subject: string;
  content: string;
  emailType: EmailType;
  salutation?: string;
  includeBoardFooter?: boolean;
  recipientIds: string[];
}

export interface EmailSaveData {
  emailId?: string;
  organizationId: string;
  subject: string;
  content: string;
  emailType: EmailType;
  salutation?: string;
  includeBoardFooter?: boolean;
  status?: "draft" | "scheduled";
  scheduledAt?: string;
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
  salutation?: string;
  includeBoardFooter?: boolean;
  recipientName?: string;
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
  newsletter: "Warm regards",
  announcement: "Sincerely",
  reminder: "Thank you",
  notice: "Respectfully",
};

export const useEmailSystem = () => {
  const { loggedIn } = useUserSession();

  // Loading and error states
  const isLoading = ref(false);
  const isSending = ref(false);
  const error = ref<string | null>(null);

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

      const response = await $fetch<EmailListResponse>(`/api/email/list?${params}`);

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
      const response = await $fetch(`/api/email/${id}`);
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
  };
};

import { createItem, updateItem, readItem, readItems } from "@directus/sdk";
import type { EmailType } from "../../utils/email-templates-mjml";

interface SaveEmailBody {
  emailId?: string;
  organizationId: string;
  subject: string;
  content: string;
  emailType: EmailType;
  contentMode?: "visual" | "mjml";
  greeting?: string;
  salutation?: string;
  includeBoardFooter?: boolean;
  status?: "draft" | "scheduled";
  scheduledAt?: string;
  recurrenceRule?: "none" | "weekly" | "monthly";
  recipientFilter?: "all" | "owners" | "tenants" | "custom";
  recipientIds?: string[];
  attachmentIds?: string[];
  headerText?: string | null;
  footerImageId?: string | null;
  cc?: string[];
  bcc?: string[];
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody<SaveEmailBody>(event);

  const {
    emailId,
    organizationId,
    subject,
    content,
    emailType,
    contentMode = "visual",
    greeting,
    salutation,
    includeBoardFooter = true,
    status = "draft",
    scheduledAt,
    recurrenceRule = "none",
    recipientFilter = "all",
    recipientIds,
    attachmentIds,
    headerText,
    footerImageId,
    cc,
    bcc,
  } = body;

  // Validation
  if (!organizationId || !subject || !content || !emailType) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields: organizationId, subject, content, emailType",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Format attachments for M2M relationship
    const attachmentsData = attachmentIds && attachmentIds.length > 0
      ? attachmentIds.map(fileId => ({ directus_files_id: fileId }))
      : [];

    // Resolve a friendly web_slug so drafts are shareable with a pretty URL.
    // Reuse an existing one; otherwise derive it from the subject, unique per org.
    let webSlug: string | null = null;
    if (emailId) {
      const existing = (await directus.request(
        readItem("hoa_emails", emailId, { fields: ["web_slug"] })
      )) as { web_slug?: string | null };
      webSlug = existing?.web_slug || null;
    }
    if (!webSlug) {
      const slugRows = (await directus.request(
        readItems("hoa_emails", {
          filter: {
            organization: { _eq: organizationId },
            web_slug: { _nnull: true },
            ...(emailId ? { id: { _neq: emailId } } : {}),
          },
          fields: ["web_slug"],
          limit: -1,
        })
      )) as Array<{ web_slug?: string | null }>;
      const taken = new Set(slugRows.map((r) => r.web_slug).filter(Boolean) as string[]);
      webSlug = buildUniqueWebSlug(subject, taken);
    }

    const emailData = {
      organization: organizationId,
      subject,
      content,
      email_type: emailType,
      content_mode: contentMode,
      greeting: greeting || null,
      salutation: salutation || null,
      include_board_footer: includeBoardFooter,
      status,
      scheduled_at: scheduledAt || null,
      recurrence_rule: recurrenceRule,
      recipient_filter: recipientFilter,
      recipient_ids: recipientIds && recipientIds.length > 0 ? recipientIds : null,
      next_run_at: status === "scheduled" ? scheduledAt || null : null,
      attachments: attachmentsData,
      header_text: headerText || null,
      footer_image: footerImageId || null,
      cc: cc?.length ? cc : null,
      bcc: bcc?.length ? bcc : null,
      web_slug: webSlug,
    };

    let email;
    if (emailId) {
      // Verify the email exists and belongs to this organization
      const existingEmail = await directus.request(
        readItem("hoa_emails", emailId, {
          fields: ["id", "organization", "status"],
        })
      );

      if (!existingEmail) {
        throw createError({
          statusCode: 404,
          message: "Email not found",
        });
      }

      if (existingEmail.organization !== organizationId) {
        throw createError({
          statusCode: 403,
          message: "Email does not belong to this organization",
        });
      }

      // Only allow updating drafts or scheduled emails
      if (existingEmail.status !== "draft" && existingEmail.status !== "scheduled") {
        throw createError({
          statusCode: 400,
          message: "Cannot update sent or sending emails",
        });
      }

      email = await directus.request(updateItem("hoa_emails", emailId, emailData));
    } else {
      email = await directus.request(createItem("hoa_emails", emailData));
    }

    return {
      success: true,
      email: {
        id: email.id,
        status: email.status,
        subject: email.subject,
      },
    };
  } catch (error: any) {
    console.error("Email save error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to save email",
    });
  }
});

import { createItem, updateItem, readItem, readItems } from "@directus/sdk";
import type { EmailType } from "../../utils/email-templates-mjml";
import { resolveEmailClass } from "#core/shared/email/email-class";
import { checkSendCompliance } from "#core/shared/email/unsubscribe";
import { emailComplianceSchema } from "../../utils/email-compliance";

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
  /** essential | community — defaults from emailType; a newsletter can't be essential. */
  emailClass?: string;
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
    emailClass: requestedClass,
  } = body;

  // Validation
  if (!organizationId || !subject || !content || !emailType) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields: organizationId, subject, content, emailType",
    });
  }

  // Authorize: the same gate as send.post.ts. A saved email with status
  // "scheduled" is sent by the cron to the whole org, so saving one is sending
  // one; this route previously required only a session — any session, any org.
  await requireAdminOrManagerGrant(event, organizationId, "communications");

  // A newsletter can't be essential, saved or sent.
  const classResolution = resolveEmailClass(emailType, requestedClass);
  if (classResolution.ok === false) {
    throw createError({ statusCode: 400, message: classResolution.message, data: { code: classResolution.code } });
  }

  try {
    const directus = getTypedDirectus();

    // Scheduling is sending later: refuse now what the cron would refuse then
    // (community mail from an org with no postal address), while the admin is
    // still on the page. Drafts are saved either way.
    if (status === "scheduled") {
      const org = (await directus.request(
        readItem("hoa_organizations", organizationId, {
          fields: ["id", "name", "street_address", "city", "state", "zip"],
        })
      )) as any;
      const compliance = checkSendCompliance({ emailType, requestedClass, org: org || {} });
      if (compliance.ok === false) {
        throw createError({ statusCode: compliance.statusCode, message: compliance.message, data: { code: compliance.code } });
      }
    }
    const schema = await emailComplianceSchema(directus);

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
      ...(schema.emailClass ? { email_class: classResolution.emailClass } : {}),
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

      // A send in flight: its rows are being delivered from this content.
      if (existingEmail.status === "sending") {
        throw createError({
          statusCode: 409,
          message: "This email is being sent; it can't be edited until the send finishes.",
          data: { code: "send_in_progress" },
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

import { createItem, updateItem, readItem } from "@directus/sdk";
import type { EmailType } from "../../utils/email-templates";

interface SaveEmailBody {
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

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody<SaveEmailBody>(event);

  const {
    emailId,
    organizationId,
    subject,
    content,
    emailType,
    salutation,
    includeBoardFooter = true,
    status = "draft",
    scheduledAt,
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

    const emailData = {
      organization: organizationId,
      subject,
      content,
      email_type: emailType,
      salutation: salutation || null,
      include_board_footer: includeBoardFooter,
      status,
      scheduled_at: scheduledAt || null,
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

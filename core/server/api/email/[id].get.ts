import { readItem, readItems } from "@directus/sdk";
import { emailComplianceSchema } from "../../utils/email-compliance";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({
      statusCode: 400,
      message: "Email ID is required",
    });
  }

  try {
    const directus = getTypedDirectus();
    // `email_class` once the Phase 3a field exists; the composer falls back to
    // the type's default without it.
    const schema = await emailComplianceSchema(directus).catch(() => ({ members: false, emailClass: false }));

    // Get email with organization info and attachment details
    const email = await directus.request(
      readItem("hoa_emails", id, {
        fields: [
          ...(schema.emailClass ? ["email_class" as const] : []),
          "id",
          "status",
          "subject",
          "content",
          "email_type",
          "greeting",
          "salutation",
          "include_board_footer",
          {
            attachments: [
              "id",
              { directus_files_id: ["id", "title", "filename_download", "type", "filesize"] },
            ],
          },
          "date_created",
          "sent_at",
          "scheduled_at",
          "recipient_count",
          "delivered_count",
          "failed_count",
          {
            organization: ["id", "name"],
          },
          {
            user_created: ["id", "first_name", "last_name"],
          } as any,
        ],
      })
    ) as Record<string, any> | null;

    if (!email) {
      throw createError({
        statusCode: 404,
        message: "Email not found",
      });
    }

    // Get recipients if email has been sent
    let recipients: any[] = [];
    if (email.status === "sent" || email.status === "sending" || email.status === "failed") {
      recipients = await directus.request(
        readItems("hoa_email_recipients", {
          filter: {
            email: { _eq: id },
          },
          fields: [
            "id",
            "recipient_email",
            "recipient_name",
            "status",
            "sent_at",
            "error_message",
            {
              member: ["id", "first_name", "last_name"],
            } as any,
          ],
          sort: ["recipient_name"],
        })
      ) as any[];
    }

    return {
      success: true,
      email: {
        ...email,
        recipients,
      },
    };
  } catch (error: any) {
    console.error("Email fetch error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to fetch email",
    });
  }
});

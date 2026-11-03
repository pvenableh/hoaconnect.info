import { readItem, readItems } from "@directus/sdk";
import { emailComplianceSchema } from "../../utils/email-compliance";
import { emailQueueSchema } from "../../utils/email-send-queue";

// The send queue's fields (Phase 3b), read once `pnpm add:email-send-queue` has run.
const QUEUE_EMAIL_FIELDS = [
  "total_recipients", "total_sent", "total_failed", "total_suppressed", "total_unknown",
  "send_run_key", "send_started_at", "send_finished_at", "send_last_error",
];

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
    const queue = await emailQueueSchema(directus).catch(() => false);

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
          ...(queue ? QUEUE_EMAIL_FIELDS : []),
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

    // Get recipients if email has been sent. With the send queue, the rows of
    // the latest occurrence (a recurring email keeps every occurrence's rows),
    // in send order, with the queue's chips.
    let recipients: any[] = [];
    const occurrence = queue ? (email.send_run_key as string | null) : null;
    if (email.status === "sent" || email.status === "sending" || email.status === "failed" || occurrence) {
      recipients = await directus.request(
        readItems("hoa_email_recipients", {
          filter: {
            email: { _eq: id },
            ...(occurrence ? { run_key: { _eq: occurrence } } : {}),
          },
          fields: [
            "id",
            "recipient_email",
            "recipient_name",
            "status",
            "sent_at",
            "error_message",
            ...(queue ? ["kind", "suppressed_reason", "delivery_status"] : []),
            {
              member: ["id", "first_name", "last_name"],
            } as any,
          ] as any,
          sort: occurrence ? ["position", "id"] : ["recipient_name"],
          limit: -1,
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

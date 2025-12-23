import { readItem, readItems } from "@directus/sdk";

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

    // Get email with organization info
    const email = await directus.request(
      readItem("hoa_emails", id, {
        fields: [
          "id",
          "status",
          "subject",
          "content",
          "email_type",
          "greeting",
          "salutation",
          "include_board_footer",
          "attachments",
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
          },
        ],
      })
    );

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
            },
          ],
          sort: ["recipient_name"],
        })
      );
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

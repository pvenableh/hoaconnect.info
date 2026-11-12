import { readItem, readItems, deleteItem, deleteItems } from "@directus/sdk";
import { canRemoveEmail } from "#core/shared/email/failed-sends";

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

    // Get email to check status
    const email = await directus.request(
      readItem("hoa_emails", id, {
        fields: ["id", "status", "organization"],
      })
    );

    if (!email) {
      throw createError({
        statusCode: 404,
        message: "Email not found",
      });
    }

    // The same gate as send and save: an admin of the email's org, or a
    // property manager with the communications grant. (Until Phase 3b any
    // session could delete any org's draft.)
    const organizationId = typeof email.organization === "object" ? (email.organization as { id: string })?.id : email.organization;
    await requireAdminOrManagerGrant(event, String(organizationId), "communications");

    // A send in flight (or paused mid-send): its rows are being delivered.
    if (email.status === "sending" || email.status === "paused") {
      throw createError({
        statusCode: 409,
        message: "This email is being sent; it can't be deleted.",
        data: { code: "send_in_progress" },
      });
    }

    // A draft, or a failed send that reached nobody (core/shared/email/
    // failed-sends.ts). Anything a member was sent is a record and stays.
    const rows = email.status === "failed"
      ? ((await directus.request(
          readItems("hoa_email_recipients", { filter: { email: { _eq: id } }, fields: ["status"], limit: -1 })
        )) as Array<{ status?: string | null }>)
      : [];
    if (!canRemoveEmail(email.status, rows)) {
      throw createError({
        statusCode: 400,
        message:
          email.status === "failed"
            ? "Some of this email was sent, so it is kept for records."
            : "Only drafts and failed sends that reached nobody can be deleted. Sent emails are kept for records.",
        data: { code: "kept_for_records" },
      });
    }

    // Its recipient rows first (a draft shouldn't have any; a failed send has
    // one per person it was meant for).
    await directus.request(
      deleteItems("hoa_email_recipients", {
        filter: {
          email: { _eq: id },
        },
      })
    );

    // Delete the email
    await directus.request(deleteItem("hoa_emails", id));

    return {
      success: true,
      message: "Email deleted successfully",
    };
  } catch (error: any) {
    console.error("Email delete error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to delete email",
    });
  }
});

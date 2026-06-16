import { updateItem, readItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const { invitationId } = body;

  if (!invitationId) {
    throw createError({
      statusCode: 400,
      message: "Invitation ID is required",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Fetch the invitation to verify it exists and belongs to the user's organization
    const invitation = await directus.request(
      readItem("hoa_invitations", invitationId, {
        fields: ["id", "email", "invitation_status", "organization"],
      })
    );

    if (!invitation) {
      throw createError({
        statusCode: 404,
        message: "Invitation not found",
      });
    }

    // Check if the invitation is still pending
    if (invitation.invitation_status !== "pending") {
      throw createError({
        statusCode: 400,
        message: `Cannot cancel an invitation that is ${invitation.invitation_status}`,
      });
    }

    // Update invitation status to canceled
    await directus.request(
      updateItem("hoa_invitations", invitationId, {
        invitation_status: "canceled",
      })
    );

    return {
      success: true,
      message: "Invitation canceled successfully",
      invitationId,
    };
  } catch (error: any) {
    console.error("Cancel invitation error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to cancel invitation",
    });
  }
});

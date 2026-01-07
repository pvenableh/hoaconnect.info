import { readItem, updateItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const { requestId, reason } = body;

  if (!requestId) {
    throw createError({
      statusCode: 400,
      message: "Request ID is required",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Get the join request
    const joinRequest = await directus.request(
      readItem("hoa_join_requests", requestId, {
        fields: ["id", "status", "user", "organization"],
      })
    );

    if (!joinRequest) {
      throw createError({
        statusCode: 404,
        message: "Join request not found",
      });
    }

    if (joinRequest.status !== "pending") {
      throw createError({
        statusCode: 400,
        message: "This request has already been processed",
      });
    }

    // Get organization ID and verify admin access
    const organizationId = typeof joinRequest.organization === "string"
      ? joinRequest.organization
      : (joinRequest.organization as any)?.id;

    if (!organizationId) {
      throw createError({
        statusCode: 400,
        message: "Join request has no associated organization",
      });
    }

    await requireAdminAccess(event, organizationId);

    // Update the join request status to rejected
    await directus.request(
      updateItem("hoa_join_requests", requestId, {
        status: "rejected",
        processed_by: session.user.id,
        processed_at: new Date().toISOString(),
        rejection_reason: reason || null,
      })
    );

    return {
      success: true,
      message: "Join request rejected",
    };
  } catch (error: any) {
    console.error("Reject join request error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to reject join request",
    });
  }
});

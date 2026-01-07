import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const { organizationId } = body;

  if (!organizationId) {
    throw createError({
      statusCode: 400,
      message: "Organization ID is required",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Check if user is already a member
    const existingMember = await directus.request(
      readItems("hoa_members", {
        filter: {
          user: { _eq: session.user.id },
          organization: { _eq: organizationId },
          status: { _in: ["active", "pending"] },
        },
        fields: ["id", "status"],
        limit: 1,
      })
    );

    // Check if user has a pending join request
    const pendingRequest = await directus.request(
      readItems("hoa_join_requests", {
        filter: {
          user: { _eq: session.user.id },
          organization: { _eq: organizationId },
          status: { _eq: "pending" },
        },
        fields: ["id", "status"],
        limit: 1,
      })
    );

    return {
      isMember: existingMember && existingMember.length > 0,
      memberStatus: existingMember?.[0]?.status || null,
      hasPendingRequest: pendingRequest && pendingRequest.length > 0,
    };
  } catch (error: any) {
    console.error("Check membership error:", error);
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to check membership status",
    });
  }
});

import { readItem, updateItem, readUsers } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const { memberId, userId } = body;

  if (!memberId || !userId) {
    throw createError({
      statusCode: 400,
      message: "Member ID and User ID are required",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Get the member record
    const member = await directus.request(
      readItem("hoa_members", memberId, {
        fields: ["id", "user", "organization", "first_name", "last_name", "email"],
      })
    );

    if (!member) {
      throw createError({
        statusCode: 404,
        message: "Member not found",
      });
    }

    // Get organization ID and verify admin access
    const organizationId = typeof member.organization === "string"
      ? member.organization
      : (member.organization as any)?.id;

    if (!organizationId) {
      throw createError({
        statusCode: 400,
        message: "Member has no associated organization",
      });
    }

    await requireAdminAccess(event, organizationId);

    // Check if member already has a user linked
    if (member.user) {
      throw createError({
        statusCode: 400,
        message: "This member already has an account linked",
      });
    }

    // Get the user to verify they exist
    const users = await directus.request(
      readUsers({
        filter: { id: { _eq: userId } },
        fields: ["id", "email", "first_name", "last_name", "status"],
        limit: 1,
      })
    );

    if (!users || users.length === 0) {
      throw createError({
        statusCode: 404,
        message: "User not found",
      });
    }

    const user = users[0];

    // Update the member record to link to the user
    await directus.request(
      updateItem("hoa_members", memberId, {
        user: userId,
        // Optionally sync email if not set
        email: member.email || user.email,
      })
    );

    return {
      success: true,
      message: "User connected to member successfully",
      member: {
        id: memberId,
        firstName: member.first_name,
        lastName: member.last_name,
      },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    };
  } catch (error: any) {
    console.error("Connect user to member error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to connect user to member",
    });
  }
});

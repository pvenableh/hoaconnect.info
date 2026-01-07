import { readItem, updateItem, createItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const { requestId, roleId, unitId } = body;

  if (!requestId) {
    throw createError({
      statusCode: 400,
      message: "Request ID is required",
    });
  }

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    // Get the join request with related data
    const joinRequest = await directus.request(
      readItem("hoa_join_requests", requestId, {
        fields: [
          "*",
          { user: ["id", "email", "first_name", "last_name"] },
          { organization: ["id", "name"] },
        ],
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

    // Validate user and organization exist
    if (!joinRequest.user || typeof joinRequest.user !== "object") {
      throw createError({
        statusCode: 400,
        message: "Invalid user data in join request",
      });
    }

    if (!joinRequest.organization || typeof joinRequest.organization !== "object") {
      throw createError({
        statusCode: 400,
        message: "Invalid organization data in join request",
      });
    }

    const user = joinRequest.user as { id: string; email: string; first_name: string; last_name: string };
    const organization = joinRequest.organization as { id: string; name: string };

    // Use provided role or default to member role
    const memberRoleId = roleId || config.public.directusRoleMember;

    // Create HoaMember record
    const newMember = await directus.request(
      createItem("hoa_members", {
        user: user.id,
        organization: organization.id,
        role: memberRoleId,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        member_type: joinRequest.member_type || "owner",
        status: "active",
      })
    );

    // If a unit was specified, create the member-unit relationship
    if (unitId) {
      await directus.request(
        createItem("hoa_member_units", {
          member_id: newMember.id,
          unit_id: unitId,
          is_primary_unit: true,
          status: "published",
        })
      );
    }

    // Update the join request status
    await directus.request(
      updateItem("hoa_join_requests", requestId, {
        status: "approved",
        processed_by: session.user.id,
        processed_at: new Date().toISOString(),
      })
    );

    return {
      success: true,
      member: {
        id: newMember.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
      },
    };
  } catch (error: any) {
    console.error("Approve join request error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to approve join request",
    });
  }
});

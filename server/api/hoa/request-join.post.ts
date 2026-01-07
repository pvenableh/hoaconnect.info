import { createItem, readItems, readItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const { organizationId, unitNumber, memberType, message } = body;

  if (!organizationId) {
    throw createError({
      statusCode: 400,
      message: "Organization ID is required",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Verify the organization exists
    const organization = await directus.request(
      readItem("hoa_organizations", organizationId, {
        fields: ["id", "name", "status"],
      })
    );

    if (!organization) {
      throw createError({
        statusCode: 404,
        message: "Organization not found",
      });
    }

    if (organization.status !== "active") {
      throw createError({
        statusCode: 400,
        message: "This organization is not accepting new members",
      });
    }

    // Check if user is already a member of this organization
    const existingMember = await directus.request(
      readItems("hoa_members", {
        filter: {
          user: { _eq: session.user.id },
          organization: { _eq: organizationId },
          status: { _in: ["active", "pending"] },
        },
        limit: 1,
      })
    );

    if (existingMember && existingMember.length > 0) {
      throw createError({
        statusCode: 400,
        message: "You are already a member of this organization",
      });
    }

    // Check if user already has a pending request for this organization
    const existingRequest = await directus.request(
      readItems("hoa_join_requests", {
        filter: {
          user: { _eq: session.user.id },
          organization: { _eq: organizationId },
          status: { _eq: "pending" },
        },
        limit: 1,
      })
    );

    if (existingRequest && existingRequest.length > 0) {
      throw createError({
        statusCode: 400,
        message: "You already have a pending request to join this organization",
      });
    }

    // Create the join request
    const joinRequest = await directus.request(
      createItem("hoa_join_requests", {
        user: session.user.id,
        organization: organizationId,
        unit_number: unitNumber || null,
        member_type: memberType || "owner",
        message: message || null,
        status: "pending",
      })
    );

    return {
      success: true,
      request: {
        id: joinRequest.id,
        status: "pending",
        organizationName: organization.name,
      },
      message: "Your request to join has been submitted. An administrator will review your request.",
    };
  } catch (error: any) {
    console.error("Request join error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to submit join request",
    });
  }
});

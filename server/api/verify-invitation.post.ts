import { readItems } from "@directus/sdk";
import { getAdminDirectus } from "../../utils/directus";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { token } = body;

  if (!token) {
    throw createError({
      statusCode: 400,
      message: "Token is required",
    });
  }

  try {
    const directus = await getAdminDirectus();

    // Find the invitation
    const invitations = await directus.request(
      readItems("hoa_invitations", {
        filter: {
          token: { _eq: token },
          invitation_status: { _eq: "pending" },
        },
        fields: ["*", "organization.name", "role.name"],
        limit: 1,
      })
    );

    if (!invitations || invitations.length === 0) {
      throw createError({
        statusCode: 400,
        message: "Invalid invitation token",
      });
    }

    const invitation = invitations[0];

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);

    if (now > expiresAt) {
      throw createError({
        statusCode: 400,
        message: "Invitation has expired",
      });
    }

    // Return invitation details (without sensitive data)
    return {
      email: invitation.email,
      organizationName: invitation.organization?.name,
      roleName: invitation.role?.name,
      expiresAt: invitation.expires_at,
    };
  } catch (error: any) {
    throw createError({
      statusCode: error.statusCode || 400,
      message: error.message || "Invalid invitation",
    });
  }
});

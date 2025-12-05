import { readItems } from "@directus/sdk";

/**
 * Check if an email exists in the system
 * Returns information about existing accounts/members
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const email = query.email as string;

  if (!email) {
    throw createError({
      statusCode: 400,
      message: "Email is required",
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw createError({
      statusCode: 400,
      message: "Invalid email format",
    });
  }

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    // Check if email exists in directus_users (has an account)
    const existingUsers = await $fetch(
      `${config.directus.url}/users`,
      {
        headers: {
          Authorization: `Bearer ${config.directus.token}`,
        },
        query: {
          filter: JSON.stringify({
            email: { _eq: email.toLowerCase() },
          }),
          fields: ["id", "email", "first_name", "last_name", "status"],
          limit: 1,
        },
      }
    );

    const userExists = existingUsers?.data && existingUsers.data.length > 0;
    const existingUser = userExists ? existingUsers.data[0] : null;

    // Check if email exists in hoa_members (might be invited but not yet have account)
    const existingMembers = await directus.request(
      readItems("hoa_members", {
        filter: {
          email: { _eq: email.toLowerCase() },
        },
        fields: [
          "id",
          "email",
          "first_name",
          "last_name",
          "status",
          "organization.id",
          "organization.name",
          "user",
        ],
        limit: 10,
      })
    );

    const memberExists = existingMembers && existingMembers.length > 0;

    // Check for pending invitations
    const pendingInvitations = await directus.request(
      readItems("hoa_invitations", {
        filter: {
          email: { _eq: email.toLowerCase() },
          invitation_status: { _eq: "pending" },
          expires_at: { _gt: new Date().toISOString() },
        },
        fields: [
          "id",
          "email",
          "organization.id",
          "organization.name",
          "expires_at",
        ],
        limit: 10,
      })
    );

    const hasPendingInvitations = pendingInvitations && pendingInvitations.length > 0;

    // Build response with detailed information
    return {
      exists: userExists || memberExists,
      hasAccount: userExists,
      user: existingUser
        ? {
            id: existingUser.id,
            firstName: existingUser.first_name,
            lastName: existingUser.last_name,
            status: existingUser.status,
          }
        : null,
      memberships: memberExists
        ? existingMembers.map((m: any) => ({
            id: m.id,
            organizationId: m.organization?.id,
            organizationName: m.organization?.name,
            status: m.status,
            hasLinkedUser: !!m.user,
          }))
        : [],
      pendingInvitations: hasPendingInvitations
        ? pendingInvitations.map((inv: any) => ({
            id: inv.id,
            organizationId: inv.organization?.id,
            organizationName: inv.organization?.name,
            expiresAt: inv.expires_at,
          }))
        : [],
    };
  } catch (error: any) {
    console.error("Email check error:", error);
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to check email",
    });
  }
});

import {
  readItems,
  createUser,
  createItem,
  updateItem,
  authentication,
  rest,
  readMe,
  readUsers,
} from "@directus/sdk";
import { createDirectus } from "@directus/sdk";
import { sendInvitationAcceptedEmail } from "../../utils/sendgrid";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const { token, password, firstName, lastName, phone } = body;

  if (!token || !password || !firstName || !lastName) {
    throw createError({
      statusCode: 400,
      message: "Token, password, first name, and last name are required",
    });
  }

  try {
    const directus = getTypedDirectus();
    const config = useRuntimeConfig();

    // 1. Find the invitation by token
    const invitations = await directus.request(
      readItems("hoa_invitations", {
        filter: {
          token: { _eq: token },
          invitation_status: { _eq: "pending" as const },
        },
        fields: ["*", { organization: ["*"], invited_by: ["*"] }],
        limit: 1,
      })
    );

    if (!invitations || invitations.length === 0) {
      throw createError({
        statusCode: 400,
        message: "Invalid or expired invitation token",
      });
    }

    const invitation = invitations[0];

    // Validate that relational fields are populated
    if (
      typeof invitation.organization !== "object" ||
      invitation.organization === null
    ) {
      throw createError({
        statusCode: 500,
        message: "Organization data not properly loaded",
      });
    }

    if (
      typeof invitation.invited_by !== "object" ||
      invitation.invited_by === null
    ) {
      throw createError({
        statusCode: 500,
        message: "Inviter data not properly loaded",
      });
    }

    // Extract and validate required fields for type safety
    const organizationId = invitation.organization.id;
    const organizationName = invitation.organization.name;
    const inviterEmail = invitation.invited_by.email;
    const inviterFirstName = invitation.invited_by.first_name;

    if (!organizationId || !organizationName) {
      throw createError({
        statusCode: 500,
        message: "Organization data is incomplete",
      });
    }

    if (!inviterEmail || !inviterFirstName) {
      throw createError({
        statusCode: 500,
        message: "Inviter data is incomplete",
      });
    }

    // 2. Check if invitation is expired
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);

    if (now > expiresAt) {
      // Update invitation status to expired
      await directus.request(
        updateItem("hoa_invitations", invitation.id, {
          invitation_status: "expired",
        })
      );

      throw createError({
        statusCode: 400,
        message: "Invitation has expired",
      });
    }

    // 3. Check if user already exists with this email
    const existingUsers = await directus.request(
      readUsers({
        filter: {
          email: { _eq: invitation.email },
        },
        limit: 1,
      })
    );

    if (existingUsers && existingUsers.length > 0) {
      throw createError({
        statusCode: 400,
        message: "A user with this email already exists",
      });
    }

    // 4. Create the Directus user
    const newUser = await directus.request(
      createUser({
        email: invitation.email,
        password,
        first_name: firstName,
        last_name: lastName,
        role: invitation.role,
        status: "active",
        provider: "local",
      })
    );

    // 5. Create hoa_member record with personal info
    await directus.request(
      createItem("hoa_members", {
        user: newUser.id,
        organization: organizationId,
        role: invitation.role,
        first_name: firstName,
        last_name: lastName,
        email: invitation.email,
        phone: phone || null,
        member_type: "owner", // Default to owner, can be changed later
        status: "published",
      })
    );

    // 6. Mark invitation as accepted
    await directus.request(
      updateItem("hoa_invitations", invitation.id, {
        invitation_status: "accepted",
        accepted_at: new Date().toISOString(),
      })
    );

    // 7. Log the user in automatically
    const authClient = createDirectus(config.directus.url)
      .with(authentication("json"))
      .with(rest());

    const authResult = await authClient.login({
      email: invitation.email,
      password,
    });

    if (!authResult.access_token || !authResult.refresh_token) {
      throw createError({
        statusCode: 500,
        message: "Authentication succeeded but tokens were not returned",
      });
    }

    // Ensure expires is present
    if (authResult.expires === null || authResult.expires === undefined) {
      throw createError({
        statusCode: 500,
        message:
          "Authentication succeeded but expiration time was not returned",
      });
    }

    // Get user details
    const user = await authClient.request(readMe());

    // Set user session with Directus tokens for API proxy
    await setUserSession(
      event,
      {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: typeof user.role === "object" ? user.role.name : user.role,
          provider: "local",
        },
        loggedInAt: Date.now(),
        expiresAt: Date.now() + authResult.expires * 1000, // Convert to milliseconds
      } as any,
      {
        secure: {
          directusAccessToken: authResult.access_token,
          directusRefreshToken: authResult.refresh_token,
        },
      } as any
    );

    // 8. Send notification email to admin who sent the invitation
    try {
      await sendInvitationAcceptedEmail({
        to: inviterEmail,
        adminName: inviterFirstName,
        memberName: `${firstName} ${lastName}`,
        memberEmail: newUser.email || invitation.email,
        organizationName: organizationName,
      });

      console.log("✅ Admin notification email sent to:", inviterEmail);
    } catch (emailError: any) {
      console.error("❌ Failed to send admin notification email:", emailError);
      // Don't fail the whole request if email fails
    }

    return {
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
      },
    };
  } catch (error: any) {
    console.error("Accept invitation error:", error);
    throw createError({
      statusCode: error.statusCode || 400,
      message: error.message || "Failed to accept invitation",
    });
  }
});

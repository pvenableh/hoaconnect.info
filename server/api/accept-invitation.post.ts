import {
  readItems,
  createUser,
  createItem,
  updateItem,
  authentication,
  rest,
  readMe,
} from "@directus/sdk";
import { createDirectus } from "@directus/sdk";
import { getAdminDirectus } from "../utils/directus";
import { sendInvitationAcceptedEmail } from "../utils/sendgrid";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const { token, password } = body;

  if (!token || !password) {
    throw createError({
      statusCode: 400,
      message: "Token and password are required",
    });
  }

  try {
    const directus = await getAdminDirectus();
    const config = useRuntimeConfig();

    // 1. Find the invitation by token
    const invitations = await directus.request(
      readItems("hoa_invitations", {
        filter: {
          token: { _eq: token },
          invitation_status: { _eq: "pending" as const },
        },
        fields: ["*", "organization.*", "invited_by.*"],
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
      readItems("directus_users", {
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

    // 4. Find the associated person record
    const people = await directus.request(
      readItems("hoa_people", {
        filter: {
          email: { _eq: invitation.email },
          organization: { _eq: invitation.organization.id },
        },
        fields: ["*"],
        limit: 1,
      })
    );

    const person = people && people.length > 0 ? people[0] : null;

    // 5. Create the Directus user
    const newUser = await directus.request(
      createUser({
        email: invitation.email,
        password,
        first_name: person?.first_name || "",
        last_name: person?.last_name || "",
        role: invitation.role,
        status: "active",
        provider: "local",
      })
    );

    // 6. Create hoa_member record linking user to organization
    await directus.request(
      createItem("hoa_members", {
        user: newUser.id,
        organization: invitation.organization.id,
        role: invitation.role,
        status: "published",
      })
    );

    // 7. Update person record if exists
    if (person) {
      await directus.request(
        updateItem("hoa_people", person.id, {
          status: "published", // Activate the person record
        })
      );
    }

    // 8. Mark invitation as accepted
    await directus.request(
      updateItem("hoa_invitations", invitation.id, {
        invitation_status: "accepted",
        accepted_at: new Date().toISOString(),
      })
    );

    // 9. Log the user in automatically
    // Create a new client for authentication (can't use admin client for user login)
    const authClient = createDirectus(config.directus.url)
      .with(authentication())
      .with(rest());

    const authResult = await authClient.login(invitation.email, password);

    // Get user details
    const user = await authClient.request(readMe());

    // Set user session
    await setUserSession(event, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: typeof user.role === "object" ? user.role.name : user.role,
        provider: "local",
      },
      loggedInAt: Date.now(),
      expiresAt: Date.now() + (authResult.expires || 900000), // Default 15 min
    });

    // 10. Send notification email to admin who sent the invitation
    try {
      await sendInvitationAcceptedEmail({
        to: invitation.invited_by.email,
        adminName: invitation.invited_by.first_name,
        memberName: `${newUser.first_name} ${newUser.last_name}`,
        memberEmail: newUser.email,
        organizationName: invitation.organization.name,
      });

      console.log(
        "✅ Admin notification email sent to:",
        invitation.invited_by.email
      );
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

import { readItem, createItem, readItems } from "@directus/sdk";
import { sendHoaInvitationEmail } from "../../utils/sendgrid";
import { randomBytes } from "crypto";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const { email, firstName, lastName, organizationId, roleId } = body;

  // Validation
  if (!email || !firstName || !lastName || !organizationId || !roleId) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields",
    });
  }

  // Normalize email to lowercase
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    // Check if email already exists as a member in this organization
    const existingMembers = await directus.request(
      readItems("hoa_members", {
        filter: {
          email: { _eq: normalizedEmail },
          organization: { _eq: organizationId },
        },
        fields: ["id", "status", "user"],
        limit: 1,
      })
    );

    if (existingMembers && existingMembers.length > 0) {
      const existingMember = existingMembers[0];
      throw createError({
        statusCode: 409,
        message: existingMember.user
          ? "This email is already a member of this organization"
          : "This email already has a pending invitation for this organization",
      });
    }

    // Check if there's already a pending invitation for this email in this org
    const existingInvitations = await directus.request(
      readItems("hoa_invitations", {
        filter: {
          email: { _eq: normalizedEmail },
          organization: { _eq: organizationId },
          invitation_status: { _eq: "pending" },
          expires_at: { _gt: new Date().toISOString() },
        },
        fields: ["id", "expires_at"],
        limit: 1,
      })
    );

    if (existingInvitations && existingInvitations.length > 0) {
      throw createError({
        statusCode: 409,
        message: "A pending invitation already exists for this email. Please wait for it to expire or cancel it first.",
      });
    }

    // Check if user already exists in the system (has an account)
    let existingUser = null;
    try {
      const existingUsers = await $fetch(
        `${config.directus.url}/users`,
        {
          headers: {
            Authorization: `Bearer ${config.directus.token}`,
          },
          query: {
            filter: JSON.stringify({
              email: { _eq: normalizedEmail },
            }),
            fields: ["id", "email", "first_name", "last_name"],
            limit: 1,
          },
        }
      );
      if (existingUsers?.data && existingUsers.data.length > 0) {
        existingUser = existingUsers.data[0];
      }
    } catch (userCheckError) {
      console.warn("Could not check for existing user:", userCheckError);
    }

    // Generate unique invitation token
    const token = randomBytes(32).toString("hex");

    // Set expiration (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Get organization details for email (including branding info)
    const organization = await directus.request(
      readItem("hoa_organizations", organizationId, {
        fields: [
          "name",
          "legal_name",
          "slug",
          "email",
          "phone",
          "street_address",
          "city",
          "state",
          "zip",
          "settings.logo",
        ],
      })
    );

    // Build organization logo URL if available
    let orgLogoUrl: string | undefined;
    const settings = organization.settings as { logo?: string | { id: string } } | null;
    if (settings?.logo) {
      const logoId = typeof settings.logo === "string" ? settings.logo : settings.logo?.id;
      if (logoId) {
        orgLogoUrl = `${config.directus.url}/assets/${logoId}?width=200&format=png&fit=inside&quality=80`;
      }
    }

    // Build organization address
    const addressParts = [
      organization.street_address,
      organization.city,
      organization.state,
      organization.zip,
    ].filter(Boolean);
    const orgAddress = addressParts.length > 0 ? addressParts.join(", ") : undefined;

    // Build organization URL (slug-based)
    const orgUrl = organization.slug
      ? `${config.public.appUrl}/${organization.slug}`
      : config.public.appUrl;

    // Get role details for email via REST API (core collections can't use readItem)
    let roleName = "Member";
    try {
      const roleResponse = await $fetch(`${config.directusUrl}/roles/${roleId}`, {
        headers: {
          Authorization: `Bearer ${config.directusToken}`,
        },
        params: {
          fields: 'name',
        },
      });
      if (roleResponse?.data?.name) {
        roleName = roleResponse.data.name;
      }
    } catch (roleError) {
      console.warn("Could not fetch role name, using default:", roleError);
    }

    // Create invitation record (use normalized email)
    const invitation = await directus.request(
      createItem("hoa_invitations", {
        email: normalizedEmail,
        organization: organizationId,
        role: roleId,
        invited_by: session.user.id,
        token,
        invitation_status: "pending",
        expires_at: expiresAt.toISOString(),
      })
    );

    // Build invitation URL
    const invitationUrl = `${orgUrl}/accept-invite?token=${token}`;

    try {
      await sendHoaInvitationEmail({
        to: email,
        firstName,
        lastName,
        organizationName: organization.name || "Unknown Organization",
        invitationUrl,
        inviterName:
          `${session.user.firstName || ""} ${session.user.lastName || ""}`.trim() ||
          "Admin",
        roleName: roleName,
        expiresAt: expiresAt.toISOString(),
        // Organization branding data
        orgLogoUrl,
        orgUrl,
        orgPhoneNumber: organization.phone || undefined,
        orgEmail: organization.email || undefined,
        orgAddress,
        orgLegalName: organization.legal_name || undefined,
      });

      console.log("✅ Invitation email sent successfully to:", email);
    } catch (emailError: any) {
      console.error("❌ Failed to send invitation email:", emailError);
      // Don't fail the whole request if email fails
      // The invitation is still created and can be resent
    }

    return {
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expires_at,
      },
      // Include info about whether user already has an account
      existingUser: existingUser
        ? {
            id: existingUser.id,
            firstName: existingUser.first_name,
            lastName: existingUser.last_name,
            hasAccount: true,
          }
        : null,
    };
  } catch (error: any) {
    console.error("Invitation error:", error);
    // Re-throw if it's already a createError (preserves status code)
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to send invitation",
    });
  }
});

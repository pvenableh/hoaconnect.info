import { readItem, updateItem, readItems } from "@directus/sdk";
import { sendHoaInvitationEmail } from "../../utils/sendgrid";
import { randomBytes } from "crypto";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const { invitationId } = body;

  if (!invitationId) {
    throw createError({
      statusCode: 400,
      message: "Invitation ID is required",
    });
  }

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    // Fetch the invitation with organization details
    const invitation = await directus.request(
      readItem("hoa_invitations", invitationId, {
        fields: [
          "id",
          "email",
          "invitation_status",
          "organization",
          "role",
          "invited_by.first_name",
          "invited_by.last_name",
        ],
      })
    );

    if (!invitation) {
      throw createError({
        statusCode: 404,
        message: "Invitation not found",
      });
    }

    // Check if the invitation can be resent (pending or expired)
    if (invitation.invitation_status !== "pending" && invitation.invitation_status !== "expired") {
      throw createError({
        statusCode: 400,
        message: `Cannot resend an invitation that is ${invitation.invitation_status}`,
      });
    }

    // Generate new token and expiration
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Get organization details for email
    const organizationId = typeof invitation.organization === "string"
      ? invitation.organization
      : invitation.organization?.id;

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

    // Get role name
    const roleId = typeof invitation.role === "string" ? invitation.role : invitation.role?.id;
    let roleName = "Member";
    if (roleId) {
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
    }

    // Update invitation with new token and expiration
    await directus.request(
      updateItem("hoa_invitations", invitationId, {
        token,
        expires_at: expiresAt.toISOString(),
        invitation_status: "pending",
      })
    );

    // Get first name from email (for greeting)
    const emailParts = invitation.email?.split("@")[0] || "there";
    const firstName = emailParts.charAt(0).toUpperCase() + emailParts.slice(1);

    // Send invitation email
    const invitationUrl = `${orgUrl}/accept-invite?token=${token}`;

    const invitedBy = invitation.invited_by as { first_name?: string; last_name?: string } | null;
    const inviterName = invitedBy
      ? `${invitedBy.first_name || ""} ${invitedBy.last_name || ""}`.trim() || "Admin"
      : `${session.user.firstName || ""} ${session.user.lastName || ""}`.trim() || "Admin";

    try {
      await sendHoaInvitationEmail({
        to: invitation.email!,
        firstName,
        lastName: "",
        organizationName: organization.name || "Unknown Organization",
        invitationUrl,
        inviterName,
        roleName,
        expiresAt: expiresAt.toISOString(),
        orgLogoUrl,
        orgUrl,
        orgPhoneNumber: organization.phone || undefined,
        orgEmail: organization.email || undefined,
        orgAddress,
        orgLegalName: organization.legal_name || undefined,
      });

      console.log("✅ Invitation email resent successfully to:", invitation.email);
    } catch (emailError: any) {
      console.error("❌ Failed to resend invitation email:", emailError);
      // Don't fail the request if email fails - the token is still updated
    }

    return {
      success: true,
      message: "Invitation resent successfully",
      invitation: {
        id: invitationId,
        email: invitation.email,
        expiresAt: expiresAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Resend invitation error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to resend invitation",
    });
  }
});

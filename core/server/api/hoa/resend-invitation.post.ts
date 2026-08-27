import { readItem, updateItem, readItems } from "@directus/sdk";
import { sendHoaInvitationEmail } from "../../utils/sendgrid";
import { randomBytes } from "crypto";
import type { HoaOrganization, DirectusRole } from "#core/types/directus";

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
          { invited_by: ["first_name", "last_name"] },
        ],
      })
    );

    if (!invitation) {
      throw createError({
        statusCode: 404,
        message: "Invitation not found",
      });
    }

    // Which organization does this invitation belong to? Resolved BEFORE
    // anything else, because it is what the authorization check needs.
    const organizationId = typeof invitation.organization === "string"
      ? invitation.organization
      : (invitation.organization as HoaOrganization | null)?.id;

    if (!organizationId) {
      throw createError({
        statusCode: 400,
        message: "Invitation has no associated organization",
      });
    }

    // ⚠️ Only org admins (or app admins) may resend an invitation for this
    // organization. This endpoint previously required nothing but a session:
    // any logged-in user who knew — or guessed — an invitation id could rotate
    // its token and make the app mail any organization's invitee. The token
    // only ever goes to the invitee's own address, so it was never a path to
    // the caller, but it was unauthenticated-to-that-org outbound mail and a
    // way to invalidate a pending invitation someone else was relying on.
    //
    // Checked here rather than at the top because the organization is not
    // known until the invitation has been read, and checked BEFORE the token
    // rotation below so a refused caller changes nothing.
    await requireAdminAccess(event, organizationId);

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
          { settings: ["logo"] },
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
    const roleId = typeof invitation.role === "string" ? invitation.role : (invitation.role as DirectusRole | null)?.id;
    let roleName = "Member";
    if (roleId) {
      try {
        const roleResponse = await $fetch<{ data?: { name?: string } }>(`${config.directusUrl}/roles/${roleId}`, {
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
        organizationId,
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

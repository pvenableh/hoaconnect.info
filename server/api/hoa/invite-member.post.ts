import { readItem, createItem } from "@directus/sdk";
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

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    // Generate unique invitation token
    const token = randomBytes(32).toString("hex");

    // Set expiration (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Get organization details for email
    const organization = await directus.request(
      readItem("hoa_organizations", organizationId, {
        fields: ["name"],
      })
    );

    // Get role details for email
    const role = await directus.request(
      readItem("directus_roles", roleId, {
        fields: ["name"],
      })
    );

    // Create invitation record
    const invitation = await directus.request(
      createItem("hoa_invitations", {
        email,
        organization: organizationId,
        role: roleId,
        invited_by: session.user.id,
        token,
        invitation_status: "pending",
        expires_at: expiresAt.toISOString(),
        status: "published",
      })
    );

    // Send invitation email via SendGrid
    const invitationUrl = `${config.public.appUrl}/hoa/accept-invite?token=${token}`;

    try {
      await sendHoaInvitationEmail({
        to: email,
        firstName,
        lastName,
        organizationName: organization.name || "Unknown Organization",
        invitationUrl,
        inviterName: `${session.user.first_name || ""} ${session.user.last_name || ""}`.trim() || "Admin",
        roleName: role.name,
        expiresAt: expiresAt.toISOString(),
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
    };
  } catch (error: any) {
    console.error("Invitation error:", error);
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to send invitation",
    });
  }
});

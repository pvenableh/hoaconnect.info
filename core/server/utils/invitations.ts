/**
 * Issue an invitation to a community: the row `accept-invitation` reads, and
 * the branded email with its link. Moved out of `invite-member.post.ts` so an
 * approved lease can invite its tenant the same way the Members page does.
 *
 * Callers decide whether this person may be invited (inviteGateFor, no
 * pending invitation) and who may send it; this only issues it.
 */
import { createItem, readItem } from "@directus/sdk";
import { randomBytes } from "crypto";
import type { ManagerGrants } from "#core/shared/transition/grants";
import type { Residency } from "#core/shared/members/residency";
import { sendHoaInvitationEmail } from "./invitation-email";

export interface IssueInvitationInput {
  organizationId: string;
  /** Lower-cased and trimmed by the caller. */
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  invitedByUserId: string;
  inviterName: string;
  memberType: Residency | null;
  unitId: string | null;
  managerPermissions?: ManagerGrants | null;
}

export async function issueInvitation(input: IssueInvitationInput): Promise<{ id: string; email: string | null; expires_at: string }> {
  const { organizationId, email, roleId } = input;
  const config = useRuntimeConfig();
  const directus = getTypedDirectus();

  // Generate unique invitation token
  const token = randomBytes(32).toString("hex");

  // Set expiration (7 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Get organization details for email (including branding info)
  const organization = await directus.request(
    readItem("hoa_organizations", organizationId, {
      fields: ["name", "legal_name", "slug", "email", "phone", "street_address", "city", "state", "zip", { settings: ["logo"] }],
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
  const addressParts = [organization.street_address, organization.city, organization.state, organization.zip].filter(Boolean);
  const orgAddress = addressParts.length > 0 ? addressParts.join(", ") : undefined;

  // Build organization URL (slug-based)
  const orgUrl = organization.slug ? `${config.public.appUrl}/${organization.slug}` : config.public.appUrl;

  // Get role details for email via REST API (core collections can't use readItem)
  let roleName = "Member";
  try {
    const roleResponse = await $fetch<{ data?: { name?: string } }>(`${config.directusUrl}/roles/${roleId}`, {
      headers: {
        Authorization: `Bearer ${config.directusToken}`,
      },
      params: {
        fields: "name",
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
      email,
      organization: organizationId,
      role: roleId,
      invited_by: input.invitedByUserId,
      token,
      invitation_status: "pending",
      expires_at: expiresAt.toISOString(),
      manager_permissions: input.managerPermissions ?? null,
      member_type: input.memberType,
      unit: input.unitId,
    })
  );

  // Build invitation URL
  const invitationUrl = `${orgUrl}/accept-invite?token=${token}`;

  try {
    // Demo guardrail: create the invitation record (so the UI reflects it) but
    // never actually email a stranger from a public demo org.
    if (await shouldBlockDemoEmail(organizationId)) {
      console.log(`[demo] invitation email suppressed for demo org ${organizationId} → ${email}`);
    } else {
      await sendHoaInvitationEmail({
        to: email,
        firstName: input.firstName,
        lastName: input.lastName,
        organizationName: organization.name || "Unknown Organization",
        invitationUrl,
        inviterName: input.inviterName || "Admin",
        roleName: roleName,
        expiresAt: expiresAt.toISOString(),
        // Organization branding data
        orgLogoUrl,
        orgUrl,
        orgPhoneNumber: organization.phone || undefined,
        orgEmail: organization.email || undefined,
        orgAddress,
        orgLegalName: organization.legal_name || undefined,
        organizationId,
      });

      console.log("✅ Invitation email sent successfully to:", email);
    }
  } catch (emailError: any) {
    console.error("❌ Failed to send invitation email:", emailError);
    // Don't fail the whole request if email fails
    // The invitation is still created and can be resent
  }

  return { id: invitation.id, email: invitation.email ?? null, expires_at: invitation.expires_at as string };
}

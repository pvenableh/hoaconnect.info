import { readItem, createItem, readItems } from "@directus/sdk";
import { sendHoaInvitationEmail } from "../../utils/sendgrid";
import { randomBytes } from "crypto";
import {
  normalizeGrants,
  presetFor,
  type ManagerGrants,
} from "#core/shared/transition/grants";
import { normalizeResidency, isKnownNonResidency } from "#core/shared/members/residency";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const { email, firstName, lastName, organizationId, roleId, memberType, personType, unitId } = body;

  // Manager grants, chosen at invite time. Parked on the invitation row and
  // copied onto the member when they accept — see `hoa_invitations.manager_permissions`
  // in scripts/create-transition-collections.ts for why the choice has to wait
  // somewhere rather than be made again later from a row of seven switches.
  //
  // `grantPreset` (a key from GRANT_PRESETS) is the normal path; an explicit
  // `managerPermissions` object covers a custom mix. Either way it is normalized
  // to the full key set, so a stored row never carries a missing — and therefore
  // ambiguous — flag.
  const pmRoleId = String(useRuntimeConfig().public.directusRolePropertyManager || "");
  let managerPermissions: ManagerGrants | null = null;
  if (pmRoleId && String(roleId) === pmRoleId) {
    const preset = presetFor(body?.grantPreset);
    if (preset) managerPermissions = preset.grants;
    else if (body?.managerPermissions && typeof body.managerPermissions === "object") {
      managerPermissions = normalizeGrants(body.managerPermissions);
    }
  }

  // Validation
  if (!email || !firstName || !lastName || !organizationId || !roleId) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields",
    });
  }

  // Residency of the person being invited.
  //
  // `InviteMemberForm.vue` has ALWAYS collected this (its "Type" control) and
  // always POSTed it as `personType` — this endpoint simply never read it, and
  // `accept-invitation.post.ts` then hardcoded every new member to "owner".
  // So the admin's answer was not missing, it was discarded. `memberType` is
  // the canonical name; `personType` is accepted because that is what the
  // existing form sends. See #core/shared/members/residency.
  const rawMemberType = memberType ?? personType ?? null;
  const normalizedMemberType = normalizeResidency(rawMemberType);
  if (normalizedMemberType === null && !isKnownNonResidency(rawMemberType)) {
    throw createError({
      statusCode: 400,
      message: "memberType must be 'owner' or 'tenant'",
    });
  }

  // Only org admins (or app admins) may invite members to this organization
  await requireAdminAccess(event, organizationId);

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

    const existingMember = existingMembers?.[0];
    if (existingMember) {
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
          expires_at: { _gt: new Date().toISOString() } as any,
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
      const existingUsers = await $fetch<{
        data?: {
          id: string;
          email: string | null;
          first_name: string | null;
          last_name: string | null;
        }[];
      }>(
        `${config.directus.url}/users`,
        {
          headers: {
            Authorization: `Bearer ${config.directus.staticToken}`,
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

    // Get role details for email via REST API (core collections can't use readItem)
    let roleName = "Member";
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

    // The unit the invitee is being invited to.
    //
    // Same bug shape as `personType` in Phase 1: `InviteMemberForm.vue` has
    // always sent a `unitId` and this endpoint has always thrown it away, so
    // an invitation could not say WHICH unit someone was an owner or tenant of.
    // It is optional — "No unit assigned" is a real choice in the form — but a
    // unit that IS named has to belong to this organization, or accepting the
    // invitation would link a member to another org's unit.
    let invitationUnitId: string | null = null;
    if (unitId) {
      const unit = await directus.request(
        readItem("hoa_units", String(unitId), { fields: ["id", "organization"] })
      ).catch(() => null);
      const unitOrgId =
        typeof unit?.organization === "string" ? unit.organization : (unit?.organization as any)?.id;
      if (!unit || unitOrgId !== organizationId) {
        throw createError({
          statusCode: 400,
          message: "Unit does not belong to this organization",
        });
      }
      invitationUnitId = String(unitId);
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
        manager_permissions: managerPermissions,
        member_type: normalizedMemberType,
        unit: invitationUnitId,
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
      }
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

import {
  createUser,
  createItem,
  readItems,
  updateItem,
  authentication,
  rest,
  readMe,
  readUsers,
} from "@directus/sdk";
import { createDirectus } from "@directus/sdk";
import type { User } from "#auth-utils";
import { sendInvitationAcceptedEmail } from "../../utils/sendgrid";
import { normalizeResidency, residencyOnAccept } from "#core/shared/members/residency";
import { invitableMembers } from "#core/shared/members/invitability";

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
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    // 1. Find the invitation by token
    const invitations = await directus.request(
      readItems("hoa_invitations", {
        filter: {
          token: { _eq: token },
          invitation_status: { _eq: "pending" as const },
        },
        fields: ["*", { organization: ["*", { settings: ["logo"] }], invited_by: ["*"] }],
        limit: 1,
      })
    );

    const invitation = invitations?.[0];

    if (!invitation) {
      throw createError({
        statusCode: 400,
        message: "Invalid or expired invitation token",
      });
    }

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

    if (!invitation.email) {
      throw createError({
        statusCode: 500,
        message: "Invitation data is incomplete",
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
        role: { id: invitation.role as string },
        status: "active",
        provider: "local",
      })
    );

    // 5. Attach the account to the member — ADOPTING an existing row if there
    //    is one, rather than creating a second member for the same person.
    //
    // ⚠️ This handler used to create unconditionally. That was safe only while
    // `invite-member` 409'd every existing member; the moment an ACTIVE member
    // with no account may be invited — which is the entire onboarding batch,
    // 58 of 1033 Lenox's 59 active members — an unconditional create would
    // split each of them into two rows: the original keeping the unit link,
    // the residency and the payment history, the new one keeping the account.
    //
    // The org also already contains duplicate (email, organization) rows —
    // 605 Lincoln Road has four such groups — so this is a shape the data can
    // and does take. `invitableMembers` applies the same active-and-not-yet-
    // onboarded rule the gate used to let the invitation out.
    const existingMembers = await directus.request(
      readItems("hoa_members", {
        filter: {
          email: { _eq: invitation.email },
          organization: { _eq: organizationId },
        },
        fields: ["id", "status", "user", "member_type", "first_name", "last_name"],
        sort: ["date_created"],
        limit: -1,
      })
    );

    // The invitation's residency, ONLY when it actually states one.
    // ⚠️ Deliberately not `residencyOnAccept`, which falls back to "owner":
    // adopting a known tenant with an old invitation that carries no residency
    // must not rewrite them into an owner-only mail audience. 1033 Lenox has
    // 22 tenants and every invitation predating Phase 1 says nothing.
    const invitationResidency = normalizeResidency(invitation.member_type);

    const adoptee = invitableMembers(existingMembers as any[])[0] ?? null;

    if (adoptee) {
      await directus.request(
        updateItem("hoa_members", adoptee.id as string, {
          user: newUser.id,
          role: invitation.role,
          // The person signing up is the authority on their own name; the
          // roster row was typed by whoever imported it.
          first_name: firstName,
          last_name: lastName,
          ...(phone ? { phone } : {}),
          ...(invitationResidency ? { member_type: invitationResidency } : {}),
          ...(invitation.manager_permissions
            ? { manager_permissions: invitation.manager_permissions }
            : {}),
          // ⚠️ `status` is NOT written. They are already active — that is what
          // let the invitation out — and membership standing is not something
          // signing into the portal should decide.
        })
      );
    }

    const newMember = adoptee
      ? { id: adoptee.id as string }
      : await directus.request(
          createItem("hoa_members", {
            user: newUser.id,
            organization: organizationId,
            role: invitation.role,
            first_name: firstName,
            last_name: lastName,
            email: invitation.email,
            phone: phone || null,
            // Residency the admin chose when sending the invitation. This was a
            // hardcoded "owner" for EVERY invitee until Phase 1, because the
            // invitation had nowhere to carry the real answer.
            member_type: residencyOnAccept(invitation.member_type),
            status: "active",
            // The grants the admin chose when they sent the invitation. A manager
            // who accepts is immediately able to do the job they were invited to do,
            // rather than logging into an account with no permissions and waiting
            // for someone to remember which switches to flip.
            ...(invitation.manager_permissions
              ? { manager_permissions: invitation.manager_permissions }
              : {}),
          })
        );

    // 5b. Link the new member to the unit they were invited to.
    //
    // The invitation only gained a `unit` in Phase 2 — before that,
    // `invite-member.post.ts` discarded the `unitId` the form had always sent,
    // so an accepted invitation produced a member with no unit at all. That is
    // why 605 Lincoln Road has 33 active members and zero links.
    //
    // Residency goes on the LINK as well as the member: `residencyFor()` reads
    // the link first, and a link with no residency would make it fall back for
    // a member whose residency we actually know.
    //
    // Best-effort on purpose. A failure here must not strand someone who has
    // already had a Directus user and an hoa_member created for them — they
    // would be unable to retry, since the invitation is single-use and their
    // email now exists. An admin can link the unit from the members UI.
    const invitationUnitId =
      typeof invitation.unit === "string" ? invitation.unit : (invitation.unit as any)?.id ?? null;
    if (invitationUnitId) {
      try {
        // An ADOPTED member may already hold this link — 55 of 1033 Lenox's
        // active members do — so this is an upsert keyed on (member, unit), the
        // same rule `member-units/assign.post.ts` follows. A blind create would
        // leave two rows for one unit and let `residencyFor()` pick between
        // duplicates.
        const existingLinks = adoptee
          ? await directus.request(
              readItems("hoa_member_units", {
                filter: { member_id: { _eq: newMember.id } },
                fields: ["id", "unit_id", "is_primary_unit"],
                limit: -1,
              })
            )
          : [];

        const linkUnitId = (l: any) =>
          typeof l.unit_id === "string" ? l.unit_id : l.unit_id?.id;
        const existingLink = (existingLinks as any[]).find(
          (l) => linkUnitId(l) === invitationUnitId
        );

        // Residency for the LINK. For an adopted member the invitation wins
        // only when it says something; otherwise their own known residency
        // fills the link in — which is exactly the gap the roster has today,
        // where all 81 real links carry `member_type: null`.
        const linkResidency = adoptee
          ? invitationResidency ?? normalizeResidency((adoptee as any).member_type)
          : residencyOnAccept(invitation.member_type);

        // Don't create a SECOND primary. If they already have one on another
        // unit, an admin decided that; accepting an invitation is not the
        // moment to overturn it.
        const hasOtherPrimary = (existingLinks as any[]).some(
          (l) => l.id !== existingLink?.id && l.is_primary_unit
        );

        if (existingLink) {
          await directus.request(
            updateItem("hoa_member_units", existingLink.id, {
              ...(hasOtherPrimary ? {} : { is_primary_unit: true }),
              ...(linkResidency ? { member_type: linkResidency } : {}),
            })
          );
        } else {
          await directus.request(
            createItem("hoa_member_units", {
              member_id: newMember.id,
              unit_id: invitationUnitId,
              is_primary_unit: !hasOtherPrimary,
              member_type: linkResidency,
              start_date: new Date().toISOString().slice(0, 10),
              status: "published",
            })
          );
        }
      } catch (linkError) {
        console.error("Could not link accepted member to their unit:", linkError);
      }
    }

    // 6. Mark invitation as accepted
    await directus.request(
      updateItem("hoa_invitations", invitation.id, {
        invitation_status: "accepted",
        accepted_at: new Date().toISOString(),
      })
    );

    // Keep the org's denormalized member_count in sync.
    await recomputeMemberCount(organizationId, directus);

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
    // Set user session with Directus tokens for API proxy
    await setUserSession(event, {
      user: {
        id: user.id as string,
        email: user.email as string,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        avatar: null,
        role: null,
        organization: {
          id: organizationId,
          name: organizationName,
          slug: null,
          domain: null,
          logo: null,
          email: null,
          phone: null,
          address: null,
          city: null,
          state: null,
          zip: null,
          settings: null,
          status: "active",
        },
        member: null,
      } as unknown as User,
      loggedInAt: Date.now(),
      expiresAt: Date.now() + authResult.expires * 1000,
      secure: {
        directusAccessToken: authResult.access_token,
        directusRefreshToken: authResult.refresh_token,
      },
    });

    // 8. Send notification email to admin who sent the invitation
    // Build organization branding data for email
    const org = invitation.organization;
    let orgLogoUrl: string | undefined;
    const settings = (org as any).settings as { logo?: string | { id: string } } | null;
    if (settings?.logo) {
      const logoId = typeof settings.logo === "string" ? settings.logo : settings.logo?.id;
      if (logoId) {
        orgLogoUrl = `${config.directus.url}/assets/${logoId}?width=200&format=png&fit=inside&quality=80`;
      }
    }

    // Build organization address
    const addressParts = [
      (org as any).street_address,
      (org as any).city,
      (org as any).state,
      (org as any).zip,
    ].filter(Boolean);
    const orgAddress = addressParts.length > 0 ? addressParts.join(", ") : undefined;

    // Build organization URL (slug-based)
    const orgUrl = (org as any).slug
      ? `${config.public.appUrl}/${(org as any).slug}`
      : config.public.appUrl;

    try {
      await sendInvitationAcceptedEmail({
        to: inviterEmail,
        adminName: inviterFirstName,
        memberName: `${firstName} ${lastName}`,
        memberEmail: newUser.email || invitation.email,
        organizationName: organizationName,
        // Organization branding data
        orgLogoUrl,
        orgUrl,
        orgPhoneNumber: (org as any).phone || undefined,
        orgEmail: (org as any).email || undefined,
        orgAddress,
        orgLegalName: (org as any).legal_name || undefined,
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

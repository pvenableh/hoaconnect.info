/**
 * POST /api/hoa/accept-invitation — join a community from an invitation.
 *
 * Body: { token, password?, firstName?, lastName?, phone? }.
 *   - A new account sends its name and a password.
 *   - Someone who already has an HOA Connect account sends its password, or
 *     nothing when they are signed in as it.
 * The rules are in core/server/utils/accept-invitation.ts. This route starts
 * the session and tells the person who sent the invitation.
 */
import { acceptInvitation } from "#core/server/utils/accept-invitation";
import { startPasswordSession } from "#core/server/utils/password-session";
import { sendInvitationAcceptedEmail } from "#core/server/utils/invitation-accepted-email";

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {};
  if (!body.token) throw createError({ statusCode: 400, message: "Invalid or expired invitation token" });

  const session = await getUserSession(event);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

  try {
    const accepted = await acceptInvitation({
      token: String(body.token),
      password: body.password,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      sessionUserId,
    });

    // Signed in as this account already: keep that session.
    if (accepted.tokens) await startPasswordSession(event, accepted.tokens);

    // Tell the person who sent it, in the community's branding.
    try {
      await sendInvitationAcceptedEmail({
        to: accepted.inviter.email,
        adminName: accepted.inviter.firstName,
        memberName: accepted.memberName,
        memberEmail: accepted.email,
        organizationName: accepted.organization.name,
        // The demo guardrail needs it: accepting a demo invitation must not mail the inviter.
        organizationId: accepted.organization.id,
      });
    } catch (emailError) {
      console.error("Failed to send the invitation-accepted email:", emailError);
    }

    return {
      success: true,
      existingAccount: accepted.existingAccount,
      user: { id: accepted.userId, email: accepted.email },
      organization: { id: accepted.organization.id, name: accepted.organization.name, slug: accepted.organization.slug },
    };
  } catch (error: any) {
    console.error("Accept invitation error:", error);
    throw createError({
      statusCode: error.statusCode || 400,
      message: error.message || "Failed to accept invitation",
    });
  }
});

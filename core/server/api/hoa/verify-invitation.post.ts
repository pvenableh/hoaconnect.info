/**
 * POST /api/hoa/verify-invitation — what the accept page shows for a token:
 * the email, the community, the role, and whether that email already has an
 * HOA Connect account (then the page asks for its password, not a new one).
 * The token is the secret the invitation email carried, so whoever holds it
 * may learn this about the address it was sent to.
 */
import { readItems } from "@directus/sdk";
import { accountForEmail, pendingInvitation } from "#core/server/utils/accept-invitation";
import { invitableMembers } from "#core/shared/members/invitability";

export default defineEventHandler(async (event) => {
  const { token } = (await readBody(event)) ?? {};
  if (!token) throw createError({ statusCode: 400, message: "Token is required" });

  const invitation = await pendingInvitation(String(token));
  if (!invitation) throw createError({ statusCode: 400, message: "Invalid invitation token" });
  if (new Date() > new Date(invitation.expires_at)) throw createError({ statusCode: 400, message: "Invitation has expired" });

  const org = typeof invitation.organization === "object" ? invitation.organization : null;
  const email = String(invitation.email || "").toLowerCase();
  const directus = getTypedDirectus();

  const account = email ? await accountForEmail(email) : null;

  // A new account's name, from the roster row the acceptance will adopt.
  let firstName: string | null = null;
  let lastName: string | null = null;
  if (!account && email && org?.id) {
    const roster = (await directus
      .request(
        readItems("hoa_members", {
          filter: { email: { _eq: email }, organization: { _eq: org.id } },
          fields: ["id", "status", "user", "first_name", "last_name"],
          sort: ["date_created"],
          limit: -1,
        } as never)
      )
      .catch(() => [])) as unknown as Array<{ id: string; status?: unknown; user?: unknown; first_name?: string | null; last_name?: string | null }>;
    const row = invitableMembers(roster)[0];
    firstName = row?.first_name || null;
    lastName = row?.last_name || null;
  }

  return {
    email,
    organizationName: org?.name,
    organizationSlug: org?.slug ?? null,
    roleName: typeof invitation.role === "object" ? (invitation.role as { name?: string } | null)?.name : undefined,
    expiresAt: invitation.expires_at,
    hasAccount: !!account,
    firstName,
    lastName,
  };
});

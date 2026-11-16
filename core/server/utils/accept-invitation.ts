/**
 * Accept an invitation to a community, as a new HOA Connect account or with
 * one the person already has.
 *
 * One account serves every community a person belongs to (hoa_members holds
 * one row per community), so an invitation to someone who already signed up
 * elsewhere joins that account to this community. It used to refuse them
 * ("A user with this email already exists"), and the only way in was a new
 * email address.
 *
 *   - New account: first and last name and a password; the account is created.
 *   - Existing account, signed out: their password, checked with Directus
 *     before anything is written. Their name comes from the account.
 *   - Existing account, signed in as it: nothing to type.
 *
 * The community role goes on the membership (hoa_members.role), which is what
 * the app's admin checks read. An existing account's Directus role is not
 * changed; the policies its new community role needs are attached to it
 * (account-access.ts), so calls on its own token work in the new community.
 *
 * Then, either way: the roster row for this email is adopted if there is one
 * (never a second row for the same person), the unit is linked, an approved
 * lease report's lease gets its tenant, and the invitation is marked accepted.
 */
import { createItem, createUser, readItems, readUsers, updateItem } from "@directus/sdk";
import { DIRECTUS_EMAIL_OFF } from "#core/shared/notifications/preferences";
import { normalizeResidency, residencyOnAccept } from "#core/shared/members/residency";
import { invitableMembers } from "#core/shared/members/invitability";
import { claimInvitedLeases } from "./lease-requests";
import { passwordTokens, type PasswordTokens } from "./password-session";
import { grantRoleAccess } from "./account-access";

/** The shortest password a new account may have; the form says so. */
export const MIN_PASSWORD_LENGTH = 8;

export interface AcceptInvitationInput {
  token: string;
  password?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  /** The account the caller is signed in as, if any. */
  sessionUserId?: string | null;
}

export interface AcceptedInvitation {
  userId: string;
  email: string;
  memberId: string;
  /** They signed up before, here or in another community. */
  existingAccount: boolean;
  /** Tokens to start a session with; null when they were already signed in as this account. */
  tokens: PasswordTokens | null;
  organization: { id: string; name: string; slug: string | null };
  inviter: { email: string; firstName: string };
  memberName: string;
}

interface InvitationRow {
  id: string;
  email?: string | null;
  role?: unknown;
  expires_at: string;
  member_type?: unknown;
  unit?: unknown;
  manager_permissions?: unknown;
  organization?: { id?: string; name?: string; slug?: string | null } | string | null;
  invited_by?: { email?: string | null; first_name?: string | null } | string | null;
}

interface AccountRow {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  status?: string | null;
}

interface MemberRow {
  id: string;
  status?: unknown;
  user?: unknown;
  member_type?: unknown;
  first_name?: string | null;
  last_name?: string | null;
}

const fail = (statusCode: number, message: string) => createError({ statusCode, message });
const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;
const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The pending invitation for `token`, with its community and sender, or null. */
export async function pendingInvitation(token: string): Promise<InvitationRow | null> {
  if (!token) return null;
  const rows = (await getTypedDirectus().request(
    readItems("hoa_invitations", {
      filter: { token: { _eq: token }, invitation_status: { _eq: "pending" } },
      fields: [
        "*",
        "role.id",
        "role.name",
        "organization.id",
        "organization.name",
        "organization.slug",
        "invited_by.email",
        "invited_by.first_name",
      ],
      limit: 1,
    } as never)
  )) as unknown as InvitationRow[];
  return rows?.[0] ?? null;
}

/** The HOA Connect account with this email, or null. */
export async function accountForEmail(email: string): Promise<AccountRow | null> {
  const rows = (await getTypedDirectus().request(
    readUsers({ filter: { email: { _eq: email } }, fields: ["id", "email", "first_name", "last_name", "status"], limit: 1 } as never)
  )) as unknown as AccountRow[];
  return rows?.[0] ?? null;
}

export async function acceptInvitation(input: AcceptInvitationInput): Promise<AcceptedInvitation> {
  const directus = getTypedDirectus();
  const invitation = await pendingInvitation(clean(input.token));
  if (!invitation) throw fail(400, "Invalid or expired invitation token");

  const org = typeof invitation.organization === "object" ? invitation.organization : null;
  const sender = typeof invitation.invited_by === "object" ? invitation.invited_by : null;
  if (!org?.id || !org.name) throw fail(500, "Organization data is incomplete");
  if (!sender?.email || !sender.first_name) throw fail(500, "Inviter data is incomplete");
  const email = clean(invitation.email).toLowerCase();
  if (!email) throw fail(500, "Invitation data is incomplete");
  const organization = { id: org.id, name: org.name, slug: org.slug ?? null };

  if (new Date() > new Date(invitation.expires_at)) {
    await directus.request(updateItem("hoa_invitations", invitation.id, { invitation_status: "expired" } as never));
    throw fail(400, "Invitation has expired");
  }

  const password = typeof input.password === "string" ? input.password : "";
  const account = await accountForEmail(email);

  // ── The account ──────────────────────────────────────────────────────────
  let userId: string;
  let tokens: PasswordTokens | null = null;
  let firstName: string;
  let lastName: string;

  if (account) {
    if (input.sessionUserId && input.sessionUserId === account.id) {
      // Signed in as this account already: that is the proof.
    } else {
      if (account.status && account.status !== "active") {
        throw fail(403, `The HOA Connect account for ${email} isn't active. Ask ${organization.name} to contact HOA Connect.`);
      }
      if (!password) throw fail(400, `Enter the password for ${email}.`);
      try {
        tokens = await passwordTokens(email, password);
      } catch {
        throw fail(401, `That isn't the password for ${email}. Reset it from the sign-in page if you've forgotten it.`);
      }
    }
    userId = account.id;
    firstName = clean(account.first_name) || clean(input.firstName);
    lastName = clean(account.last_name) || clean(input.lastName);

    // Already in this community on this account: don't add them twice.
    const mine = (await directus.request(
      readItems("hoa_members", {
        filter: { user: { _eq: userId }, organization: { _eq: organization.id } },
        fields: ["id", "status"],
        limit: -1,
      } as never)
    )) as unknown as MemberRow[];
    const current = mine.find((m) => m.status === "active");
    if (current) {
      await markAccepted(invitation.id);
      return {
        userId,
        email,
        memberId: current.id,
        existingAccount: true,
        tokens,
        organization,
        inviter: { email: sender.email, firstName: sender.first_name },
        memberName: `${firstName} ${lastName}`.trim(),
      };
    }
    if (mine.length) {
      // A former membership on this account: restoring it is the community's
      // call (invitability.ts), and a second row would split the person.
      throw fail(409, `Your earlier membership of ${organization.name} isn't active. Ask them to restore it, then sign in.`);
    }
  } else {
    firstName = clean(input.firstName);
    lastName = clean(input.lastName);
    if (!firstName || !lastName) throw fail(400, "Enter your first and last name.");
    if (password.length < MIN_PASSWORD_LENGTH) throw fail(400, `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    const created = (await directus.request(
      createUser({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        role: { id: idOf(invitation.role) as string },
        status: "active",
        provider: "local",
        ...DIRECTUS_EMAIL_OFF,
      } as never)
    )) as unknown as { id: string };
    userId = created.id;
    tokens = await passwordTokens(email, password);
  }

  // ── The membership ───────────────────────────────────────────────────────
  // Adopt the roster row for this email if there is one, rather than creating
  // a second member for the same person: an active member with no account is
  // exactly who an invitation is for (invitability.ts). Duplicate (email,
  // organization) rows exist in real data, so this reads all of them.
  const roster = (await directus.request(
    readItems("hoa_members", {
      filter: { email: { _eq: email }, organization: { _eq: organization.id } },
      fields: ["id", "status", "user", "member_type", "first_name", "last_name"],
      sort: ["date_created"],
      limit: -1,
    } as never)
  )) as unknown as MemberRow[];

  // The invitation's residency only when it states one: an old invitation
  // with none must not turn a known tenant into an owner.
  const invitationResidency = normalizeResidency(invitation.member_type);
  const adoptee = invitableMembers(roster)[0] ?? null;
  const phone = clean(input.phone);

  let memberId: string;
  if (adoptee) {
    await directus.request(
      updateItem("hoa_members", adoptee.id, {
        user: userId,
        role: idOf(invitation.role),
        // The person signing up is the authority on their own name; the
        // roster row was typed by whoever imported it.
        first_name: firstName,
        last_name: lastName,
        ...(phone ? { phone } : {}),
        ...(invitationResidency ? { member_type: invitationResidency } : {}),
        ...(invitation.manager_permissions ? { manager_permissions: invitation.manager_permissions } : {}),
        // Not `status`: they are already active, which is what let the
        // invitation out.
      } as never)
    );
    memberId = adoptee.id;
  } else {
    const made = (await directus.request(
      createItem("hoa_members", {
        user: userId,
        organization: organization.id,
        role: idOf(invitation.role),
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        member_type: residencyOnAccept(invitation.member_type),
        status: "active",
        ...(invitation.manager_permissions ? { manager_permissions: invitation.manager_permissions } : {}),
      } as never)
    )) as unknown as { id: string };
    memberId = made.id;
  }

  // An existing account gets what its new community role needs in Directus.
  // Best-effort: the membership is what the app's own admin routes read.
  if (account) {
    try {
      await grantRoleAccess(userId, idOf(invitation.role));
    } catch (accessError) {
      console.error("Could not give the account its community role's access:", accessError);
    }
  }

  // ── The unit ─────────────────────────────────────────────────────────────
  // Best-effort: the account and the membership exist now, and the invitation
  // is single-use; an admin can link the unit from the members page.
  const unitId = idOf(invitation.unit);
  if (unitId) {
    try {
      await linkInvitedUnit(memberId, unitId, adoptee
        ? invitationResidency ?? normalizeResidency(adoptee.member_type)
        : residencyOnAccept(invitation.member_type), !!adoptee);
    } catch (linkError) {
      console.error("Could not link accepted member to their unit:", linkError);
    }
  }

  // An approved lease report names this person as the tenant (lease-requests.ts).
  try {
    await claimInvitedLeases(organization.id, email, memberId);
  } catch (leaseError) {
    console.error("Could not attach accepted member to their lease:", leaseError);
  }

  await markAccepted(invitation.id);
  await recomputeMemberCount(organization.id, directus);

  return {
    userId,
    email,
    memberId,
    existingAccount: !!account,
    tokens,
    organization,
    inviter: { email: sender.email, firstName: sender.first_name },
    memberName: `${firstName} ${lastName}`.trim(),
  };
}

async function markAccepted(invitationId: string): Promise<void> {
  await getTypedDirectus().request(
    updateItem("hoa_invitations", invitationId, { invitation_status: "accepted", accepted_at: new Date().toISOString() } as never)
  );
}

/**
 * Link the member to the unit they were invited to, keyed on (member, unit):
 * an adopted member may already hold the link. Residency goes on the link too,
 * since residencyFor() reads the link first. Never a second primary unit.
 */
async function linkInvitedUnit(memberId: string, unitId: string, residency: string | null, adopted: boolean): Promise<void> {
  const directus = getTypedDirectus();
  const links = adopted
    ? ((await directus.request(
        readItems("hoa_member_units", {
          filter: { member_id: { _eq: memberId } },
          fields: ["id", "unit_id", "is_primary_unit"],
          limit: -1,
        } as never)
      )) as unknown as Array<{ id: string; unit_id?: unknown; is_primary_unit?: boolean | null }>)
    : [];
  const existing = links.find((l) => idOf(l.unit_id) === unitId);
  const hasOtherPrimary = links.some((l) => l.id !== existing?.id && l.is_primary_unit);

  if (existing) {
    await directus.request(
      updateItem("hoa_member_units", existing.id, {
        ...(hasOtherPrimary ? {} : { is_primary_unit: true }),
        ...(residency ? { member_type: residency } : {}),
      } as never)
    );
    return;
  }
  await directus.request(
    createItem("hoa_member_units", {
      member_id: memberId,
      unit_id: unitId,
      is_primary_unit: !hasOtherPrimary,
      member_type: residency,
      start_date: new Date().toISOString().slice(0, 10),
      status: "published",
    } as never)
  );
}

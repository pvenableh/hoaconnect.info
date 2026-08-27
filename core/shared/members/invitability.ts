// Invitation gating — MAY this email be sent an invitation to this org?
//
// Kept as pure functions, in shared, for the same reason as residency: the
// answer decides whether real mail goes to a real person, and it is asked from
// more than one place (the single-invite endpoint today, a bulk batch next).
//
// ⚠️ TWO ORTHOGONAL AXES, and collapsing them is the mistake this module
// exists to prevent:
//
//   • MEMBERSHIP — `hoa_members.status`. Is this person a current member of
//     the community, a current owner or tenant? 1033 Lenox: 59 active,
//     27 archived.
//   • PORTAL ONBOARDING — `hoa_members.user` being set. Have they ever signed
//     up for HOA Connect? 1033 Lenox: 1 of 59.
//
// An active member who has never signed in is NORMAL AND CORRECT, and is
// precisely who an invitation is FOR — 58 of 1033 Lenox's 59 active members are
// exactly that, and they are the whole reason the batch exists. The endpoint
// used to 409 every existing member with "This email already has a pending
// invitation", which was wrong on both axes at once: it read an absent ACCOUNT
// and reported it as an absent INVITATION, and it made the onboarding batch
// impossible to send.

/** The four values `hoa_members.status` actually takes in production. */
export type MembershipStatus = "active" | "inactive" | "pending" | "archived";

/**
 * The shape the gate needs off a `hoa_members` row. Structural rather than the
 * generated `HoaMember`: callers fetch a narrow `fields` list.
 */
export interface InvitableMember {
  id?: string | null;
  status?: unknown;
  /** The ACCOUNT axis. Set = they have signed up. Never confuse with `status`. */
  user?: unknown;
  first_name?: string | null;
  last_name?: string | null;
}

export type InviteBlockCode =
  /** Already a member here AND already on the portal. Nothing to invite them to. */
  | "member_already_onboarded"
  /** A former resident. Restore is an explicit, separate act — never automatic. */
  | "member_archived"
  /** Some other non-active membership status. */
  | "member_not_active";

/**
 * What the client needs to offer a Restore action. The gate NEVER performs it:
 * a typo'd email that happens to match a former resident must not silently
 * reactivate them. Presenting the choice to a human is the whole design.
 */
export interface InviteRestoreTarget {
  memberId: string;
  name: string;
  currentStatus: string;
}

export type InviteDecision =
  | {
      allowed: true;
      /**
       * The existing ACTIVE member this invitation onboards, when there is one.
       * Null means a genuinely new person. `accept-invitation` adopts this row
       * rather than creating a second member for the same email.
       */
      member: InvitableMember | null;
    }
  | {
      allowed: false;
      code: InviteBlockCode;
      /** The membership status that blocked it, named so the message can say why. */
      status: string | null;
      message: string;
      /** Non-null when a human could unblock this by making the member active. */
      restore: InviteRestoreTarget | null;
    };

const nameOf = (m: InvitableMember): string =>
  `${m.first_name || ""} ${m.last_name || ""}`.trim() || "This email";

const statusOf = (m: InvitableMember): string =>
  typeof m.status === "string" && m.status ? m.status : "unknown";

const hasAccount = (m: InvitableMember): boolean => {
  const u = m.user;
  if (u == null || u === "") return false;
  if (typeof u === "object") return !!(u as { id?: unknown }).id;
  return true;
};

/**
 * Is this membership status one an invitation may be sent to?
 *
 * Only `active`. `inactive`, `pending` and `archived` all describe someone who
 * is not a current member of the community, and mailing them a portal signup
 * link would be inviting a stranger — or worse, a former resident — back in.
 */
export function isInvitableStatus(status: unknown): boolean {
  return status === "active";
}

/**
 * The members of a roster who should receive an onboarding invitation.
 *
 * Active AND not already on the portal. This is the batch filter — the 58 of
 * 1033 Lenox's 86 members, arrived at by excluding the 27 archived former
 * residents and the 1 who already has an account.
 *
 * It filters ROWS, and does NOT dedupe by email: 605 Lincoln Road would yield
 * 31 rows for 29 distinct addresses. That is safe rather than an oversight —
 * the second invitation to an address hits `invite-member`'s existing
 * "a pending invitation already exists" 409, so nobody is mailed twice — but a
 * batch builder that wants an accurate "will send N" count has to dedupe
 * itself. 1033 Lenox holds no duplicates, so its 58 is already distinct.
 */
export function invitableMembers<T extends InvitableMember>(members: readonly T[]): T[] {
  return members.filter((m) => isInvitableStatus(m.status) && !hasAccount(m));
}

/**
 * Decide whether an email may be invited, given EVERY `hoa_members` row that
 * already matches it in this organization.
 *
 * Takes a list, not one row, because duplicate (email, organization) rows are
 * real: 605 Lincoln Road holds four such groups today, one of them three rows
 * deep. Picking `[0]` and reasoning from it would let the answer depend on
 * Directus's sort order.
 *
 * Precedence is deliberate:
 *   1. Any row with an account wins — they are on the portal, full stop.
 *   2. Otherwise any ACTIVE row means invite away, and that row is the one the
 *      acceptance adopts.
 *   3. Otherwise the person is not a current member, and archived is called out
 *      by name because it is the case with a restore path.
 */
export function inviteGateFor(matches: readonly InvitableMember[]): InviteDecision {
  const rows = (matches || []).filter(Boolean);
  if (rows.length === 0) return { allowed: true, member: null };

  const onboarded = rows.find(hasAccount);
  if (onboarded) {
    return {
      allowed: false,
      code: "member_already_onboarded",
      status: statusOf(onboarded),
      message: `${nameOf(onboarded)} is already a member of this organization and already has a portal account.`,
      restore: null,
    };
  }

  const active = rows.find((m) => isInvitableStatus(m.status));
  if (active) return { allowed: true, member: active };

  const archived = rows.find((m) => m.status === "archived");
  const blocker = archived ?? rows[0]!;
  const restore: InviteRestoreTarget | null = blocker.id
    ? { memberId: String(blocker.id), name: nameOf(blocker), currentStatus: statusOf(blocker) }
    : null;

  if (archived) {
    return {
      allowed: false,
      code: "member_archived",
      status: "archived",
      message:
        `${nameOf(archived)} is an archived former resident of this organization, not a current member. ` +
        `Restore them first if they have moved back — sending an invitation will not, and should not, do it for you.`,
      restore,
    };
  }

  return {
    allowed: false,
    code: "member_not_active",
    status: statusOf(blocker),
    message:
      `${nameOf(blocker)}'s membership status is "${statusOf(blocker)}", not active. ` +
      `Only active members can be invited. Set their status to Active first if they are a current resident.`,
    restore,
  };
}

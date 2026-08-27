// Portal onboarding — is this member ON THE APP yet, and if not, have we asked?
//
// ⚠️ THIS IS THE SECOND AXIS, and it is not `hoa_members.status`.
//
//   • MEMBERSHIP — `hoa_members.status`. Is this person a current member of the
//     community, a current owner or tenant? 1033 Lenox: 59 active, 27 archived.
//   • PORTAL ONBOARDING — this module. Have they ever signed up, and if not,
//     is there an invitation outstanding? 1033 Lenox: 1 of 59 has an account.
//
// An active member who has never signed in is NORMAL AND CORRECT — 58 of 1033
// Lenox's 59 active members are exactly that, and they are who the onboarding
// batch is FOR. Nothing here reads or writes `status`; a member is never
// demoted for not being on the portal. What this module adds is the ability to
// ASK the question — "which of my active owners is still not on the portal?" —
// without the answer having to be smuggled into their membership standing.
//
// Three states, from two sources joined on (email, organization):
//
//   has an account       `hoa_members.user` is set
//   invited, not accepted an `hoa_invitations` row is still outstanding
//   not yet invited      neither
//
// The caller supplies both sides already scoped to ONE organization — the
// members page fetches each with `organization: { _eq: orgId }` — so the join
// key here is the email address alone.

export type OnboardingState = "account" | "invited" | "not_invited";

/** The shape this needs off a `hoa_members` row. Structural: callers fetch a narrow `fields` list. */
export interface OnboardingMember {
  email?: string | null;
  /** The ACCOUNT axis. Set = they have signed up. Never confuse with `status`. */
  user?: unknown;
}

/** The shape this needs off an `hoa_invitations` row. */
export interface OnboardingInvitation {
  id?: string | null;
  email?: string | null;
  invitation_status?: unknown;
  expires_at?: string | null;
  date_created?: string | null;
}

/**
 * Deliberately ONE flat shape with nullable fields rather than a union
 * discriminated on `state`. This project compiles without `strictNullChecks`
 * and Vitest never typechecks, so a union that narrows in neither would pass
 * every unit test and fail only in `nuxt typecheck`. See `invitability.ts`.
 */
export interface MemberOnboarding {
  state: OnboardingState;
  label: string;
  /**
   * The outstanding invitation has lapsed — the fix is Resend, not a fresh
   * invite. Only meaningful when `state` is "invited".
   */
  expired: boolean;
  invitationId: string | null;
  /** `date_created` of the invitation that decided the state. */
  invitedAt: string | null;
  /**
   * The normalized status of the most recent invitation to this address, in ANY
   * status — including the `accepted` and `canceled` ones that do NOT make
   * someone "invited". Carried so the UI can explain a surprising state
   * ("not yet invited" for someone whose only invitation was canceled) instead
   * of just asserting it.
   */
  lastInvitationStatus: string | null;
}

export const ONBOARDING_LABELS: Record<OnboardingState, string> = {
  account: "Has account",
  invited: "Invited",
  not_invited: "Not invited",
};

/**
 * `hoa_invitations` fields an onboarding read needs. Spread into a `fields`
 * array so a call site cannot half-migrate — asking for the state while
 * forgetting `expires_at` would report a dead invitation as outstanding.
 */
export const ONBOARDING_INVITATION_FIELDS = [
  "id",
  "email",
  "invitation_status",
  "expires_at",
  "date_created",
] as const;

/** Join key. Emails are compared case- and whitespace-insensitively. */
export function onboardingEmailKey(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/**
 * Normalize `invitation_status` before comparing it.
 *
 * ⚠️ Not cosmetic. The Directus field's own choice list carries
 * `"canceled "` — WITH A TRAILING SPACE — and the generated type in
 * `core/types/directus.ts` reproduces it. The app's `cancel-invitation`
 * endpoint writes the trimmed `"canceled"`, so both spellings are reachable,
 * and an untrimmed compare would read a canceled invitation as outstanding.
 * Directus does not enforce `choices` at all, so junk is reachable too.
 */
export function normalizeInvitationStatus(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  return s || null;
}

/**
 * Is this invitation still outstanding — i.e. does it mean "we have asked and
 * they have not joined"?
 *
 * Defined by what ENDS an invitation, not by what continues it: `accepted` and
 * `canceled` are over, everything else is outstanding. That way a status this
 * code has never heard of — Directus does not enforce `choices`, so one is
 * reachable — reads as "a row exists, so they were asked", which is the
 * conservative answer. An expired invitation is still outstanding: the person
 * was asked, the link merely died, and the fix is a resend.
 */
export function isOutstandingInvitation(invitation: OnboardingInvitation | null | undefined): boolean {
  if (!invitation) return false;
  const status = normalizeInvitationStatus(invitation.invitation_status);
  return status !== "accepted" && status !== "canceled";
}

/**
 * Has this invitation lapsed?
 *
 * Checks `expires_at` as well as the stored status, because the status is only
 * flipped to `expired` LAZILY — `accept-invitation.post.ts` writes it when
 * someone tries to use a dead token. A pending row whose `expires_at` has
 * passed is expired in every way that matters and nothing will have said so.
 */
export function isExpiredInvitation(
  invitation: OnboardingInvitation | null | undefined,
  asOf: Date = new Date()
): boolean {
  if (!invitation) return false;
  if (normalizeInvitationStatus(invitation.invitation_status) === "expired") return true;
  if (!invitation.expires_at) return false;
  const expires = new Date(invitation.expires_at);
  if (Number.isNaN(expires.getTime())) return false; // unparseable → don't declare it dead
  return expires.getTime() < asOf.getTime();
}

/** Newest first, by `date_created`; rows without one sort last. */
function byNewest(a: OnboardingInvitation, b: OnboardingInvitation): number {
  const ta = a.date_created ? Date.parse(a.date_created) : NaN;
  const tb = b.date_created ? Date.parse(b.date_created) : NaN;
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return tb - ta;
}

/**
 * Group one organization's invitations by email address.
 *
 * A `Map`, not an object: an email is arbitrary user input and an object index
 * would let `__proto__` or `constructor` return something that is not an
 * invitation list.
 */
export function indexInvitationsByEmail(
  invitations: readonly OnboardingInvitation[] | null | undefined
): Map<string, OnboardingInvitation[]> {
  const index = new Map<string, OnboardingInvitation[]>();
  for (const invitation of invitations || []) {
    if (!invitation) continue;
    const key = onboardingEmailKey(invitation.email);
    if (!key) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(invitation);
    else index.set(key, [invitation]);
  }
  return index;
}

/** Does this member row carry a portal account? Mirrors `invitability.ts`. */
function hasAccount(member: OnboardingMember | null | undefined): boolean {
  const u = member?.user;
  if (u == null || u === "") return false;
  if (typeof u === "object") return !!(u as { id?: unknown }).id;
  return true;
}

/**
 * Where does this member stand on the PORTAL axis?
 *
 * Precedence: the account wins. `hoa_members.user` is the account axis, so a
 * member who has signed up reads as "has account" whatever their invitation
 * history says — including the accepted invitation that produced it.
 */
export function onboardingFor(
  member: OnboardingMember | null | undefined,
  invitations: readonly OnboardingInvitation[] | null | undefined,
  options?: { asOf?: Date }
): MemberOnboarding {
  const asOf = options?.asOf ?? new Date();
  const rows = (invitations || []).filter(Boolean).slice().sort(byNewest);
  const lastInvitationStatus = rows.length
    ? normalizeInvitationStatus(rows[0]!.invitation_status)
    : null;

  if (hasAccount(member)) {
    return {
      state: "account",
      label: ONBOARDING_LABELS.account,
      expired: false,
      invitationId: null,
      invitedAt: null,
      lastInvitationStatus,
    };
  }

  const outstanding = rows.find(isOutstandingInvitation);
  if (outstanding) {
    return {
      state: "invited",
      label: ONBOARDING_LABELS.invited,
      expired: isExpiredInvitation(outstanding, asOf),
      invitationId: outstanding.id ? String(outstanding.id) : null,
      invitedAt: outstanding.date_created ?? null,
      lastInvitationStatus,
    };
  }

  return {
    state: "not_invited",
    label: ONBOARDING_LABELS.not_invited,
    expired: false,
    invitationId: null,
    invitedAt: null,
    lastInvitationStatus,
  };
}

/**
 * The whole roster's onboarding, keyed by whatever id the caller uses.
 *
 * Convenience over `onboardingFor` in a loop, so a list view builds the email
 * index once instead of per row.
 */
export function onboardingIndexFor<T extends OnboardingMember & { id?: unknown }>(
  members: readonly T[] | null | undefined,
  invitations: readonly OnboardingInvitation[] | null | undefined,
  options?: { asOf?: Date }
): Map<string, MemberOnboarding> {
  const byEmail = indexInvitationsByEmail(invitations);
  const result = new Map<string, MemberOnboarding>();
  for (const member of members || []) {
    if (!member || member.id == null) continue;
    result.set(
      String(member.id),
      onboardingFor(member, byEmail.get(onboardingEmailKey(member.email)), options)
    );
  }
  return result;
}

/**
 * How many members sit in each state, so a list can offer the counts without
 * the caller re-deriving them.
 *
 * ⚠️ Counts ROWS, not addresses — 605 Lincoln Road holds four `(email,
 * organization)` groups whose extra rows are DIFFERENT UNITS owned by the same
 * entity, not duplicates. Same caveat as `invitableMembers()`.
 */
export function onboardingCounts(
  members: readonly OnboardingMember[] | null | undefined,
  invitations: readonly OnboardingInvitation[] | null | undefined,
  options?: { asOf?: Date }
): Record<OnboardingState | "all", number> {
  const byEmail = indexInvitationsByEmail(invitations);
  const counts = { all: 0, account: 0, invited: 0, not_invited: 0 };
  for (const member of members || []) {
    if (!member) continue;
    counts.all += 1;
    counts[onboardingFor(member, byEmail.get(onboardingEmailKey(member.email)), options).state] += 1;
  }
  return counts;
}

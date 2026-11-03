/**
 * Email classes and the audience rules that follow from them (Earnest parity
 * round 3, Phase 3a).
 *
 * Every email an org sends to its members is one of two classes:
 *
 *   essential — dues, assessments, meeting notices, violations, governance,
 *               membership. Relationship mail: it cannot be unsubscribed, and
 *               its footer says so.
 *   community — newsletters, announcements, general news. Members may opt out
 *               (`hoa_members.email_community_opt_out`), and every send carries
 *               the one-click `List-Unsubscribe` headers.
 *
 * The composer picks a default from the email type and lets the sender change
 * it, with one hard rule: a newsletter is never essential. Calling a newsletter
 * "essential" is the exact move that turns an opt-out into a complaint, so the
 * server refuses it rather than trusting the client.
 *
 * A bounced address (`hoa_members.email_bounced`) drops out of BOTH classes —
 * mailing a dead mailbox costs the shared sending reputation whatever the
 * content. An opted-out member drops out of `community` only.
 *
 * Pure: imported by the send routes, the scheduled job, the digest worker (by
 * relative path, so no `#core` runtime imports here) and the composer.
 */

export const EMAIL_CLASSES = ["essential", "community"] as const;
export type EmailClass = (typeof EMAIL_CLASSES)[number];

/** The composer's email types (`hoa_emails.email_type`). */
export type ComposedEmailType =
  | "basic"
  | "alert"
  | "newsletter"
  | "announcement"
  | "reminder"
  | "notice";

/** Types that read as official notices default to essential; the rest to community. */
const ESSENTIAL_BY_DEFAULT: ReadonlySet<string> = new Set(["alert", "reminder", "notice"]);

/** Types that may never be sent as essential. */
const NEVER_ESSENTIAL: ReadonlySet<string> = new Set(["newsletter"]);

export const NEWSLETTER_NOT_ESSENTIAL = "newsletter_not_essential";

export function isEmailClass(value: unknown): value is EmailClass {
  return value === "essential" || value === "community";
}

/** The class an email of this type starts as in the composer. Unknown types are community. */
export function defaultEmailClass(emailType: string | null | undefined): EmailClass {
  return emailType && ESSENTIAL_BY_DEFAULT.has(emailType) ? "essential" : "community";
}

/** May an email of this type be sent as essential? */
export function canBeEssential(emailType: string | null | undefined): boolean {
  return !(emailType && NEVER_ESSENTIAL.has(emailType));
}

export type EmailClassResolution =
  | { ok: true; emailClass: EmailClass }
  | { ok: false; code: typeof NEWSLETTER_NOT_ESSENTIAL; message: string };

/**
 * The class a send goes out as. No (or an unrecognised) request takes the
 * type's default; an explicit `essential` on a newsletter is refused, never
 * quietly downgraded — the sender asked for something the rules forbid, and
 * they should hear that rather than find out from a resident.
 */
export function resolveEmailClass(
  emailType: string | null | undefined,
  requested?: unknown
): EmailClassResolution {
  if (!isEmailClass(requested)) return { ok: true, emailClass: defaultEmailClass(emailType) };
  if (requested === "essential" && !canBeEssential(emailType)) {
    return {
      ok: false,
      code: NEWSLETTER_NOT_ESSENTIAL,
      message:
        "A newsletter is community mail, so members can unsubscribe from it. It can't be sent as essential.",
    };
  }
  return { ok: true, emailClass: requested };
}

// ── Audience ────────────────────────────────────────────────────────────────

/** Where an opt-out came from (`hoa_members.email_community_opt_out_source`). */
export const OPT_OUT_SOURCES = ["link", "one_click", "spam", "admin"] as const;
export type OptOutSource = (typeof OPT_OUT_SOURCES)[number];

export function isOptOutSource(value: unknown): value is OptOutSource {
  return typeof value === "string" && (OPT_OUT_SOURCES as readonly string[]).includes(value);
}

/** The two flags the audience rules read off a member. Missing = false. */
export interface MemberEmailState {
  email_community_opt_out?: boolean | null;
  email_bounced?: boolean | null;
}

export type SuppressionReason = "bounced" | "opted_out";

/** Why this member is left out of a send of this class, or null when they are mailed. */
export function suppressionReason(
  member: MemberEmailState | null | undefined,
  emailClass: EmailClass
): SuppressionReason | null {
  if (member?.email_bounced === true) return "bounced";
  if (emailClass === "community" && member?.email_community_opt_out === true) return "opted_out";
  return null;
}

/**
 * May an essential, one-to-one message (a dues reminder, a project notice) go
 * to this member by email? A hard-bounced address gets nothing — SendGrid would
 * drop it and count it against the sender. The community opt-out does not
 * apply: these are essential (Phase 3b, docs/spec-email-send-queue.md §7.4).
 */
export function essentialEmailAllowed(member: MemberEmailState | null | undefined): boolean {
  return member?.email_bounced !== true;
}

/** Split a resolved audience into who is mailed and who is left out (and why). */
export function partitionAudience<T extends MemberEmailState>(
  members: readonly T[],
  emailClass: EmailClass
): { recipients: T[]; suppressed: Array<{ member: T; reason: SuppressionReason }> } {
  const recipients: T[] = [];
  const suppressed: Array<{ member: T; reason: SuppressionReason }> = [];
  for (const member of members) {
    const reason = suppressionReason(member, emailClass);
    if (reason) suppressed.push({ member, reason });
    else recipients.push(member);
  }
  return { recipients, suppressed };
}

/** What an essential email is, in the words the footer, the composer and the unsubscribe page use. */
export const ESSENTIAL_MAIL_EXAMPLES = [
  "Dues and assessments",
  "Meeting notices",
  "Violations",
  "Governance and votes",
  "Membership",
] as const;

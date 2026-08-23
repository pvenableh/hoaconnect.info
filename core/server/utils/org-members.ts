/**
 * "Which of these people actually belong to this community?"
 *
 * One answer, in one place, because three different things need it for three
 * different reasons: a write that must be rejected (task links), a bell row
 * that must not be created, and an email that must not be sent. The question is
 * identical every time; only what you do with the answer differs.
 *
 * Membership means "has an hoa_members row in this org", any status. The
 * question here is which community someone belongs to, not whether their
 * membership is currently active — a deactivated member is still this
 * community's person, and folding lifecycle policy into a tenancy check makes
 * both harder to reason about.
 *
 * Never fails open. Every caller is a boundary of some kind, so a read failure
 * has to surface as a failure rather than as an empty set that quietly means
 * "allow everyone" or "allow no one" depending on which way the caller reads it.
 */

import { readItems } from "@directus/sdk";

/**
 * The subset of `userIds` that hold a membership in `organizationId`.
 * Throws if the lookup itself fails — see the note above.
 */
export async function orgMemberUserIds(
  organizationId: string,
  userIds: string[],
): Promise<Set<string>> {
  const wanted = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!wanted.length) return new Set();

  const rows = (await getTypedDirectus().request(
    readItems("hoa_members", {
      filter: { organization: { _eq: organizationId }, user: { _in: wanted } },
      fields: ["user"],
      limit: -1,
    })
  )) as any[];

  return new Set(
    (rows || [])
      .map((r) => (typeof r.user === "string" ? r.user : r.user?.id))
      .filter(Boolean)
  );
}

/**
 * Keep only the recipients who belong to this community, for the notification
 * paths — where the right response to an outsider is to drop them, not to fail
 * the action that triggered the notification.
 *
 * FAILS CLOSED, which is the opposite of what the rest of the notify layer
 * does and is deliberate. Elsewhere in `notify.ts` an unreadable preference
 * falls back to notifying everyone, on the reasoning that losing a durable bell
 * row is worse than showing someone a category they muted. That reasoning does
 * not carry here: the failure being weighed is not a muted category, it is one
 * community's message reaching another community's member. A transient
 * Directus error must not become a leak, so it becomes silence — loudly logged.
 *
 * `label` names the call site in the log, since a silent drop is otherwise
 * indistinguishable from "nobody had anything to say".
 */
export async function scopeRecipientsToOrg(
  organizationId: string,
  userIds: string[],
  label: string,
): Promise<string[]> {
  const wanted = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!wanted.length) return [];

  let members: Set<string>;
  try {
    members = await orgMemberUserIds(organizationId, wanted);
  } catch (e) {
    console.error(
      `[${label}] membership lookup failed for org ${organizationId}; sending to nobody`,
      (e as Error).message
    );
    return [];
  }

  const kept = wanted.filter((id) => members.has(id));
  if (kept.length !== wanted.length) {
    // Worth a line every time. Legitimately this is someone who has left the
    // community since the row naming them was written; illegitimately it is an
    // id that arrived in a request body, which is the case this exists for.
    console.warn(
      `[${label}] dropped ${wanted.length - kept.length} recipient(s) with no membership in org ${organizationId}`
    );
  }
  return kept;
}

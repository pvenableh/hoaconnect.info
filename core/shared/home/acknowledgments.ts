// Who still owes an acknowledgment (docs/scope-notices-and-forms.md, step 1).
//
// Pure: no Directus, no clock (callers pass `now`). Two rules hold everywhere:
//  - Organization: a notice and an acknowledgment only count for the person's
//    own community. A row from another organization never matches.
//  - Role and hat: a notice reaches a person only if its `target_audience` fits
//    their residency or board hat in THAT community (hats add: an owner on the
//    board is reached by "owners" and by "board members").

export type NoticeAudience = "all" | "owners" | "tenants" | "board members";

export interface AckNotice {
  id: string;
  organization: string;
  status?: string | null;
  target_audience?: string | null;
  requires_acknowledgment?: boolean | null;
  ack_due?: string | null;
  publish_date?: string | null;
  expiry_date?: string | null;
  title?: string | null;
}

export interface AckRecord {
  announcement: string;
  member: string;
  organization: string;
}

/** The slice of a RoleContext the audience check reads. */
export interface AckRecipient {
  /** `hoa_members` id for this community. */
  memberId: string;
  organization: string;
  residency: "owner" | "tenant" | "none";
  board: boolean;
}

/** Does this notice's audience include this person? Unknown audiences reach no one. */
export function reachesRecipient(audience: string | null | undefined, who: Pick<AckRecipient, "residency" | "board">): boolean {
  switch (audience ?? "all") {
    case "all":
      return true;
    case "owners":
      return who.residency === "owner";
    case "tenants":
      return who.residency === "tenant";
    case "board members":
      return who.board;
    default:
      return false;
  }
}

/** A notice that is live on `now`: published, started, not expired. */
function isLive(n: AckNotice, now: Date): boolean {
  if (n.status !== "published") return false;
  const t = now.getTime();
  if (n.publish_date && new Date(n.publish_date).getTime() > t) return false;
  if (n.expiry_date && new Date(n.expiry_date).getTime() < t) return false;
  return true;
}

/** Notices that ask for acknowledgment, are live, and belong to `orgId`. */
export function ackNotices(notices: readonly AckNotice[], orgId: string, now: Date): AckNotice[] {
  return notices.filter((n) => n.organization === orgId && n.requires_acknowledgment === true && isLive(n, now));
}

/**
 * The notices this person still owes, soonest due first (undated last, then
 * title). Empty when the person has no membership in the notice's community.
 */
export function outstandingFor(
  who: AckRecipient,
  notices: readonly AckNotice[],
  acks: readonly AckRecord[],
  now: Date
): AckNotice[] {
  const done = new Set(
    acks.filter((a) => a.organization === who.organization && a.member === who.memberId).map((a) => a.announcement)
  );
  return ackNotices(notices, who.organization, now)
    .filter((n) => reachesRecipient(n.target_audience, who) && !done.has(n.id))
    .sort((a, b) => {
      if (a.ack_due && b.ack_due) return a.ack_due.localeCompare(b.ack_due);
      if (a.ack_due) return -1;
      if (b.ack_due) return 1;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
}

/** The admin's "who has not" list for one notice: reached members without a row. */
export function unacknowledgedBy<T extends AckRecipient>(
  notice: AckNotice,
  recipients: readonly T[],
  acks: readonly AckRecord[]
): T[] {
  const done = new Set(
    acks.filter((a) => a.announcement === notice.id && a.organization === notice.organization).map((a) => a.member)
  );
  return recipients.filter(
    (r) => r.organization === notice.organization && reachesRecipient(notice.target_audience, r) && !done.has(r.memberId)
  );
}

/** Is an acknowledgment past its due date on `today` (YYYY-MM-DD)? */
export function isOverdue(notice: Pick<AckNotice, "ack_due">, today: string): boolean {
  return !!notice.ack_due && notice.ack_due.slice(0, 10) < today;
}

/** The unique key stored on a row: one acknowledgment per member per notice. */
export function ackKey(announcementId: string, memberId: string): string {
  return `${announcementId}:${memberId}`;
}

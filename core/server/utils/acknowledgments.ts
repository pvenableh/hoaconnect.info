/**
 * The lookups behind notice acknowledgments (docs/scope-notices-and-forms.md,
 * step 2). Who still owes one is decided in `#core/shared/home/acknowledgments`,
 * pure; this file only reads rows, with the admin token, and always filters by
 * the organization the caller was checked against.
 */
import { readItems } from "@directus/sdk";
import { RESIDENCY_UNIT_FIELDS, residencyFor } from "#core/shared/members/residency";
import { todayUtc } from "#core/shared/roles/role-context";
import type { AckNotice, AckRecipient, AckRecord } from "#core/shared/home/acknowledgments";

const idOf = (v: any): string | null => (v && typeof v === "object" ? (v.id ?? null) : v ? String(v) : null);

/** Stored audiences are `board_members`; the pure core says `board members`. */
const audienceOf = (v: unknown) => (typeof v === "string" ? v.replace(/_/g, " ") : null);

const NOTICE_FIELDS = ["id", "organization", "status", "title", "target_audience", "requires_acknowledgment", "ack_due", "publish_date", "expiry_date"] as const;

const toNotice = (r: any): AckNotice => ({
  id: String(r.id),
  organization: idOf(r.organization) as string,
  status: r.status ?? null,
  title: r.title ?? null,
  target_audience: audienceOf(r.target_audience),
  requires_acknowledgment: r.requires_acknowledgment === true,
  ack_due: r.ack_due ?? null,
  publish_date: r.publish_date ?? null,
  expiry_date: r.expiry_date ?? null,
});

/** Published notices in `orgId` that ask for acknowledgment (liveness is the pure core's call). */
export async function readAckNotices(orgId: string, onlyId?: string): Promise<AckNotice[]> {
  const rows = (await getTypedDirectus().request(
    readItems("hoa_announcements", {
      filter: {
        organization: { _eq: orgId },
        requires_acknowledgment: { _eq: true },
        status: { _eq: "published" },
        ...(onlyId ? { id: { _eq: onlyId } } : {}),
      } as never,
      fields: [...NOTICE_FIELDS] as never,
      limit: -1,
    })
  )) as any[];
  return (rows ?? []).map(toNotice);
}

/** Acknowledgment rows in `orgId`, for one member or one notice. */
export async function readAcks(orgId: string, by: { member?: string; announcement?: string }): Promise<AckRecord[]> {
  const rows = (await getTypedDirectus().request(
    readItems("hoa_acknowledgments", {
      filter: {
        organization: { _eq: orgId },
        ...(by.member ? { member: { _eq: by.member } } : {}),
        ...(by.announcement ? { announcement: { _eq: by.announcement } } : {}),
      } as never,
      fields: ["announcement", "member", "organization"] as never,
      limit: -1,
    })
  )) as any[];
  return (rows ?? []).map((r) => ({
    announcement: idOf(r.announcement) as string,
    member: idOf(r.member) as string,
    organization: idOf(r.organization) as string,
  }));
}

export interface AckPerson extends AckRecipient {
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
}

/** Every active member of `orgId` with the residency and board hat the audience check reads. */
export async function readAckRecipients(orgId: string): Promise<AckPerson[]> {
  const directus = getTypedDirectus();
  const members = (await directus.request(
    readItems("hoa_members", {
      filter: { organization: { _eq: orgId }, status: { _eq: "active" } } as never,
      fields: ["id", "user", "first_name", "last_name", "member_type", ...RESIDENCY_UNIT_FIELDS] as never,
      limit: -1,
    })
  )) as any[];
  const today = todayUtc();
  const terms = (await directus.request(
    readItems("hoa_board_members", {
      filter: {
        hoa_member: { organization: { _eq: orgId } },
        status: { _eq: "published" },
        _and: [
          { _or: [{ term_start: { _lte: today } }, { term_start: { _null: true } }] },
          { _or: [{ term_end: { _gte: today } }, { term_end: { _null: true } }] },
        ],
      } as never,
      fields: ["hoa_member"] as never,
      limit: -1,
    })
  )) as any[];
  const board = new Set((terms ?? []).map((t) => idOf(t.hoa_member)).filter(Boolean) as string[]);
  return (members ?? []).map((m) => ({
    memberId: String(m.id),
    organization: orgId,
    residency: residencyFor(m) ?? "none",
    board: board.has(String(m.id)),
    userId: idOf(m.user),
    firstName: m.first_name ?? null,
    lastName: m.last_name ?? null,
  }));
}

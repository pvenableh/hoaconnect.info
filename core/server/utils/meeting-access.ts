/**
 * Meetings access (server-side enforcement) — the gate file for the
 * `meetings` area in AREAS (docs/spec-delegation.md).
 *
 *   work = org admin ∪ manager with the `meetings` grant
 *          ∪ a helper or committee holding it
 *
 * Working the area is posting meetings: notices, agendas, minutes,
 * recordings and attendance. Every read and write the meetings page makes
 * goes through the /api/org/meetings routes, with the app's token, behind
 * requireAreaWork(…, "meetings"); a helper is a plain HOA Member in Directus.
 * The Board Room's decision records stay with admins.
 */
import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";
import { z } from "zod";
import type { ReadSpec } from "#core/server/utils/directus-graphql";

const idOf = (v: any): string | null => (v == null ? null : typeof v === "string" ? v : (v.id ?? null));

/** 403 unless the caller works meetings in `orgId`. */
export function requireMeetingsWork(event: H3Event, orgId: string) {
  return requireAreaWork(event, orgId, "meetings");
}

export const MEETING_FIELDS = [
  "id", "title", "type", "status", "meeting_date", "end_date", "location", "virtual_url", "agenda", "minutes",
  "recording_url", "is_published", "target_audience", "date_created", "organization",
  "attendees.id", "attendees.hoa_member.id", "attendees.hoa_member.first_name", "attendees.hoa_member.last_name",
  "attendees.role_at_meeting", "attendees.is_board_member", "attendees.attendance", "attendees.board_term.id",
] as const;

/** The page's three reads: the meetings, the people who can attend, and the board terms. */
export function meetingsPageSpecs(orgId: string): Record<"meetings" | "members" | "terms", ReadSpec> {
  return {
    meetings: {
      collection: "hoa_meetings",
      filter: { organization: { _eq: orgId } },
      fields: [...MEETING_FIELDS],
      sort: ["-meeting_date"],
      limit: -1,
    },
    members: {
      collection: "hoa_members",
      filter: { organization: { _eq: orgId }, status: { _in: ["active", "inactive"] } },
      fields: ["id", "first_name", "last_name", "member_type"],
      sort: ["last_name", "first_name"],
      limit: -1,
    },
    terms: {
      collection: "hoa_board_members",
      filter: { hoa_member: { organization: { _eq: orgId } } },
      fields: ["id", "title", "term_start", "term_end", "hoa_member.id"],
      limit: -1,
    },
  };
}

const text = z.string().trim().max(20000).nullable().optional();

/** What a meeting write may set. `organization` is the route's, never the body's. */
export const meetingBody = z.object({
  orgId: z.string().optional(),
  title: z.string().trim().min(1, "Title is required").max(300),
  type: z.enum(["board", "annual", "special", "committee"]),
  status: z.enum(["scheduled", "in_progress", "completed", "canceled"]),
  meeting_date: z.string().trim().max(40).nullable(),
  location: text,
  virtual_url: text,
  agenda: text,
  minutes: text,
  recording_url: text,
  is_published: z.boolean(),
  target_audience: z.enum(["all", "owners", "tenants", "board_members"]),
});

export type MeetingBody = z.infer<typeof meetingBody>;

/** The row a write stores: every field the body names, blanks as null. */
export function meetingRow(body: MeetingBody) {
  const { orgId: _orgId, ...rest } = body;
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" || v === undefined ? null : v]));
}

/** The meeting `id` if it is `orgId`'s, else 404. */
export async function requireOrgMeeting(orgId: string, id: string): Promise<{ id: string }> {
  const rows = (await getTypedDirectus().request(
    readItems("hoa_meetings" as any, { filter: { id: { _eq: id } }, fields: ["id", "organization"], limit: 1 } as any)
  )) as any[];
  const row = rows?.[0];
  if (!row || idOf(row.organization) !== orgId) throw createError({ statusCode: 404, message: "Meeting not found" });
  return { id: String(row.id) };
}

/** Parse a body with zod, 400 with the first message. */
export function parseMeetingBody(raw: unknown): MeetingBody {
  const parsed = meetingBody.safeParse(raw);
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the meeting." });
  return parsed.data;
}

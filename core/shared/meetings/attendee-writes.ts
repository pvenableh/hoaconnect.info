/**
 * Adding attendees to a meeting: the body POST /api/org/meetings/[id]/attendees
 * takes, and the checks it runs once the rows are loaded.
 *
 * Directus cannot check this write itself: a validation on `meeting` refuses
 * the plain id the page sends and passes an object holding only the id, which
 * Directus then links without looking at the meeting
 * (scripts/lib/admin-scope-perms.ts). So the HOA Admin policy has no create
 * on hoa_meeting_attendees, and the route checks that the meeting, each person
 * and each board term are the community's.
 *
 * Pure: no Directus.
 */
import { z } from "zod";

export const ATTENDANCE = ["present", "absent", "excused", "proxy"] as const;

const id = z.string().uuid("That isn't a valid id.");

export const attendeeInput = z
  .object({
    hoa_member: id,
    board_term: id.nullable().optional(),
    role_at_meeting: z.string().trim().max(120).nullable().optional(),
    is_board_member: z.boolean().optional(),
    attendance: z.enum(ATTENDANCE).nullable().optional(),
  })
  .strict();

export const addAttendeesBody = z
  .object({ attendees: z.array(attendeeInput).min(1, "Add at least one person.").max(500) })
  .strict();

export type AttendeeInput = z.infer<typeof attendeeInput>;

export interface AttendeeRow {
  meeting: string;
  hoa_member: string;
  board_term: string | null;
  role_at_meeting: string | null;
  is_board_member: boolean;
  attendance: (typeof ATTENDANCE)[number];
}

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

/**
 * The rows to create, or why not. `members` and `terms` are whatever the
 * route found for the ids named; a person outside the community, or a term
 * that is not that person's, refuses the whole request. People already
 * attending, and repeats in the body, are skipped.
 */
export function planAttendees(input: {
  meetingId: string;
  orgId: string;
  attendees: readonly AttendeeInput[];
  members: readonly { id: string; organization?: unknown }[];
  terms: readonly { id: string; hoa_member?: unknown }[];
  /** `hoa_member` of the meeting's current attendees. */
  attending: readonly unknown[];
}): { ok: true; rows: AttendeeRow[]; skipped: string[] } | { ok: false; status: 400; error: string } {
  const inOrg = new Set(input.members.filter((m) => asId(m.organization) === input.orgId).map((m) => m.id));
  const termOf = new Map(input.terms.map((t) => [t.id, asId(t.hoa_member)]));
  const seen = new Set(input.attending.map(asId).filter((v): v is string => !!v));
  const rows: AttendeeRow[] = [];
  const skipped: string[] = [];

  for (const a of input.attendees) {
    if (!inOrg.has(a.hoa_member)) return { ok: false, status: 400, error: "That person isn't a member of this community." };
    if (a.board_term && termOf.get(a.board_term) !== a.hoa_member) {
      return { ok: false, status: 400, error: "That board term isn't this person's." };
    }
    if (seen.has(a.hoa_member)) {
      skipped.push(a.hoa_member);
      continue;
    }
    seen.add(a.hoa_member);
    rows.push({
      meeting: input.meetingId,
      hoa_member: a.hoa_member,
      board_term: a.board_term ?? null,
      role_at_meeting: a.role_at_meeting ?? null,
      is_board_member: a.is_board_member ?? false,
      attendance: a.attendance ?? "present",
    });
  }
  return { ok: true, rows, skipped };
}

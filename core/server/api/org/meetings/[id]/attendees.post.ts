/**
 * POST /api/org/meetings/[id]/attendees — add people to a meeting's
 * attendance. Admin of the meeting's community only, as the meetings page is.
 *
 * Body: { attendees: [{ hoa_member, board_term?, role_at_meeting?,
 * is_board_member?, attendance? }] }. Each person must be a member of the
 * meeting's community and each board term that person's; anyone already
 * attending is skipped. Written with the app's token: the HOA Admin policy has
 * no create on hoa_meeting_attendees, because Directus cannot check the
 * meeting a new row names (core/shared/meetings/attendee-writes.ts).
 * Removing an attendee stays a Directus delete, which checks the row.
 */
import { createItems, readItem, readItems } from "@directus/sdk";
import { addAttendeesBody, planAttendees } from "#core/shared/meetings/attendee-writes";

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const meetingId = getRouterParam(event, "id");
  if (!meetingId) throw createError({ statusCode: 400, message: "id is required" });

  const parsed = addAttendeesBody.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the attendees." });
  const { attendees } = parsed.data;

  const directus = getTypedDirectus();
  let meeting: { id: string; organization?: unknown } | null = null;
  try {
    meeting = (await directus.request(readItem("hoa_meetings" as never, meetingId, { fields: ["id", "organization"] } as never))) as unknown as { id: string; organization?: unknown };
  } catch {
    meeting = null;
  }
  const orgId = asId(meeting?.organization);
  if (!meeting || !orgId) throw createError({ statusCode: 404, message: "Meeting not found" });

  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) throw createError({ statusCode: 403, message: "Only an admin of this community can record attendance." });

  const memberIds = [...new Set(attendees.map((a) => a.hoa_member))];
  const termIds = [...new Set(attendees.map((a) => a.board_term).filter((t): t is string => !!t))];
  const [members, terms, attending] = await Promise.all([
    directus.request(
      readItems("hoa_members" as never, { filter: { id: { _in: memberIds } }, fields: ["id", "organization"], limit: -1 } as never)
    ) as Promise<{ id: string; organization?: unknown }[]>,
    termIds.length
      ? (directus.request(
          readItems("hoa_board_members" as never, { filter: { id: { _in: termIds } }, fields: ["id", "hoa_member"], limit: -1 } as never)
        ) as Promise<{ id: string; hoa_member?: unknown }[]>)
      : Promise.resolve([]),
    directus.request(
      readItems("hoa_meeting_attendees" as never, { filter: { meeting: { _eq: meetingId } }, fields: ["hoa_member"], limit: -1 } as never)
    ) as Promise<{ hoa_member?: unknown }[]>,
  ]);

  const plan = planAttendees({
    meetingId,
    orgId,
    attendees,
    members: members ?? [],
    terms: terms ?? [],
    attending: (attending ?? []).map((a) => a.hoa_member),
  });
  if (plan.ok === false) throw createError({ statusCode: plan.status, message: plan.error });

  const created = plan.rows.length
    ? ((await directus.request(createItems("hoa_meeting_attendees" as never, plan.rows as never))) as unknown as { id: string }[])
    : [];
  return { created: created.map((r) => r.id), skipped: plan.skipped };
});

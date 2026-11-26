/**
 * GET /api/org/meetings/[id]/rsvp?orgId= — the caller's RSVP to one meeting and
 * the counts so far. Anyone the community lets in (an admin with no membership
 * row gets the counts and no `mine`); rows are read with
 * the app token (no role reads hoa_meeting_rsvps directly).
 */
import { readItem, readItems } from "@directus/sdk";
import { rsvpCounts, rsvpOpen } from "#core/shared/meetings/rsvp";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const meetingId = String(getRouterParam(event, "id") || "");
  const orgId = String(getQuery(event).orgId || "");
  if (!meetingId || !orgId) throw createError({ statusCode: 400, statusMessage: "id and orgId are required" });

  const { context, allowed } = await getRoleContext(event, orgId);
  // Anyone the community lets in may read the counts; `mine` needs a membership.
  if (!allowed) throw createError({ statusCode: 403, statusMessage: "Not a member of this community" });

  const directus = getTypedDirectus();
  const readMeeting = async (): Promise<any> => {
    try {
      return await directus.request(readItem("hoa_meetings" as never, meetingId, { fields: ["id", "organization", "status", "is_published", "meeting_date"] } as never));
    } catch {
      return null;
    }
  };
  const readRsvps = async (): Promise<any[]> =>
    (await directus.request(readItems("hoa_meeting_rsvps" as never, { filter: { organization: { _eq: orgId }, meeting: { _eq: meetingId } }, fields: ["member", "response"], limit: -1 } as never))) as any[];
  const [meeting, rows] = await Promise.all([readMeeting(), readRsvps()]);
  const meetingOrg = typeof meeting?.organization === "object" ? meeting?.organization?.id : meeting?.organization;
  if (!meeting || meetingOrg !== orgId) throw createError({ statusCode: 404, statusMessage: "Meeting not found" });

  const mine = context.membershipId
    ? rows.find((r) => (typeof r.member === "object" ? r.member?.id : r.member) === context.membershipId)?.response ?? null
    : null;
  return { mine, counts: rsvpCounts(rows), open: rsvpOpen(meeting, Date.now()) };
});

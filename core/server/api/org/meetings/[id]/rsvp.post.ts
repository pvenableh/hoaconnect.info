/**
 * POST /api/org/meetings/[id]/rsvp  { orgId, response: going | maybe | not_going }
 *
 * The caller answers for themselves, as often as they like until the meeting
 * starts. The row is written with the app token so the route sets the member,
 * the organization and `rsvp_key` (unique: one RSVP per member per meeting).
 */
import { createItem, readItem, readItems, updateItem } from "@directus/sdk";
import { isRsvpResponse, rsvpCounts, rsvpKey, rsvpOpen } from "#core/shared/meetings/rsvp";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const meetingId = String(getRouterParam(event, "id") || "");
  const body = await readBody(event).catch(() => null);
  const orgId = String(body?.orgId || "");
  const response = body?.response;
  if (!meetingId || !orgId) throw createError({ statusCode: 400, statusMessage: "id and orgId are required" });
  if (!isRsvpResponse(response)) throw createError({ statusCode: 400, statusMessage: "response is going, maybe or not_going" });

  const { context, allowed } = await getRoleContext(event, orgId);
  if (!allowed || !context.membershipId) throw createError({ statusCode: 403, statusMessage: "Not a member of this community" });
  const memberId = context.membershipId;

  const directus = getTypedDirectus();
  const meeting = (await directus
    .request(readItem("hoa_meetings" as never, meetingId, { fields: ["id", "organization", "status", "is_published", "meeting_date"] } as never))
    .catch(() => null)) as any;
  const meetingOrg = typeof meeting?.organization === "object" ? meeting?.organization?.id : meeting?.organization;
  if (!meeting || meetingOrg !== orgId) throw createError({ statusCode: 404, statusMessage: "Meeting not found" });
  if (!rsvpOpen(meeting, Date.now())) throw createError({ statusCode: 409, statusMessage: "This meeting is no longer taking RSVPs." });

  const key = rsvpKey(meetingId, memberId);
  const existing = ((await directus.request(readItems("hoa_meeting_rsvps" as never, { filter: { rsvp_key: { _eq: key } }, fields: ["id"], limit: 1 } as never))) as any[])[0];
  if (existing) {
    await directus.request(updateItem("hoa_meeting_rsvps" as never, existing.id, { response } as never));
  } else {
    try {
      await directus.request(createItem("hoa_meeting_rsvps" as never, { organization: orgId, meeting: meetingId, member: memberId, response, rsvp_key: key } as never));
    } catch (e: any) {
      // A second tap raced the first: answer with the row that won, then set it.
      if (e?.errors?.[0]?.extensions?.code !== "RECORD_NOT_UNIQUE") throw e;
      const won = ((await directus.request(readItems("hoa_meeting_rsvps" as never, { filter: { rsvp_key: { _eq: key } }, fields: ["id"], limit: 1 } as never))) as any[])[0];
      if (won) await directus.request(updateItem("hoa_meeting_rsvps" as never, won.id, { response } as never));
    }
  }
  const rows = (await directus.request(readItems("hoa_meeting_rsvps" as never, { filter: { organization: { _eq: orgId }, meeting: { _eq: meetingId } }, fields: ["response"], limit: -1 } as never))) as any[];
  return { mine: response, counts: rsvpCounts(rows), open: true };
});

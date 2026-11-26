/**
 * DELETE /api/org/meetings/:id/attendees/:attendeeId?orgId= — take someone off
 * a meeting's attendance. Admin, the `meetings` grant, or a helper or
 * committee holding it; 404 for a meeting of another community or an
 * attendee row of another meeting.
 */
import { deleteItem, readItems } from "@directus/sdk";
import { requireOrgId } from "#core/server/utils/area-reads";
import { requireMeetingsWork, requireOrgMeeting } from "#core/server/utils/meeting-access";

const idOf = (v: any): string | null => (v == null ? null : typeof v === "string" ? v : (v.id ?? null));

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = requireOrgId(getQuery(event).orgId);
  const id = String(getRouterParam(event, "id") ?? "").trim();
  const attendeeId = String(getRouterParam(event, "attendeeId") ?? "").trim();
  if (!id || !attendeeId) throw createError({ statusCode: 400, message: "id and attendeeId are required" });
  await requireMeetingsWork(event, orgId);
  await requireOrgMeeting(orgId, id);
  const directus = getTypedDirectus();
  const rows = (await directus.request(
    readItems("hoa_meeting_attendees" as any, { filter: { id: { _eq: attendeeId } }, fields: ["id", "meeting"], limit: 1 } as any)
  )) as any[];
  if (!rows?.[0] || idOf(rows[0].meeting) !== id) throw createError({ statusCode: 404, message: "Attendee not found" });
  await directus.request(deleteItem("hoa_meeting_attendees" as any, attendeeId));
  return { deleted: attendeeId };
});

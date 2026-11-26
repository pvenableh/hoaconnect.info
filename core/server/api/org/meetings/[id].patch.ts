/**
 * PATCH /api/org/meetings/:id — { orgId, …the meeting's fields }: edit a
 * meeting. Admin, the `meetings` grant, or a helper or committee holding it;
 * 404 for a meeting of another community. The organization never changes.
 */
import { updateItem } from "@directus/sdk";
import { requireOrgId } from "#core/server/utils/area-reads";
import { meetingRow, parseMeetingBody, requireMeetingsWork, requireOrgMeeting } from "#core/server/utils/meeting-access";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const raw = await readBody(event).catch(() => null);
  const orgId = requireOrgId(raw?.orgId);
  const id = String(getRouterParam(event, "id") ?? "").trim();
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  await requireMeetingsWork(event, orgId);
  const body = parseMeetingBody(raw);
  await requireOrgMeeting(orgId, id);
  await getTypedDirectus().request(updateItem("hoa_meetings" as any, id, meetingRow(body) as any));
  return { meeting: { id } };
});

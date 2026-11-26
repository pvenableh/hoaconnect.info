/**
 * POST /api/org/meetings — { orgId, title, type, status, meeting_date, …,
 * is_published, target_audience }: post a meeting in the community. Admin,
 * the `meetings` grant, or a helper or committee holding it. The page
 * announces a published meeting through /api/org/notify-event, as before.
 */
import { requireOrgId } from "#core/server/utils/area-reads";
import { meetingRow, parseMeetingBody, requireMeetingsWork } from "#core/server/utils/meeting-access";
import { createAsCaller } from "#core/server/utils/create-as";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const raw = await readBody(event).catch(() => null);
  const orgId = requireOrgId(raw?.orgId);
  await requireMeetingsWork(event, orgId);
  const body = parseMeetingBody(raw);
  const created: any = await createAsCaller(event, "hoa_meetings", { ...meetingRow(body), organization: orgId });
  return { meeting: { id: String(created?.id) } };
});

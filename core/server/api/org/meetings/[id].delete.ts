/**
 * DELETE /api/org/meetings/:id?orgId= — delete a meeting. Admin, the
 * `meetings` grant, or a helper or committee holding it; 404 for a meeting of
 * another community.
 */
import { deleteItem } from "@directus/sdk";
import { requireOrgId } from "#core/server/utils/area-reads";
import { requireMeetingsWork, requireOrgMeeting } from "#core/server/utils/meeting-access";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = requireOrgId(getQuery(event).orgId);
  const id = String(getRouterParam(event, "id") ?? "").trim();
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  await requireMeetingsWork(event, orgId);
  await requireOrgMeeting(orgId, id);
  await getTypedDirectus().request(deleteItem("hoa_meetings" as any, id));
  return { deleted: id };
});

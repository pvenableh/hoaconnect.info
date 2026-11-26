/**
 * GET /api/org/inquiries/:id?orgId= — one request and its linked discussion
 * channel, for /manage/inquiries/:id (docs/spec-delegation.md). Admin, the
 * `inquiries` grant, or a helper or committee holding it; 404 for a request
 * of another community.
 */
import { requireOrgId } from "#core/server/utils/area-reads";
import { linkedChannelOf, readAreaRequest } from "#core/server/utils/area-requests";

export default defineEventHandler(async (event) => {
  const orgId = requireOrgId(getQuery(event).orgId);
  const id = String(getRouterParam(event, "id") ?? "").trim();
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const { request } = await readAreaRequest(event, orgId, id);
  return { request, channel: await linkedChannelOf(orgId, id) };
});

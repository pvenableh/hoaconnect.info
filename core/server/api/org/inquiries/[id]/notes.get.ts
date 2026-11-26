/**
 * GET /api/org/inquiries/:id/notes?orgId= — a request's internal notes, for the
 * thread on /manage/inquiries/:id (docs/spec-delegation.md). A helper is a
 * plain HOA Member in Directus, whose read of hoa_comments leaves internal
 * notes out; this reads them with the app's token behind the same gate as the
 * request (readAreaRequest), in one batch with it. 404 for a request of another
 * community or outside the caller's scope.
 */
import { requireOrgId } from "#core/server/utils/area-reads";
import { internalNotesSpec, readAreaRequest } from "#core/server/utils/area-requests";

export default defineEventHandler(async (event) => {
  const orgId = requireOrgId(getQuery(event).orgId);
  const id = String(getRouterParam(event, "id") ?? "").trim();
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const { rows } = await readAreaRequest(event, orgId, id, { notes: internalNotesSpec(orgId, id) });
  return { notes: rows.notes ?? [] };
});

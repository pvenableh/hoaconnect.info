// DELETE /api/governing/documents/:id/sources/:sourceId — remove an original
// document and its file. Managers only. Writes an audit row. Never touches
// provision text.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { deleteGoverningSource } from "#core/server/utils/governing-sources";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  return deleteGoverningSource(
    event,
    orgId,
    String(getRouterParam(event, "id") ?? ""),
    String(getRouterParam(event, "sourceId") ?? "")
  );
});

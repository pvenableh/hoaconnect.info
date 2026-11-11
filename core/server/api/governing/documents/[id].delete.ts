// DELETE /api/governing/documents/:id — delete a draft document with its
// provisions, originals and page images. Managers only. A published document
// is refused (409). Writes an audit row.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { deleteGoverningDraft } from "#core/server/utils/governing-review";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const id = String(getRouterParam(event, "id") ?? "");
  return deleteGoverningDraft(event, orgId, id);
});

// GET /api/governing/sources/:id/pages — the pages of an original with the
// text extracted from each. Managers only: that text is an unreviewed draft.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { listSourcePages } from "#core/server/utils/governing-pages";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  return listSourcePages(orgId, String(getRouterParam(event, "id") ?? ""));
});

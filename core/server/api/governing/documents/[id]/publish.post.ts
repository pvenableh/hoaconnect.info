// POST /api/governing/documents/:id/publish — publish a draft. Managers only.
// Refused (409) until every provision is reviewed and none contains
// [illegible]. Writes an audit row.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { publishGoverningDocument } from "#core/server/utils/governing-review";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const id = String(getRouterParam(event, "id") ?? "");
  return publishGoverningDocument(event, orgId, id);
});

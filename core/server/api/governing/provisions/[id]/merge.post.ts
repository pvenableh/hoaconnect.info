// POST /api/governing/provisions/:id/merge — join a draft provision with the
// one after it. Managers only. The result is the exact concatenation of the
// two texts. Writes an audit row with before and after.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { mergeGoverningProvision } from "#core/server/utils/governing-review";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const id = String(getRouterParam(event, "id") ?? "");
  return mergeGoverningProvision(event, orgId, id);
});

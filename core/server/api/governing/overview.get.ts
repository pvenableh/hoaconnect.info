// GET /api/governing/overview — counts by relationship and the counsel_review
// flags as an open-questions list (spec §6). Members' counts cover confirmed
// flags only.
import { requireGoverningAccess } from "#core/server/utils/governing-access";
import { governingOverview } from "#core/server/utils/governing-data";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  const { canManage } = await requireGoverningAccess(event, orgId);
  return governingOverview(orgId, canManage);
});

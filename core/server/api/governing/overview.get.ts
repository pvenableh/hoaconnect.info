// GET /api/governing/overview — counts by relationship and the counsel_review
// flags as an open-questions list (spec §6). Members' counts cover confirmed
// flags only. Managers also get the statute references not checked within
// `staleAfterDays` (default 365).
import { STALE_AFTER_DAYS } from "#core/shared/governing/flags";
import { requireGoverningAccess } from "#core/server/utils/governing-access";
import { governingOverview } from "#core/server/utils/governing-data";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  const { canManage } = await requireGoverningAccess(event, orgId);
  const asked = Number(getQuery(event).staleAfterDays);
  const staleAfterDays = Number.isInteger(asked) && asked >= 1 && asked <= 3650 ? asked : STALE_AFTER_DAYS;
  return governingOverview(orgId, canManage, staleAfterDays);
});

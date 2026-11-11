// GET /api/governing/documents/:id/review — what the review screen shows: the
// document's provisions with their page, each page's image and draft text, and
// what still blocks publishing. Managers only.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { getGoverningReview } from "#core/server/utils/governing-review";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const id = String(getRouterParam(event, "id") ?? "");
  return getGoverningReview(orgId, id);
});

// POST /api/governing/provisions/:id/review-state — mark a provision reviewed
// or verified, or reopen it. Managers only. Body: { state }. Refused (409)
// while the text still contains [illegible]. Writes an audit row.
import { isReviewState } from "#core/shared/governing/review";
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { setGoverningReviewState } from "#core/server/utils/governing-review";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const id = String(getRouterParam(event, "id") ?? "");
  const body = ((await readBody(event)) ?? {}) as { state?: unknown };
  if (!isReviewState(body.state)) throw createError({ statusCode: 400, message: "state must be ocr_draft, reviewed or verified" });
  return setGoverningReviewState(event, orgId, id, body.state);
});

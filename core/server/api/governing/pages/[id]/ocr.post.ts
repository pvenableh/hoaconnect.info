// POST /api/governing/pages/:id/ocr — read a scanned page's image and store
// what it says as the page's draft text. Managers only. Body: `{ force? }` to
// read again a page that already has text.
//
// One page per call, so each call is short. Charged to the community's AI
// wallet; 402 when it is empty. The text is a draft until reviewed.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { ocrSourcePage } from "#core/server/utils/governing-pages";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);

  const body = await readBody(event).catch(() => null);
  return ocrSourcePage(event, orgId, String(getRouterParam(event, "id") ?? ""), { force: body?.force === true });
});

// POST /api/governing/documents/:id/propose — cut the text of the document's
// pages into draft provisions (`ocr_draft`). Managers only. Body: `{ source? }`
// to use one original only.
//
// Refused (409) when the document already has a provision: this never
// replaces or edits existing text. Writes one audit row.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { proposeGoverningProvisions } from "#core/server/utils/governing-propose";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);

  const body = await readBody(event).catch(() => null);
  const source = typeof body?.source === "string" && body.source ? body.source : null;
  return proposeGoverningProvisions(event, orgId, String(getRouterParam(event, "id") ?? ""), source);
});

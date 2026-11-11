// POST /api/governing/documents/:id/suggest-flags — ask the model to propose
// statute flags for a published document, from the curated library only.
// Managers only. Uses the community's AI credits. Suggestions are saved as
// `suggested`, which members never see. Writes one audit row.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { suggestGoverningFlags } from "#core/server/utils/governing-suggest";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  return suggestGoverningFlags(event, orgId, String(getRouterParam(event, "id") ?? ""));
});

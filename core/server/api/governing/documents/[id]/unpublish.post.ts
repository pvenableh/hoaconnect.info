// POST /api/governing/documents/:id/unpublish — take a published document back
// to draft, so members stop seeing it. Managers only. Body: { reason }
// (required). Nothing is deleted. Writes an audit row.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { unpublishGoverningDocument } from "#core/server/utils/governing-review";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const id = String(getRouterParam(event, "id") ?? "");
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 2000) : null;
  return unpublishGoverningDocument(event, orgId, id, reason);
});

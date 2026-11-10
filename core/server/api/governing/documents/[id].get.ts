// GET /api/governing/documents/:id — one document and its provisions in reading
// order, text verbatim. 404 for a document the caller may not see, so a member
// cannot tell a draft from nothing.
import { requireGoverningAccess } from "#core/server/utils/governing-access";
import { getGoverningDocument } from "#core/server/utils/governing-data";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  const { canManage } = await requireGoverningAccess(event, orgId);
  const found = await getGoverningDocument(orgId, String(getRouterParam(event, "id") ?? ""), canManage);
  if (!found) throw createError({ statusCode: 404, message: "Document not found" });
  return { ...found, can_manage: canManage };
});

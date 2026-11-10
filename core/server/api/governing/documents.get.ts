// GET /api/governing/documents — the organization's governing documents, in order.
// Members get published documents; managers also get drafts (governing-access.ts).
import { requireGoverningAccess } from "#core/server/utils/governing-access";
import { listGoverningDocuments } from "#core/server/utils/governing-data";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  const { canManage } = await requireGoverningAccess(event, orgId);
  return { documents: await listGoverningDocuments(orgId, canManage), can_manage: canManage };
});

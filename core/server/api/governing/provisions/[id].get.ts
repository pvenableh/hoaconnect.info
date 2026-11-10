// GET /api/governing/provisions/:id — one provision: verbatim text, citation,
// book and page, its document, the amendment chain and its statute flags.
// Members get confirmed flags only. 404 for a provision the caller may not see.
import { requireGoverningAccess } from "#core/server/utils/governing-access";
import { getGoverningProvision } from "#core/server/utils/governing-data";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  const { canManage } = await requireGoverningAccess(event, orgId);
  const found = await getGoverningProvision(orgId, String(getRouterParam(event, "id") ?? ""), canManage);
  if (!found) throw createError({ statusCode: 404, message: "Provision not found" });
  return { ...found, can_manage: canManage };
});

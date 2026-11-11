// POST /api/governing/documents/:id/reorder — put a draft's provisions in a
// new order. Managers only. Body: { ids } listing every provision once.
// Changes `sort` only. Writes an audit row with the order before and after.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { reorderGoverningProvisions } from "#core/server/utils/governing-review";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const id = String(getRouterParam(event, "id") ?? "");
  const body = ((await readBody(event)) ?? {}) as { ids?: unknown };
  if (!Array.isArray(body.ids) || !body.ids.every((v) => typeof v === "string")) {
    throw createError({ statusCode: 400, message: "ids must be a list of provision ids" });
  }
  return reorderGoverningProvisions(event, orgId, id, body.ids as string[]);
});

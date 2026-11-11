// POST /api/governing/provisions/:id/split — cut a draft provision in two at
// a character offset. Managers only. Body: { at }. The two pieces joined are
// the original text exactly. Writes an audit row with before and after.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { splitGoverningProvision } from "#core/server/utils/governing-review";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const id = String(getRouterParam(event, "id") ?? "");
  const body = ((await readBody(event)) ?? {}) as { at?: unknown };
  if (typeof body.at !== "number") throw createError({ statusCode: 400, message: "at must be a number" });
  return splitGoverningProvision(event, orgId, id, body.at);
});

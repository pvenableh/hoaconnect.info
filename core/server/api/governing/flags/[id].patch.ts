// PATCH /api/governing/flags/:id — edit a statute flag that is still a
// suggestion. Managers only. Body: { relationship?, severity?, document_rule?,
// statute_rule?, note? }. Refused (409) once the flag is confirmed or
// dismissed. Writes an audit row with the fields before and after. Never
// touches a provision, the flag's citation or its quoted words.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { editGoverningFlag } from "#core/server/utils/governing-flags";
import { requireOrgId } from "#core/server/utils/org-context";
import { FLAG_TEXT_FIELDS, type FlagEdit } from "#core/shared/governing/flags";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  const edit: Record<string, unknown> = {};
  for (const field of ["relationship", "severity", ...FLAG_TEXT_FIELDS]) {
    if (body[field] !== undefined) edit[field] = body[field];
  }
  for (const field of ["relationship", "severity"]) {
    if (edit[field] !== undefined && typeof edit[field] !== "string") throw createError({ statusCode: 400, message: `${field} must be text` });
  }
  return editGoverningFlag(event, orgId, String(getRouterParam(event, "id") ?? ""), edit as FlagEdit);
});

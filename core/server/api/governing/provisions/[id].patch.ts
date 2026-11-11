// PATCH /api/governing/provisions/:id — the audited edit of a provision.
// Managers only. Body: { text?, citation?, heading?, original_label?,
// block_type?, uncertain?, reason? }. `text` is stored exactly as sent. A
// reason is required when the document is published. Writes an audit row with
// the fields before and after.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { editGoverningProvision } from "#core/server/utils/governing-review";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const id = String(getRouterParam(event, "id") ?? "");
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  const text = (field: string) => {
    const value = body[field];
    if (value === undefined) return undefined;
    if (value !== null && typeof value !== "string") throw createError({ statusCode: 400, message: `${field} must be text` });
    return value as string | null;
  };
  if (body.text !== undefined && typeof body.text !== "string") throw createError({ statusCode: 400, message: "text must be text" });
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 2000) : null;
  return editGoverningProvision(
    event,
    orgId,
    id,
    {
      text: body.text as string | undefined,
      citation: text("citation"),
      heading: text("heading"),
      original_label: text("original_label"),
      block_type: typeof body.block_type === "string" ? body.block_type : undefined,
      uncertain: typeof body.uncertain === "boolean" ? body.uncertain : undefined,
    },
    reason
  );
});

// PATCH /api/governing/documents/:id — the audited edit of a document's own
// details. Managers only. Body: { title?, kind?, amends?, citation_prefix?,
// executed_on?, recorded_on?, or_book?, or_page_start?, or_page_end?,
// clerk_file_no?, county?, reason? }. `amends` is another document's id, or
// null for none. A reason is required when the document
// is published. Never touches a provision. Writes an audit row with the fields
// before and after.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { editGoverningDocument } from "#core/server/utils/governing-review";
import { requireOrgId } from "#core/server/utils/org-context";
import { DOCUMENT_DATE_FIELDS, DOCUMENT_NUMBER_FIELDS, DOCUMENT_TEXT_FIELDS, type DocumentEdit } from "#core/shared/governing/review";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);
  const id = String(getRouterParam(event, "id") ?? "");
  const body = ((await readBody(event)) ?? {}) as Record<string, unknown>;
  const edit: Record<string, unknown> = {};
  for (const field of ["kind", "amends", ...DOCUMENT_TEXT_FIELDS, ...DOCUMENT_DATE_FIELDS, ...DOCUMENT_NUMBER_FIELDS]) {
    if (body[field] !== undefined) edit[field] = body[field];
  }
  if (edit.kind !== undefined && typeof edit.kind !== "string") throw createError({ statusCode: 400, message: "kind must be text" });
  if (edit.amends !== undefined && edit.amends !== null && typeof edit.amends !== "string") {
    throw createError({ statusCode: 400, message: "amends must be a document" });
  }
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 2000) : null;
  return editGoverningDocument(event, orgId, id, edit as DocumentEdit, reason);
});

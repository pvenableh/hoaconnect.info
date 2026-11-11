// POST /api/governing/documents — a new draft document from an uploaded PDF or
// image. Managers only. Body: `{ title, kind, is_recorded_copy?, upload: { id,
// parts, sha256, filename, type } }`, the upload having been sent through
// POST /api/governing/uploads/parts.
//
// Creates the document as a draft (members do not see it), stores the file
// unmodified as its original, and writes the audit rows. Creates no provision.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { createDraftFromUpload, readUploadRef } from "#core/server/utils/governing-upload";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);

  const body = await readBody(event);
  return createDraftFromUpload(event, orgId, {
    title: String(body?.title ?? ""),
    kind: String(body?.kind ?? "other"),
    upload: readUploadRef(body),
    is_recorded_copy: body?.is_recorded_copy === true,
  });
});

// POST /api/governing/documents/:id/sources/upload — attach an original that
// was sent in parts (POST /api/governing/uploads/parts), for files over the
// 4.5 MB a single request may carry. Managers only. Body: `{ upload: { id,
// parts, sha256, filename, type }, is_recorded_copy?, is_authoritative?, notes? }`.
//
// The result is the same as the multipart attach route: the file as it was, a
// source row and an audit row. Never touches provision text.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { attachUploadedSource, readUploadRef } from "#core/server/utils/governing-upload";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);

  const body = await readBody(event);
  return attachUploadedSource(event, orgId, String(getRouterParam(event, "id") ?? ""), readUploadRef(body), {
    is_recorded_copy: body?.is_recorded_copy === true,
    is_authoritative: body?.is_authoritative === true,
    notes: typeof body?.notes === "string" && body.notes ? body.notes : null,
  });
});

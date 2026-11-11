// POST /api/governing/uploads/parts (multipart/form-data) — one part of a file
// too large for a single request. Managers only. Fields: `uploadId` (a uuid the
// browser made), `index` (0-based), `file` (the part's bytes).
//
// The parts are joined, checked and deleted by the call that uses the upload:
// POST /api/governing/documents or POST /api/governing/documents/:id/sources/upload.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { storeUploadPart } from "#core/server/utils/governing-upload";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);

  const form = (await readMultipartFormData(event)) ?? [];
  const file = form.find((part) => part.name === "file");
  if (!file?.data?.length) throw createError({ statusCode: 400, message: "That part is empty" });
  const field = (name: string) => form.find((part) => part.name === name)?.data?.toString() ?? "";

  return storeUploadPart(orgId, field("uploadId"), Number(field("index")), new Uint8Array(file.data));
});

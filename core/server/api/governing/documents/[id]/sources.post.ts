// POST /api/governing/documents/:id/sources (multipart/form-data) — attach an
// original document (the recorded scan, or another copy) to a governing
// document. Managers only. Fields: `file` (a PDF or an image), and optionally
// `is_recorded_copy`, `is_authoritative` ("true"), `notes`.
//
// Writes the file, a source row and an audit row. Never touches provision text.
import { requireGoverningManage } from "#core/server/utils/governing-access";
import { attachGoverningSource } from "#core/server/utils/governing-sources";
import { requireOrgId } from "#core/server/utils/org-context";

export default defineEventHandler(async (event) => {
  const orgId = await requireOrgId(event);
  await requireGoverningManage(event, orgId);

  const form = (await readMultipartFormData(event)) ?? [];
  const file = form.find((part) => part.name === "file");
  if (!file?.data?.length) throw createError({ statusCode: 400, message: "Choose a file to attach" });
  const field = (name: string) => form.find((part) => part.name === name)?.data?.toString() ?? "";

  return attachGoverningSource(event, orgId, String(getRouterParam(event, "id") ?? ""), {
    bytes: new Uint8Array(file.data),
    filename: file.filename || "original-document",
    type: file.type || "application/octet-stream",
    is_recorded_copy: field("is_recorded_copy") === "true",
    is_authoritative: field("is_authoritative") === "true",
    notes: field("notes") || null,
  });
});

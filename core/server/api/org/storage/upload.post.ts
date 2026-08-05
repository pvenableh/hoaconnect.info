/**
 * POST /api/org/storage/upload  (multipart/form-data)
 *
 * Upload a file into the org subtree. Fields:
 *   file     - the binary (required)
 *   orgId    - organization id (falls back to session)
 *   folderId - explicit destination folder (must be in the org subtree)
 *   source   - "comment" | "message" | "email" | "image" | "document"
 *              routes the upload into the matching standard subfolder
 *   title    - optional display title
 *
 * Pipeline: optimize the image (email-safe) → enforce the org storage quota
 * against the FINAL (optimized) size → upload as the member (so `uploaded_by`
 * powers the "My uploads" lane) → increment the cached usage counter.
 */

import { uploadFiles } from "@directus/sdk";
import {
  resolveStorageContext,
  assertFolderInOrg,
  UPLOAD_SOURCE_KEYS,
  type UploadSource,
} from "#core/server/utils/org-storage";
import { optimizeImageBuffer } from "#core/server/utils/image-optimize";
import {
  enforceStorageLimit,
  addOrgStorageUsage,
} from "#core/server/utils/storage-enforcement";

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event);
  if (!form) {
    throw createError({ statusCode: 400, statusMessage: "No file data provided" });
  }

  const fields: Record<string, string> = {};
  const filePart = form.find((p) => p.name === "file");
  for (const part of form) {
    if (part.name !== "file" && part.data) fields[part.name!] = part.data.toString();
  }
  if (!filePart) {
    throw createError({ statusCode: 400, statusMessage: "No file found in form data" });
  }

  const ctx = await resolveStorageContext(event, fields.orgId || null);
  const root = ctx.storage.rootId;

  // Resolve destination folder.
  let folderId = fields.folderId || null;
  if (!folderId && fields.source) {
    const key = UPLOAD_SOURCE_KEYS[fields.source as UploadSource];
    if (key) folderId = ctx.storage.map[key] || null;
  }
  if (!folderId) folderId = root;
  await assertFolderInOrg(root, folderId);

  // Optimize (email-safe 'auto'). Best-effort — never blocks the upload.
  const original = Buffer.from(filePart.data);
  const optimized = await optimizeImageBuffer(
    original,
    filePart.type || "application/octet-stream",
    filePart.filename || "upload"
  );

  // Enforce the quota against the size we're actually about to store. Throws 413
  // (per-file cap or `code: 'storage_full'`) BEFORE any bytes are written.
  await enforceStorageLimit(ctx.orgId, optimized.bytes.length);

  // Upload as the member (preserves uploaded_by) via their session token.
  // GOTCHA: metadata fields MUST be appended BEFORE the file part — Directus/
  // busboy silently drops fields that arrive after the file stream, which would
  // orphan the upload outside the org folder.
  const userClient = await getUserDirectus(event);
  const uploadForm = new FormData();
  if (fields.title) uploadForm.append("title", fields.title);
  uploadForm.append("folder", folderId);
  const blob = new Blob([new Uint8Array(optimized.bytes)], {
    type: optimized.type,
  });
  uploadForm.append("file", blob, optimized.filename);

  const result = await userClient.request(uploadFiles(uploadForm));

  // Increment the cached usage counter by the stored size (best-effort).
  await addOrgStorageUsage(ctx.orgId, optimized.bytes.length);

  return result;
});

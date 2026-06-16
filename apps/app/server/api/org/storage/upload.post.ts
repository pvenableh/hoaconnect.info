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
 * Runs the actual upload with the USER client so `uploaded_by` is the member —
 * this is what powers the "My uploads" lane for non-library users.
 */

import { uploadFiles } from "@directus/sdk";
import {
  resolveStorageContext,
  assertFolderInOrg,
  UPLOAD_SOURCE_KEYS,
  type UploadSource,
} from "~~/server/utils/org-storage";

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

  // Upload as the member (preserves uploaded_by) via their session token.
  const userClient = await getUserDirectus(event);
  const uploadForm = new FormData();
  const blob = new Blob([new Uint8Array(filePart.data)], {
    type: filePart.type || "application/octet-stream",
  });
  uploadForm.append("file", blob, filePart.filename || "upload");
  if (fields.title) uploadForm.append("title", fields.title);
  uploadForm.append("folder", folderId);

  const result = await userClient.request(uploadFiles(uploadForm));
  return result;
});

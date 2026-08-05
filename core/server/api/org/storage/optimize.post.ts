/**
 * POST /api/org/storage/optimize  { fileId, format }
 *
 * Optimize a single existing file on demand. Fetches the current bytes, runs the
 * optimizer in the chosen format ('auto' = email-safe JPEG/PNG, or 'webp' =
 * smaller but not email-safe), and — only if it actually shrinks — replaces the
 * file's binary IN PLACE (same file id, so every /assets/<id> link, embed and
 * copied URL keeps working). The org storage counter is adjusted by the delta.
 *
 * Allowed for org admins, or the member who uploaded the file.
 */

import { readFile } from "@directus/sdk";
import {
  resolveStorageContext,
  assertFileInOrg,
} from "#core/server/utils/org-storage";
import {
  isOptimizableImage,
  optimizeImageBuffer,
  type OptimizeFormat,
} from "#core/server/utils/image-optimize";
import { addOrgStorageUsage } from "#core/server/utils/storage-enforcement";

export default defineEventHandler(async (event) => {
  const ctx = await resolveStorageContext(event);
  const body = await readBody(event);
  const fileId = body?.fileId;
  const format: OptimizeFormat = body?.format === "webp" ? "webp" : "auto";
  if (!fileId) {
    throw createError({ statusCode: 400, statusMessage: "fileId is required" });
  }

  const admin = getTypedDirectus();
  const root = ctx.storage.rootId;

  const file = (await admin.request(
    readFile(fileId, {
      fields: ["id", "folder", "uploaded_by", "type", "filesize", "filename_download"],
    })
  )) as any;
  await assertFileInOrg(root, file);

  const ownerId =
    file?.uploaded_by == null
      ? null
      : typeof file.uploaded_by === "string"
        ? file.uploaded_by
        : file.uploaded_by.id;
  if (!(ctx.isAdmin || ownerId === ctx.userId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only optimize files you uploaded",
    });
  }
  if (!isOptimizableImage(file.type)) {
    throw createError({ statusCode: 400, statusMessage: "This file type cannot be optimized." });
  }

  const before = Number(file.filesize) || 0;

  const config = useRuntimeConfig();
  const url = config.directus?.url || config.public.directusUrl;
  const token = config.directus?.staticToken;

  // Pull the current bytes with the admin token.
  const assetRes = await fetch(`${url}/assets/${fileId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!assetRes.ok) {
    throw createError({ statusCode: 502, statusMessage: "Could not read the file." });
  }
  const original = Buffer.from(await assetRes.arrayBuffer());

  const result = await optimizeImageBuffer(
    original,
    file.type,
    file.filename_download || "image",
    { format }
  );
  if (!result.optimized) {
    return { optimized: false, before, after: before, type: file.type };
  }

  // Replace the binary in place (PATCH /files/{id} with multipart, same id).
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(result.bytes)], { type: result.type }),
    result.filename
  );
  const patchRes = await fetch(`${url}/files/${fileId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!patchRes.ok) {
    console.error("[storage/optimize] replace failed:", patchRes.status, await patchRes.text());
    throw createError({ statusCode: 502, statusMessage: "Could not save the optimized file." });
  }

  const after = result.bytes.length;
  await addOrgStorageUsage(ctx.orgId, after - before); // negative delta frees space
  return { optimized: true, before, after, type: result.type, format };
});

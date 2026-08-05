/**
 * POST /api/org/storage/optimize-sweep  { offset, limit }  (admin only)
 *
 * Email-safe library optimize — ONE BATCH per call. Walks the org's optimizable
 * images (stable id-order pagination) and re-encodes each to email-safe JPEG/PNG
 * (never WebP — a bulk pass can't know which files land in an email), replacing
 * in place and freeing the reclaimed bytes from the meter.
 *
 * Pagination is by `offset` on an id sort: replacing a file's binary keeps its
 * id (and sort position), so each file is visited exactly once per run without a
 * persisted "optimized" marker. The client calls this repeatedly with the
 * returned `nextOffset`, showing progress, until `done`.
 */

import { readFiles } from "@directus/sdk";
import {
  resolveStorageContext,
  assertAdmin,
  getDescendantFolderIds,
} from "#core/server/utils/org-storage";
import { optimizeImageBuffer } from "#core/server/utils/image-optimize";
import { addOrgStorageUsage } from "#core/server/utils/storage-enforcement";

const OPTIMIZABLE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/avif",
  "image/webp",
];

export default defineEventHandler(async (event) => {
  const ctx = await resolveStorageContext(event);
  assertAdmin(ctx);

  const body = await readBody(event);
  const offset = Math.max(0, Number(body?.offset) || 0);
  const limit = Math.min(Math.max(Number(body?.limit) || 5, 1), 10);

  const admin = getTypedDirectus();
  const config = useRuntimeConfig();
  const url = config.directus?.url || config.public.directusUrl;
  const token = config.directus?.staticToken;

  const subtree = await getDescendantFolderIds(ctx.storage.rootId);

  const batch = (await admin.request(
    readFiles({
      filter: { _and: [{ folder: { _in: subtree } }, { type: { _in: OPTIMIZABLE_TYPES } }] },
      fields: ["id", "type", "filesize", "filename_download"],
      sort: ["id"], // stable ordering so offset paginates every file exactly once
      limit,
      offset,
    })
  )) as any[];

  let reclaimedBytes = 0;
  let processed = 0;

  for (const file of batch || []) {
    processed++;
    const before = Number(file.filesize) || 0;
    try {
      const assetRes = await fetch(`${url}/assets/${file.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!assetRes.ok) continue;
      const original = Buffer.from(await assetRes.arrayBuffer());
      const result = await optimizeImageBuffer(
        original,
        file.type,
        file.filename_download || "image"
      ); // 'auto' = email-safe
      if (!result.optimized) continue;
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(result.bytes)], { type: result.type }),
        result.filename
      );
      const patch = await fetch(`${url}/files/${file.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (patch.ok) reclaimedBytes += before - result.bytes.length;
    } catch (err) {
      console.error("[storage/optimize-sweep] failed for", file.id, (err as Error).message);
    }
  }

  if (reclaimedBytes) await addOrgStorageUsage(ctx.orgId, -reclaimedBytes);

  // A short batch means we've reached the end of the list.
  return { processed, reclaimedBytes, nextOffset: offset + processed, done: processed < limit };
});

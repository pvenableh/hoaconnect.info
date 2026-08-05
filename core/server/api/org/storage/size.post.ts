/**
 * POST /api/org/storage/size  { folderId }
 *
 * On-demand subtree byte size for a folder (inclusive of all descendants).
 * Network-heavy — the UI calls it only on folder expand / explicit request.
 */

import {
  resolveStorageContext,
  assertFolderInOrg,
} from "#core/server/utils/org-storage";
import { sumFolderSubtree } from "#core/server/utils/storage-enforcement";

export default defineEventHandler(async (event) => {
  const ctx = await resolveStorageContext(event);
  const body = await readBody(event);
  const folderId = body?.folderId;
  if (!folderId) {
    throw createError({ statusCode: 400, statusMessage: "folderId is required" });
  }
  await assertFolderInOrg(ctx.storage.rootId, folderId);
  return { bytes: await sumFolderSubtree(folderId) };
});

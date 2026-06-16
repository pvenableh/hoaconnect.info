/**
 * POST /api/org/storage/ensure
 *
 * Idempotently scaffolds the org's root folder + standard subfolder layout and
 * returns the caller's storage context (access tier + the folder-key → id map).
 * The client calls this once on entering the Files area / opening the picker.
 */

import { resolveStorageContext, STORAGE_TREE } from "~~/server/utils/org-storage";

export default defineEventHandler(async (event) => {
  const ctx = await resolveStorageContext(event);

  return {
    orgId: ctx.orgId,
    rootId: ctx.storage.rootId,
    map: ctx.storage.map,
    tree: STORAGE_TREE,
    access: {
      isAdmin: ctx.isAdmin,
      isBoard: ctx.isBoard,
      browseAccess: ctx.browseAccess,
      canBrowseLibrary: ctx.canBrowseLibrary,
      canManage: ctx.isAdmin,
    },
  };
});

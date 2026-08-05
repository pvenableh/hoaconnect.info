/**
 * POST /api/org/storage/folder
 *
 * Admin-only folder mutations, confined to the org subtree.
 *   action: "create" | "rename" | "move" | "delete"
 *
 * Delete takes a `mode`: "keep" (default) reparents any contents up to the
 * deleted folder's parent and drops the empty shell (nothing is orphaned out of
 * the org subtree; storage unchanged); "contents" recursively deletes the folder,
 * its descendants and all their files, and frees the reclaimed bytes. Either way
 * we avoid Directus's default delete, which would null out contained files.
 */

import {
  createFolder,
  updateFolder,
  deleteFolder,
  deleteFolders,
  deleteFiles,
  readFolder,
  readFolders,
  readFiles,
  updateFile,
} from "@directus/sdk";
import {
  resolveStorageContext,
  assertAdmin,
  assertFolderInOrg,
  isWithinOrgRoot,
  invalidateOrgStorage,
} from "#core/server/utils/org-storage";
import { addOrgStorageUsage } from "#core/server/utils/storage-enforcement";

export default defineEventHandler(async (event) => {
  const ctx = await resolveStorageContext(event);
  assertAdmin(ctx);

  const body = await readBody(event);
  const action = body?.action as string;
  const admin = getTypedDirectus();
  const root = ctx.storage.rootId;

  const cleanup = () => invalidateOrgStorage(ctx.orgId);

  switch (action) {
    case "create": {
      const name = String(body?.name || "").trim();
      if (!name) throw createError({ statusCode: 400, statusMessage: "Name is required" });
      const parentId = body?.parentId || root;
      await assertFolderInOrg(root, parentId);
      const created = await admin.request(createFolder({ name, parent: parentId }));
      cleanup();
      return created;
    }

    case "rename": {
      const folderId = body?.folderId;
      const name = String(body?.name || "").trim();
      if (!folderId || !name) {
        throw createError({ statusCode: 400, statusMessage: "Folder and name are required" });
      }
      if (folderId === root) {
        throw createError({ statusCode: 400, statusMessage: "Cannot rename the root folder" });
      }
      await assertFolderInOrg(root, folderId);
      const updated = await admin.request(updateFolder(folderId, { name }));
      cleanup();
      return updated;
    }

    case "move": {
      const folderId = body?.folderId;
      const targetId = body?.parentId || root;
      if (!folderId) throw createError({ statusCode: 400, statusMessage: "Folder is required" });
      if (folderId === root) {
        throw createError({ statusCode: 400, statusMessage: "Cannot move the root folder" });
      }
      if (folderId === targetId) {
        throw createError({ statusCode: 400, statusMessage: "Cannot move a folder into itself" });
      }
      await assertFolderInOrg(root, folderId);
      await assertFolderInOrg(root, targetId);
      // Prevent cycles: target must not be the folder or one of its descendants.
      if (await isWithinOrgRoot(folderId, targetId)) {
        throw createError({
          statusCode: 400,
          statusMessage: "Cannot move a folder into its own subfolder",
        });
      }
      const updated = await admin.request(updateFolder(folderId, { parent: targetId }));
      cleanup();
      return updated;
    }

    case "delete": {
      const folderId = body?.folderId;
      // "keep" (default, non-destructive): reparent contents up one level, then
      // drop the empty shell — storage is unchanged. "contents" (destructive):
      // delete the folder, every descendant folder, and all files within, and
      // free the reclaimed bytes from the org meter.
      const mode: "keep" | "contents" = body?.mode === "contents" ? "contents" : "keep";
      if (!folderId) throw createError({ statusCode: 400, statusMessage: "Folder is required" });
      if (folderId === root) {
        throw createError({ statusCode: 400, statusMessage: "Cannot delete the root folder" });
      }
      await assertFolderInOrg(root, folderId);

      if (mode === "keep") {
        const folder = (await admin.request(
          readFolder(folderId, { fields: ["id", "parent"] })
        )) as any;
        const parentId =
          folder?.parent == null
            ? root
            : typeof folder.parent === "string"
              ? folder.parent
              : folder.parent.id;

        // Reparent contents up one level so nothing leaves the org subtree.
        const [childFolders, childFiles] = await Promise.all([
          admin.request(
            readFolders({ filter: { parent: { _eq: folderId } }, fields: ["id"], limit: -1 })
          ),
          admin.request(
            readFiles({ filter: { folder: { _eq: folderId } }, fields: ["id"], limit: -1 })
          ),
        ]);

        await Promise.all([
          ...(childFolders as any[]).map((f) =>
            admin.request(updateFolder(f.id, { parent: parentId }))
          ),
          ...(childFiles as any[]).map((f) =>
            admin.request(updateFile(f.id, { folder: parentId }))
          ),
        ]);

        await admin.request(deleteFolder(folderId));
        cleanup();
        return {
          mode: "keep",
          deleted: 1,
          reparentedFolders: (childFolders as any[]).length,
          reparentedFiles: (childFiles as any[]).length,
        };
      }

      // mode === "contents": recursive destructive delete.
      // 1. Collect the folder + all descendants (level-order BFS).
      const folderIds: string[] = [folderId];
      let frontier: string[] = [folderId];
      while (frontier.length) {
        const children = (await admin.request(
          readFolders({ filter: { parent: { _in: frontier } }, fields: ["id"], limit: -1 })
        )) as any[];
        const ids = (children || []).map((c) => c.id).filter(Boolean);
        if (!ids.length) break;
        folderIds.push(...ids);
        frontier = ids;
      }

      // 2. Gather every file in those folders (ids + sizes for the meter delta).
      const fileIds: string[] = [];
      let freedBytes = 0;
      for (let i = 0; i < folderIds.length; i += 50) {
        const chunk = folderIds.slice(i, i + 50);
        const files = (await admin.request(
          readFiles({ filter: { folder: { _in: chunk } }, fields: ["id", "filesize"], limit: -1 })
        )) as any[];
        for (const f of files || []) {
          fileIds.push(f.id);
          freedBytes += Number(f.filesize) || 0;
        }
      }

      // 3. Delete files first, then folders deepest-first (reverse BFS order).
      for (let i = 0; i < fileIds.length; i += 100) {
        await admin.request(deleteFiles(fileIds.slice(i, i + 100)));
      }
      const deepestFirst = [...folderIds].reverse();
      for (let i = 0; i < deepestFirst.length; i += 100) {
        await admin.request(deleteFolders(deepestFirst.slice(i, i + 100)));
      }

      // 4. Free the bytes from the org's storage meter.
      if (freedBytes) await addOrgStorageUsage(ctx.orgId, -freedBytes);
      cleanup();
      return {
        mode: "contents",
        deletedFolders: folderIds.length,
        deletedFiles: fileIds.length,
        freedBytes,
      };
    }

    default:
      throw createError({ statusCode: 400, statusMessage: `Unknown action: ${action}` });
  }
});

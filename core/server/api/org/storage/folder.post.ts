/**
 * POST /api/org/storage/folder
 *
 * Admin-only folder mutations, confined to the org subtree.
 *   action: "create" | "rename" | "move" | "delete"
 *
 * Delete reparents any contents up to the deleted folder's parent first, so
 * nothing is ever orphaned out of the org subtree (Directus would otherwise
 * null out child folder/file references on delete).
 */

import {
  createFolder,
  updateFolder,
  deleteFolder,
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
      if (!folderId) throw createError({ statusCode: 400, statusMessage: "Folder is required" });
      if (folderId === root) {
        throw createError({ statusCode: 400, statusMessage: "Cannot delete the root folder" });
      }
      await assertFolderInOrg(root, folderId);

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
      return { deleted: 1, reparentedFolders: (childFolders as any[]).length, reparentedFiles: (childFiles as any[]).length };
    }

    default:
      throw createError({ statusCode: 400, statusMessage: `Unknown action: ${action}` });
  }
});

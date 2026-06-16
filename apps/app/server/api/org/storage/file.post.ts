/**
 * POST /api/org/storage/file
 *
 * File mutations confined to the org subtree.
 *   action: "rename" | "move" | "delete"
 *
 * Admins may act on any file in the org; non-admins only on files they
 * uploaded themselves (uploaded_by === caller).
 */

import { readFile, updateFile, deleteFile } from "@directus/sdk";
import {
  resolveStorageContext,
  assertFileInOrg,
  assertFolderInOrg,
} from "~~/server/utils/org-storage";

export default defineEventHandler(async (event) => {
  const ctx = await resolveStorageContext(event);
  const body = await readBody(event);
  const action = body?.action as string;
  const fileId = body?.fileId;
  if (!fileId) throw createError({ statusCode: 400, statusMessage: "File is required" });

  const admin = getTypedDirectus();
  const root = ctx.storage.rootId;

  const file = (await admin.request(
    readFile(fileId, { fields: ["id", "folder", "uploaded_by"] })
  )) as any;
  await assertFileInOrg(root, file);

  const ownerId =
    file?.uploaded_by == null
      ? null
      : typeof file.uploaded_by === "string"
        ? file.uploaded_by
        : file.uploaded_by.id;
  const canModify = ctx.isAdmin || ownerId === ctx.userId;
  if (!canModify) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only modify files you uploaded",
    });
  }

  switch (action) {
    case "rename": {
      const title = String(body?.title || "").trim();
      if (!title) throw createError({ statusCode: 400, statusMessage: "Title is required" });
      return await admin.request(updateFile(fileId, { title }));
    }

    case "move": {
      const folderId = body?.folderId || root;
      await assertFolderInOrg(root, folderId);
      return await admin.request(updateFile(fileId, { folder: folderId }));
    }

    case "delete": {
      await admin.request(deleteFile(fileId));
      return { deleted: 1 };
    }

    default:
      throw createError({ statusCode: 400, statusMessage: `Unknown action: ${action}` });
  }
});

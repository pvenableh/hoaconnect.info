/**
 * POST /api/org/storage/list
 *
 * Lists storage contents, always scoped to the org subtree and the caller's
 * access tier. Two modes:
 *   - scope: "library" → a folder's subfolders + files (requires library access)
 *   - scope: "mine"    → a flat list of the caller's own uploads across the org
 *
 * Reads run with the admin client; isolation/permission is enforced here.
 */

import {
  readFolder,
  readFolders,
  readFiles,
} from "@directus/sdk";
import {
  resolveStorageContext,
  assertFolderInOrg,
  getDescendantFolderIds,
} from "~~/server/utils/org-storage";

const FILE_FIELDS = [
  "id",
  "title",
  "filename_download",
  "type",
  "filesize",
  "width",
  "height",
  "uploaded_on",
  "uploaded_by",
  "modified_on",
  "folder",
] as const;

export default defineEventHandler(async (event) => {
  const ctx = await resolveStorageContext(event);
  const body = await readBody(event);
  const scope: "library" | "mine" = body?.scope === "mine" ? "mine" : "library";
  const search: string | undefined = body?.search?.trim() || undefined;
  const limit: number = Math.min(Number(body?.limit) || 500, 1000);

  const admin = getTypedDirectus();
  const root = ctx.storage.rootId;

  // ---- "mine": the caller's own uploads anywhere in the org subtree ----
  if (scope === "mine") {
    const folderIds = await getDescendantFolderIds(root);
    const files = (await admin.request(
      readFiles({
        filter: {
          folder: { _in: folderIds },
          uploaded_by: { _eq: ctx.userId },
        },
        fields: FILE_FIELDS,
        sort: ["-uploaded_on"],
        limit,
        ...(search ? { search } : {}),
      })
    )) as any[];
    return { mode: "mine", files };
  }

  // ---- "library": browse a folder (requires library access) ----
  if (!ctx.canBrowseLibrary) {
    throw createError({
      statusCode: 403,
      statusMessage: "You don't have access to browse the organization library",
    });
  }

  const folderId: string = body?.folderId || root;
  await assertFolderInOrg(root, folderId);

  const [folders, files] = await Promise.all([
    admin.request(
      readFolders({
        filter: { parent: { _eq: folderId } },
        fields: ["id", "name", "parent"],
        sort: ["name"],
        limit: -1,
      })
    ),
    admin.request(
      readFiles({
        filter: { folder: { _eq: folderId } },
        fields: FILE_FIELDS,
        sort: ["-uploaded_on"],
        limit,
        ...(search ? { search } : {}),
      })
    ),
  ]);

  // Breadcrumb: from root → current folder.
  const breadcrumb: { id: string; name: string }[] = [];
  let cursor: string | null = folderId;
  for (let i = 0; i < 64 && cursor; i++) {
    const f = (await admin.request(
      readFolder(cursor, { fields: ["id", "name", "parent"] })
    )) as any;
    breadcrumb.unshift({ id: f.id, name: f.name });
    if (f.id === root) break;
    cursor = f?.parent == null ? null : typeof f.parent === "string" ? f.parent : f.parent.id;
  }

  return {
    mode: "folder",
    folderId,
    isRoot: folderId === root,
    breadcrumb,
    folders,
    files,
  };
});

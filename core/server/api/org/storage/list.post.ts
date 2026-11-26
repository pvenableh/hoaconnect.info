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
  resolveStorageContextWithOrg,
  assertFolderInOrg,
  getDescendantFolderIds,
  isWithinOrgRoot,
} from "#core/server/utils/org-storage";
import { NOT_GOVERNING_FILE } from "#core/shared/governing/files";

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

/** The org's root folder name, when the org row's folder is the root the storage layout knows. */
function rootNameFrom(org: Record<string, any> | null, rootId: string): string | undefined {
  const folder = org?.folder;
  return folder && typeof folder === "object" && folder.id === rootId && typeof folder.name === "string" ? folder.name : undefined;
}

/**
 * Breadcrumb from the root to `folderId`, reading each folder up the chain.
 * The root's own name comes from the storage context's org read when known,
 * so a library at its root reads no folder here.
 */
async function breadcrumbFor(folderId: string, rootId: string, rootName: string | undefined) {
  const admin = getTypedDirectus();
  const breadcrumb: { id: string; name: string }[] = [];
  let cursor: string | null = folderId;
  for (let i = 0; i < 64 && cursor; i++) {
    if (cursor === rootId && rootName !== undefined) {
      breadcrumb.unshift({ id: rootId, name: rootName });
      break;
    }
    const f = (await admin.request(
      readFolder(cursor, { fields: ["id", "name", "parent"] })
    )) as any;
    breadcrumb.unshift({ id: f.id, name: f.name });
    if (f.id === rootId) break;
    cursor = f?.parent == null ? null : typeof f.parent === "string" ? f.parent : f.parent.id;
  }
  return breadcrumb;
}

export default defineEventHandler(async (event) => {
  // The root folder's name rides on the context's one request (the breadcrumb's first crumb).
  const { ctx, org } = await resolveStorageContextWithOrg(event, ["folder.id", "folder.name"]);
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
          _and: [{ folder: { _in: folderIds } }, { uploaded_by: { _eq: ctx.userId } }, NOT_GOVERNING_FILE],
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

  // Records (receipts, leases: core/shared/records/files.ts) are filed with the
  // community but shown in the library to its admins only.
  const records = ctx.storage.map.records ?? null;
  if (!ctx.isAdmin && records && (await isWithinOrgRoot(records, folderId))) {
    throw createError({ statusCode: 403, statusMessage: "Records are for the community's admins" });
  }

  // The breadcrumb walks up alongside the listing; the listing's error, if any, is still the one thrown.
  const [listing, crumbs] = await Promise.allSettled([
    Promise.all([
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
          // Governing originals and page images live on the governing pages.
          filter: { _and: [{ folder: { _eq: folderId } }, NOT_GOVERNING_FILE] },
          fields: FILE_FIELDS,
          sort: ["-uploaded_on"],
          limit,
          ...(search ? { search } : {}),
        })
      ),
    ]),
    breadcrumbFor(folderId, root, rootNameFrom(org, root)),
  ]);
  if (listing.status === "rejected") throw listing.reason;
  if (crumbs.status === "rejected") throw crumbs.reason;
  const [folders, files] = listing.value;
  const breadcrumb = crumbs.value;

  return {
    mode: "folder",
    folderId,
    isRoot: folderId === root,
    breadcrumb,
    folders: ctx.isAdmin ? folders : (folders as Array<{ id: string }>).filter((f) => f.id !== records),
    files,
  };
});

/**
 * useOrgStorage — client API for the org-scoped file storage system.
 *
 * Thin wrapper over /api/org/storage/* (the org-isolated, permission-checked
 * routes). All browsing, mutation and upload for the Files manager and the
 * universal file picker goes through here — never the raw /api/directus/* file
 * routes, which are global and not tenant-scoped.
 */

export interface StorageFile {
  id: string;
  title?: string | null;
  filename_download?: string;
  type?: string | null;
  filesize?: number | null;
  width?: number | null;
  height?: number | null;
  uploaded_on?: string | null;
  uploaded_by?: string | { id: string } | null;
  modified_on?: string;
  folder?: string | { id: string } | null;
}

export interface StorageFolder {
  id: string;
  name: string;
  parent?: string | { id: string } | null;
}

export interface StorageAccess {
  isAdmin: boolean;
  isBoard: boolean;
  browseAccess: "admins_board" | "all_members" | "admins_only";
  canBrowseLibrary: boolean;
  canManage: boolean;
}

export type StorageSource = "comment" | "message" | "email" | "image" | "document";

/** A file chosen via the universal FilePicker (id + metadata + asset url). */
export interface PickedFile {
  id: string;
  title: string;
  filename_download?: string;
  type?: string | null;
  filesize?: number | null;
  url: string;
}

export const useOrgStorage = () => {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { getUrl, getOptimizedUrl } = useDirectusFiles();

  const orgId = () => selectedOrgId.value || undefined;

  /** Ensure scaffold exists + return access tier and the folder-key → id map. */
  const ensure = async () => {
    return await $fetch<{
      orgId: string;
      rootId: string;
      map: Record<string, string>;
      tree: { key: string; name: string; children?: any[] }[];
      access: StorageAccess;
    }>("/api/org/storage/ensure", {
      method: "POST",
      body: { orgId: orgId() },
    });
  };

  /** List a folder's contents ("library") or the caller's own uploads ("mine"). */
  const list = async (opts: {
    folderId?: string | null;
    scope?: "library" | "mine";
    search?: string;
    limit?: number;
  } = {}) => {
    return await $fetch<{
      mode: "folder" | "mine";
      folderId?: string;
      isRoot?: boolean;
      breadcrumb?: { id: string; name: string }[];
      folders?: StorageFolder[];
      files: StorageFile[];
    }>("/api/org/storage/list", {
      method: "POST",
      body: { orgId: orgId(), ...opts },
    });
  };

  // ---- folder mutations (admin) ----
  const createFolder = (name: string, parentId?: string | null) =>
    $fetch("/api/org/storage/folder", {
      method: "POST",
      body: { orgId: orgId(), action: "create", name, parentId },
    });

  const renameFolder = (folderId: string, name: string) =>
    $fetch("/api/org/storage/folder", {
      method: "POST",
      body: { orgId: orgId(), action: "rename", folderId, name },
    });

  const moveFolder = (folderId: string, parentId: string | null) =>
    $fetch("/api/org/storage/folder", {
      method: "POST",
      body: { orgId: orgId(), action: "move", folderId, parentId },
    });

  const deleteFolder = (folderId: string) =>
    $fetch("/api/org/storage/folder", {
      method: "POST",
      body: { orgId: orgId(), action: "delete", folderId },
    });

  // ---- file mutations (admin, or own file) ----
  const renameFile = (fileId: string, title: string) =>
    $fetch("/api/org/storage/file", {
      method: "POST",
      body: { orgId: orgId(), action: "rename", fileId, title },
    });

  const moveFile = (fileId: string, folderId: string | null) =>
    $fetch("/api/org/storage/file", {
      method: "POST",
      body: { orgId: orgId(), action: "move", fileId, folderId },
    });

  const deleteFile = (fileId: string) =>
    $fetch("/api/org/storage/file", {
      method: "POST",
      body: { orgId: orgId(), action: "delete", fileId },
    });

  /** Upload a file. Provide either folderId or source (routes to a subfolder). */
  const upload = async (
    file: File,
    opts: { folderId?: string; source?: StorageSource; title?: string } = {}
  ) => {
    const fd = new FormData();
    fd.append("file", file);
    if (orgId()) fd.append("orgId", orgId()!);
    if (opts.folderId) fd.append("folderId", opts.folderId);
    if (opts.source) fd.append("source", opts.source);
    if (opts.title) fd.append("title", opts.title);
    return await $fetch<StorageFile>("/api/org/storage/upload", {
      method: "POST",
      body: fd,
    });
  };

  // ---- settings (browse access) ----
  const getSettings = () =>
    $fetch<{ browseAccess: StorageAccess["browseAccess"] }>(
      "/api/org/storage/settings",
      { method: "POST", body: { orgId: orgId() } }
    );

  const setBrowseAccess = (browseAccess: StorageAccess["browseAccess"]) =>
    $fetch<{ browseAccess: StorageAccess["browseAccess"] }>(
      "/api/org/storage/settings",
      { method: "POST", body: { orgId: orgId(), browseAccess } }
    );

  return {
    ensure,
    list,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    renameFile,
    moveFile,
    deleteFile,
    upload,
    getSettings,
    setBrowseAccess,
    // asset url helpers (reused from useDirectusFiles)
    getUrl,
    getOptimizedUrl,
  };
};

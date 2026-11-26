// server/utils/org-storage.ts
/**
 * Organization-scoped file storage helpers.
 *
 * Directus `directus_files` / `directus_folders` are GLOBAL collections — they
 * are not natively scoped to an HOA. Every org owns a single root folder
 * (`hoa_organizations.folder`); all of that org's files and subfolders live
 * inside that root's subtree. These helpers are the single choke point that:
 *
 *   1. Scaffold the root + the standard subfolder layout (idempotent).
 *   2. Resolve the caller's identity, org membership and access tier.
 *   3. Guarantee tenant isolation — every folder/file a request touches is
 *      proven to live inside the caller's org root subtree before we act.
 *
 * The storage API routes (server/api/org/storage/*) run privileged Directus
 * operations with the admin (static-token) client AFTER enforcing our own
 * permission + containment checks here — mirroring the board-access pattern of
 * elevated server routes rather than per-row Directus policies.
 */

import {
  readItems,
  readFolder,
  readFolders,
  createFolder,
  updateItem,
} from "@directus/sdk";
import type { H3Event } from "h3";
import type { BatchSpec } from "./directus-graphql";

// ---------------------------------------------------------------------------
// Standard subfolder layout (the "Proposed default")
// ---------------------------------------------------------------------------

export interface StorageNode {
  /** Stable programmatic key, "/"-delimited (e.g. "uploads/comments") */
  key: string;
  /** Display name used as the Directus folder name */
  name: string;
  children?: StorageNode[];
}

export const STORAGE_TREE: StorageNode[] = [
  { key: "documents", name: "Documents" },
  {
    key: "meetings",
    name: "Meetings",
    children: [
      { key: "meetings/agendas", name: "Agendas" },
      { key: "meetings/minutes", name: "Minutes" },
    ],
  },
  { key: "images", name: "Images" },
  {
    key: "uploads",
    name: "Uploads",
    children: [
      { key: "uploads/comments", name: "Comments" },
      { key: "uploads/messages", name: "Messages" },
      { key: "uploads/emails", name: "Emails" },
    ],
  },
  { key: "branding", name: "Branding" },
  // A record's file (core/shared/records/files.ts): filed with its community,
  // shown in the library to admins only, opened by its record's rule.
  {
    key: "records",
    name: "Records",
    children: [
      { key: "records/receipts", name: "Expense receipts" },
      { key: "records/leases", name: "Leases" },
    ],
  },
];

/** Map a comment/message/email source to its Uploads subfolder key. */
export const UPLOAD_SOURCE_KEYS = {
  comment: "uploads/comments",
  message: "uploads/messages",
  email: "uploads/emails",
  image: "images",
  document: "documents",
} as const;

export type UploadSource = keyof typeof UPLOAD_SOURCE_KEYS;

export type BrowseAccess = "admins_board" | "all_members" | "admins_only";

export interface OrgStorage {
  rootId: string;
  /** Maps a StorageNode.key (e.g. "uploads/comments") → folder id */
  map: Record<string, string>;
}

export interface StorageContext {
  userId: string;
  orgId: string;
  isAdmin: boolean;
  isBoard: boolean;
  browseAccess: BrowseAccess;
  /** May this user browse the whole org library (vs. only their own uploads)? */
  canBrowseLibrary: boolean;
  storage: OrgStorage;
}

// ---------------------------------------------------------------------------
// Caches (module-scoped, per server process)
// ---------------------------------------------------------------------------

const storageCache = new Map<string, OrgStorage>();
// folderId → parentId (null = root-level). Bounded to avoid unbounded growth.
const parentCache = new Map<string, string | null>();

function rememberParent(id: string, parent: string | null) {
  if (parentCache.size > 5000) parentCache.clear();
  parentCache.set(id, parent);
}

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

function adminRoleIds(): string[] {
  const config = useRuntimeConfig();
  return [
    config.public.directusRoleAppAdmin,
    config.public.directusRoleHoaAdmin,
    (config.public as any).directusRoleAdmin,
  ].filter(Boolean) as string[];
}

function roleIdOf(role: unknown): string | null {
  if (!role) return null;
  return typeof role === "string" ? role : (role as any)?.id ?? null;
}

function hasActiveBoardTerm(terms: any[] | undefined | null): boolean {
  if (!Array.isArray(terms)) return false;
  const now = Date.now();
  return terms.some((t) => {
    if (!t) return false;
    const start = t.term_start ? new Date(t.term_start).getTime() : null;
    const end = t.term_end ? new Date(t.term_end).getTime() : null;
    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Scaffolding
// ---------------------------------------------------------------------------

/**
 * Ensure the org's root folder and the standard subfolder layout exist.
 * Idempotent — creates only what is missing. Uses the admin client so it works
 * regardless of the caller's Directus permissions. Result is cached per org.
 */
export async function ensureOrgStorage(
  orgId: string,
  opts: { refresh?: boolean } = {}
): Promise<OrgStorage> {
  if (!opts.refresh && storageCache.has(orgId)) {
    return storageCache.get(orgId)!;
  }

  const admin = getTypedDirectus();

  const orgs = (await admin.request(
    readItems("hoa_organizations", {
      filter: { id: { _eq: orgId } },
      fields: ["id", "name", "slug", "folder"],
      limit: 1,
    })
  )) as any[];

  const org = orgs?.[0];
  if (!org) {
    throw createError({ statusCode: 404, statusMessage: "Organization not found" });
  }

  // Resolve (or create) the root folder.
  let rootId: string | null =
    typeof org.folder === "string" ? org.folder : org.folder?.id ?? null;

  if (rootId) {
    // Verify it still exists; if it was deleted, fall through to recreate.
    try {
      await admin.request(readFolder(rootId, { fields: ["id"] }));
    } catch {
      rootId = null;
    }
  }

  if (!rootId) {
    const created = (await admin.request(
      createFolder({ name: org.name || org.slug || "Organization", parent: null })
    )) as any;
    rootId = created.id as string;
    await admin.request(
      updateItem("hoa_organizations", orgId, { folder: rootId } as any)
    );
  }

  // Walk the standard tree, creating any missing nodes.
  const map: Record<string, string> = {};

  const ensureChildren = async (parentId: string, nodes: StorageNode[]) => {
    const existing = (await admin.request(
      readFolders({
        filter: { parent: { _eq: parentId } },
        fields: ["id", "name"],
        limit: -1,
      })
    )) as any[];
    const byName = new Map<string, string>();
    for (const f of existing) byName.set((f.name || "").toLowerCase(), f.id);

    for (const node of nodes) {
      let id = byName.get(node.name.toLowerCase());
      if (!id) {
        const created = (await admin.request(
          createFolder({ name: node.name, parent: parentId })
        )) as any;
        id = created.id as string;
      }
      map[node.key] = id;
      rememberParent(id, parentId);
      if (node.children?.length) await ensureChildren(id, node.children);
    }
  };

  await ensureChildren(rootId, STORAGE_TREE);
  rememberParent(rootId, null);

  const result: OrgStorage = { rootId, map };
  storageCache.set(orgId, result);
  return result;
}

// ---------------------------------------------------------------------------
// Containment (tenant isolation)
// ---------------------------------------------------------------------------

/** Drop what this process remembers of a folder's parent, after it moves. */
export function forgetFolderParent(id: string) {
  parentCache.delete(id);
}

async function folderParent(id: string, fresh = false): Promise<string | null> {
  if (!fresh && parentCache.has(id)) return parentCache.get(id)!;
  const admin = getTypedDirectus();
  const folder = (await admin.request(
    readFolder(id, { fields: ["id", "parent"] })
  )) as any;
  const parent =
    folder?.parent == null
      ? null
      : typeof folder.parent === "string"
        ? folder.parent
        : folder.parent.id;
  rememberParent(id, parent ?? null);
  return parent ?? null;
}

/**
 * True if `folderId` is the root itself or a descendant of it. Walks the parent
 * chain (bounded). This is what proves a request stays inside the org subtree.
 *
 * Parents are cached per server process. Which community a folder is in does
 * not change through the app (a move stays inside one library; a root does not
 * move), so the cache is safe for that question. Whether a folder is inside
 * another one does change, and other processes' caches do not hear of a move,
 * so a cycle check passes `fresh`.
 */
export async function isWithinOrgRoot(
  rootId: string,
  folderId: string | null | undefined,
  opts: { fresh?: boolean } = {}
): Promise<boolean> {
  if (!folderId) return false;
  if (folderId === rootId) return true;
  let current: string | null = folderId;
  for (let i = 0; i < 64 && current; i++) {
    if (current === rootId) return true;
    current = await folderParent(current, opts.fresh);
  }
  return false;
}

/** Throw 403 unless the folder is inside the org root subtree. */
export async function assertFolderInOrg(rootId: string, folderId: string) {
  if (!(await isWithinOrgRoot(rootId, folderId))) {
    throw createError({
      statusCode: 403,
      statusMessage: "Folder is outside this organization",
    });
  }
}

/**
 * Collect the root folder id plus every descendant folder id (BFS). Used to
 * scope flat file queries (e.g. "my uploads") to the org subtree.
 */
export async function getDescendantFolderIds(rootId: string): Promise<string[]> {
  const admin = getTypedDirectus();
  const ids = [rootId];
  let frontier = [rootId];
  for (let depth = 0; depth < 64 && frontier.length; depth++) {
    const children = (await admin.request(
      readFolders({
        filter: { parent: { _in: frontier } },
        fields: ["id", "parent"],
        limit: -1,
      })
    )) as any[];
    if (!children.length) break;
    frontier = children.map((c) => {
      rememberParent(c.id, typeof c.parent === "string" ? c.parent : c.parent?.id ?? null);
      return c.id;
    });
    ids.push(...frontier);
  }
  return ids;
}

/** Throw 403 unless the file lives in a folder inside the org root subtree. */
export async function assertFileInOrg(
  rootId: string,
  file: { folder?: string | { id: string } | null }
) {
  const folderId =
    file?.folder == null
      ? null
      : typeof file.folder === "string"
        ? file.folder
        : file.folder.id;
  if (!folderId || !(await isWithinOrgRoot(rootId, folderId))) {
    throw createError({
      statusCode: 403,
      statusMessage: "File is outside this organization",
    });
  }
}

// ---------------------------------------------------------------------------
// Context resolution
// ---------------------------------------------------------------------------

/** The membership fields the context reads: the role and the board terms. */
const CONTEXT_MEMBER_FIELDS = ["id", "role", "board_member_terms.term_start", "board_member_terms.term_end"] as const;

/**
 * The context's two reads as one readItemsBatch: the caller's ACTIVE
 * membership in the org and the org row (its `modules`, plus whatever the
 * route needs of it, e.g. the storage quota's fields). The same filters and
 * fields as the reads they replace, the board terms dotted.
 */
export function storageContextSpecs(userId: string, orgId: string, orgFields: readonly string[] = []) {
  return {
    sc_member: {
      collection: "hoa_members",
      filter: { user: { _eq: userId }, organization: { _eq: orgId }, status: { _eq: "active" } },
      fields: CONTEXT_MEMBER_FIELDS,
      limit: 1,
    },
    sc_org: {
      collection: "hoa_organizations",
      filter: { id: { _eq: orgId } },
      fields: ["modules", ...orgFields.filter((f) => f !== "modules")],
      limit: 1,
    },
  } satisfies Record<string, BatchSpec>;
}

/** The caller's standing and the org's browse tier from the membership and org rows. */
export function storageAccessFrom(member: any, org: any) {
  const isAdmin = adminRoleIds().includes(roleIdOf(member.role) || "");
  const isBoard = hasActiveBoardTerm(member.board_member_terms);
  // Per-org browse setting lives in the modules JSON (no schema migration).
  const modules = (org?.modules ?? {}) as Record<string, any>;
  const browseAccess: BrowseAccess =
    modules.storage_browse_access === "all_members" ||
    modules.storage_browse_access === "admins_only"
      ? modules.storage_browse_access
      : "admins_board";
  const canBrowseLibrary =
    isAdmin ||
    browseAccess === "all_members" ||
    (browseAccess === "admins_board" && isBoard);
  return { isAdmin, isBoard, browseAccess, canBrowseLibrary };
}

function notAMember(): never {
  throw createError({
    statusCode: 403,
    statusMessage: "Not a member of this organization",
  });
}

/** The context's reads one by one, as before the batch: the membership first, refused before the org is read. */
async function storageContextRowsOneByOne(userId: string, orgId: string, orgFields: readonly string[]) {
  const admin = getTypedDirectus();
  const specs = storageContextSpecs(userId, orgId, orgFields);
  const members = (await admin.request(readItems("hoa_members", specs.sc_member as any))) as any[];
  if (!members?.[0]) notAMember();
  const orgRows = (await admin.request(readItems("hoa_organizations", specs.sc_org as any))) as any[];
  return { member: members[0], org: orgRows?.[0] ?? null };
}

/**
 * Resolve the caller's storage context for an org: identity, membership, role,
 * access tier and the (ensured) folder layout. Throws 401/403 as appropriate.
 *
 * orgId precedence: explicit arg → request body.orgId → session.selectedOrgId.
 */
export async function resolveStorageContext(
  event: H3Event,
  explicitOrgId?: string | null
): Promise<StorageContext> {
  return (await resolveStorageContextWithOrg(event, [], explicitOrgId)).ctx;
}

/**
 * resolveStorageContext, also handing back the org row with `orgFields` read
 * in the same request (null if the org has no row).
 *
 * Membership is resolved with the admin client (reliable regardless of the
 * member's own read grants). No ACTIVE membership in this org → no access: an
 * inactive/archived row is someone removed from the community, and their role
 * column still says whatever it said (a former HOA Admin stays "HOA Admin").
 * The membership and the org row are one request; nothing of the org is
 * returned to a caller refused here. Should the batch fail, the reads go one
 * by one as before, so the answer (an error's included) is the same.
 */
export async function resolveStorageContextWithOrg(
  event: H3Event,
  orgFields: readonly string[],
  explicitOrgId?: string | null
): Promise<{ ctx: StorageContext; org: Record<string, any> | null }> {
  const session = await getUserSession(event);
  const userId = (session?.user as any)?.id;
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  let orgId = explicitOrgId || null;
  if (!orgId) {
    try {
      const body = await readBody(event);
      orgId = body?.orgId || null;
    } catch {
      // not all requests have a body (e.g. multipart handled elsewhere)
    }
  }
  if (!orgId) orgId = (session as any)?.selectedOrgId || null;
  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: "Organization context required" });
  }

  let member: any;
  let org: any;
  try {
    const rows = await readItemsBatch(storageContextSpecs(userId, orgId, orgFields));
    member = rows.sc_member[0];
    org = rows.sc_org[0] ?? null;
  } catch {
    ({ member, org } = await storageContextRowsOneByOne(userId, orgId, orgFields));
  }
  if (!member) notAMember();

  const access = storageAccessFrom(member, org);
  const storage = await ensureOrgStorage(orgId);

  return {
    ctx: { userId, orgId, ...access, storage },
    org,
  };
}

/** Throw 403 unless the caller is an org admin. */
export function assertAdmin(ctx: StorageContext) {
  if (!ctx.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin access required",
    });
  }
}

/** Invalidate the cached layout for an org (after structural changes). */
export function invalidateOrgStorage(orgId: string) {
  storageCache.delete(orgId);
}

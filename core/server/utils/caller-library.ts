// Where a file or folder may go, for the app's own routes
// (`/api/directus/files`, `/api/directus/files/upload`,
// `/api/directus/files/import`, `/api/directus/folders`, `/api/directus/items`).
//
// Directus cannot say this itself: a create or a move is checked against the
// new values, and such a check cannot follow a relation (tested on production
// 2026-11-12: a create rule on folders was not enforced). So no community
// policy writes `directus_files.folder` or `directus_folders.parent`
// (PLACEMENT_FIELDS, core/shared/roles/admin-file-fields.ts): on their own
// token a member or admin could otherwise put a file or folder into another
// community's library. These routes check where it goes and place it with the
// app's token; renames and the rest stay on the caller's own. The storage
// library's routes check the same way with `assertFolderInOrg`. Reads use the
// app's token.
import { readFile, readFolder, readItems, updateFile, uploadFiles, importFile } from "@directus/sdk";
import type { H3Event } from "h3";
import { isWithinOrgRoot } from "./org-storage";

const asId = (v: unknown): string | null => (typeof v === "string" ? v : ((v as { id?: string } | null)?.id ?? null));

/**
 * The organizations the caller is an ACTIVE member of, with each one's library
 * root. A removed member's (inactive/archived) row puts nothing in reach.
 */
export async function callerCommunities(event: H3Event): Promise<{ organization: string; root: string | null }[]> {
  const session = await requireUserSession(event);
  const userId = (session.user as { id?: string } | undefined)?.id;
  if (!userId) return [];
  const rows = (await getTypedDirectus().request(
    readItems("hoa_members" as never, {
      filter: { user: { _eq: userId }, status: { _eq: "active" } },
      fields: ["organization.id", "organization.folder"],
      limit: -1,
    } as never)
  )) as Array<{ organization?: { id?: string; folder?: unknown } | string | null }>;
  const seen = new Map<string, string | null>();
  for (const row of rows ?? []) {
    const org = row.organization;
    const id = asId(org);
    if (id) seen.set(id, org && typeof org === "object" ? asId(org.folder) : null);
  }
  return [...seen].map(([organization, root]) => ({ organization, root }));
}

/**
 * Throw unless `folderId` is inside the library of a community the caller
 * belongs to. `allowNone` lets "no folder" through (a file outside every
 * library is in nobody's).
 */
export async function assertFolderInCallerLibrary(event: H3Event, folderId: unknown, options: { allowNone?: boolean } = {}) {
  if (folderId === null || folderId === undefined || folderId === "") {
    if (options.allowNone) return;
    throw createError({ statusCode: 403, message: "Choose a folder in your community's library" });
  }
  if (typeof folderId !== "string") throw createError({ statusCode: 400, message: "A folder is given by its id" });
  for (const { root } of await callerCommunities(event)) {
    if (root && (await isWithinOrgRoot(root, folderId))) return;
  }
  throw createError({ statusCode: 403, message: "That folder is not in your community's library" });
}

/** Throw unless every meeting named is one of the caller's communities'. */
export async function assertMeetingsInCallerCommunities(event: H3Event, meetingIds: unknown[]) {
  const ids = [...new Set(meetingIds.map(asId).filter((id): id is string => !!id))];
  if (!ids.length) return;
  const orgs = new Set((await callerCommunities(event)).map((c) => c.organization));
  const meetings = (await getTypedDirectus().request(
    readItems("hoa_meetings" as never, { filter: { id: { _in: ids } }, fields: ["id", "organization"], limit: -1 } as never)
  )) as Array<{ id: string; organization?: unknown }>;
  const ok = ids.every((id) => {
    const meeting = meetings.find((m) => m.id === id);
    const org = meeting ? asId(meeting.organization) : null;
    return !!org && orgs.has(org);
  });
  if (!ok) throw createError({ statusCode: 403, message: "That meeting is not one of your community's" });
}

/** The library root of one of the caller's communities that holds `folderId`, or null. */
async function callerRootOf(event: H3Event, folderId: string): Promise<string | null> {
  for (const { root } of await callerCommunities(event)) {
    if (root && (await isWithinOrgRoot(root, folderId))) return root;
  }
  return null;
}

async function callerId(event: H3Event): Promise<string> {
  const session = await requireUserSession(event);
  return String((session.user as { id?: unknown } | undefined)?.id ?? "");
}

/**
 * Throw unless the caller may move this file to `target`: a file in one of
 * their communities' libraries moves within that same library, or out of every
 * library; a file in no folder that they uploaded moves into any of their
 * libraries. Never from one community's library into another's, even for
 * someone in both.
 */
export async function assertFileMove(event: H3Event, fileId: unknown, target: unknown): Promise<void> {
  if (typeof fileId !== "string" || !fileId) throw createError({ statusCode: 400, message: "A file is given by its id" });
  if (target !== null && target !== undefined && target !== "" && typeof target !== "string") {
    throw createError({ statusCode: 400, message: "A folder is given by its id" });
  }
  type FileRow = { folder?: unknown; uploaded_by?: unknown };
  let file: FileRow | null = null;
  try {
    file = (await getTypedDirectus().request(readFile(fileId, { fields: ["id", "folder", "uploaded_by"] } as never))) as unknown as FileRow;
  } catch {
    file = null;
  }
  if (!file) throw createError({ statusCode: 404, message: "File not found" });

  const from = asId(file.folder);
  const to = (target as string | null | undefined) || null;
  if (from) {
    const root = await callerRootOf(event, from);
    if (!root) throw createError({ statusCode: 403, message: "That file is not in your community's library" });
    if (to && !(await isWithinOrgRoot(root, to))) {
      throw createError({ statusCode: 403, message: "A file moves only within its own community's library" });
    }
    return;
  }
  if (asId(file.uploaded_by) !== (await callerId(event))) {
    throw createError({ statusCode: 403, message: "That file is not in your community's library" });
  }
  await assertFolderInCallerLibrary(event, to, { allowNone: true });
}

/**
 * Throw unless the caller may move this folder under `parent`: a folder below
 * the root of one of their communities' libraries, to somewhere else in that
 * same library and not inside itself. A library's root does not move.
 */
export async function assertFolderMove(event: H3Event, folderId: unknown, parent: unknown): Promise<void> {
  if (typeof folderId !== "string" || !folderId) throw createError({ statusCode: 400, message: "A folder is given by its id" });
  if (typeof parent !== "string" || !parent) throw createError({ statusCode: 403, message: "Choose a folder in your community's library" });
  try {
    await getTypedDirectus().request(readFolder(folderId, { fields: ["id"] } as never));
  } catch {
    throw createError({ statusCode: 404, message: "Folder not found" });
  }
  const root = await callerRootOf(event, folderId);
  if (!root || root === folderId) throw createError({ statusCode: 403, message: "That folder is not one you can move" });
  if (!(await isWithinOrgRoot(root, parent))) {
    throw createError({ statusCode: 403, message: "A folder moves only within its own community's library" });
  }
  // Read fresh: a cached parent may predate a move (org-storage.ts says why).
  if (await isWithinOrgRoot(folderId, parent, { fresh: true })) {
    throw createError({ statusCode: 400, message: "A folder can't go inside itself" });
  }
}

/**
 * Store an upload or an import as the caller's: with the app's token, which
 * may file it (the caller's may not), then `uploaded_by` set to them, as
 * Directus would have. The folder in `form` must already be checked.
 */
export async function storeAsCaller(event: H3Event, upload: { form: FormData } | { url: string; data: Record<string, unknown> }): Promise<Record<string, unknown> | null> {
  const userId = await callerId(event);
  const directus = getTypedDirectus();
  const stored = (await directus.request(
    "form" in upload ? uploadFiles(upload.form) : importFile(upload.url, upload.data as never)
  )) as unknown as Record<string, unknown> | null;
  const id = stored && typeof stored.id === "string" ? stored.id : null;
  if (!id) return stored;
  if (userId) await directus.request(updateFile(id, { uploaded_by: userId } as never));
  return { ...stored, uploaded_by: userId || stored!.uploaded_by };
}

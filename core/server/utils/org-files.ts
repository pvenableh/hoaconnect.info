/**
 * "May this community's email carry this file?"
 *
 * The email routes read, fetch and store Directus files with the ADMIN token,
 * and a file id carries no tenancy of its own. Until 2026-11-12 they took any
 * id they were handed: a manager of one community could attach another
 * community's private PDF and have it mailed to any test address. Every id an
 * email names now passes this check before its file is read, fetched, stored or
 * described.
 *
 * A file belongs to community `orgId` when
 *   (a) its folder is inside that community's library (the subtree under
 *       `hoa_organizations.folder`) — where the composer's pickers and uploads
 *       put every attachment and editor image; or
 *   (b) a record of that community claims it (`fileOwnerOrgIds`, which fails
 *       closed) — but not by way of an email's own attachment list. That list
 *       is what is being checked: counted as ownership, an email that attached
 *       another community's file before this check existed would vouch for the
 *       file itself. A claim that might rest on it is refused.
 * With `allowPublicImages` (an image in the body, the footer photo), also any
 * file the Directus public policy already serves to anyone: an image whose
 * description is not a governing or support mark (scripts/lib/public-files.ts).
 *
 * An id that is not a canonical UUID string is refused outright: Postgres also
 * reads braces, upper case and missing hyphens as the same UUID, and an object
 * in a relation field is a nested write — either would slip past a check that
 * skipped it. A well-formed id that matches no file is not refused: there is
 * nothing to read, and the loaders skip it and Directus refuses to relate it,
 * as before.
 */
import { readFiles, readItem, readItems } from "@directus/sdk";
import { GOVERNING_FILE_PREFIX } from "#core/shared/governing/files";
import { SUPPORT_FILE_PREFIX } from "#core/shared/support/attachments";
import { isWithinOrgRoot } from "./org-storage";
import { fileOwnerOrgIds } from "./file-owner";

export interface FileScopeOptions {
  /** Inline images and the footer photo: also allow what the public policy serves anyway. */
  allowPublicImages?: boolean;
}

interface ScopedFile {
  id: string;
  folder?: string | { id: string } | null;
  type?: string | null;
  description?: string | null;
}

const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A Directus file id is a UUID; anything else names no file. */
export const isFileId = (v: unknown): v is string => typeof v === "string" && FILE_ID.test(v);

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: string } | null)?.id ?? null);

/** The `<img>` tags of an email body, as both senders' CID extraction walks them. */
export function imageTags(content: string | null | undefined): RegExpMatchArray[] {
  return [...(content || "").matchAll(/<img([^>]*?)src=["']([^"']+)["']([^>]*?)\/?>/gi)];
}

/**
 * The Directus file an `<img src>` names, lower-cased, or null. The one matcher
 * the check and both CID extractors share, so what is checked is what is fetched.
 */
export function assetIdFromSrc(src: string | null | undefined, directusUrl: string): string | null {
  if (!src || !(src.includes(directusUrl) || src.includes("/assets/"))) return null;
  const id = src.match(/\/assets\/([a-f0-9-]+)/i)?.[1];
  return isFileId(id) ? id.toLowerCase() : null;
}

/** Every Directus file an email body's images would be fetched from. */
export function inlineAssetIds(content: unknown, directusUrl: string): string[] {
  const ids = new Set<string>();
  for (const [, , src] of imageTags(typeof content === "string" ? content : "")) {
    const id = assetIdFromSrc(src, directusUrl);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** What the Directus public policy serves anonymously (isPublicFile in scripts/lib/public-files.ts). */
function isPublicImage(file: ScopedFile): boolean {
  if (!(file.type ?? "").startsWith("image/")) return false;
  const d = file.description;
  return d == null || !(d.startsWith(GOVERNING_FILE_PREFIX) || d.startsWith(SUPPORT_FILE_PREFIX));
}

/** (b): a record of `orgId` claims the file, and the claim can't be an email's attachment list. */
async function claimedByOrgRecord(orgId: string, fileId: string): Promise<boolean> {
  if (!(await fileOwnerOrgIds(fileId)).has(orgId)) return false;
  try {
    const rows = (await getTypedDirectus().request(
      readItems("hoa_emails_files" as never, {
        filter: { directus_files_id: { _eq: fileId } },
        fields: ["hoa_emails_id.organization"],
        limit: -1,
      } as never)
    )) as unknown as Array<{ hoa_emails_id?: { organization?: unknown } | null }>;
    return !(rows || []).some((r) => asId(r?.hoa_emails_id?.organization) === orgId);
  } catch {
    return false;
  }
}

/**
 * The named ids that may not go out in `orgId`'s email: anything that isn't a
 * UUID string, and (lower-cased) every existing file that doesn't belong to the
 * community. Empty when every file may go. A failed read throws: callers refuse.
 */
export async function filesOutsideOrg(orgId: string, fileIds: unknown, opts: FileScopeOptions = {}): Promise<string[]> {
  const given = (Array.isArray(fileIds) ? fileIds : [fileIds]).filter((v) => v != null && v !== "");
  const malformed = given.filter((v) => !isFileId(v)).map((v) => (typeof v === "string" ? v : "(not an id)"));
  const ids = [...new Set(given.filter(isFileId).map((id) => id.toLowerCase()))];
  if (!ids.length) return malformed;

  const directus = getTypedDirectus();
  // limit -1: Directus answers 100 rows by default, and a file left out of the
  // answer would read as "no such file" and pass.
  const rows = (await directus.request(
    readFiles({ filter: { id: { _in: ids } }, fields: ["id", "folder", "type", "description"], limit: -1 } as never)
  )) as unknown as ScopedFile[];
  const byId = new Map((rows || []).map((f) => [String(f.id).toLowerCase(), f]));
  if (!byId.size) return malformed;

  let root: string | null | undefined;
  const orgRoot = async () => {
    if (root === undefined) {
      const org = (await directus.request(readItem("hoa_organizations", orgId, { fields: ["folder"] } as never))) as {
        folder?: unknown;
      } | null;
      root = asId(org?.folder);
    }
    return root;
  };

  const refused = [...malformed];
  for (const id of ids) {
    const file = byId.get(id);
    if (!file) continue;
    if (opts.allowPublicImages && isPublicImage(file)) continue;
    const rootId = await orgRoot();
    const folder = asId(file.folder);
    if (rootId && folder && (await isWithinOrgRoot(rootId, folder).catch(() => false))) continue;
    if (await claimedByOrgRecord(orgId, id)) continue;
    refused.push(id);
  }
  return refused;
}

/** Throw 403 unless every named file may go out in `orgId`'s email. */
export async function assertFilesInOrg(orgId: string, fileIds: unknown, opts: FileScopeOptions = {}): Promise<void> {
  const refused = await filesOutsideOrg(orgId, fileIds, opts);
  if (refused.length) {
    console.warn(`[org-files] refused ${refused.length} file(s) outside org ${orgId}`);
    throw createError({
      statusCode: 403,
      message: "This email names a file that isn't in this community's library.",
      data: { code: "file_outside_org" },
    });
  }
}

/** The four email routes' check: attachments, then the body's images and the footer photo. */
export async function assertEmailFilesInOrg(
  orgId: string,
  input: { attachmentIds?: unknown; content?: unknown; footerImageId?: unknown; directusUrl: string }
): Promise<void> {
  await assertFilesInOrg(orgId, input.attachmentIds);
  await assertFilesInOrg(orgId, [...inlineAssetIds(input.content, input.directusUrl), input.footerImageId], {
    allowPublicImages: true,
  });
}

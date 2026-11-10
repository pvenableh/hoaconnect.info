// Support attachments (operator console Session F). Files live in directus_files
// with the admin token, never the member's own Directus permissions, in the
// "Support attachments" folder (`pnpm run create:support-attachments-folder`).
//
// Two steps, because a Vercel function body tops out at 4.5 MB: each file is
// uploaded on its own (POST /api/support/attachments) and comes back as an id;
// the message then names its ids. A file is marked in `description` as the
// uploader's until a message claims it (core/shared/support/attachments.ts), so a
// message can attach only that person's own fresh, unattached uploads.
//
// Downloads go through GET /api/support/attachments/:messageId/:fileId, which
// checks the viewer may see that message. The general asset proxy refuses these
// files outright (`isSupportFileMarker`).
import { readAssetArrayBuffer, readFiles, readFolders, updateFiles, uploadFiles } from "@directus/sdk";
import {
  ATTACHMENT_CLAIM_HOURS,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENTS_PER_MESSAGE,
  attachedMarker,
  attachmentProblem,
  attachmentType,
  bytesMatchType,
  pendingMarker,
  type SupportAttachment,
} from "#core/shared/support/attachments";

export const SUPPORT_ATTACHMENTS_FOLDER = "Support attachments";

let folderCache: { id: string | null; at: number } | null = null;

/** Tests only. */
export function _resetSupportFolderCache(): void {
  folderCache = null;
}

/** The folder's id, or null before the script has made it (files then land in the root). */
async function supportFolderId(): Promise<string | null> {
  if (folderCache && Date.now() - folderCache.at < 10 * 60_000) return folderCache.id;
  const rows = (await getTypedDirectus()
    .request(
      (readFolders as any)({
        filter: { name: { _eq: SUPPORT_ATTACHMENTS_FOLDER }, parent: { _null: true } },
        fields: ["id"],
        limit: 1,
      })
    )
    .catch(() => [])) as Array<{ id: string }>;
  folderCache = { id: rows?.[0]?.id ?? null, at: Date.now() };
  return folderCache.id;
}

/** Store one upload as this person's, waiting to be attached. Throws 400/413 in words. */
export async function storeSupportAttachment(input: {
  userId: string;
  name: string;
  data: Uint8Array;
}): Promise<SupportAttachment> {
  const name = (input.name || "file").trim().slice(0, 200);
  const problem = attachmentProblem({ name, size: input.data.byteLength });
  if (problem) throw createError({ statusCode: input.data.byteLength > ATTACHMENT_MAX_BYTES ? 413 : 400, message: problem });
  const kind = attachmentType(name)!;
  if (!bytesMatchType(name, input.data)) {
    throw createError({ statusCode: 400, message: `${name} doesn't look like a ${name.split(".").pop()?.toUpperCase()} file.` });
  }

  // Directus reads the fields before the file, so they go first.
  const form = new FormData();
  form.append("title", name);
  form.append("description", pendingMarker(input.userId));
  const folder = await supportFolderId();
  if (folder) form.append("folder", folder);
  form.append("file", new Blob([new Uint8Array(input.data)], { type: kind.type }), name);

  const file = (await getTypedDirectus().request((uploadFiles as any)(form, { fields: ["id", "filesize"] }))) as {
    id: string;
    filesize?: number | string | null;
  };
  return { id: file.id, name, type: kind.type, size: Number(file.filesize) || input.data.byteLength };
}

/**
 * The attachments a message may carry: each id must be this person's own
 * upload, not yet attached, and fresh. Read-only; `markAttached` follows once the
 * message exists. Throws 400 in words when any id fails, so nothing is written.
 */
export async function claimSupportAttachments(userId: string, ids: readonly string[] | undefined): Promise<SupportAttachment[]> {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (!unique.length) return [];
  if (unique.length > ATTACHMENTS_PER_MESSAGE) {
    throw createError({ statusCode: 400, message: `Attach up to ${ATTACHMENTS_PER_MESSAGE} files to one message.` });
  }
  const rows = (await getTypedDirectus().request(
    (readFiles as any)({
      filter: { id: { _in: unique }, description: { _eq: pendingMarker(userId) } },
      fields: ["id", "title", "filename_download", "type", "filesize", "uploaded_on"],
      limit: unique.length,
    })
  )) as Array<{ id: string; title?: string | null; filename_download?: string | null; type?: string | null; filesize?: number | string | null; uploaded_on?: string | null }>;
  const since = Date.now() - ATTACHMENT_CLAIM_HOURS * 3_600_000;
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const out: SupportAttachment[] = [];
  for (const id of unique) {
    const r = byId.get(id);
    if (!r || !r.uploaded_on || Date.parse(r.uploaded_on) < since) {
      throw createError({ statusCode: 400, message: "One of the attachments has expired or can't be used. Attach it again." });
    }
    const name = r.title || r.filename_download || "file";
    out.push({ id, name, type: attachmentType(name)?.type ?? r.type ?? "application/octet-stream", size: Number(r.filesize) || 0 });
  }
  return out;
}

/** Mark claimed files as the message's, so they can't be attached again. Never throws. */
export async function markAttached(files: readonly SupportAttachment[], messageId: string): Promise<void> {
  if (!files.length) return;
  await getTypedDirectus()
    .request((updateFiles as any)(files.map((f) => f.id), { description: attachedMarker(messageId) }))
    .catch((e: any) => console.error("[support] attachments not marked:", e?.message ?? e));
}

/** A message's stored attachments, defensively. */
export function messageAttachments(m: { attachments?: unknown } | null | undefined): SupportAttachment[] {
  const list = Array.isArray(m?.attachments) ? m.attachments : [];
  return list.filter((a: any) => a && typeof a.id === "string").map((a: any) => ({
    id: a.id,
    name: String(a.name ?? "file"),
    type: String(a.type ?? "application/octet-stream"),
    size: Number(a.size) || 0,
  }));
}

/** For a thread response: each attachment with the URL that checks access. */
export function attachmentLinks(messageId: string, m: { attachments?: unknown }) {
  return messageAttachments(m).map((a) => ({ ...a, url: `/api/support/attachments/${messageId}/${a.id}` }));
}

export async function readSupportAttachmentBytes(fileId: string): Promise<Uint8Array> {
  const buf = (await getTypedDirectus().request((readAssetArrayBuffer as any)(fileId))) as ArrayBuffer;
  return new Uint8Array(buf);
}

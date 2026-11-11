// Governing documents: getting a file of any size onto the server, and turning
// an upload into a draft document (docs/prompts/governing-docs.md, Session 3A).
//
// Vercel refuses a request body over 4.5 MB, and a recorded scan is often
// larger. So the browser sends the file in parts; each part is held as a
// private file marked with the upload's id, and the last call joins them,
// checks the SHA-256 the browser computed, and hands the one unmodified file to
// the same attach path a small file takes. The parts are then deleted.
//
// Nothing here reads or writes the text of a provision.
// Callers have already passed `requireGoverningManage`.

import { createHash } from "node:crypto";
import { createItem, deleteFiles, deleteItem, readAssetArrayBuffer, readFiles, readItems, uploadFiles } from "@directus/sdk";
import type { H3Event } from "h3";
import { DOCUMENT_KINDS, UPLOAD_MAX_BYTES, UPLOAD_MAX_PARTS, UPLOAD_PART_MAX_BYTES } from "#core/shared/governing/upload";
import { governingActor, writeGoverningAudit } from "./governing-audit";
import { attachGoverningSource, isSourceFileType } from "./governing-sources";
import { enforceStorageLimit } from "./storage-enforcement";

const DOCUMENTS = "hoa_governing_documents";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const STALE_PART_MS = 24 * 60 * 60 * 1000;

/** What marks a file as a part of one organization's upload. The organization is in it, so another's parts never match. */
const partMarker = (organizationId: string, uploadId: string) => `governing-upload:${organizationId}:${uploadId}`;
const files = async (filter: Record<string, unknown>) =>
  ((await getTypedDirectus().request(
    readFiles({ filter, fields: ["id", "title", "filesize", "description", "uploaded_on"], limit: -1 } as any)
  )) ?? []) as unknown as Array<{ id: string; title: string | null; filesize: number | string | null; uploaded_on?: string | null }>;
const removeFiles = async (ids: string[]) => {
  if (ids.length) await getTypedDirectus().request((deleteFiles as any)(ids)).catch(() => {});
};

const requireUploadId = (uploadId: string) => {
  if (!UUID.test(uploadId)) throw createError({ statusCode: 400, message: "Upload id is not valid" });
};

/** Hold one part. Sending the same index again replaces it, so a failed part can simply be retried. */
export async function storeUploadPart(organizationId: string, uploadId: string, index: number, bytes: Uint8Array) {
  requireUploadId(uploadId);
  if (!Number.isInteger(index) || index < 0 || index >= UPLOAD_MAX_PARTS) throw createError({ statusCode: 400, message: "Part number is not valid" });
  if (!bytes.length) throw createError({ statusCode: 400, message: "That part is empty" });
  if (bytes.length > UPLOAD_PART_MAX_BYTES) throw createError({ statusCode: 413, message: "That part is too large" });
  await enforceStorageLimit(organizationId, bytes.length);

  const marker = partMarker(organizationId, uploadId);
  if (index === 0) {
    // Parts of uploads that were never finished: clear this organization's old ones.
    const cutoff = Date.now() - STALE_PART_MS;
    const old = (await files({ description: { _starts_with: `governing-upload:${organizationId}:` } })).filter(
      (f) => f.uploaded_on && new Date(f.uploaded_on).getTime() < cutoff
    );
    await removeFiles(old.map((f) => f.id));
  }
  const earlier = (await files({ description: { _eq: marker } })).filter((f) => f.title === String(index));

  // No folder: a part is not in anyone's library, and no one but the admin token can read it.
  const form = new FormData();
  form.append("title", String(index));
  form.append("description", marker);
  form.append("file", new File([new Uint8Array(bytes)], `${index}.part`, { type: "application/octet-stream" }), `${index}.part`);
  await getTypedDirectus().request(uploadFiles(form));
  await removeFiles(earlier.map((f) => f.id));
  return { ok: true, index };
}

export type UploadRef = { id: string; parts: number; sha256: string; filename: string; type: string };

export function readUploadRef(body: any): UploadRef {
  const upload = body?.upload ?? {};
  const ref: UploadRef = {
    id: String(upload.id ?? ""),
    parts: Number(upload.parts),
    sha256: String(upload.sha256 ?? "").toLowerCase(),
    filename: String(upload.filename ?? "").slice(0, 255) || "original-document",
    type: String(upload.type ?? ""),
  };
  requireUploadId(ref.id);
  if (!Number.isInteger(ref.parts) || ref.parts < 1 || ref.parts > UPLOAD_MAX_PARTS) throw createError({ statusCode: 400, message: "Part count is not valid" });
  if (!SHA256.test(ref.sha256)) throw createError({ statusCode: 400, message: "The file's checksum is missing" });
  if (!isSourceFileType(ref.type)) throw createError({ statusCode: 400, message: "Upload a PDF or an image" });
  return ref;
}

/**
 * Join the parts into the file the browser had. The parts are deleted whether
 * or not the join succeeds: a failed upload starts again from the first part.
 */
export async function joinUploadParts(organizationId: string, ref: UploadRef): Promise<Uint8Array> {
  const parts = await files({ description: { _eq: partMarker(organizationId, ref.id) } });
  try {
    const byIndex = new Map(parts.map((p) => [Number(p.title), p]));
    if (parts.length !== ref.parts || byIndex.size !== ref.parts) throw createError({ statusCode: 409, message: "Some parts of the file did not arrive. Upload it again." });
    const total = parts.reduce((sum, p) => sum + (Number(p.filesize) || 0), 0);
    if (total > UPLOAD_MAX_BYTES) throw createError({ statusCode: 413, message: "That file is too large to upload here" });

    const hash = createHash("sha256");
    const chunks: Uint8Array[] = [];
    for (let index = 0; index < ref.parts; index++) {
      const part = byIndex.get(index);
      if (!part) throw createError({ statusCode: 409, message: "Some parts of the file did not arrive. Upload it again." });
      const chunk = new Uint8Array((await getTypedDirectus().request((readAssetArrayBuffer as any)(part.id))) as ArrayBuffer);
      hash.update(chunk);
      chunks.push(chunk);
    }
    if (hash.digest("hex") !== ref.sha256) throw createError({ statusCode: 422, message: "The file did not arrive intact. Upload it again." });

    const bytes = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    if (ref.type === "application/pdf" && new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).indexOf("%PDF-") < 0) {
      throw createError({ statusCode: 400, message: "That file is not a PDF" });
    }
    return bytes;
  } finally {
    await removeFiles(parts.map((p) => p.id));
  }
}

type SourceOptions = { is_recorded_copy: boolean; is_authoritative: boolean; notes: string | null };

/** Attach an uploaded file to a document that already exists. Same result as the multipart attach route. */
export async function attachUploadedSource(event: H3Event, organizationId: string, documentId: string, ref: UploadRef, options: SourceOptions) {
  const bytes = await joinUploadParts(organizationId, ref);
  return attachGoverningSource(event, organizationId, documentId, { bytes, filename: ref.filename, type: ref.type, ...options });
}

/**
 * A new draft document with the uploaded file as its original. Members see
 * neither until the document is published. No provision exists yet: pages and
 * proposals follow, each through its own route.
 */
export async function createDraftFromUpload(
  event: H3Event,
  organizationId: string,
  input: { title: string; kind: string; upload: UploadRef; is_recorded_copy: boolean }
) {
  const title = input.title.trim();
  if (!title) throw createError({ statusCode: 400, message: "Give the document a title" });
  if (!(DOCUMENT_KINDS as readonly string[]).includes(input.kind)) throw createError({ statusCode: 400, message: "Choose what kind of document this is" });

  const bytes = await joinUploadParts(organizationId, input.upload);

  const existing = ((await getTypedDirectus().request(
    readItems(DOCUMENTS as never, { filter: { organization: { _eq: organizationId } }, fields: ["sort"], limit: -1 } as never)
  )) ?? []) as Array<{ sort: number | null }>;
  const sort = existing.reduce((max, d) => Math.max(max, Number(d.sort) || 0), 0) + 1;

  const document = (await getTypedDirectus().request(
    createItem(DOCUMENTS as never, { organization: organizationId, title, kind: input.kind, status: "draft", sort } as never)
  )) as unknown as { id: string };

  let source: { id: string; file: string; page_count: number | null };
  try {
    source = await attachGoverningSource(event, organizationId, document.id, {
      bytes,
      filename: input.upload.filename,
      type: input.upload.type,
      is_recorded_copy: input.is_recorded_copy,
      // The draft's text will be taken from this file.
      is_authoritative: true,
      notes: null,
    });
  } catch (error) {
    // Nothing points at the empty draft: take it back out.
    await getTypedDirectus().request(deleteItem(DOCUMENTS as never, document.id)).catch(() => {});
    throw error;
  }

  await writeGoverningAudit(await governingActor(event), {
    action: "document_upload",
    organization: organizationId,
    document: document.id,
    summary: `Created draft "${title}" from the uploaded file "${input.upload.filename}"`,
    after: { document: document.id, title, kind: input.kind, status: "draft", source: source.id, file: source.file, page_count: source.page_count },
  });
  return { id: document.id, source: source.id, file: source.file, page_count: source.page_count };
}

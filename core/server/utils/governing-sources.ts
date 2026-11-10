// Original documents: attaching and removing the files behind a transcription
// (docs/prompts/governing-docs.md, Session 1D), and deciding who may open one.
//
// A source is a PDF or image of the document as recorded (or another copy),
// kept beside the transcribed text. Nothing here reads or writes the text of
// a provision. Every attach and delete writes a row to the audit log.
//
// Callers have already passed `requireGoverningManage`.

import { createItem, deleteFiles, deleteItem, readFiles, readItems, uploadFiles } from "@directus/sdk";
import type { H3Event } from "h3";
import { MEMBER_DOCUMENT_STATUSES } from "#core/shared/governing/visibility";
import { hasCapability } from "#core/shared/permissions";
import { resolveActors } from "./board-access";
import { getManagerGrants } from "./manager-access";
import { ensureOrgStorage } from "./org-storage";
import { addOrgStorageUsage, enforceStorageLimit } from "./storage-enforcement";

const SOURCES = "hoa_governing_sources";
const DOCUMENTS = "hoa_governing_documents";
const AUDIT = "hoa_governing_audit_log";

const asId = (v: unknown): string | null => (typeof v === "string" ? v : ((v as { id?: string } | null)?.id ?? null));
const rows = async (collection: string, query: Record<string, unknown>) =>
  ((await getTypedDirectus().request(readItems(collection as never, query as never))) ?? []) as any[];

export const isSourceFileType = (type: string | null | undefined) => type === "application/pdf" || /^image\//.test(type ?? "");

/** Pages in a PDF, or null when it is not a PDF or cannot be read. Never blocks an attach. */
export async function pdfPageCount(bytes: Uint8Array, type: string): Promise<number | null> {
  if (type !== "application/pdf") return null;
  try {
    const { getDocumentProxy } = await import("unpdf");
    // A copy: the reader may take ownership of the buffer it is given.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    return Number.isInteger(pdf.numPages) && pdf.numPages > 0 ? pdf.numPages : null;
  } catch {
    return null;
  }
}

type Actor = { id: string; name: string | null; email: string | null };

async function actorOf(event: H3Event): Promise<Actor> {
  const user = ((await getUserSession(event))?.user ?? {}) as Record<string, any>;
  const name = [user.firstName ?? user.first_name, user.lastName ?? user.last_name].filter(Boolean).join(" ");
  return { id: String(user.id), name: name || null, email: user.email ?? null };
}

async function writeAudit(
  actor: Actor,
  entry: { action: string; organization: string; document: string; summary: string; before?: unknown; after?: unknown }
) {
  await getTypedDirectus().request(
    createItem(AUDIT as never, {
      occurred_at: new Date().toISOString(),
      action: entry.action,
      organization: entry.organization,
      actor_user: actor.id,
      actor_name: actor.name,
      actor_email: actor.email,
      document: entry.document,
      summary: entry.summary,
      before: entry.before ?? null,
      after: entry.after ?? null,
    } as never)
  );
}

/** The document, if it is this organization's. Otherwise a 404. */
async function documentInOrg(organizationId: string, documentId: string) {
  const [document] = await rows(DOCUMENTS, {
    filter: { id: { _eq: documentId }, organization: { _eq: organizationId } },
    fields: ["id", "title"],
    limit: 1,
  });
  if (!document) throw createError({ statusCode: 404, message: "Document not found" });
  return document as { id: string; title: string | null };
}

export type AttachInput = {
  bytes: Uint8Array;
  filename: string;
  type: string;
  is_recorded_copy: boolean;
  is_authoritative: boolean;
  notes: string | null;
};

/** Store the file in the organization's Documents folder, create the source row, write the audit row. */
export async function attachGoverningSource(event: H3Event, organizationId: string, documentId: string, input: AttachInput) {
  const document = await documentInOrg(organizationId, documentId);
  if (!isSourceFileType(input.type)) throw createError({ statusCode: 400, message: "Attach a PDF or an image" });
  if (!input.bytes.length) throw createError({ statusCode: 400, message: "That file is empty" });
  await enforceStorageLimit(organizationId, input.bytes.length);

  const storage = await ensureOrgStorage(organizationId);
  const folder = storage.map.documents || storage.rootId;
  const page_count = await pdfPageCount(input.bytes, input.type);

  // The bytes go in as they came: this is the record, so no optimizing or
  // re-encoding. Fields before the file part, or Directus drops them.
  const form = new FormData();
  form.append("title", `${document.title ?? "Governing document"} (original)`);
  form.append("folder", folder);
  form.append("file", new File([new Uint8Array(input.bytes)], input.filename, { type: input.type }), input.filename);
  const file = (await getTypedDirectus().request(uploadFiles(form))) as { id: string };

  let source: { id: string };
  try {
    source = (await getTypedDirectus().request(
      createItem(SOURCES as never, {
        organization: organizationId,
        document: document.id,
        file: file.id,
        is_recorded_copy: input.is_recorded_copy,
        is_authoritative: input.is_authoritative,
        notes: input.notes,
        page_count,
      } as never)
    )) as unknown as { id: string };
  } catch (error) {
    // No row points at the file, so nobody could ever open it: take it back out.
    await getTypedDirectus().request((deleteFiles as any)([file.id])).catch(() => {});
    throw error;
  }
  await addOrgStorageUsage(organizationId, input.bytes.length);

  const after = {
    source: source.id,
    file: file.id,
    filename: input.filename,
    type: input.type,
    filesize: input.bytes.length,
    page_count,
    is_recorded_copy: input.is_recorded_copy,
    is_authoritative: input.is_authoritative,
    notes: input.notes,
  };
  await writeAudit(await actorOf(event), {
    action: "source_attach",
    organization: organizationId,
    document: document.id,
    summary: `Attached original document "${input.filename}" to ${document.title ?? "a governing document"}`,
    after,
  });
  return { id: source.id, file: file.id, page_count };
}

/** Remove the source row and its file. 404 unless the source is on this document in this organization. */
export async function deleteGoverningSource(event: H3Event, organizationId: string, documentId: string, sourceId: string) {
  const document = await documentInOrg(organizationId, documentId);
  const [source] = await rows(SOURCES, {
    filter: { id: { _eq: sourceId }, organization: { _eq: organizationId }, document: { _eq: document.id } },
    fields: ["id", "file", "is_recorded_copy", "is_authoritative", "notes", "page_count"],
    limit: 1,
  });
  if (!source) throw createError({ statusCode: 404, message: "Original document not found" });

  const fileId = asId(source.file);
  const [file] = fileId
    ? (((await getTypedDirectus().request(
        readFiles({ filter: { id: { _eq: fileId } }, fields: ["id", "filename_download", "type", "filesize"], limit: 1 } as any)
      )) ?? []) as any[])
    : [];

  await getTypedDirectus().request(deleteItem(SOURCES as never, source.id));
  if (fileId) {
    await getTypedDirectus().request((deleteFiles as any)([fileId]));
    await addOrgStorageUsage(organizationId, -(Number(file?.filesize) || 0));
  }

  await writeAudit(await actorOf(event), {
    action: "source_delete",
    organization: organizationId,
    document: document.id,
    summary: `Removed original document "${file?.filename_download ?? "file"}" from ${document.title ?? "a governing document"}`,
    before: {
      source: source.id,
      file: fileId,
      filename: file?.filename_download ?? null,
      type: file?.type ?? null,
      filesize: file?.filesize != null ? Number(file.filesize) : null,
      page_count: source.page_count ?? null,
      is_recorded_copy: source.is_recorded_copy === true,
      is_authoritative: source.is_authoritative === true,
      notes: source.notes ?? null,
    },
  });
  return { ok: true };
}

/**
 * For the asset proxy. Null when the file is not a governing source, so the
 * proxy's ordinary rules apply. Otherwise this decides alone: the caller needs
 * a seat in the organization, and either manages governing documents or the
 * document is one members may see. A draft's scan is refused to a member even
 * though they belong to the organization that owns it.
 */
export async function mayOpenGoverningSourceFile(event: H3Event, fileId: string): Promise<boolean | null> {
  let claims: any[];
  try {
    claims = await rows(SOURCES, { filter: { file: { _eq: fileId } }, fields: ["organization", "document"], limit: -1 });
  } catch {
    return null; // The collection is not in this deployment.
  }
  if (!claims.length) return null;

  for (const claim of claims) {
    const organizationId = asId(claim.organization);
    const documentId = asId(claim.document);
    if (!organizationId || !documentId) continue;
    const actors = await resolveActors(event, organizationId);
    if (!hasCapability(actors, "governing:read")) continue;
    if (hasCapability(actors, "governing:manage")) return true;
    if (actors.includes("property_manager") && (await getManagerGrants(event, organizationId))?.documents === true) return true;
    const [document] = await rows(DOCUMENTS, {
      filter: { id: { _eq: documentId }, organization: { _eq: organizationId } },
      fields: ["status"],
      limit: 1,
    });
    if (document && MEMBER_DOCUMENT_STATUSES.includes(document.status)) return true;
  }
  return false;
}

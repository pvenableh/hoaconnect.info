// Governing documents: review, the audited text writes, publishing and
// deleting a draft (docs/prompts/governing-docs.md, Session 3B; spec §7).
//
// This is the one place the app CHANGES the text of a provision. There are
// three ways, and each writes an audit row with the text before and after:
//   - an explicit edit by a manager (`text_edit`);
//   - a split: the two pieces joined are the text exactly (`provision_split`);
//   - a merge: the exact concatenation of two neighbours (`provision_merge`).
// Text is stored as it is given: no trim, no normalize, no reflow.
//
// Split, merge, reorder, publish and delete work on a draft document only. A
// published document's provisions can be edited (a reason is then required)
// and nothing else.
//
// Callers have already passed `requireGoverningManage`.

import { createItem, deleteItem, deleteItems, readItems, updateItem } from "@directus/sdk";
import type { H3Event } from "h3";
import {
  DOCUMENT_DATE_FIELDS,
  DOCUMENT_KINDS,
  DOCUMENT_NUMBER_FIELDS,
  DOCUMENT_TEXT_FIELDS,
  REVIEW_MOVES,
  type DocumentEdit,
  canPublish,
  countMarkers,
  hasBlockingMarker,
  isDraftStatus,
  mergeText,
  parseUploadKey,
  publishBlockers,
  splitText,
} from "#core/shared/governing/review";
import type { DocumentStatus, ReviewState } from "#core/shared/governing/types";
import { governingActor, writeGoverningAudit } from "./governing-audit";
import { deleteGoverningSource } from "./governing-sources";

const PROVISIONS = "hoa_governing_provisions";
const DOCUMENTS = "hoa_governing_documents";
const SOURCES = "hoa_governing_sources";
const PAGES = "hoa_governing_pages";

const PROVISION_FIELDS = [
  "id", "document", "source_key", "sort", "citation", "original_label", "heading", "text",
  "review_state", "reviewed_by", "reviewed_at", "block_type", "uncertain",
];
const DOCUMENT_FIELDS = ["id", "title", "kind", "status", ...DOCUMENT_TEXT_FIELDS.slice(1), ...DOCUMENT_DATE_FIELDS, ...DOCUMENT_NUMBER_FIELDS];
type DocumentRow = { id: string; title: string | null; kind: string | null; status: DocumentStatus } & Record<string, unknown>;
export const BLOCK_TYPES = ["text", "execution", "exhibit", "drawing"] as const;

const asId = (v: unknown): string | null => (typeof v === "string" ? v : ((v as { id?: string } | null)?.id ?? null));
const rows = async (collection: string, query: Record<string, unknown>) =>
  ((await getTypedDirectus().request(readItems(collection as never, query as never))) ?? []) as any[];
const write = (op: unknown) => getTypedDirectus().request(op as never);
const inOrder = (a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.id).localeCompare(String(b.id));
const stateOf = (p: any) => (p.review_state ?? "ocr_draft") as ReviewState;

async function documentInOrg(organizationId: string, documentId: string) {
  const [document] = await rows(DOCUMENTS, {
    filter: { id: { _eq: documentId }, organization: { _eq: organizationId } },
    fields: DOCUMENT_FIELDS,
    limit: 1,
  });
  if (!document) throw createError({ statusCode: 404, message: "Document not found" });
  return document as DocumentRow;
}

async function provisionInOrg(organizationId: string, provisionId: string) {
  const [provision] = await rows(PROVISIONS, {
    filter: { id: { _eq: provisionId }, organization: { _eq: organizationId } },
    fields: PROVISION_FIELDS,
    limit: 1,
  });
  if (!provision) throw createError({ statusCode: 404, message: "Provision not found" });
  const document = await documentInOrg(organizationId, asId(provision.document) ?? "");
  return { provision, document };
}

const provisionsOf = async (organizationId: string, documentId: string) =>
  (await rows(PROVISIONS, { filter: { document: { _eq: documentId }, organization: { _eq: organizationId } }, fields: PROVISION_FIELDS, limit: -1 })).sort(inOrder);

const requireDraft = (document: { status: DocumentStatus }, what: string) => {
  if (!isDraftStatus(document.status)) throw createError({ statusCode: 409, message: `${what} is only possible while the document is a draft` });
};
const name = (p: any) => p.citation || p.original_label || "a provision";

/** Everything the review screen needs: the provisions with their page, and each page's image and draft text. */
export async function getGoverningReview(organizationId: string, documentId: string) {
  const document = await documentInOrg(organizationId, documentId);
  const provisions = await provisionsOf(organizationId, document.id);
  const sources = await rows(SOURCES, { filter: { document: { _eq: document.id }, organization: { _eq: organizationId } }, fields: ["id"], limit: -1 });
  const pages = sources.length
    ? await rows(PAGES, {
        filter: { source: { _in: sources.map((s) => s.id) }, organization: { _eq: organizationId } },
        fields: ["id", "source", "page_number", "image", "text", "extraction"],
        limit: -1,
      })
    : [];
  const blockers = publishBlockers(provisions.map((p) => ({ text: p.text ?? null, review_state: stateOf(p), citation: p.citation ?? null })));
  return {
    document,
    provisions: provisions.map((p) => ({
      id: p.id as string,
      sort: (p.sort ?? null) as number | null,
      citation: (p.citation ?? null) as string | null,
      original_label: (p.original_label ?? null) as string | null,
      heading: (p.heading ?? null) as string | null,
      text: (p.text ?? "") as string,
      review_state: stateOf(p),
      reviewed_at: (p.reviewed_at ?? null) as string | null,
      block_type: (p.block_type ?? "text") as string,
      uncertain: p.uncertain === true,
      page: parseUploadKey(p.source_key),
      markers: countMarkers(p.text),
    })),
    pages: pages
      .map((p) => ({
        id: p.id as string,
        source: asId(p.source)!,
        page_number: Number(p.page_number),
        image: asId(p.image),
        text: (p.text ?? null) as string | null,
        extraction: (p.extraction ?? null) as string | null,
      }))
      .sort((a, b) => a.source.localeCompare(b.source) || a.page_number - b.page_number),
    blockers,
    can_publish: isDraftStatus(document.status) && canPublish(blockers),
  };
}

export type ProvisionEdit = {
  text?: string;
  citation?: string | null;
  heading?: string | null;
  original_label?: string | null;
  block_type?: string;
  uncertain?: boolean;
};

/**
 * The audited edit. `text` is stored exactly as given. In a draft, changing the
 * text sets the provision back to `ocr_draft`; in a published document a reason
 * is required and the provision stays visible, marked reviewed by the editor.
 */
export async function editGoverningProvision(event: H3Event, organizationId: string, provisionId: string, edit: ProvisionEdit, reason: string | null) {
  const { provision, document } = await provisionInOrg(organizationId, provisionId);
  if (edit.text !== undefined && (typeof edit.text !== "string" || !edit.text.length)) {
    throw createError({ statusCode: 400, message: "text must not be empty" });
  }
  if (edit.block_type !== undefined && !(BLOCK_TYPES as readonly string[]).includes(edit.block_type)) {
    throw createError({ statusCode: 400, message: "Unknown block_type" });
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const set = (field: string, value: unknown, current: unknown) => {
    if (value === undefined || value === current) return;
    before[field] = current;
    after[field] = value;
  };
  set("text", edit.text, provision.text ?? "");
  for (const field of ["citation", "heading", "original_label"] as const) {
    if (edit[field] !== undefined) set(field, edit[field] || null, provision[field] ?? null);
  }
  set("block_type", edit.block_type, provision.block_type ?? "text");
  if (edit.uncertain !== undefined) set("uncertain", edit.uncertain === true, provision.uncertain === true);
  if (!Object.keys(after).length) return { id: provision.id as string, changed: false, review_state: stateOf(provision) };

  const draft = isDraftStatus(document.status);
  if (!draft && !reason) throw createError({ statusCode: 400, message: "A reason is required to edit a provision of a published document" });

  const actor = await governingActor(event);
  const textChanged = "text" in after;
  if (textChanged) {
    const next = draft
      ? { review_state: "ocr_draft", reviewed_by: null, reviewed_at: null }
      : { review_state: "reviewed", reviewed_by: actor.id, reviewed_at: new Date().toISOString() };
    before.review_state = stateOf(provision);
    Object.assign(after, next);
  }
  await write(updateItem(PROVISIONS as never, provision.id, after as never));
  try {
    await writeGoverningAudit(actor, {
      action: textChanged ? "text_edit" : "provision_edit",
      organization: organizationId,
      document: document.id,
      provision: provision.id,
      summary: `${textChanged ? "Edited the text of" : "Edited the details of"} ${name({ ...provision, ...after })} in ${document.title ?? "a governing document"}`,
      reason,
      before,
      after,
    });
  } catch (error) {
    // No edit without its audit row: put back what was there.
    const restore = Object.fromEntries(Object.keys(after).map((k) => [k, k in before ? before[k] : (provision[k] ?? null)]));
    await write(updateItem(PROVISIONS as never, provision.id, restore as never)).catch(() => {});
    throw error;
  }
  return { id: provision.id as string, changed: true, review_state: (after.review_state ?? stateOf(provision)) as ReviewState };
}

/** ocr_draft → reviewed → verified, or back to ocr_draft. Any manager; each move is audited. */
export async function setGoverningReviewState(event: H3Event, organizationId: string, provisionId: string, state: ReviewState) {
  const { provision, document } = await provisionInOrg(organizationId, provisionId);
  const from = stateOf(provision);
  if (from === state) return { id: provision.id as string, review_state: state, changed: false };
  if (!REVIEW_MOVES[from].includes(state)) {
    throw createError({ statusCode: 409, message: "This provision cannot be moved to that state from where it is" });
  }
  if (state === "ocr_draft" && !isDraftStatus(document.status)) {
    throw createError({ statusCode: 409, message: "A provision of a published document cannot be reopened. Edit it instead." });
  }
  if (state === "reviewed" && hasBlockingMarker(provision.text)) {
    throw createError({ statusCode: 409, message: "This provision still contains [illegible]. Read the page image and replace each one first." });
  }

  const actor = await governingActor(event);
  // Verified is a second pair of eyes (Peter, 2026-11-10): not the person who marked it reviewed.
  // A provision with no recorded reviewer (the 1033 import) may be verified by any manager.
  if (state === "verified" && asId(provision.reviewed_by) === actor.id) {
    throw createError({ statusCode: 409, message: "Verifying is a second check. Someone other than the person who reviewed this provision must do it." });
  }
  const after =
    state === "ocr_draft"
      ? { review_state: state, reviewed_by: null, reviewed_at: null }
      : { review_state: state, reviewed_by: actor.id, reviewed_at: new Date().toISOString() };
  await write(updateItem(PROVISIONS as never, provision.id, after as never));
  await writeGoverningAudit(actor, {
    action: "review_state",
    organization: organizationId,
    document: document.id,
    provision: provision.id,
    summary: `${name(provision)} in ${document.title ?? "a governing document"}: ${from} → ${state}`,
    before: { review_state: from, reviewed_by: asId(provision.reviewed_by), reviewed_at: provision.reviewed_at ?? null },
    after,
  });
  return { id: provision.id as string, review_state: state, changed: true };
}

const UNREVIEWED = { review_state: "ocr_draft", reviewed_by: null, reviewed_at: null };

async function renumber(ordered: { id: string; sort: number | null }[]) {
  for (const [i, p] of ordered.entries()) {
    if (p.sort !== i + 1) await write(updateItem(PROVISIONS as never, p.id, { sort: i + 1 } as never));
  }
}

/** Cut a draft provision in two at a character offset. The pieces joined are the text exactly. */
export async function splitGoverningProvision(event: H3Event, organizationId: string, provisionId: string, at: number) {
  const { provision, document } = await provisionInOrg(organizationId, provisionId);
  requireDraft(document, "Splitting a provision");
  const text = (provision.text ?? "") as string;
  const pieces = splitText(text, at);
  if (!pieces) throw createError({ statusCode: 400, message: "The cut must fall inside the text" });

  const all = await provisionsOf(organizationId, document.id);
  const actor = await governingActor(event);
  await write(updateItem(PROVISIONS as never, provision.id, { text: pieces[0], ...UNREVIEWED } as never));
  const created = (await write(
    createItem(PROVISIONS as never, {
      organization: organizationId,
      document: document.id,
      // Same page as the piece it was cut from.
      source_key: provision.source_key ? `${provision.source_key}:s${Date.now().toString(36)}` : null,
      sort: (provision.sort ?? 0) + 1,
      text: pieces[1],
      block_type: provision.block_type ?? "text",
      ...UNREVIEWED,
    } as never)
  )) as any;

  const index = all.findIndex((p) => p.id === provision.id);
  await renumber([...all.slice(0, index + 1), { id: created.id, sort: null }, ...all.slice(index + 1)]);

  await writeGoverningAudit(actor, {
    action: "provision_split",
    organization: organizationId,
    document: document.id,
    provision: provision.id,
    summary: `Split ${name(provision)} in ${document.title ?? "a governing document"} in two`,
    before: { id: provision.id, text, review_state: stateOf(provision) },
    after: { at, pieces: [{ id: provision.id, text: pieces[0] }, { id: created.id, text: pieces[1] }], review_state: "ocr_draft" },
  });
  return { id: provision.id as string, created: created.id as string };
}

/**
 * Join a draft provision with the one after it. The result is the first text followed by the second, exactly.
 * The first piece keeps its label, citation and heading; one it lacks is taken from the second.
 */
export async function mergeGoverningProvision(event: H3Event, organizationId: string, provisionId: string) {
  const { provision, document } = await provisionInOrg(organizationId, provisionId);
  requireDraft(document, "Merging provisions");
  const all = await provisionsOf(organizationId, document.id);
  const next = all[all.findIndex((p) => p.id === provision.id) + 1];
  if (!next) throw createError({ statusCode: 409, message: "There is no provision after this one to merge with" });

  const first = (provision.text ?? "") as string;
  const second = (next.text ?? "") as string;
  const text = mergeText(first, second);
  const actor = await governingActor(event);
  // Where the first piece has no label, citation or heading, the second's is kept rather than lost.
  const kept: Record<string, string> = {};
  for (const field of ["original_label", "citation", "heading"] as const) {
    if (!provision[field] && next[field]) kept[field] = next[field];
  }
  await write(updateItem(PROVISIONS as never, provision.id, { text, ...kept, ...UNREVIEWED } as never));
  await write(deleteItem(PROVISIONS as never, next.id));

  const piece = (p: any, t: string) => ({
    id: p.id, text: t, source_key: p.source_key ?? null, citation: p.citation ?? null,
    original_label: p.original_label ?? null, heading: p.heading ?? null, review_state: stateOf(p),
  });
  await writeGoverningAudit(actor, {
    action: "provision_merge",
    organization: organizationId,
    document: document.id,
    provision: provision.id,
    summary: `Merged ${name(provision)} with the provision after it in ${document.title ?? "a governing document"}`,
    before: { pieces: [piece(provision, first), piece(next, second)] },
    after: { id: provision.id, text, ...kept, review_state: "ocr_draft" },
  });
  return { id: provision.id as string, removed: next.id as string };
}

/** Put a draft's provisions in a new order. `ids` must be exactly the document's provisions. Writes `sort` only. */
export async function reorderGoverningProvisions(event: H3Event, organizationId: string, documentId: string, ids: string[]) {
  const document = await documentInOrg(organizationId, documentId);
  requireDraft(document, "Reordering provisions");
  const all = await provisionsOf(organizationId, document.id);
  const current = all.map((p) => p.id as string);
  if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => current.includes(id))) {
    throw createError({ statusCode: 400, message: "ids must list every provision of the document exactly once" });
  }
  if (ids.every((id, i) => id === current[i])) return { changed: false };

  const byId = new Map(all.map((p) => [p.id as string, p]));
  await renumber(ids.map((id) => ({ id, sort: (byId.get(id)!.sort ?? null) as number | null })));
  await writeGoverningAudit(await governingActor(event), {
    action: "provisions_reorder",
    organization: organizationId,
    document: document.id,
    summary: `Reordered the provisions of ${document.title ?? "a governing document"}`,
    before: { order: current },
    after: { order: ids },
  });
  return { changed: true };
}

/** Publish a draft. Refused until every provision is reviewed, has a citation, and none contains [illegible]. */
export async function publishGoverningDocument(event: H3Event, organizationId: string, documentId: string) {
  const document = await documentInOrg(organizationId, documentId);
  if (!isDraftStatus(document.status)) throw createError({ statusCode: 409, message: "Only a draft can be published" });
  const provisions = await provisionsOf(organizationId, document.id);
  const blockers = publishBlockers(provisions.map((p) => ({ text: p.text ?? null, review_state: stateOf(p), citation: p.citation ?? null })));
  if (!canPublish(blockers)) {
    throw createError({
      statusCode: 409,
      message: !blockers.provisions
        ? "This document has no provisions yet"
        : `Not ready to publish: ${blockers.unreviewed} not reviewed, ${blockers.illegible} still containing [illegible], ${blockers.uncited} with no citation`,
      data: blockers,
    });
  }

  await write(updateItem(DOCUMENTS as never, document.id, { status: "published" } as never));
  await writeGoverningAudit(await governingActor(event), {
    action: "publish",
    organization: organizationId,
    document: document.id,
    summary: `Published ${document.title ?? "a governing document"} with ${provisions.length} ${provisions.length === 1 ? "provision" : "provisions"}`,
    before: { status: document.status },
    after: {
      status: "published",
      provisions: provisions.length,
      reviewed: provisions.filter((p) => stateOf(p) === "reviewed").length,
      verified: provisions.filter((p) => stateOf(p) === "verified").length,
    },
  });
  return { id: document.id, status: "published" as const, provisions: provisions.length };
}

/**
 * Edit a document's own details (title, kind, book and page, dates). Never its
 * provisions. A reason is required when the document is published.
 */
export async function editGoverningDocument(event: H3Event, organizationId: string, documentId: string, edit: DocumentEdit, reason: string | null) {
  const document = await documentInOrg(organizationId, documentId);
  const bad = (message: string) => createError({ statusCode: 400, message });
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const set = (field: string, value: unknown) => {
    const current = document[field] ?? null;
    if (value === current) return;
    before[field] = current;
    after[field] = value;
  };

  if (edit.kind !== undefined) {
    if (!(DOCUMENT_KINDS as readonly string[]).includes(edit.kind)) throw bad("Unknown kind of document");
    set("kind", edit.kind);
  }
  for (const field of DOCUMENT_TEXT_FIELDS) {
    const value = edit[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") throw bad(`${field} must be text`);
    const text = (value ?? "").trim();
    if (field === "title" && !text) throw bad("A document needs a title");
    if (text.length > 500) throw bad(`${field} is too long`);
    set(field, text || null);
  }
  for (const field of DOCUMENT_DATE_FIELDS) {
    const value = edit[field];
    if (value === undefined) continue;
    if (value !== null && value !== "" && !(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)))) {
      throw bad(`${field} must be a date`);
    }
    // Directus may answer a date with a time part; compare the day only.
    const current = typeof document[field] === "string" ? (document[field] as string).slice(0, 10) : null;
    if ((value || null) !== current) set(field, value || null);
  }
  for (const field of DOCUMENT_NUMBER_FIELDS) {
    const value = edit[field];
    if (value === undefined) continue;
    if (value !== null && !(Number.isInteger(value) && value > 0)) throw bad(`${field} must be a page number`);
    set(field, value);
  }
  const start = ("or_page_start" in after ? after.or_page_start : document.or_page_start) as number | null | undefined;
  const end = ("or_page_end" in after ? after.or_page_end : document.or_page_end) as number | null | undefined;
  if (start != null && end != null && end < start) throw bad("The last page cannot come before the first");

  if (!Object.keys(after).length) return { id: document.id, changed: false };
  if (!isDraftStatus(document.status) && !reason) {
    throw createError({ statusCode: 400, message: "A reason is required to edit the details of a published document" });
  }

  const actor = await governingActor(event);
  await write(updateItem(DOCUMENTS as never, document.id, after as never));
  try {
    await writeGoverningAudit(actor, {
      action: "document_edit",
      organization: organizationId,
      document: document.id,
      summary: `Edited the details of ${(after.title as string | undefined) ?? document.title ?? "a governing document"}`,
      reason,
      before,
      after,
    });
  } catch (error) {
    // No edit without its audit row: put back what was there.
    await write(updateItem(DOCUMENTS as never, document.id, before as never)).catch(() => {});
    throw error;
  }
  return { id: document.id, changed: true };
}

/**
 * Take a published document back to draft: members stop seeing it, its
 * provisions and its flags, until it is published again. Nothing is deleted
 * and no provision changes. A reason is required.
 */
export async function unpublishGoverningDocument(event: H3Event, organizationId: string, documentId: string, reason: string | null) {
  const document = await documentInOrg(organizationId, documentId);
  if (document.status !== "published") throw createError({ statusCode: 409, message: "Only a published document can be unpublished" });
  if (!reason) throw createError({ statusCode: 400, message: "A reason is required to unpublish a document" });

  const actor = await governingActor(event);
  await write(updateItem(DOCUMENTS as never, document.id, { status: "draft" } as never));
  try {
    await writeGoverningAudit(actor, {
      action: "unpublish",
      organization: organizationId,
      document: document.id,
      summary: `Unpublished ${document.title ?? "a governing document"}`,
      reason,
      before: { status: "published" },
      after: { status: "draft" },
    });
  } catch (error) {
    await write(updateItem(DOCUMENTS as never, document.id, { status: "published" } as never)).catch(() => {});
    throw error;
  }
  return { id: document.id, status: "draft" as const };
}

/** Delete a draft: its provisions, its originals with their page images, then the document. Never a published one. */
export async function deleteGoverningDraft(event: H3Event, organizationId: string, documentId: string) {
  const document = await documentInOrg(organizationId, documentId);
  if (!isDraftStatus(document.status)) throw createError({ statusCode: 409, message: "Only a draft can be deleted" });

  const provisions = await provisionsOf(organizationId, document.id);
  const sources = await rows(SOURCES, { filter: { document: { _eq: document.id }, organization: { _eq: organizationId } }, fields: ["id"], limit: -1 });
  const actor = await governingActor(event);

  if (provisions.length) await write(deleteItems(PROVISIONS as never, provisions.map((p) => p.id) as never));
  for (const source of sources) await deleteGoverningSource(event, organizationId, document.id, source.id);
  await write(deleteItem(DOCUMENTS as never, document.id));

  // No `document` on the row: the document is gone. What it was is in `before`.
  await writeGoverningAudit(actor, {
    action: "document_delete",
    organization: organizationId,
    summary: `Deleted the draft "${document.title ?? document.id}" with ${provisions.length} ${provisions.length === 1 ? "provision" : "provisions"}`,
    before: { id: document.id, title: document.title, kind: document.kind, status: document.status, provisions: provisions.length, sources: sources.length },
    after: null,
  });
  return { ok: true, provisions: provisions.length, sources: sources.length };
}

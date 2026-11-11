// Governing documents: proposing provisions from an upload's pages
// (docs/prompts/governing-docs.md, Session 3A).
//
// This is the one place the app CREATES provisions, and it only creates: a
// document that already has a provision is refused, and there is no update
// call in this file, so an upload can never change the text of an existing
// provision (acceptance criterion 8; tests/server/governing-text-guard.test.ts
// holds this file to that). Each piece is an exact slice of a page's extracted
// text and is saved as `ocr_draft`, which members never see.
//
// Callers have already passed `requireGoverningManage`.

import { createItems, readItems } from "@directus/sdk";
import type { H3Event } from "h3";
import { proposeProvisions, type ProposalPage } from "#core/shared/governing/upload";
import { governingActor, writeGoverningAudit } from "./governing-audit";

const PROVISIONS = "hoa_governing_provisions";
const DOCUMENTS = "hoa_governing_documents";
const SOURCES = "hoa_governing_sources";
const PAGES = "hoa_governing_pages";
const BATCH = 100;

const asId = (v: unknown): string | null => (typeof v === "string" ? v : ((v as { id?: string } | null)?.id ?? null));
const rows = async (collection: string, query: Record<string, unknown>) =>
  ((await getTypedDirectus().request(readItems(collection as never, query as never))) ?? []) as any[];

/**
 * Cut the document's page text into draft provisions. Uses one source when
 * `sourceId` is given, otherwise every source of the document that has pages
 * (the copy the text is taken from first, then in the order attached).
 */
export async function proposeGoverningProvisions(event: H3Event, organizationId: string, documentId: string, sourceId?: string | null) {
  const inOrg = { organization: { _eq: organizationId } };
  const [document] = await rows(DOCUMENTS, { filter: { id: { _eq: documentId }, ...inOrg }, fields: ["id", "title"], limit: 1 });
  if (!document) throw createError({ statusCode: 404, message: "Document not found" });

  const existing = await rows(PROVISIONS, { filter: { document: { _eq: document.id }, ...inOrg }, fields: ["id"], limit: 1 });
  if (existing.length) {
    throw createError({ statusCode: 409, message: "This document already has provisions. An upload never replaces them." });
  }

  const sources = (await rows(SOURCES, { filter: { document: { _eq: document.id }, ...inOrg }, fields: ["id", "is_authoritative", "date_created"], limit: -1 }))
    .filter((s) => !sourceId || s.id === sourceId)
    .sort(
      (a, b) => Number(b.is_authoritative === true) - Number(a.is_authoritative === true) || String(a.date_created ?? "").localeCompare(String(b.date_created ?? ""))
    );
  if (!sources.length) throw createError({ statusCode: 404, message: "Original document not found" });

  const order = new Map(sources.map((s, i) => [s.id as string, i]));
  const pages = (await rows(PAGES, { filter: { source: { _in: [...order.keys()] }, ...inOrg }, fields: ["source", "page_number", "text", "extraction"], limit: -1 }))
    .map((p) => ({ source: asId(p.source)!, page_number: Number(p.page_number), text: (p.text ?? null) as string | null, extraction: p.extraction ?? null }))
    .sort((a, b) => order.get(a.source)! - order.get(b.source)! || a.page_number - b.page_number);

  const proposed = proposeProvisions(pages as ProposalPage[]);
  if (!proposed.length) throw createError({ statusCode: 409, message: "No page of this document has text yet. Prepare its pages first." });

  for (let i = 0; i < proposed.length; i += BATCH) {
    await getTypedDirectus().request(
      createItems(
        PROVISIONS as never,
        proposed.slice(i, i + BATCH).map((p) => ({
          organization: organizationId,
          document: document.id,
          source_key: p.source_key,
          sort: p.sort,
          original_label: p.original_label,
          text: p.text,
          review_state: "ocr_draft",
          block_type: "text",
        })) as never
      )
    );
  }

  const counts = {
    provisions: proposed.length,
    pages: pages.length,
    pages_from_text_layer: pages.filter((p) => p.extraction === "text_layer").length,
    pages_read_from_image: pages.filter((p) => p.extraction === "ocr").length,
    pages_without_text: pages.filter((p) => !(p.text ?? "").trim()).length,
  };
  await writeGoverningAudit(await governingActor(event), {
    action: "provisions_propose",
    organization: organizationId,
    document: document.id,
    summary: `Proposed ${proposed.length} draft ${proposed.length === 1 ? "provision" : "provisions"} for ${document.title ?? "a governing document"} from its uploaded pages`,
    after: { ...counts, sources: [...order.keys()], review_state: "ocr_draft" },
  });
  return counts;
}

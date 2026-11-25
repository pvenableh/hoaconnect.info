/**
 * The reads behind the assistant's starter chips (GET /api/ai/suggestions),
 * as batch specs, and the chips built from their rows.
 *
 * The route checked the caller's standing, then read an indexed document, a
 * published rule and the latest sent email one after another: four requests
 * in four rounds. These specs ride with the access snapshot as ONE request
 * (batchWithAccessSnapshot); the route still refuses before any row is used.
 */
import type { ReadSpec } from "./directus-graphql";

export type SuggestionKey = "sg_chunks" | "sg_rules" | "sg_emails";

/** The three grounding reads; the document read only when RAG is configured, as the route read it. */
export function suggestionSpecs(orgId: string, withDocs: boolean): Partial<Record<SuggestionKey, ReadSpec>> {
  const specs: Partial<Record<SuggestionKey, ReadSpec>> = {};
  if (withDocs) {
    specs.sg_chunks = { collection: "ai_doc_chunks", filter: { organization: { _eq: orgId } }, fields: ["source_title"], limit: 25 };
  }
  specs.sg_rules = {
    collection: "hoa_governance",
    filter: { organization: { _eq: orgId }, status: { _eq: "published" } },
    fields: ["title"],
    limit: 1,
  };
  specs.sg_emails = {
    collection: "hoa_emails",
    filter: { organization: { _eq: orgId }, status: { _eq: "sent" } },
    fields: ["subject"],
    sort: ["-sent_at"],
    limit: 1,
  };
  return specs;
}

const clip = (s: unknown, n = 72): string => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/**
 * The grounded chips, in order, from whichever reads ran: the first indexed
 * document's title, the first published rule, the latest sent email. A read
 * that did not run or failed is `undefined` and adds nothing.
 */
export function groundedChips(rows: {
  chunks?: { source_title?: string | null }[];
  rules?: { title?: string | null }[];
  emails?: { subject?: string | null }[];
}): string[] {
  const out: string[] = [];
  const titles = [...new Set((rows.chunks ?? []).map((c) => c.source_title).filter(Boolean))] as string[];
  if (titles[0]) out.push(`Summarize “${clip(titles[0])}”`);
  const rule = rows.rules?.[0]?.title;
  if (rule) out.push(`What do our rules say about ${clip(rule, 48)}?`);
  const subject = rows.emails?.[0]?.subject;
  if (subject) out.push(`What was “${clip(subject)}” about?`);
  return out;
}

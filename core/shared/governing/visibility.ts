/**
 * Who sees what (spec §7; acceptance criterion 7).
 *
 * A member sees published documents, their reviewed provisions, every original
 * file attached to a published document (Peter, 2026-11-10: all of them, each
 * labelled recorded or not), and flags an admin has confirmed. Drafts, documents in review, OCR drafts, and suggested
 * or dismissed flags are for people who manage governing documents.
 *
 * `visibleSnapshot` is the one place this is decided. Every read route builds
 * its answer from what this returns, so nothing can reach a member by a route
 * that forgot to filter.
 */
import type { GovDocument, GovFlag, GovProvision, GovSnapshot } from "./types";

export const MEMBER_DOCUMENT_STATUSES: ReadonlyArray<GovDocument["status"]> = ["published"];
export const MEMBER_REVIEW_STATES: ReadonlyArray<GovProvision["review_state"]> = ["reviewed", "verified"];
export const MEMBER_FLAG_STATUSES: ReadonlyArray<GovFlag["status"]> = ["confirmed", "counsel_confirmed"];

export function visibleSnapshot(all: GovSnapshot, canManage: boolean): GovSnapshot {
  if (canManage) return all;

  const documents = all.documents.filter((d) => MEMBER_DOCUMENT_STATUSES.includes(d.status));
  const documentIds = new Set(documents.map((d) => d.id));
  const provisions = all.provisions.filter((p) => documentIds.has(p.document) && MEMBER_REVIEW_STATES.includes(p.review_state));
  const provisionIds = new Set(provisions.map((p) => p.id));
  const links = all.links.filter((l) => provisionIds.has(l.from_provision) && provisionIds.has(l.to_provision));
  const flags = all.flags
    .filter((f) => MEMBER_FLAG_STATUSES.includes(f.status))
    .map((f) => ({ ...f, provisions: f.provisions.filter((id) => provisionIds.has(id)) }))
    .filter((f) => f.provisions.length > 0);

  const sources = all.sources.filter((s) => documentIds.has(s.document));

  return { documents, provisions, links, flags, sources };
}

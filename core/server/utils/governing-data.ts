// Reads behind /api/governing (docs/plan-governing-docs.md §4).
//
// Every answer is built from `loadGoverning`, which reads the organization's
// rows with the admin token and passes them through `visibleSnapshot`. That is
// the single point where drafts and unconfirmed flags are kept from members
// (acceptance criterion 7): a route cannot return a row this did not return.
//
// Nothing in this file writes. Provision text is read and handed on as stored.

import { readFiles, readItems } from "@directus/sdk";
import { formatCitation } from "#core/shared/governing/citation";
import { STALE_AFTER_DAYS, countByRelationship, sortFlags, staleReferences } from "#core/shared/governing/flags";
import { searchProvisions, type SearchFilters } from "#core/shared/governing/search";
import type { GovDocument, GovFlag, GovLink, GovPage, GovProvision, GovReference, GovSnapshot, GovSource } from "#core/shared/governing/types";
import { visibleSnapshot } from "#core/shared/governing/visibility";

const DOCUMENT_FIELDS = [
  "id", "title", "kind", "citation_prefix", "status", "sort", "or_book", "or_page_start", "or_page_end",
  "executed_on", "recorded_on", "clerk_file_no", "county", "amends", "transcriber_notes",
] as const;
const PROVISION_FIELDS = [
  "id", "document", "parent", "sort", "citation", "original_label", "heading", "text",
  "or_page_start", "or_page_end", "review_state", "block_type", "uncertain",
] as const;
const LINK_FIELDS = ["id", "from_provision", "to_provision", "type", "note"] as const;
const FLAG_FIELDS = [
  "id", "topic", "document_rule", "statute_rule", "statute_citation", "relationship", "severity", "note", "status", "origin", "quoted_text",
] as const;
const SOURCE_FIELDS = ["id", "document", "file", "is_recorded_copy", "is_authoritative", "notes", "page_count", "date_created"] as const;
// Never `text`: a page's extracted text is a draft, read only by the manage-only pages route.
const PAGE_FIELDS = ["id", "source", "page_number", "image", "extraction"] as const;
const REFERENCE_FIELDS = ["id", "jurisdiction", "code", "title", "summary", "url", "edition", "checked_on"] as const;

const pick = <K extends string>(row: any, fields: readonly K[]) => Object.fromEntries(fields.map((f) => [f, row[f] ?? null])) as Record<K, any>;
const idOf = (v: unknown): string | null => (typeof v === "string" ? v : ((v as { id?: string } | null)?.id ?? null));
/** The copy the text was taken from first, then recorded copies, then oldest first. */
const sourceOrder = (a: GovSource, b: GovSource) =>
  Number(b.is_authoritative) - Number(a.is_authoritative) ||
  Number(b.is_recorded_copy) - Number(a.is_recorded_copy) ||
  String(a.date_created ?? "").localeCompare(String(b.date_created ?? ""));
const bySort = (a: { sort: number | null }, b: { sort: number | null }) => (a.sort ?? 0) - (b.sort ?? 0);

async function read(collection: string, filter: Record<string, unknown>, fields: readonly string[]): Promise<any[]> {
  const directus = getTypedDirectus();
  return ((await directus.request(readItems(collection as any, { filter, fields: fields as any, limit: -1 } as any))) ?? []) as any[];
}

/** Everything the caller may see of an organization's governing documents. */
export async function loadGoverning(organizationId: string, canManage: boolean): Promise<GovSnapshot> {
  const org = { organization: { _eq: organizationId } };
  const [documentRows, provisionRows, linkRows, flagRows, sourceRows, pageRows] = await Promise.all([
    read("hoa_governing_documents", org, DOCUMENT_FIELDS),
    read("hoa_governing_provisions", org, PROVISION_FIELDS),
    read("hoa_governing_provision_links", org, LINK_FIELDS),
    read("hoa_statute_flags", org, FLAG_FIELDS),
    read("hoa_governing_sources", org, SOURCE_FIELDS),
    read("hoa_governing_pages", org, PAGE_FIELDS),
  ]);

  // The file's name, type and size live on the file, not on the source row.
  const fileIds = sourceRows.map((s) => idOf(s.file)).filter((id): id is string => !!id);
  const fileRows = fileIds.length
    ? (((await getTypedDirectus().request(
        readFiles({ filter: { id: { _in: fileIds } }, fields: ["id", "filename_download", "type", "filesize"], limit: -1 } as any)
      )) ?? []) as any[])
    : [];
  const files = new Map<string, any>(fileRows.map((f) => [f.id, f]));
  const sources: GovSource[] = sourceRows
    .filter((s) => idOf(s.file) && idOf(s.document))
    .map((s) => {
      const file = files.get(idOf(s.file)!);
      return {
        id: s.id,
        document: idOf(s.document)!,
        file: idOf(s.file)!,
        filename: file?.filename_download ?? null,
        type: file?.type ?? null,
        filesize: file?.filesize != null ? Number(file.filesize) : null,
        is_recorded_copy: s.is_recorded_copy === true,
        is_authoritative: s.is_authoritative === true,
        notes: s.notes ?? null,
        page_count: s.page_count ?? null,
        date_created: s.date_created ?? null,
      };
    })
    .sort(sourceOrder);

  const sourceDocument = new Map(sources.map((s) => [s.id, s.document]));
  const pages: GovPage[] = pageRows
    .filter((p) => sourceDocument.has(idOf(p.source) ?? ""))
    .map((p) => ({
      id: p.id,
      source: idOf(p.source)!,
      document: sourceDocument.get(idOf(p.source)!)!,
      page_number: Number(p.page_number),
      image: idOf(p.image),
      extraction: p.extraction === "text_layer" || p.extraction === "ocr" ? p.extraction : null,
    }))
    .sort((a, b) => a.page_number - b.page_number);

  const flagIds = flagRows.map((f) => f.id);
  const [flagProvisions, flagReferences] = flagIds.length
    ? await Promise.all([
        read("hoa_statute_flags_provisions", { flag: { _in: flagIds } }, ["flag", "provision", "sort"]),
        read("hoa_statute_flags_references", { flag: { _in: flagIds } }, ["flag", "reference", "sort"]),
      ])
    : [[], []];
  const referenceIds = [...new Set(flagReferences.map((r) => r.reference))];
  const referenceRows = referenceIds.length ? await read("hoa_statute_references", { id: { _in: referenceIds } }, REFERENCE_FIELDS) : [];
  const references = new Map<string, GovReference>(referenceRows.map((r) => [r.id, pick(r, REFERENCE_FIELDS) as GovReference]));

  const flags: GovFlag[] = flagRows.map((f) => ({
    ...(pick(f, FLAG_FIELDS) as Omit<GovFlag, "provisions" | "references">),
    provisions: flagProvisions.filter((j) => j.flag === f.id).sort(bySort).map((j) => j.provision),
    references: flagReferences
      .filter((j) => j.flag === f.id)
      .sort(bySort)
      .flatMap((j) => (references.has(j.reference) ? [references.get(j.reference)!] : [])),
  }));

  return visibleSnapshot(
    {
      documents: documentRows.map((d) => pick(d, DOCUMENT_FIELDS) as GovDocument).sort(bySort),
      provisions: provisionRows.map((p) => pick(p, PROVISION_FIELDS) as GovProvision).sort(bySort),
      links: linkRows.map((l) => pick(l, LINK_FIELDS) as GovLink),
      flags,
      sources,
      pages,
    },
    canManage
  );
}

const brief = (p: GovProvision) => ({ id: p.id, document: p.document, citation: p.citation, heading: p.heading });

export async function listGoverningDocuments(organizationId: string, canManage: boolean) {
  const { documents, provisions, flags } = await loadGoverning(organizationId, canManage);
  const flagged = new Set(flags.flatMap((f) => f.provisions));
  return documents.map(({ transcriber_notes: _notes, ...d }) => {
    const own = provisions.filter((p) => p.document === d.id);
    return { ...d, provision_count: own.length, flagged_count: own.filter((p) => flagged.has(p.id)).length };
  });
}

/** A document with its provisions in reading order. Null when the caller may not see it. */
export async function getGoverningDocument(organizationId: string, id: string, canManage: boolean) {
  const { documents, provisions, flags, sources, pages } = await loadGoverning(organizationId, canManage);
  const document = documents.find((d) => d.id === id);
  if (!document) return null;
  const title = (d: GovDocument) => ({ id: d.id, title: d.title, kind: d.kind, recorded_on: d.recorded_on });
  const flagCount = new Map<string, number>();
  for (const f of flags) for (const p of f.provisions) flagCount.set(p, (flagCount.get(p) ?? 0) + 1);
  const amends = documents.find((d) => d.id === document.amends);
  return {
    document,
    amends: amends ? title(amends) : null,
    amended_by: documents.filter((d) => d.amends === document.id).map(title),
    provisions: provisions.filter((p) => p.document === id).map((p) => ({ ...p, flag_count: flagCount.get(p.id) ?? 0 })),
    /** The original files behind this transcription. */
    sources: sources.filter((s) => s.document === id),
    /** Page images of those files, where they have been prepared. No extracted text. */
    pages: pages.filter((p) => p.document === id),
  };
}

/** A provision with its document, amendment chain and flags. Null when the caller may not see it. */
export async function getGoverningProvision(organizationId: string, id: string, canManage: boolean) {
  const { documents, provisions, links, flags, sources } = await loadGoverning(organizationId, canManage);
  const provision = provisions.find((p) => p.id === id);
  if (!provision) return null;
  const document = documents.find((d) => d.id === provision.document)!;
  const byId = new Map(provisions.map((p) => [p.id, p]));
  const siblings = provisions.filter((p) => p.document === provision.document);
  const at = siblings.findIndex((p) => p.id === id);
  const parent = provision.parent ? byId.get(provision.parent) : undefined;
  const amended = documents.find((d) => d.id === document.amends);

  return {
    provision,
    document,
    /** The document this provision's document amends, when the caller may see it. */
    document_amends: amended ? { id: amended.id, title: amended.title } : null,
    citation: formatCitation(provision, document),
    parent: parent ? brief(parent) : null,
    children: siblings.filter((p) => p.parent === id).map(brief),
    previous: at > 0 ? brief(siblings[at - 1]!) : null,
    next: at < siblings.length - 1 ? brief(siblings[at + 1]!) : null,
    links: links
      .filter((l) => l.from_provision === id || l.to_provision === id)
      .map((l) => {
        const outgoing = l.from_provision === id;
        const other = byId.get(outgoing ? l.to_provision : l.from_provision)!;
        return { id: l.id, type: l.type, note: l.note, direction: outgoing ? ("from" as const) : ("to" as const), other: brief(other), other_document_title: documents.find((d) => d.id === other.document)?.title ?? null };
      }),
    flags: sortFlags(flags.filter((f) => f.provisions.includes(id))),
    /** The original files behind this provision's document. */
    sources: sources.filter((s) => s.document === document.id),
  };
}

export async function searchGoverning(organizationId: string, query: unknown, filters: SearchFilters, canManage: boolean) {
  const snapshot = await loadGoverning(organizationId, canManage);
  const documents = new Map(snapshot.documents.map((d) => [d.id, d]));
  const flagsFor = new Map<string, GovFlag[]>();
  for (const f of snapshot.flags) for (const p of f.provisions) flagsFor.set(p, [...(flagsFor.get(p) ?? []), f]);
  return searchProvisions(snapshot, query, filters).map((hit) => {
    const document = documents.get(hit.provision.document)!;
    const { text: _text, ...provision } = hit.provision;
    return {
      provision,
      document: { id: document.id, title: document.title, kind: document.kind },
      citation: formatCitation(hit.provision, document),
      matched: hit.matched,
      excerpt: hit.excerpt,
      flags: sortFlags(flagsFor.get(hit.provision.id) ?? []).map((f) => ({ id: f.id, relationship: f.relationship, severity: f.severity })),
    };
  });
}

export async function governingOverview(organizationId: string, canManage: boolean, staleAfterDays: number = STALE_AFTER_DAYS) {
  const { documents, provisions, flags } = await loadGoverning(organizationId, canManage);
  const byId = new Map(provisions.map((p) => [p.id, p]));
  // Counted and listed as standing: confirmed flags. A suggestion waits in its own list until someone decides.
  const live = flags.filter((f) => f.status !== "dismissed" && f.status !== "suggested");
  const withProvisions = (f: GovFlag) => ({
    ...f,
    provisions: f.provisions.flatMap((p) => (byId.has(p) ? [brief(byId.get(p)!)] : [])),
  });
  return {
    document_count: documents.length,
    provision_count: provisions.length,
    flag_count: live.length,
    by_relationship: countByRelationship(live),
    open_questions: sortFlags(live.filter((f) => f.relationship === "counsel_review")).map(withProvisions),
    /** Managers only: flags waiting for a decision, and dismissed ones (so a dismissal can be undone). */
    suggested: canManage ? sortFlags(flags.filter((f) => f.status === "suggested")).map(withProvisions) : [],
    dismissed: canManage ? sortFlags(flags.filter((f) => f.status === "dismissed")).map(withProvisions) : [],
    /** Managers only: statute references that should be read again (spec §5, freshness). */
    stale_references: canManage ? staleReferences(flags.filter((f) => f.status !== "dismissed"), new Date(), staleAfterDays) : [],
    stale_after_days: staleAfterDays,
    can_manage: canManage,
  };
}

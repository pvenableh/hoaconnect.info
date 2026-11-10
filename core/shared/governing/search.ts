/**
 * Provision search (spec §6; acceptance criterion 2).
 *
 * Ranked in code over the provisions the caller may see: an organization has a
 * few hundred, so no index is needed. Order of evidence:
 *
 *   1. the query is the citation            "By-Law 3.5", "bylaw 3.5", "Decl. 12.3"
 *   2. the query is the citation's number   "3.5"  (every document's 3.5, in document order)
 *   3. the query begins the citation        "By-Law 3"
 *   4. every word is in the heading
 *   5. every word is in the text
 *
 * Matching reads the text; it never changes it. The excerpt is a slice of the
 * stored string.
 */
import type { GovDocument, GovFlag, GovProvision, Relationship, Severity } from "./types";

export const MIN_QUERY = 2;
export const MAX_QUERY = 64;

export type SearchFilters = {
  document?: string;
  kind?: string;
  hasFlags?: boolean;
  relationship?: Relationship;
  severity?: Severity;
};

export type SearchHit = {
  provision: GovProvision;
  score: number;
  matched: "citation" | "heading" | "text" | "filter";
  /** A verbatim slice of the text around the first match, when the match is in the text. */
  excerpt: { text: string; clippedStart: boolean; clippedEnd: boolean } | null;
};

/** "By-Law 3.5" → "bylaw 3.5"; "Decl. 12.3" → "decl 12.3". For comparing, never for display. */
export function normalizeCitation(value: string): string {
  return value
    .toLowerCase()
    .replace(/-/g, "")
    .replace(/[^a-z0-9.¶ ]+/g, " ")
    .replace(/\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The number a citation ends in: "By-Law 3.5" → "3.5". */
export function citationNumber(citation: string): string | null {
  return /(\d+(?:\.\d+)*)\s*$/.exec(citation)?.[1] ?? null;
}

export function normalizeQuery(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY);
}

function excerptAround(text: string, at: number, length: number): SearchHit["excerpt"] {
  const start = Math.max(0, at - 80);
  const end = Math.min(text.length, at + length + 160);
  return { text: text.slice(start, end), clippedStart: start > 0, clippedEnd: end < text.length };
}

function score(p: GovProvision, query: string): Pick<SearchHit, "score" | "matched" | "excerpt"> | null {
  // Compared without spaces, so "By Law 3.5" and "bylaw3.5" both find "By-Law 3.5".
  const q = normalizeCitation(query).replace(/ /g, "");
  const citation = normalizeCitation(p.citation ?? "").replace(/ /g, "");
  if (q && citation === q) return { score: 1000, matched: "citation", excerpt: null };
  if (q && /^\d+(\.\d+)*$/.test(q) && citationNumber(p.citation ?? "") === q) return { score: 900, matched: "citation", excerpt: null };
  // "By-Law 3" leads to 3.1, 3.2 …, and not to By-Law 30.
  if (q && /\d$/.test(q) && citation.startsWith(q) && citation.charAt(q.length) === ".") {
    return { score: 700, matched: "citation", excerpt: null };
  }

  const words = query.toLowerCase().split(" ").filter(Boolean);
  if (!words.length) return null;
  const heading = (p.heading ?? "").toLowerCase();
  if (heading && words.every((w) => heading.includes(w))) {
    return { score: heading === query.toLowerCase() ? 600 : 500, matched: "heading", excerpt: null };
  }

  const text = p.text ?? "";
  const lower = text.toLowerCase();
  if (words.every((w) => lower.includes(w))) {
    const phrase = lower.indexOf(query.toLowerCase());
    const at = phrase !== -1 ? phrase : lower.indexOf(words[0]!);
    let occurrences = 0;
    for (let i = lower.indexOf(words[0]!); i !== -1 && occurrences < 10; i = lower.indexOf(words[0]!, i + 1)) occurrences++;
    return {
      score: (phrase !== -1 ? 200 : 100) + occurrences,
      matched: "text",
      excerpt: excerptAround(text, at, phrase !== -1 ? query.length : words[0]!.length),
    };
  }
  return null;
}

export function searchProvisions(
  input: { documents: GovDocument[]; provisions: GovProvision[]; flags: GovFlag[] },
  rawQuery: unknown,
  filters: SearchFilters = {}
): SearchHit[] {
  const query = normalizeQuery(rawQuery);
  const documents = new Map(input.documents.map((d) => [d.id, d]));
  const flagsFor = new Map<string, GovFlag[]>();
  for (const f of input.flags) for (const id of f.provisions) flagsFor.set(id, [...(flagsFor.get(id) ?? []), f]);

  const wantsFlags = filters.hasFlags || filters.relationship || filters.severity;
  const pool = input.provisions.filter((p) => {
    const document = documents.get(p.document);
    if (!document) return false;
    if (filters.document && p.document !== filters.document) return false;
    if (filters.kind && document.kind !== filters.kind) return false;
    if (wantsFlags) {
      const flags = flagsFor.get(p.id) ?? [];
      if (!flags.length) return false;
      if (filters.relationship && !flags.some((f) => f.relationship === filters.relationship)) return false;
      if (filters.severity && !flags.some((f) => f.severity === filters.severity)) return false;
    }
    return true;
  });

  // No query: the filters alone are the search ("everything with a counsel_review flag").
  const hasFilter = Object.values(filters).some(Boolean);
  let hits: SearchHit[];
  if (query.length < MIN_QUERY) {
    hits = hasFilter ? pool.map((provision) => ({ provision, score: 0, matched: "filter" as const, excerpt: null })) : [];
  } else {
    hits = pool.flatMap((provision) => {
      const s = score(provision, query);
      return s ? [{ provision, ...s }] : [];
    });
  }

  const order = (p: GovProvision) => [documents.get(p.document)?.sort ?? 0, p.sort ?? 0] as const;
  return hits.sort((a, b) => {
    const [ad, ap] = order(a.provision);
    const [bd, bp] = order(b.provision);
    return b.score - a.score || ad - bd || ap - bp;
  });
}

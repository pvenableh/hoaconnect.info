/**
 * Display helpers for the governing-documents pages. Nothing here touches
 * provision text except `splitHighlight`, which only cuts a string into
 * pieces that join back to exactly the same string.
 */
import type { GovDocument, GovProvision, GovSource, LinkType } from "./types";

const KIND_LABELS: Record<string, string> = {
  declaration: "Declaration",
  articles: "Articles of incorporation",
  bylaws: "By-laws",
  rules: "Rules",
  prospectus: "Prospectus",
  amendment: "Amendment",
  other: "Other",
};

/** A kind the list does not know is shown as stored. */
export function kindLabel(kind: string | null | undefined): string {
  if (!kind) return "Document";
  return KIND_LABELS[kind] ?? kind;
}

const STATUS_LABELS: Record<GovDocument["status"], string> = {
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  superseded: "Superseded",
};

export function statusLabel(status: GovDocument["status"]): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * How a link reads from the provision being viewed. `from` means this
 * provision is the one doing the amending.
 */
/** What a member is told about an original file: recorded or not, and whether the text came from it. */
export function sourceLabels(source: Pick<GovSource, "is_recorded_copy" | "is_authoritative">): string[] {
  return [source.is_recorded_copy ? "Recorded copy" : "Unrecorded copy", ...(source.is_authoritative ? ["Source of the text"] : [])];
}

export function linkLabel(type: LinkType, direction: "from" | "to"): string {
  const outgoing = direction === "from";
  switch (type) {
    case "amends":
      return outgoing ? "Amends" : "Amended by";
    case "replaces":
      return outgoing ? "Replaces" : "Replaced by";
    case "adds_to":
      return outgoing ? "Adds to" : "Added to by";
    case "conflicts_with":
      return "Conflicts with";
    default:
      return type;
  }
}

/** A stored calendar date (YYYY-MM-DD) in words, with no time-zone shift. */
export function formatRecordDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** "O.R. Book 9640, Pages 300–301", or as much of it as is recorded. */
export function formatBookAndPage(
  book: string | null | undefined,
  start: number | null | undefined,
  end: number | null | undefined
): string {
  const parts: string[] = [];
  if (book) parts.push(`O.R. Book ${book}`);
  if (start != null) parts.push(end != null && end !== start ? `Pages ${start}–${end}` : `Page ${start}`);
  return parts.join(", ");
}

/** How deep a provision sits under its parents, for indenting a table of contents. */
export function provisionDepths(provisions: Array<Pick<GovProvision, "id" | "parent">>): Map<string, number> {
  const parentOf = new Map(provisions.map((p) => [p.id, p.parent]));
  const depths = new Map<string, number>();
  for (const p of provisions) {
    let depth = 0;
    let at = p.parent;
    const seen = new Set<string>([p.id]);
    while (at && parentOf.has(at) && !seen.has(at)) {
      seen.add(at);
      depth++;
      at = parentOf.get(at) ?? null;
    }
    depths.set(p.id, depth);
  }
  return depths;
}

export type HighlightPart = { text: string; match: boolean };

/**
 * Cut `text` around case-insensitive occurrences of `query` so a page can
 * mark them. The parts always join back to `text` exactly.
 */
export function splitHighlight(text: string, query: string): HighlightPart[] {
  const needle = query.trim().toLowerCase();
  if (!text) return [];
  if (!needle) return [{ text, match: false }];
  const haystack = text.toLowerCase();
  // Lower-casing can change a string's length for a few characters; then the
  // offsets would not line up, so show the text unmarked.
  if (haystack.length !== text.length) return [{ text, match: false }];
  const parts: HighlightPart[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

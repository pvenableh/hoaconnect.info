/**
 * Governing documents: the review rules (docs/prompts/governing-docs.md,
 * Session 3B). Pure: no Directus, no browser. The server enforces these and the
 * review screen shows them.
 *
 * Peter's decisions, 2026-11-10:
 *  - any manager may mark a provision reviewed and then verified (verified is
 *    a second pass, not necessarily a second person);
 *  - a text edit, a split or a merge sets a draft's provision back to ocr_draft;
 *  - a provision that still contains [illegible] cannot be marked reviewed;
 *    [signature], [seal] and [drawing] may stay in published text;
 *  - a document is published only when every provision is reviewed or verified.
 *
 * Nothing here changes text. `splitText` only cuts, and its pieces joined are
 * the original exactly; `mergeText` is the exact concatenation.
 */
import type { DocumentStatus, ReviewState } from "./types";

/** What the OCR writes in place of something it does not transcribe. */
export const OCR_MARKERS = ["[illegible]", "[signature]", "[seal]", "[drawing]"] as const;
export type OcrMarker = (typeof OCR_MARKERS)[number];
/** The marker that stands for words nobody has read yet. */
export const BLOCKING_MARKER: OcrMarker = "[illegible]";

export type MarkerHit = { marker: OcrMarker; index: number };

/** Every marker in the text, in order. */
export function findMarkers(text: string | null | undefined): MarkerHit[] {
  const value = text ?? "";
  const hits: MarkerHit[] = [];
  for (const marker of OCR_MARKERS) {
    for (let at = value.indexOf(marker); at !== -1; at = value.indexOf(marker, at + marker.length)) hits.push({ marker, index: at });
  }
  return hits.sort((a, b) => a.index - b.index);
}

export const countMarkers = (text: string | null | undefined): Record<OcrMarker, number> => {
  const counts = { "[illegible]": 0, "[signature]": 0, "[seal]": 0, "[drawing]": 0 } as Record<OcrMarker, number>;
  for (const hit of findMarkers(text)) counts[hit.marker] += 1;
  return counts;
};

export const hasBlockingMarker = (text: string | null | undefined) => (text ?? "").includes(BLOCKING_MARKER);

/** Cut the text into runs of plain text and markers, for highlighting. Joined, the runs are the text exactly. */
export function splitAtMarkers(text: string | null | undefined): { text: string; marker: OcrMarker | null }[] {
  const value = text ?? "";
  const parts: { text: string; marker: OcrMarker | null }[] = [];
  let from = 0;
  for (const hit of findMarkers(value)) {
    if (hit.index > from) parts.push({ text: value.slice(from, hit.index), marker: null });
    parts.push({ text: hit.marker, marker: hit.marker });
    from = hit.index + hit.marker.length;
  }
  if (from < value.length) parts.push({ text: value.slice(from), marker: null });
  return parts;
}

/** The moves a manager may make. Reopening is always allowed. */
export const REVIEW_MOVES: Record<ReviewState, ReviewState[]> = {
  ocr_draft: ["reviewed"],
  reviewed: ["verified", "ocr_draft"],
  verified: ["ocr_draft"],
};
export const REVIEW_STATES: ReviewState[] = ["ocr_draft", "reviewed", "verified"];
export const isReviewState = (v: unknown): v is ReviewState => (REVIEW_STATES as unknown[]).includes(v);
export const REVIEW_STATE_LABELS: Record<ReviewState, string> = { ocr_draft: "Draft", reviewed: "Reviewed", verified: "Verified" };

/** Statuses in which a document's provisions may be split, merged, reordered, and the document deleted or published. */
export const isDraftStatus = (status: DocumentStatus | null | undefined) => status === "draft" || status === "in_review";

/** The two pieces of a split, or null when the cut is not strictly inside the text. No trim: a + b is the text. */
export function splitText(text: string, at: number): [string, string] | null {
  if (!Number.isInteger(at) || at <= 0 || at >= text.length) return null;
  return [text.slice(0, at), text.slice(at)];
}

export const mergeText = (first: string, second: string) => first + second;

/**
 * Where a draft provision came from: "upload:<source>:<page>:<n>" (a split
 * piece keeps its page and adds a suffix after <n>). Null for anything else,
 * such as an imported provision.
 */
export function parseUploadKey(sourceKey: string | null | undefined): { source: string; page_number: number } | null {
  const parts = (sourceKey ?? "").split(":");
  if (parts.length < 4 || parts[0] !== "upload") return null;
  const page = Number(parts[2]);
  return parts[1] && Number.isInteger(page) && page > 0 ? { source: parts[1]!, page_number: page } : null;
}

export type PublishBlockers = { provisions: number; unreviewed: number; illegible: number };

/** What stands between a draft and publishing. All zero (and at least one provision) means it may be published. */
export function publishBlockers(provisions: { text: string | null; review_state: ReviewState }[]): PublishBlockers {
  return {
    provisions: provisions.length,
    unreviewed: provisions.filter((p) => p.review_state === "ocr_draft").length,
    illegible: provisions.filter((p) => hasBlockingMarker(p.text)).length,
  };
}
export const canPublish = (b: PublishBlockers) => b.provisions > 0 && b.unreviewed === 0 && b.illegible === 0;

/**
 * A text box shows every line break as "\n", so a stored "\r\n" is one
 * character there. These two let the review screen tell whether the reviewer
 * changed anything, and turn a cursor position in the box into a position in
 * the stored text, without the stored text ever being rewritten.
 */
export const asShownInTextBox = (stored: string) => stored.replace(/\r\n?/g, "\n");
export function storedOffset(stored: string, shownOffset: number): number {
  let shown = 0;
  let i = 0;
  while (i < stored.length && shown < shownOffset) {
    i += stored[i] === "\r" && stored[i + 1] === "\n" ? 2 : 1;
    shown += 1;
  }
  return i;
}

/**
 * Governing documents: the upload flow's limits and the proposal rule
 * (docs/prompts/governing-docs.md, Session 3A).
 *
 * Pure: no Directus, no browser. The server and the page share the numbers.
 */

/** Vercel refuses a request body over 4.5 MB, so a file goes up in parts this size. */
export const UPLOAD_PART_BYTES = 3 * 1024 * 1024;
/** What one part request may carry (the part plus form overhead stays under 4.5 MB). */
export const UPLOAD_PART_MAX_BYTES = 4 * 1024 * 1024;
/** The largest original the join will hold in memory. The largest Lenox scan is 13.5 MB. */
export const UPLOAD_MAX_BYTES = 64 * 1024 * 1024;
export const UPLOAD_MAX_PARTS = Math.ceil(UPLOAD_MAX_BYTES / UPLOAD_PART_BYTES);
/** One rendered page image, one request. */
export const PAGE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const PAGE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Width the browser renders a page to: legible for reading and for OCR, a few hundred KB as a JPEG. */
export const PAGE_IMAGE_WIDTH = 1600;
/** A text layer shorter than this (non-space characters) is a scan's stray marks, not the page's text. */
export const TEXT_LAYER_MIN_CHARS = 40;

/** What a document can be. The same list as the `kind` field's choices. */
export const DOCUMENT_KINDS = ["declaration", "articles", "bylaws", "amendment", "rules", "prospectus", "other"] as const;

/**
 * Tokens an old scan-to-text pass leaves behind: a replacement character, symbols that do not occur in
 * an association's documents (`<>|~^{}\\@*=`), or a colon, semicolon or `!` in the middle of a word.
 * Measured on the 1977 typescript, whose own text layer reads `admini\uFFFDterinq`, `l!D<ZNS`, `LENOX:PLAZA`.
 */
const GARBLED_TOKEN = /[\uFFFD<>|~^{}\\@*=]|[A-Za-z][!:;][A-Za-z]/;
/** A text layer with at least this share of garbled tokens (and at least two) is not trusted over a reading of the image. */
export const TEXT_LAYER_MAX_GARBLED_SHARE = 0.01;

/** The share of a text layer's words that are garbled, and how many. */
export function textLayerNoise(text: string | null | undefined) {
  const tokens = (text ?? "").split(/\s+/).filter(Boolean);
  const garbled = tokens.filter((t) => GARBLED_TOKEN.test(t)).length;
  return { tokens: tokens.length, garbled, share: tokens.length ? garbled / tokens.length : 0 };
}

/**
 * Whether a PDF's own text layer is worth keeping over reading the page image. Long enough, and not
 * riddled with the marks of a poor earlier pass: those pages are left for "Read Scanned Pages" instead,
 * which matched 99.75% of the words on the same typescript where this layer matched 88% to 92%.
 */
export const hasUsableTextLayer = (text: string | null | undefined) => {
  if ((text ?? "").replace(/\s/g, "").length < TEXT_LAYER_MIN_CHARS) return false;
  const noise = textLayerNoise(text);
  return !(noise.garbled >= 2 && noise.share >= TEXT_LAYER_MAX_GARBLED_SHARE);
};

/**
 * True when RGBA pixels hold nothing but near-white: a page the reader could not
 * draw (a JPEG 2000 scan it cannot decode comes out white), or a page that is
 * really empty. Either way there is nothing to read, so no credits are spent on it.
 * Checks every `stride`-th pixel; a few specks of dark in a page are enough to say it is not blank.
 */
export function looksBlank(rgba: ArrayLike<number>, stride = 7): boolean {
  const step = Math.max(1, Math.floor(stride)) * 4;
  for (let i = 0; i + 2 < rgba.length; i += step) {
    if (rgba[i]! < 200 || rgba[i + 1]! < 200 || rgba[i + 2]! < 200) return false;
  }
  return true;
}

export const partCount =(bytes: number) => Math.max(1, Math.ceil(bytes / UPLOAD_PART_BYTES));

export type ProposalPage = { source: string; page_number: number; text: string | null };

export type ProposedProvision = {
  /** Stable per source, page and position, so a provision can be traced to its page image. */
  source_key: string;
  sort: number;
  /** The label as printed at the start of the piece, e.g. "ARTICLE IV", ".5", "Section 3." Null for text before the first heading on a page. */
  original_label: string | null;
  /** An exact slice of the page's text. */
  text: string;
  page_number: number;
};

/**
 * A line that starts a provision. Each pattern captures the label as printed.
 * Deliberately plain: a miss is fixed in the review screen, where pieces are
 * split and merged by hand.
 */
const HEADING_LINES: RegExp[] = [
  /^[ \t]*(ARTICLE[ \t]+[IVXLC\d]+)\b/i,
  /^[ \t]*(SECTION[ \t]+\d+(?:\.\d+)*)[.:)]?(?=[ \t]|$)/i,
  /^[ \t]*([IVXLC]+\.)[ \t]+\S/,
  /^[ \t]*(\d+(?:\.\d+)*\.?)[ \t]+\S/,
  /^[ \t]*(\.\d+)[ \t]+\S/,
  /^[ \t]*(\([a-z0-9]{1,3}\))[ \t]+\S/i,
];

const headingLabel = (line: string): string | null => {
  for (const pattern of HEADING_LINES) {
    const match = pattern.exec(line);
    if (match) return match[1]!;
  }
  return null;
};

/**
 * Cut each page's text at its heading lines. A piece never crosses a page, so
 * the pieces of a page, joined, are that page's text exactly: nothing is
 * trimmed, reflowed or added. A page with no heading is one piece. A piece of
 * only white space is dropped (there is nothing in it to review).
 */
export function proposeProvisions(pages: ProposalPage[]): ProposedProvision[] {
  const out: ProposedProvision[] = [];
  let sort = 0;
  for (const page of pages) {
    const text = page.text ?? "";
    if (!text.trim()) continue;

    // Where each line starts, keeping its own line ending with it.
    const cuts: Array<{ at: number; label: string | null }> = [{ at: 0, label: null }];
    let at = 0;
    for (const line of text.split(/(?<=\n)/)) {
      const label = headingLabel(line);
      if (label && at > 0) cuts.push({ at, label });
      else if (label) cuts[0] = { at: 0, label };
      at += line.length;
    }

    let piece = 0;
    cuts.forEach((cut, i) => {
      const slice = text.slice(cut.at, cuts[i + 1]?.at ?? text.length);
      if (!slice.trim()) return;
      piece += 1;
      sort += 1;
      out.push({
        source_key: `upload:${page.source}:${page.page_number}:${piece}`,
        sort,
        original_label: cut.label,
        text: slice,
        page_number: page.page_number,
      });
    });
  }
  return out;
}

/**
 * Governing documents: the row shapes the server hands to pages
 * (docs/plan-governing-docs.md §3). Relations are ids, not nested rows.
 */

export type DocumentStatus = "draft" | "in_review" | "published" | "superseded";
export type ReviewState = "ocr_draft" | "reviewed" | "verified";
export type LinkType = "amends" | "replaces" | "adds_to" | "conflicts_with";
export type Relationship = "statute_controls" | "statute_supplements" | "document_controls" | "consistent" | "counsel_review";
export type Severity = "info" | "low" | "medium" | "high";
export type FlagStatus = "suggested" | "confirmed" | "dismissed" | "counsel_confirmed";

export type GovDocument = {
  id: string;
  title: string | null;
  kind: string | null;
  citation_prefix: string | null;
  status: DocumentStatus;
  sort: number | null;
  or_book: string | null;
  or_page_start: number | null;
  or_page_end: number | null;
  executed_on: string | null;
  recorded_on: string | null;
  clerk_file_no: string | null;
  county: string | null;
  amends: string | null;
  transcriber_notes: string | null;
};

export type GovProvision = {
  id: string;
  document: string;
  parent: string | null;
  sort: number | null;
  citation: string | null;
  original_label: string | null;
  heading: string | null;
  /** Verbatim. Display it as it is; never transform it. */
  text: string | null;
  or_page_start: number | null;
  or_page_end: number | null;
  review_state: ReviewState;
  block_type: string | null;
  uncertain: boolean | null;
};

export type GovLink = { id: string; from_provision: string; to_provision: string; type: LinkType; note: string | null };

export type GovReference = {
  id: string;
  jurisdiction: string | null;
  code: string | null;
  title: string | null;
  summary: string | null;
  url: string | null;
  edition: string | null;
  checked_on: string | null;
};

export type GovFlag = {
  id: string;
  topic: string | null;
  document_rule: string | null;
  statute_rule: string | null;
  statute_citation: string | null;
  relationship: Relationship;
  severity: Severity;
  note: string | null;
  status: FlagStatus;
  origin: "curated" | "ai_suggested";
  /** Provision ids this flag is about. */
  provisions: string[];
  references: GovReference[];
};

/** An original file behind a document's transcription: the recorded scan, or another copy. */
export type GovSource = {
  id: string;
  document: string;
  /** Directus file id. Open it through the asset proxy, which checks the caller again. */
  file: string;
  filename: string | null;
  type: string | null;
  filesize: number | null;
  is_recorded_copy: boolean;
  /** The copy the published text was taken from. */
  is_authoritative: boolean;
  notes: string | null;
  page_count: number | null;
  date_created: string | null;
};

/**
 * One page of an original: its image, and whether text has been taken from it.
 * The extracted text itself is an unreviewed draft and is not in the snapshot;
 * managers read it through the pages route.
 */
export type GovPage = {
  id: string;
  source: string;
  document: string;
  page_number: number;
  /** Directus file id of the page image. Open it through the asset proxy. */
  image: string | null;
  /** How the page's text was obtained, or null while it has none. */
  extraction: "text_layer" | "ocr" | null;
};

export type GovSnapshot = {
  documents: GovDocument[];
  provisions: GovProvision[];
  links: GovLink[];
  flags: GovFlag[];
  sources: GovSource[];
  pages: GovPage[];
};

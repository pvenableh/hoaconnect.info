# HOA Connect: Governing Documents and Statute Flags

Feature spec. Written from a real import: the six recorded instruments of Lenox Plaza Association, Inc. (1033 Lenox Avenue, Miami Beach, 28 units), which are the seed data in this bundle.

## 1. Goal

An association uploads its official governing documents. HOA Connect stores the exact text, breaks it into citable provisions, makes it searchable, and shows next to each provision where current state law may conflict with it, add to it, or defer to it.

Three outcomes:

1. **Find the rule.** A board member types "proxies" or "By-Law 3.5" and gets the exact recorded words with a book-and-page citation.
2. **Trust the text.** What the app shows is the recorded instrument, word for word. It is never a paraphrase.
3. **See the statute.** Each provision carries flags that say what Chapter 718 does on that point, with a link to the statute and a clear status.

## 2. What the Lenox import taught us

These are requirements, not background. Each one came from a real failure or near miss.

| Lesson | What happened | Requirement |
|---|---|---|
| AI summaries drift | An earlier AI "cleaned" version of these documents renumbered articles, invented four articles and two by-laws, changed "majority" to "all", "50%" to "one-third", and dropped most of the financial rules. | Canonical text is verbatim only. Summaries, if ever shown, are a separate field, labeled, and never searchable as if they were the rule. |
| Copies differ | An unrecorded draft said "1530 Penn Corp." and "twelve apartments". The recorded copy was corrected to "1033 Lenox Corp." and "twenty-eight apartments". | Every document records its source: recorded or unrecorded, book and page, clerk's file number. Recorded copies outrank all others. Allow several source files per document and record which one is authoritative. |
| Typos are evidence | The originals contain errors ("Poxies", "cloring", a blank section number). | Never auto-correct. Store transcriber's notes per document so a reader can tell an original error from an import error. |
| Page cites matter | Boards and lawyers cite book and page. | Every provision stores the recorded page range it spans. |
| Amendments do not merge themselves | A 1978 amendment rewrites Section 11 and bans leasing. A 1994 amendment sets rental rules without mentioning the ban. | Model amendments as separate documents linked to the provisions they touch. Show the chain. Do not produce a merged "current text" automatically. |
| Sub-numbering is odd | The By-Laws number sub-sections ".1", ".2" with the section number implied. | Store the original label and a normalized citation ("By-Law 3.5"). Search both. |
| Not everything is text | Surveys, floor plans, seals, signatures, handwriting. | Support non-text blocks: a description plus a link to the page image. Mark handwritten or uncertain readings. |
| Scans are bad | A 1978 photocopy was barely legible; OCR misread names and numbers. | OCR output is a draft. Nothing is published until a person has reviewed it. Keep a per-provision review state. |
| "Overrides" is not one thing | Some statute sections write themselves into the by-laws; some defer to the documents; some may not reach a 1976 declaration at all. | Flags carry a relationship type (section 5), not a yes/no. |
| Statutes move | Florida amended Chapter 718 in 2024, 2025 and 2026. One page we read was a 2024 edition. | Every statute reference stores the edition and the date it was checked. Stale references are surfaced. |

## 3. Data model

Names are suggestions. Fit them to the repo's existing conventions and its organization model.

**GoverningDocument** (belongs to Organization)
- `title`, `kind` (declaration, articles, bylaws, amendment, rules, prospectus, other)
- `citation_prefix` ("By-Law", "Decl.", "Art.")
- `executed_on`, `recorded_on`, `or_book`, `or_page_start`, `or_page_end`, `clerk_file_no`, `county`
- `amends` (document it amends, if any)
- `status` (draft, in_review, published, superseded)
- `transcriber_notes` (markdown)

**DocumentSource** (belongs to GoverningDocument)
- uploaded file (PDF or image), `is_recorded_copy`, `is_authoritative`, `notes`, page count
- page images for side-by-side review

**Provision** (belongs to GoverningDocument)
- `citation` ("By-Law 3.5"), `original_label` (".5"), `heading`, `order`, `parent`
- `text` (verbatim), `text_format` (markdown)
- `or_page_start`, `or_page_end`
- `review_state` (ocr_draft, reviewed, verified), `reviewed_by`, `reviewed_at`
- `block_type` (text, execution, exhibit, drawing)

**ProvisionLink** (amendment relationships)
- `from_provision`, `to_provision`, `type` (amends, replaces, adds_to, conflicts_with), `note`

**StatuteReference** (shared library, per jurisdiction)
- `jurisdiction`, `code` ("718.112(2)(b)"), `title`, `summary`, `url`, `edition`, `checked_on`

**StatuteFlag** (joins Provisions to a StatuteReference)
- `topic`, `document_rule`, `statute_rule`
- `relationship` (see section 5), `severity` (info, low, medium, high)
- `note`, `status` (suggested, confirmed, dismissed, counsel_confirmed), `confirmed_by`
- `origin` (curated, ai_suggested)

**Organization** additions
- `state`, `regime` (condominium, hoa, coop), `governing_statute`
- `incorporates_future_amendments` (boolean, nullable) and a note. In Florida this is the "as amended from time to time" question. It changes how every substantive flag should be read.

## 4. Import pipeline

1. **Upload.** PDF or images, per document. Capture the metadata in section 3. Ask whether the copy is recorded.
2. **Extract.** Use the embedded text layer when there is one; otherwise OCR. Keep per-page text and page images.
3. **Structure.** Convert to markdown with page markers. Detect sections and sub-sections and propose provisions. The seed files show the target shape.
4. **Review.** A side-by-side screen: page image on the left, editable text on the right, provision boundaries adjustable. Reviewer marks each provision reviewed. Uncertain readings can be flagged.
5. **Publish.** Only reviewed documents are searchable by ordinary members. Drafts are visible to admins.
6. **Flag.** After publishing, run statute matching (section 5) and queue suggested flags for confirmation.

Also support **direct import** of already-transcribed content: a manifest plus provisions JSON plus markdown, which is exactly what `seed/` contains. Build this path first. It is the fastest way to get real data in and it exercises the whole read side.

## 5. Statute flags

**Relationship types**

| Value | Meaning | How to show it |
|---|---|---|
| `statute_controls` | The statute sets a rule the documents cannot vary, or deems it part of the by-laws. | "State law now governs this point." |
| `statute_supplements` | The documents are silent or thinner; the statute adds requirements. | "State law adds requirements." |
| `document_controls` | The statute defers to the documents. | "Your documents govern." |
| `consistent` | Both say the same. | Quiet check mark. |
| `counsel_review` | Unclear which governs, or enforceability is in doubt. | "Ask counsel." Most prominent. |

**How flags are produced**

- **Curated first.** A hand-reviewed library of statute rules by topic (elections, proxies, notices, budget, reserves, records, bonding, collections, fines, leasing, amendments). `seed/statute_flags.json` is the first 43 entries, built for Florida Chapter 718.
- **AI-assisted matching second.** For a new organization, an LLM may propose which provisions each library rule touches and draft the `document_rule` line. Proposals are `origin: ai_suggested`, `status: suggested`, and stay hidden from ordinary members until an admin confirms them.
- **Guardrails for the AI step.** It may only cite statute references that exist in the library. It quotes the provision text it relied on. It never edits provision text. It never invents a statute section. If nothing in the library fits, it proposes nothing.
- **Never legal advice.** Every flag view carries a short notice: a working comparison, confirm with association counsel. `counsel_confirmed` is a distinct status an admin sets after a lawyer signs off.
- **Freshness.** Show the edition and checked date on each statute reference. Provide an admin view of references older than a set age.

## 6. Search and reading

- Full-text search across published provisions, scoped to the organization. Rank exact citation matches first ("By-Law 3.5", "Decl. 12.3", "3.5").
- Filters: document, kind, has flags, relationship type, severity.
- Provision page: verbatim text, citation, recorded book and page, source document, amendment chain, statute flags, link to the page image.
- Document page: table of contents, continuous reading view with page markers, transcriber's notes.
- Copy-citation button that yields, for example: `By-Law 3.5, O.R. Book 9640, Page 300`.
- Organization overview: counts by relationship type, and the list of `counsel_review` flags as an open-questions list.

## 7. Permissions

- Members: read published documents and confirmed flags.
- Board and admins: upload, review, publish, confirm or dismiss flags.
- Keep an audit trail for text edits and flag status changes. This text is what people will quote in disputes.

## 8. Seed data in this bundle

| File | Contents |
|---|---|
| `seed/manifest.json` | The organization and its 7 documents with recording data. |
| `seed/provisions.json` | 209 provisions with citation, heading, verbatim text and page range. |
| `seed/statute_flags.json` | 43 curated flags with relationship, severity, statute reference, source URL and edition. |
| `seed/documents/*.md` | The full transcriptions, with page markers and transcriber's notes. Conventions are in `seed/documents/00_README.md`. |

Known limits of the seed: a few provisions were split by script and have rough boundaries (signature blocks, the brochure page). Two statute pages were read in older editions and are marked. Treat the seed as reviewed text with a few items still to verify, and import provisions as `reviewed`, not `verified`.

## 9. Acceptance criteria

1. The 1033 Lenox organization shows 7 governing documents and 209 provisions after the seed import, and the import is idempotent.
2. Searching "proxies" returns By-Law 3.5 first; searching "By-Law 6.5" or "fidelity" returns the fidelity bond provision.
3. By-Law 3.5 reads exactly as in `provisions.json`, including "Poxies".
4. By-Law 6.5 shows a `statute_controls` flag citing 718.111(11)(h) with a working link and edition.
5. The organization overview lists the `counsel_review` flags.
6. The 1978 amendment's paragraph 7 is linked to Declaration Section 11, and the 1978 and 1994 leasing provisions are linked as `conflicts_with`.
7. A member account cannot see drafts or unconfirmed AI suggestions.
8. No code path rewrites provision text except an explicit, audited admin edit.
9. Uploading a new PDF creates a draft document with per-page text and page images, and nothing from it is searchable by members until published.

## 10. Out of scope for now

- Automatic merged "as amended" text.
- Monitoring statutes for changes automatically.
- Comparing an unofficial copy against the official one (a good later feature: this bundle's history is the use case).
- Jurisdictions other than Florida, beyond keeping `jurisdiction` in the model.

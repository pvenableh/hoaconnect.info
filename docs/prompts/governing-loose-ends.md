Finish what the governing-documents build left open. Start a session with
"Read docs/prompts/governing-loose-ends.md and do Session N." Do that session only, commit locally, report, and stop.

The feature is built and deployed. These sessions check it, measure it, and close three gaps. Nothing here adds a
feature. Suggested model is on each session; they can run in any order, one at a time.

## Rules that hold everywhere

`docs/prompts/governing-docs.md` has the full rules ("Rules that hold everywhere", "Token discipline"). Read those two
sections and the last three bullets of its "Where things stand", nothing else in it. The ones that bite here:

- **Provision text is verbatim.** It changes only through `core/server/utils/governing-review.ts`, which audits.
- **Members never see drafts or unconfirmed suggestions**, enforced on the server.
- `.env` points at the production-domain Directus and holds live keys. Never print a value. **Every Directus write
  needs Peter's yes for that action in that session**, and so does anything that spends AI credits.
- **The agent never types a password.** When a check needs a signed-in session, ask Peter to sign in in the Browser
  pane, then carry on. Do not treat "no session" as a reason to skip the check: ask.
- Before deleting anything, read it and check it is what you expect.
- Work on main. It auto-deploys, so NOTHING is pushed unless Peter says so in that session.
- Node first: `eval "$(/opt/homebrew/bin/brew shellenv zsh)"; eval "$(fnm env --shell zsh)"; fnm use 22.22.1`
- Full gates once, at the end, in the background, reading each one's own exit code: `pnpm test`, `pnpm lint`
  (≤148 warnings), `pnpm audit:all`, `NODE_OPTIONS=--max-old-space-size=6144 pnpm typecheck`.
- Dev server: `preview_start {name: "hoaconnect"}`; port 3002; about 20 seconds before the first navigate. A
  "what's new" sheet covers screenshots: prove UI work with page text (`javascript_tool`, `get_page_text`).
- The Browser pane cannot upload a local file. Serve the folder from a tiny local server with a CORS header for
  `http://localhost:3002`, fetch the file in the page, and POST it (see "Known traps" under Session 3A).
- Ask Peter decisions in one `AskUserQuestion` batch (≤4), recommendation first. Summaries ≤8 lines.

## Where things stand (2026-11-11)

- `origin/main` is at `9fe6525`, pushed 2026-11-11 with Peter's word, and live on `www.hoaconnect.info`: the four
  newest routes (`audit.get`, `documents/[id].patch`, `documents/[id]/unpublish.post`, `flags/[id].patch`) answered
  404 until the deploy landed about six minutes later, and now refuse a signed-out caller with 401.
- Gates at `9fe6525`: 169 files / 3,038 tests, lint 0 errors and 139 warnings, 16 audits green, typecheck 0.
- 1033 Lenox on the hosted Directus: 7 published documents, 209 provisions, no draft. Page rows and images exist for
  the 1995 Amendment only (2 pages).
- **One AI suggestion is waiting, undecided:** on the 1995 Amendment, the sentence "Attached is new SURVEY AND SITE
  PLAN including revised reserved parking spaces." matched to `718.110(1), (3), (4)`. It is Peter's to confirm, edit
  or dismiss.
- **Verifying takes a second person** (`c276122`): the recorded reviewer is refused with 409. Peter confirmed this on
  2026-11-11 over his earlier "same person may do both". A provision with no recorded reviewer (the import) may be
  verified by any manager. Editing the text of a published provision makes the editor its reviewer.
- `docs/prompts/launch-followups.md` is untracked and belongs to another track. Leave it alone.
- `gh` and `vercel` are not installed on this Mac. A deploy is confirmed by probing a route that is new in the push.

Each session appends its own "Session N done" bullet here.

- **Session 1 done (2026-11-11), no code changed.** Dev server on port 3000 this time. Signed in by Peter as Oscar
  (Directus role HOA Member, `hoa_members` role HOA Admin: that alone makes a manager) and as Obie (plain member).
  Checks, seen unless noted:
  - Change history: seen. All 27 rows have labels and the right actor (Peter for the Nov 10 runs, Oscar for today's);
    diffs read for text edit, split, flag status, review state; the kind filter and its empty state work. A merge's
    diff shows its `pieces` as raw JSON (readable, not pretty). **Paging not checked:** 27 rows, under the page of 50.
  - Document details: seen. Fields filled; Save disabled without a reason; edited the clerk's file number and put it
    back, two audit rows.
  - Suggested flag: seen. Edit form opens (relationship, severity, three texts), cancelled unsaved; the counsel
    sign-off asks who gave it and stays disabled until filled, cancelled. The suggestion is still undecided.
  - Page image turn and zoom: seen (turn by 90°, zoom 100/150/200, floor 100%). **Drag-to-reorder not checked:**
    handles and arrows are present on a draft, but dragging writes and was not approved; reorder, split and merge
    exist only on drafts.
  - Transcriber's notes: seen, a five-item list.
  - Unpublish and republish of the 1995 Amendment: done; audit rows for both, with reasons.
  - Member check as Obie: seen. 6 documents and 207 provisions while the 1995 Amendment was a draft, no Upload,
    Review, Edit Text, Suggest Flags, change history, "Waiting for a decision" or suggestion; `/governing/audit` and
    `/governing/review/<id>` show refusals; `/api/governing/audit` and the review route answered 403, the draft 404;
    a search for the draft's words found only published documents. **The count of 7 after republishing was not
    re-checked as a member** (same filter; the manager list shows 7).
  - Note for later sessions: governing API calls need `orgId` as a query parameter (the page sends it); the app's
    View as Admin/Member/Public switch only hides manager controls and is not a member check.
  - **Two small follow-ups fixed afterwards:** a merge's `pieces` in the change history now read as "Piece 1 / Piece 2"
    (details, then the text exactly as stored) through `auditValue` in `core/shared/governing/audit.ts`, with tests;
    the member-preview banner and the Member button now say that admin controls are hidden but admin access stays.
    Gates after: 169 files / 3,041 tests, lint 0 errors and 139 warnings, 16 audits green, typecheck 0.
- **Session 2 done (2026-11-11).** Signed in as Oscar on the dev server (port 3001). Credits spent: 266 in all, from a
  balance of 199,704 (Suggest Flags 121, OCR 145 of which 16 bought nothing, see below).
  - **Suggest Flags on the By-Laws:** 51 provisions against 33 references, one call to `claude-opus-4-8`, 121 credits.
    11 suggestions saved and 6 dropped, every drop `already_flagged` (the model keeps proposing pairs a curated flag
    already holds; the drop is the guard working). All 11 are `counsel_review` / `info` with the provision's own words
    as the quote, and are left undecided for Peter (12 are waiting in all, with the 1995 Amendment's). By reading:
    about 4 look like real links (2.4 voting representative, 3.1 annual meeting, 3.3 posting notice, 6.2 budget notice)
    and about 7 look like noise (2.3, 3.3 against a board-meeting reference, 3.4, 3.5, 3.8, 4.12, 4.1). The cause is
    not the prompt: **the 8 references behind them have no title and no summary in the library**, so the model judged
    from a code alone, and three of those codes mean something else in the curated flags (3.4 quorum and 3.5 proxies
    were matched to `718.112(2)(e)` codes the curators use for the budget; 3.8 and 4.12 minutes to `718.111(13)`, the
    annual financial report, when the curated flag for the same provisions already links `718.111(12)`, official
    records). A reading of the statute is counsel's, not this session's: treat the split as a first look. No prompt
    change made. If wanted: add to `SUGGEST_SYSTEM` "A reference with no title and no summary tells you only its code.
    Report such a pair only when you are certain what that exact subsection covers", but filling the library's
    titles and summaries (curators' words, not invented) would do more.
  - **OCR on the 1977 typescript:** pages 12-14 first. **Finding 1:** the file already carries a text layer on pages
    12 and 13 (an old poor OCR), so the app uses it and never reads those pages: against the transcription it matches
    236 of 257 and 264 of 300 words (91.8% and 88.0%), with garbled marks such as `admini�terinq`, `mernbersh�p`.
    **Finding 2 (bug):** page 14 rendered as a blank white image and "Read Scanned Pages" read it anyway, got empty
    text and charged 16 credits. Cause: that page's scan is JPEG 2000 (`JPXDecode`) and the bundled pdf.js has no
    `wasmUrl` for its OpenJPEG decoder, so it draws nothing and says nothing. 49 of this file's 57 pages are JPX; the
    recorded scans (the ones the other six originals are) are plain JPEG and unaffected. Redone on pages 15, 16, 17,
    18 and 20 (plain JPEG, no text layer; approved by Peter): 129 credits for 5 pages (26 each), 1,593 words in the
    transcription, 1,589 matched (99.75%), zero `[illegible]`. Every difference: `designee- directors`, `Declara- tion`
    (line-end hyphens kept as printed, where the transcription joins them), `shall.` for `shall` on page 17 (a speck
    after the word in the image; the transcription drops it), and the blank line in "Section ____ of the Declaration"
    on page 16, which the reading leaves out without a marker. The typed attorney footer and page number on each
    page are read too; the transcription leaves them out. Both test drafts deleted with Delete Draft; the document,
    original and page images answer 404; the list shows no test draft.
  - **Fix made (Peter's choice): a blank-page guard.** `looksBlank` in `core/shared/governing/upload.ts` (tested);
    Prepare Pages warns when a page draws white, and Read Scanned Pages checks each stored image first and skips a
    blank one with a warning, so no credits are spent. Seen working in the pane on a white and a marked image.
  - **Two follow-ups fixed afterwards (Peter: "fix these").**
    1. **JPEG 2000 pages now draw.** The `unpdf` build strips pdf.js's OpenJPEG, JBIG2 and ICC decoders (their loaders are
       empty functions, so `wasmUrl` does nothing there). The page renderer now uses the official `pdfjs-dist@5.6.205`
       (new dependency, exact version, the one `unpdf` bundles; its worker comes in with `?url`) and passes
       `wasmUrl: "/pdfjs/wasm/"`; `public/pdfjs/wasm/` holds `openjpeg.wasm`, `jbig2.wasm`, `qcms_bg.wasm` (about 450 KB,
       fetched only when a page needs one) and their licences, copied unchanged from that package; `public/pdfjs/README.md`
       says to copy again when the version moves. `unpdf` stays for the server (page counts, RAG). Checked in the pane
       without storing anything: all 57 pages of the 1977 file render (none blank, 4 seconds in all, largest image 787 KB
       against the 4 MB limit), and the clean-text board copy PDF still gives page text.
    2. **A poor text layer no longer beats OCR.** `hasUsableTextLayer` now also refuses a layer where at least 2 words and
       1% of words are garbled marks (a replacement character, one of `<>|~^{}\\@*=`, or `!`, `:`, `;` inside a word);
       `textLayerNoise` is exported and tested on lines copied from the 1977 layer, and a clean legal paragraph (`e.g.`,
       `p.m.`, `$25.00`, `5%`, a URL) stays usable. Result on the 1977 file: pages 10, 12 and 13 lose their text layer and
       are read from the image instead, so all 57 pages now go to Read Scanned Pages: expect about 57 x 26 = 1,500 credits
       for the whole file (measured 26 per page on this typescript). Pages already stored keep what they have; this
       applies to pages prepared from now on.
  - **Open:** nothing from Session 2.

---

## Session 1 — see every screen, signed in · mid model

No code unless a screen is broken. No Directus write except the ones listed, each with Peter's yes.

**Ask Peter first, in one batch:** to sign in on the dev server in the Browser pane (and, if he is willing, on
`www.hoaconnect.info`); whether he has a real member login to use, or will make a test member himself; what to do
with the waiting AI suggestion (confirm, edit then confirm, dismiss, or leave); and whether the reversible writes
below may be made on a published document.

Screens built on 2026-11-11 that **nobody has seen rendered**:
- Change history: `app/pages/[slug]/governing/audit.vue`. Every action shows a label, not a raw name; the
  before/after diff reads correctly for a `text_edit`, a `provision_split` and a `flag_status`; paging works past 50.
  The rows from the 3B and 4 real runs are in there (upload, propose, split, merge, edit, review states, draft
  delete, `flags_suggest`): confirm they are, with the right actor.
- Document details on the review screen: `app/components/Governing/DocumentDetails.vue`.
- Editing a suggested flag, and the counsel sign-off asking who gave it: `app/components/Governing/StatuteFlag.vue`.
- The review screen's page image turning and zooming, and drag-to-reorder.
- Transcriber's notes laid out as headings and lists on the reading view.

Reversible writes worth one pass each, with Peter's yes: edit a document detail and put it back; unpublish and
republish the 1995 Amendment (it has 2 provisions, both cited; check the audit rows and that a member cannot see it
in between).

**Member check, the one thing tests cannot give:** signed in as a real member, confirm the list shows 7 documents,
no Upload, no Review or Edit Text, no Suggest Flags, no change history, no "Waiting for a decision"; that
`/governing/audit` and `/governing/review/<id>` refuse; and that the routes answer 403 from that session
(`/api/governing/audit`, `/api/governing/documents/<id>/review`).

Done: a table of each screen and check with seen / broken / not checked and why, fixes for anything broken, gates if
code changed, "Session 1 done" appended.

## Session 2 — measure the two AI steps · mid model

Both spend 1033 Lenox's AI credits and write to the hosted Directus. **Ask Peter first, in one batch:** approval and
a credit ceiling for each; which pages of the 1977 typescript to read.

- **Suggest Flags on the By-Laws.** It has the most curated flags, so it is the best comparison. Run it once from the
  page. Report: suggestions saved and dropped (with reasons, from the `flags_suggest` audit row), credits, and for
  each suggestion whether a curated flag already links that provision to a nearby reference. Pairs that already have
  a flag are skipped by design, so what comes back is what the curators did not flag: judge whether those are real
  links or noise. Leave every suggestion undecided for Peter and say how many there are. If most are noise, propose
  a prompt change in `SUGGEST_SYSTEM` (`core/server/utils/governing-suggest.ts`) and show it before applying.
- **OCR on the 1977 typescript.** `~/Projects/1033/documents/1977-Lenox Plaza CORPORATION-CERTIFICATE.pdf` has the
  By-Laws on pages 12 to 24. Make a test draft from a few of those pages (split the PDF locally; do not upload all
  57), run Prepare Pages and Read Scanned Pages, and compare each page's text with the hand transcription word by
  word, as the 3A real run did. Report words matched, every difference, every `[illegible]`, and credits per page.
  Never read `seed/provisions.json` whole; use `jq`. **Delete the test draft at the end** with Delete Draft and
  confirm the document and its file answer 404.

Done: the two sets of numbers, any prompt change with before and after, gates if code changed, "Session 2 done".

## Session 3 — close three gaps · strong model

**Ask Peter first, in one batch,** how he wants each handled; recommendations below.

1. **Page images and image originals are readable straight from Directus by anyone holding the file id**, because the
   public policy serves `image/*`. The app never hands a member a draft's file id and the asset proxy refuses it, so
   this needs a leaked or guessed uuid, but a draft's scan should not depend on that. Find how the repo keeps other
   files private (PDFs are; see `core/server/utils/governing-sources.ts` and the asset proxy
   `core/server/api/directus/assets/[id].get.ts`) and what the public policy matches on. Recommend the smallest
   change that makes these files private without touching unrelated images, show Peter the dry run, and ask before
   any Directus permission or folder change. Existing files (the 7 originals are PDFs; the 2 page images of the 1995
   Amendment are JPEGs) must be covered too.
2. **A provision cannot cross a page.** A section that runs over is two drafts, and merging them joins the texts with
   nothing between. Options: leave it and document that the reviewer merges and adds the break by an edit
   (recommended: it is already possible and audited); or have the merge of two pieces from different pages offer to
   insert a line break, recorded in the audit row. If the second, the exact-concatenation tests change on purpose.
3. **No edit screen for `amends`, the transcriber's notes and the transcription.** `amends` drives the amendment
   chain members see. Recommend adding `amends` to `editGoverningDocument` (audited, reason on a published
   document) and leaving the other two alone.

Also in this session: bring `docs/prompts/governing-docs.md` up to date (its newest bullet still says "NOT pushed").

Done: each gap closed or explicitly left with Peter's reason, tests for anything changed, the text guard still
passing, full gates, "Session 3 done", and a final list of anything still open.

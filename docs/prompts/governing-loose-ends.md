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

# Plan: governing documents and statute flags

Session 0 output, 2026-11-10. Spec: `docs/governing-docs/SPEC_governing-documents.md`. Session prompts:
`docs/prompts/governing-docs.md`. Nothing is built yet. §7 holds Peter's decisions.

## 1. What the repo is

- Nuxt app that extends a Nuxt layer in `core/` (`nuxt.config.ts:8`). Directus back end, hosted; `.env` points at it.
  pnpm, vitest (happy-dom), eslint, `pnpm audit:all`.
- **Layout:** pages and components in `app/`; composables in `core/app/composables/useXxx.ts`; server routes in
  `core/server/api/`; guards and data helpers in `core/server/utils/`; pure logic in `core/shared/<domain>/`
  (imported as `#core/shared/...`); generated types in `core/types/directus.ts`.
- **Orgs and roles:** `hoa_organizations` (has `slug`, `state`, `type` residential/commercial, `folder`).
  `hoa_members.role` is a Directus role (HOA Admin, Member, Property Manager; ids in runtime config). Board office is a
  current-term `hoa_board_members` row, not a role. Guards in `core/server/utils/admin-auth.ts`:
  `requireMembership(event, orgId)`, `requireAdminAccess(event, orgId)`, `requireAppAdmin`. Board:
  `board-access.ts` `getBoardPosition`, `resolveActors` + the matrix in `core/shared/permissions.ts`. Org comes from
  `getOrgContext` / `requireOrgId` (`org-context.ts`).
- **Two data paths.** (a) Browser → `/api/directus/items` proxy with the user's token, so Directus row permissions
  enforce access (`useDirectusItems`). (b) Server routes with the static admin token (`getTypedDirectus()`) behind a
  guard (ops console, org storage).
- **Schema changes** are tsx scripts run by hand against the hosted Directus. Newest template:
  `scripts/create-ops-audit-log.ts` (read-only by default, `--apply` writes, diffs collections/fields/relations and
  creates only what is missing). Then `pnpm generate:types`. There are no migration files.
- **1033 Lenox** is `hoa_organizations.slug = "1033-lenox"` (`scripts/migrate-1033.ts:54`). That script's
  `upsert(collection, match, data)` on natural keys plus `--dry` is the idempotency precedent.
- **Files:** Directus files under a per-org folder tree (`core/server/utils/org-storage.ts`), uploaded through
  `core/server/api/org/storage/upload.post.ts`, read through the authenticated proxy
  `core/server/api/directus/assets/[id].get.ts`, which maps file → org via `file-owner.ts`.
- **Search:** Spotlight (`core/shared/search/index.ts`, `_icontains`, staff-only record search) and a client
  `_icontains` search in `useGovernance`. No ranking, no full-text index anywhere.
- **Audit precedent:** `ops_audit_log` (`ops-audit.ts`, before/after, idempotency key) and `org_audit_log`
  (`audit-log.ts`, three fixed event types). Both append-only with zero role permissions.
- **AI:** `@anthropic-ai/sdk` via `core/server/utils/anthropic.ts` and `llm/provider.ts`; per-org wallet in
  `ai-wallet.ts`; model tiers in `core/shared/ai/credits.ts`. RAG (`rag-ingest.ts`) embeds `hoa_governance` and
  `hoa_documents`.
- **PDF:** `unpdf` (text layer) and `sharp` are installed. No OCR library. No markdown renderer.
- **Tests:** server routes with `MemoryDirectus` (`tests/server/support/memory-directus.ts`; no `_icontains`) and
  stubbed h3 globals, template `tests/server/ops-console.test.ts`. Pure functions in `tests/shared/`. Scripts are
  tested through extracted pure functions.

## 2. Where the spec fights the repo

1. **`hoa_governance` already exists** (`scripts/create-governance-collection.ts`, `useGovernance`,
   `app/pages/[slug]/rules/`): title, section number, summary, TipTap rich-text content, category
   bylaw/rule/ccr/policy/guideline, and it feeds the AI assistant's RAG. It is the paraphrase-friendly shape the spec
   warns about: HTML content, a summary field, no source, no pages, no review state. **Proposed:** leave it alone as
   house rules and policies; build governing documents as new collections with their own section. Do not migrate or
   delete anything in it. Whether 1033 Lenox has rows there (possibly the old "cleaned" version) is unknown; checking
   is a production read, to be done with a yes in Session 1A.
2. **Member visibility.** The repo's usual member path is Directus row permissions through the generic proxy. That
   would also let an HOA Admin PATCH provision text through the proxy with no audit row. **Proposed:** grant **no
   role any permission** on the new collections (as `ops_audit_log` does) and serve everything from guarded server
   routes. Drafts and suggestions are then filtered in one place, testable with `MemoryDirectus`, and the audited
   edit route is the only writer of `text`.
3. **Markdown.** The spec stores markdown; the repo renders rich text as TipTap HTML and has no markdown renderer.
   **Proposed:** render provision text as plain text with `white-space: pre-wrap`. No dependency, and nothing
   transforms the words. Transcriber's notes get the same treatment in Phase 1.
4. **Search.** `_icontains` cannot rank citation matches first. **Proposed:** the search route loads the org's
   published provisions (209 rows for Lenox) and ranks them with a pure function. No index, no dependency. Revisit
   if an org passes a few thousand provisions.
5. **"Board and admins."** HOA Admin is a role; board is not. **Proposed:** add `governing:read` and
   `governing:manage` to `core/shared/permissions.ts` and resolve through `resolveActors`. See §7 for who gets manage.
6. **Seed vs spec shape.** Found in the seed:
   - A flag can point at several provisions (10 of 43 do) → flag↔provision junction.
   - `statute_ref` can be null (2 flags), compound (`718.112(2)(k); 718.111(14)`) or a case citation → flag keeps the
     verbatim string and links to zero or more library references.
   - URL and edition are given per section (8 sources), not per subsection; no titles or summaries. Reference
     `title`/`summary` stay null (not invented). Three sources carry "recheck" editions; these are stored verbatim
     and surface in the stale view.
   - No `original_label`, `parent`, `block_type`, or flag `status` in the seed. Parent is derived only where the id
     says so (`decl:11.1` → `decl:11`). `original_label` stays null (TODO). `block_type` defaults to `text`.
   - The org block has `kaufman_language: false` and a note → `incorporates_future_amendments = false` plus the note
     verbatim. `original_statute_cited` gets its own field.
7. **RAG.** The assistant would not know about provisions. Out of scope for these phases; if added later, published
   provisions only, verbatim chunks.

## 3. Data model here

All org-scoped collections have `organization` (M2O `hoa_organizations`) and standard Directus system fields.

| Spec | Collection | Notes |
|---|---|---|
| GoverningDocument | `hoa_governing_documents` | spec fields; `amends` self M2O; `status` draft/in_review/published/superseded; `source_key` (e.g. `decl`); `transcription` (full .md, verbatim, never searched) |
| DocumentSource | `hoa_governing_sources` | `document`, `file` (Directus file), `is_recorded_copy`, `is_authoritative`, `notes`, `page_count` |
| page images/text | `hoa_governing_pages` | Phase 3: `source`, `page_number`, `image` (file), `text` |
| Provision | `hoa_governing_provisions` | spec fields; `source_key` (e.g. `bylaws:3.5`); `sort` for order; `parent` self M2O |
| ProvisionLink | `hoa_governing_provision_links` | `from_provision`, `to_provision`, `type`, `note` |
| StatuteReference | `hoa_statute_references` | shared, no org; unique (`jurisdiction`, `code`); `url`, `edition`, `checked_on` |
| StatuteFlag | `hoa_statute_flags` | spec fields; `statute_citation` verbatim; `source_key` |
| flag ↔ provision | `hoa_statute_flags_provisions` | junction |
| flag ↔ reference | `hoa_statute_flags_references` | junction |
| audit | `hoa_governing_audit_log` | append-only: `action`, actor, `provision`/`flag`/`document`, `before`, `after`, `occurred_at` |

`hoa_organizations` additions (all nullable): `regime`, `governing_statute`, `original_statute_cited`,
`incorporates_future_amendments`, `incorporates_future_amendments_note`. `state` already exists.

Idempotency keys: documents and provisions on (`organization`, `source_key`); references on (`jurisdiction`, `code`);
flags on (`organization`, `source_key` = topic slug + provision ids); links on (`from`, `to`, `type`); junction rows on
their pair.

Seed import defaults, for Peter to veto:
- Documents `published`; provisions `reviewed` (spec §8); flags `origin: curated`, `status: confirmed` so members see
  them under the notice. The seed's own disclaimer says every flag still needs counsel.
- Links: each amendment → Declaration at document level (`amends`); `amend-1978:¶7` → `decl:11` as `amends`;
  `amend-1978:¶6` (the leasing ban) → `amend-1994:¶1` as `conflicts_with`. ¶5 (which deletes the lease-approval
  clause) is not linked unless Peter wants it.

## 4. Code layout

- **Scripts:** `scripts/create-governing-docs.ts` (`pnpm run create:governing-docs`, read-only unless `--apply`);
  `scripts/seed-governing-docs-1033.ts` (`--dry` default-style as in `migrate-1033`); mapping in
  `scripts/lib/governing-import.ts` (pure).
- **Shared:** `core/shared/governing/` — `search.ts` (normalize citation, rank), `citation.ts` (copy-citation
  string), `visibility.ts` (what a member may see), `flags.ts` (relationship labels from spec §5, ordering with
  `counsel_review` first).
- **Server:** `core/server/utils/governing-data.ts`, `governing-access.ts`; routes under `core/server/api/governing/`:
  `documents.get`, `documents/[id].get`, `provisions/[id].get`, `search.get`, `overview.get`; later
  `flags/[id]/status.post`, `provisions/[id]/text.post` (the only text writer), `upload.post`, `documents/[id]/publish.post`.
- **Client:** `core/app/composables/useGoverningDocs.ts`; components in `app/components/Governing/`; pages
  `app/pages/[slug]/governing/{index,search}.vue`, `[document].vue`, `provisions/[id].vue`; admin pages under
  `app/pages/[slug]/admin/governing/`. Nav entry in `core/app/composables/useAppNav.ts` beside Documents and Rules.

## 5. Tests per acceptance criterion

| # | Test |
|---|---|
| 1 | `tests/scripts/governing-import.test.ts`: map the real seed → 7 documents, 209 provisions; apply twice to a memory store, counts unchanged |
| 2 | `tests/shared/governing-search.test.ts` on the real seed: "proxies" → By-Law 3.5 first; "By-Law 6.5", "fidelity" → `bylaws:6.5` |
| 3 | same import test: `bylaws:3.5` text strictly equals the JSON string and contains "Poxies" |
| 4 | `tests/server/governing-read.test.ts`: provision route for By-Law 6.5 returns a `statute_controls` flag, `718.111(11)(h)`, non-empty URL and edition |
| 5, 6 | route tests for overview and links; checked in the browser |
| 7 | `tests/server/governing-visibility.test.ts`: as a member, every read route returns no draft/in_review document, none of its provisions, no `suggested`/`dismissed` flag |
| 8 | `tests/server/governing-text-guard.test.ts`: source scan proves only `provisions/[id]/text.post.ts` (and the import lib) write `text`; route test proves an edit writes an audit row with before/after and a member gets 403 |
| 9 | Session 3A route test: upload → draft + pages; member search empty |

## 6. Build order

As in `docs/prompts/governing-docs.md`: 1A schema + import → 1B routes + search → 1C pages → 2 flags UI and
overview → 3A upload/extract → 3B review/publish/audit → 4 assisted flagging.

Open for later sessions:
- **3A page images and OCR.** `unpdf` covers the text layer. Rendering PDF pages to images on the server needs a
  canvas dependency and must fit Vercel function limits; rendering in the browser with pdf.js and uploading the
  images avoids that. OCR candidates: Claude vision through the existing Anthropic integration (no new dependency,
  spends the org wallet), tesseract.js (new dependency, weak on poor scans), or an external OCR API. Ask at 3A.
- **4.** Reuse `llm/provider.ts` and `ai-wallet.ts`; load the `claude-api` skill first.

## 7. Decisions (Peter, 2026-11-10)

1. **New collections.** `hoa_governing_*` and a separate Governing Documents section. `hoa_governance` and the Rules
   page stay untouched.
2. **Server routes only.** No Directus role gets any permission on the new collections. Every read and write goes
   through a guarded server route.
3. **Manage = HOA Admins, current-term board members, property managers with the `documents` grant, App Admins.**
   Everyone else with an active membership reads published documents and confirmed flags.
4. **Search ranks in the server route** with a pure function over the org's published provisions.

Not yet decided (asked when reached): the seed import defaults in §3 (flags as `confirmed`, link types); OCR and
page-image approach (Session 3A).

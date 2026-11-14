# Responsibilities register — Phase 2b, first slice

Model: Opus 5.5 (`claude-opus-5-5`), high effort, for the spec, schema and routes (commits 1–5). Sonnet 5.5 for the pages (commits 6–9). Census and grep go to Haiku 5.5 subagents.

Run this after Phase 1b (capability nav) and Phase 2 (resource scaffold) have shipped. Deadline: the 1033 Lenox board is seated 2026-12-09 and needs the grid and the PDF.

```
Build Phase 2b of the role-first UX programme: the responsibilities register,
first slice. Read docs/plan-role-first-ux.md §2.1, §2.3, §3.4 (all of it,
including "History: end, don't erase"), the Phase 2b row of §4, and §7 with
its Session log. Read docs/ux-standards.md before any UI. Do not read the
rest of the plan.

Local session: work on main, ask before pushing. Tool shells may have no
node/pnpm: run `eval "$(/usr/local/bin/fnm env)"` in every one when fnm is
at that path. Never run a schema script against production: write it, dry-run
it, and list it under operator TODOs.

What exists (do not rebuild):
- RoleContext, AREAS in core/shared/transition/grants.ts, the capability nav
  registry (Phase 1b), the resource scaffold AppResourceIndex / useResource
  (Phase 2). If Phase 2 has not shipped, stop and ask; the fallback is
  AppDataTable directly.
- hoa_board_members { hoa_member, title (president | vice_president |
  secretary | treasurer | director), term_start, term_end, status }. It has
  no organization field; the org comes through hoa_member. "Current term" is
  defined in core/server/utils/board-access.ts. Reuse that definition.
- The Board tab in app/components/pages/MembersPage.vue writes terms from
  the client with useDirectusItems: Edit overwrites person and office in
  place, Remove hard-deletes. This is what loses history today.
- hoa_vendors, hoa_teams (+ hoa_team_members), hoa_tasks, hoa_activity,
  hoa_meeting attendance's frozen title (the precedent for name snapshots).
- Script helpers: copy from scripts/create-projects-collections.ts.
  Permissions: scripts/setup-directus-permissions.ts only.
- jspdf + jspdf-autotable are already dependencies.

The model, in one paragraph: one row per standing job. Many holders per row
through a junction. A holder is exactly one of a board office, a member, a
user, a vendor, a team or a free-text label. Every holder row has a start
and an end date. A change of holder ends one row and opens another; nothing
is overwritten or deleted. The same rule is applied to board terms.

Schema, in ONE idempotent script with --dry-run,
scripts/create-responsibilities-collections.ts:

hoa_responsibilities
  organization (M2O, required, CASCADE) · title (required) · description
  category: finance | building | mechanical_safety | compliance_records |
    community (required)
  cadence: continuous | daily | weekly | monthly | quarterly | annual |
    as_needed
  basis: contract | bylaws | statute | resolution | practice | unknown
    (default unknown) · basis_reference (string)
  evidence (M2M directus_files)
  area (string, nullable): a key from AREAS. Validated in the route.
  status: active | disputed | retired (default active). "Unassigned" is NOT
    stored: a row with no current holder reads as unassigned.
  last_verified (date) · last_verified_by (M2O directus_users)
  member_visible (boolean, default true: the per-row opt-out; the community
    publish switch below is the gate)
  project (M2O hoa_projects, SET NULL) · notes · sort · audit fields
  No next_review field: derive it from cadence and last_verified in a pure
  shared function.

hoa_responsibility_assignees
  organization · responsibility (M2O, CASCADE, one_field assignees)
  office (string, nullable: the board title enum)
  member (M2O hoa_members) · user (M2O directus_users) ·
  vendor (M2O hoa_vendors) · team (M2O hoa_teams), all nullable, SET NULL
  label (string)
  role: owner | performs | backup | oversight (default owner)
  start_date (date, required) · end_date (date, null = current)
  holder_name (string): frozen by the server when the row is ended
  notes · sort · audit fields
  Exactly one of office / member / user / vendor / team / label is set.

Additions to existing collections (same script):
  hoa_board_members.end_reason: term_ended | resigned | removed |
    changed_office (nullable)
  hoa_tasks.responsibility (M2O, SET NULL, one_field tasks)
  hoa_organizations.responsibilities_published (boolean, default false)
  modules.responsibilities in DEFAULT_MODULES, backfilled idempotently

Do NOT create attestation or review collections. They are Phase 11.

Build, in this order, one commit each:

1. docs/spec-responsibilities.md, under 150 lines: the shapes above, the
   exactly-one-target rule, "current" and "as of" definitions, how an office
   resolves to a person on a date (including vacant, and two terms inside
   one assignment), the hand-over and term actions with their inputs, what
   each audience reads, and the named tests. Write up anything in the live
   schema (pnpm generate:types) that contradicts this prompt. Stop and ask
   me if it contradicts plan §3.4.

2. Pure shared code in core/shared/responsibilities/, with table tests:
   - validateTarget(): exactly one target, clear error otherwise
   - holdersAsOf(assignees, date) and currentHolders()
   - officeHolderAsOf(boardTerms, office, date): person, or vacant
   - nextReview(cadence, lastVerified)
   - planHandOver(current, next, date): the row to end and the row to open
   - planTermChange(term, action, date): end / change office / correct
   - categories and the seed list (config). Label the seed "Florida
     condominium"; the rows are in the appendix below.

3. The area: add `responsibilities` to AREAS with its gate file, grantable.
   Check what that does to presets and the "Full service" match (Session 1
   kept vendors and billing notify-only for this reason) and log the answer.

4. The schema script, dry-run output pasted into the session log, and the
   permission entries. Members get NO direct Directus read on either new
   collection: owners read through the server route, which is what keeps
   vendor contact fields, basis, notes and history out. Run
   `pnpm setup:permissions:audit` before and after.

5. Server routes under core/server/api/org/responsibilities/ (the gated
   routes live under /api/org, not /api/hoa), zod bodies, org-scope tests:
   - GET  index?asOf=          editors and board: everything
   - GET  published            owners and tenants: published rows, current
                               holders, four columns, nothing else
   - POST create · PATCH [id] · POST [id]/retire      (no delete)
   - POST [id]/assignees       add a holder
   - POST [id]/hand-over       ends one row, opens the next, one call
   - PATCH assignees/[id]      correction only: notes, role, a wrong date
   - POST apply-template       additive, idempotent on title
   - POST publish · POST unpublish
   - GET  export.pdf?asOf=     grouped by category; columns Job · Who ·
                               Cadence · Basis · Last verified; an empty Who
                               prints as an empty cell; the as-of date in
                               the header
   And for board terms, under core/server/api/org/board-terms/:
   - POST [id]/end             date + end_reason
   - POST [id]/change-office   ends the row, opens one for the same member
   - PATCH [id]                correction only
   - DELETE [id]               "entered by mistake" only; refuse when any
                               assignee row's dates depend on it
   Ending any row freezes holder_name. Each write logs hoa_activity
   ("Treasurer ended on Reconciles bank statements; CPA added").

6. Board tab: replace the client-side update/remove with the term routes.
   Row actions: End term · Change office · Correct. Delete moves to the
   overflow with a confirm that says it is for mistakes. An "As of" date
   control. Name every user-visible change in the log.

7. Admin register on the scaffold, as one entry in the nav registry gated
   by the `responsibilities` area and the module toggle. Index grouped by
   the five categories with sticky headers; columns Job · Who · Cadence ·
   Basis · Last verified · Status; filters for category, status, holder,
   basis unknown, review overdue; an "As of" date control. Holder chips:
   office → office name and the person resolved for the date, or "(vacant)";
   member/user → avatar and name; vendor → company; team → colour dot and
   name; label → plain. Role as a suffix only when it is not owner. Detail
   in the §2.3 layout: summary strip with the one next action (Hand over,
   or Assign when empty), facts, the holder timeline (ended rows with their
   dates and frozen names), files, discussion. Header actions: New job ·
   Start from the Florida condominium list · Publish · Export PDF.

8. Owner view at /{slug}/responsibilities: published rows only, same
   grouping, Job · Who · Cadence · Last verified. Its own registry entry.
   Empty state: "The board hasn't published who handles what yet."

9. Service history on the member detail: offices held and jobs held, with
   dates, visible to editors and the board.

Rules: a role never sees a control it cannot use. The hat never grants
access. No delete for a job or a holder row. A stored value is never one
that can be derived.

Out of scope: the director survey and diff, the monthly review mode, the
home tile, reminders on next review, any sync between the register and
manager_areas.notify, billing. Note the hook points in the spec; build none.

Token rules: subagents on Haiku 5.5 for census/grep; review diffs, not
files. Gates run in the background; read only the tail. Typecheck with
NODE_OPTIONS=--max-old-space-size=6144.

Quality gate, per commit: typecheck 0, vitest green, build green (serially),
`pnpm audit:all` at or under baseline, lint under the warning cap.

When done: add the Phase 2b rows to §7 Status, append to the Session log
(shipped, deviations, operator TODOs: the schema script, type regeneration,
publishing for 1033 Lenox), link the spec from docs/ROADMAP.md, and stop.
```

## Appendix — seed list, "Florida condominium"

`{ category, title, cadence }`. Applying is additive and idempotent on title within the community.

**finance** — Sends dues invoices and statements to owners (monthly) · Receives owner payments, which account (continuous) · Records each payment against the owner ledger (continuous) · Deposits funds (weekly) · Tracks who is behind, AR aging (monthly) · Sends late notices (monthly) · Receives vendor invoices (continuous) · Approves vendor invoices for payment (continuous) · Pays vendors, from which account (continuous) · Reconciles bank statements (monthly) · Produces monthly financials (monthly) · Keeps the official system of record (continuous) · Prepares the annual budget (annual) · Files tax return and annual report (annual)

**building** — Walks the building and logs problems (weekly) · Lobby, hallway, catwalk cleaning (weekly) · Laundry room equipment and service calls (as_needed) · Storage and bike areas (quarterly) · Trash, recycling, bulk pickup (weekly) · Pest control (monthly) · Roof, gutters, drainage checks (quarterly) · Exterior paint, gates, fencing (annual) · Landscaping and irrigation (weekly) · Pool and courtyard (weekly)

**mechanical_safety** — Elevator service contract and monthly visits (monthly) · Elevator permit and inspection certificate (annual) · Fire extinguishers, alarms, sprinkler inspections (annual) · Backflow and other annual inspections (annual) · Electrical and plumbing emergencies, after hours (as_needed) · Hurricane prep and shutdown (annual) · Keys, fobs, gate codes, access list (continuous)

**compliance_records** — 40-year recertification: engineer, City, permits (continuous) · SIRS and reserve study (annual) · Insurance policies, renewals, claims (annual) · City notices, violations, code letters (as_needed) · Vendor contracts: where kept, when they expire (quarterly) · Bids: who collects, how many (as_needed) · Meeting notices, minutes, official records (monthly) · Owner files: deeds, leases, tenant approvals, estoppels (as_needed) · Website and owner portal (continuous)

**community** — Owner complaints: who receives, who answers (continuous) · Rules violations: who evaluates, who sends the letter (as_needed) · Move-ins, move-outs, contractor access (as_needed) · Owner communications: who sends, from where (continuous) · Emergency contact for the building (continuous)

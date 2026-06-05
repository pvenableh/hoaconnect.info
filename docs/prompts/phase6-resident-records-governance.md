# Prompt — Phase 6: Historical resident records (pets/vehicles/leases) + searchable governance

> Hand this to a fresh Claude Code session in the `hoaconnect` repo. Self-contained.
> Strategic context: `docs/ROADMAP.md`; conventions mirror
> `docs/prompts/phase5-comments-reactions-requests.md`. Product is a multi-tenant
> HOA SaaS (Nuxt 4 + Directus, code name **Property Flow**).

## Where things stand (already built / LIVE — do NOT rebuild)

Phase 5 backend is **live** on the Directus at `admin.hoaconnect.info`
(`types/directus.ts` is current): `hoa_comments`, `hoa_reactions`,
`hoa_comment_reports`, `hoa_requests`, `hoa_teams`, `hoa_team_members`,
`hoa_polls`, `hoa_poll_votes`. Universal comment/reaction rails, requests/tickets
(+ Tier 2 workflows in `app/config/requestWorkflows.ts`), named **teams** with
domain-based manager rights (`useTeams`), community **polls**, a **Building**
activity feed (`/{slug}/feed`), comment **moderation** + **reporting**
(`/{slug}/admin/moderation`). Theme is dual-axis; floating dock nav.

Relevant existing schema (verified):
- `hoa_units` { unit_number, organization, members (O2M → hoa_member_units) }.
- `hoa_member_units` (member↔unit junction) **already temporal**:
  `{ member_id, unit_id, is_primary_unit, ownership_percentage, start_date,
  end_date }`. Occupancy history already exists — **reuse this pattern**.
- `hoa_pets` { member_id, name, type(dog|cat), breed, weight, image } — tied to
  a MEMBER only; **no unit, no date range**.
- `hoa_vehicles` { member_id, make, model, year, license_plate, parking_spot,
  image } — member only; no unit/date range.
- `hoa_members` exposes `pets`, `vehicles`, `units` relations.
- **No `hoa_leases`**, **no governance/bylaws** collection.

## The big idea

**Historical accuracy = never delete, end-date instead.** A pet/vehicle/lease
belongs to a **unit** (the persistent thing) and a responsible **member**, over a
**time range**. On tenant turnover you set `end_date` + archive rather than
deleting, so the unit's history is always answerable ("what was registered to 4B
in 2023, and who was the tenant?"). This mirrors the meetings feature's frozen
`hoa_meeting_attendees` snapshot and the existing `hoa_member_units` start/end.

---

## Track 1 — Pets / vehicles / leases attached to units, historically accurate

### Schema (idempotent `scripts/` migrations; confirm before running)

1. **Extend `hoa_pets` + `hoa_vehicles`** (additive — keep `member_id`):
   - `unit_id` M2O → `hoa_units` (`on_delete SET NULL`) — the unit it's tied to.
   - `start_date`, `end_date` (timestamps) — the residency/registration window.
   - (pets) consider widening `type` beyond dog|cat (bird/reptile/other).
   - Keep `status` (active/archived) for soft-archive.
   - Write `scripts/extend-pets-vehicles-units.ts` (`pnpm extend:pets-vehicles`).
     Optionally backfill `unit_id` from each member's **primary active**
     `hoa_member_units` row, and `start_date` from that row's `start_date`.
2. **Create `hoa_leases`** — `scripts/create-leases-collection.ts`
   (`pnpm create:leases`):
   | field | type | notes |
   |---|---|---|
   | `unit` | M2O → hoa_units (required) | |
   | `tenant` | M2O → hoa_members | the lessee |
   | `owner` | M2O → hoa_members | landlord/owner (optional) |
   | `start_date` / `end_date` | timestamp | term |
   | `rent_amount` / `deposit_amount` | decimal | |
   | `document` | file (M2O directus_files) | signed lease PDF |
   | `status` | string | active / expired / terminated |
   | `notes` | text | |
   | `organization` | M2O (required) | tenancy |
   | + system fields | | |
   Add an O2M alias `leases` on `hoa_units`.
3. `pnpm generate:types`, then **permissions** (in each create script, matching
   the Phase 5 pattern): admins manage all in org; members read their org's
   units' records; a tenant reads their own lease. Pets/vehicles readable
   org-wide (directory), writable by admin (and optionally the owning member).

### UI
- **Unit detail page** `app/pages/[slug]/admin/units/[id].vue` (and a
  member-visible variant if desired): header + two sections —
  **Current** (active occupant(s) from `hoa_member_units` with no end-date,
  active pets/vehicles, active lease) and **History** (all rows with date
  ranges, grouped by period). A "Pet/Vehicle/Lease" add modal that sets `unit_id`
  + `start_date`. A "Move out / end" action that sets `end_date` + archives
  rather than deletes.
- Components: `app/components/units/{UnitRecordList,PetForm,VehicleForm,LeaseForm}.vue`.
- Wire from the Directory (`/admin/members`, `/admin/units`) — link each unit to
  its detail page.
- A composable `useUnitRecords(unitId)`: loads members (via hoa_member_units),
  pets, vehicles, leases for a unit, split into current vs historical by
  `end_date`.

---

## Track 2 — By-laws & rules, entered per org and searchable

### Schema — `scripts/create-governance-collection.ts` (`pnpm create:governance`)
`hoa_governance`:
| field | type | notes |
|---|---|---|
| `status` | string | published / draft / archived |
| `category` | string | bylaw / rule / ccr / policy / guideline |
| `title` | string (required) | |
| `section_number` | string | e.g. "4.2.1" (sortable) |
| `summary` | text | short plain-text blurb (powers search snippets) |
| `content` | text (`input-rich-text-html`, TipTap) | the rule body |
| `effective_date` | timestamp | |
| `parent` | M2O → hoa_governance | section hierarchy (self-ref) |
| `tags` | json | keyword list |
| `sort` | integer | |
| `organization` | M2O (required) | tenancy |
| + system fields | | |
Permissions: admins manage; members **read published** in their org.

### Search + UI
- Page `app/pages/[slug]/rules/index.vue` (member-facing; admin gets create/edit):
  a **search box** + category filter chips + a sectioned/accordion list, and a
  detail view rendering the rich-text `content`.
- Search: query with Directus's `search` param **and/or** a filter
  `{ _or: [{ title: { _icontains: q } }, { summary: { _icontains: q } },
  { content: { _icontains: q } }] }`, status published, org-scoped. Debounce the
  input; highlight matches in the snippet (from `summary`/stripped `content`).
- Composable `useGovernance()`: `search(q, category)`, `list()`, `get(id)`,
  admin `create/update`. Author with the existing TipTap editor
  (`ChannelsChannelEditor`, no toolbar variant or `showToolbar`).
- Add a **dock app** (e.g. "Rules", icon `scale` or `book-open`) to member +
  admin docks (`app/composables/useAppNav.ts`), and optionally surface
  newly-published rules in the Building feed (`useActivityFeed`) and as a
  `document`-style notification.
- Optional: reuse the comment rail (`CommentsCommentThread` targeting
  `hoa_governance`) so members can ask questions on a specific rule.

---

## Conventions (apply to every track)
- **Backend changes** = idempotent TS script in `scripts/` (copy
  `create-polls-collections.ts`), needs `DIRECTUS_STATIC_TOKEN`, **explicit user
  confirmation before running**, then `pnpm generate:types`, then permissions in
  the same script (Phase 5 pattern). `types/directus.ts` is the schema source of
  truth — only query fields that exist.
- **Additive & non-destructive.** Pets/vehicles changes must keep `member_id`.
- **UI** — Tailwind v4 (`color-mix`, not raw HSL); glass via `.ios-card`/`.glass*`;
  `.spinner-ios`; pill buttons; segmented-pill tabs; TipTap for rich text;
  `t-*` theme utilities. Path-prefixed auto-imports (e.g. `UnitsUnitRecordList`).
- **History UX rule:** end-date + archive on turnover; never hard-delete a
  resident record. Current = `end_date` null/future; History = everything.

## Verification setup (gotchas — same as prior phases)
- Preview server runs HOA on **:3000** (Directus CORS only allows
  `http://localhost:3000`). Use the `preview_*` tools.
- **Login is manual** — ask the user to log in in the preview window; org
  dashboard is `/605-lincoln/dashboard`.
- Recurring `[auth-refresh] 401 No refresh token available` console errors are
  preview session aging — NOT a bug.
- Verify compilation by fetching transformed modules
  (`/_nuxt/@fs/<abs-path>.vue`) and watch `preview_console_logs`/`preview_logs`.

## Suggested order
Track 1 schema (leases + pets/vehicles fields) → unit detail UI → Track 2
governance (schema → search page). Confirm each backend mutation with the user
before running.

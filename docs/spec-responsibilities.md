# Spec — responsibilities register, first slice (role-first UX, Phase 2b)

Plan: `docs/plan-role-first-ux.md` §3.4 and "History: end, don't erase". Brief: `docs/prompts/responsibilities-register.md`. Builds on `docs/spec-resource-scaffold.md`. Written 2026-11-15.

One row per standing job. Many holders per job, one dated row each. A change of holder ends one row and opens another; nothing is overwritten or deleted. Board terms follow the same rule.

## Shapes

`scripts/create-responsibilities-collections.ts` (idempotent, `--dry-run`). Audit fields are `date_created`, `date_updated`, `user_created`, `user_updated`.

| Collection | Fields |
|---|---|
| `hoa_responsibilities` | `organization` (M2O, required, CASCADE) · `title` (required) · `description` · `category` (required: finance · building · mechanical_safety · compliance_records · community) · `cadence` (continuous · daily · weekly · monthly · quarterly · annual · as_needed) · `basis` (contract · bylaws · statute · resolution · practice · unknown; default unknown) · `basis_reference` · `evidence` (M2M `directus_files` through `hoa_responsibilities_files`) · `area` (a key of `AREAS`, nullable; checked by the routes) · `status` (active · disputed · retired; default active) · `last_verified` (date) · `last_verified_by` (M2O users) · `member_visible` (default true) · `project` (M2O `hoa_projects`, SET NULL) · `notes` · `sort` |
| `hoa_responsibility_assignees` | `organization` · `responsibility` (M2O, CASCADE, one_field `assignees`) · `office` (board title) · `member` · `user` · `vendor` · `team` (M2Os, SET NULL) · `label` · `role` (owner · performs · backup · oversight; default owner) · `start_date` (required) · `end_date` (null = open) · `holder_name` · `notes` · `sort` |
| Existing | `hoa_board_members.end_reason` (term_ended · resigned · removed · changed_office) and `.holder_name` · `hoa_tasks.responsibility` (M2O, SET NULL, one_field `tasks`) · `hoa_organizations.responsibilities_published` and `.responsibilities_show_unassigned` (default false) · `modules.responsibilities` (default true, back-filled onto stored maps) · `hoa_activity.event_type` choices `responsibility` and `board_term` |

Not stored, because each is derived: "unassigned", "next review", "overdue", "vacant", "unassigned since", the person behind an office.

**Exactly one target.** An assignee row sets exactly one of `office`, `member`, `user`, `vendor`, `team`, `label`. `validateTarget()` is the one check, used by every route that opens a row. An office must be a board title. A label is trimmed and non-empty. The target of a row never changes after it is opened: Correct cannot change it, so a new holder always means a new row.

**Frozen names.** Ending a row (hand-over, retire, End term, Change office) writes `holder_name`: the office label ("Treasurer"), the member's or user's name, the vendor's company, the team's name, or the label. A current row reads names live. An ended row reads `holder_name` first. A deleted member sets `hoa_board_members.hoa_member` to null (live schema, SET NULL), which is why the term freezes a name too.

## Dates

All dates are `YYYY-MM-DD`, compared as UTC dates, both ends inclusive, as `isCurrentBoardTerm` (`core/shared/roles/role-context.ts`) compares board terms.

- **Holds on d:** `start_date ≤ d` and (`end_date` null or `end_date ≥ d`). **Current** is "holds today". **As of d** is `holdersAsOf(rows, d)`.
- **Unassigned on d:** no row holds on d. **Unassigned since:** the day after the latest `end_date` before d, which is the date the change was entered as. With no ended row, the day the job was created.
- **An office on d:** `officeHolderAsOf(terms, office, d)` returns the members whose term of that office is current on d (`isCurrentBoardTerm`). Directors can be several. None is **vacant**: the chip reads "Treasurer (vacant)".
- **Two terms inside one assignment:** `officeTermsWithin(terms, office, start, end)` lists every term of that office overlapping the row, clipped to it, in order. A mid-year resignation shows as two terms under one "Treasurer" row.
- **Effective date.** Hand-over, retire and Change office take `effective`, the first day of the new state. The row being ended gets `effective − 1`. End term takes `lastDay`, which is the `term_end` it writes. An effective date on or before the row's start is refused (409, "correct the row instead"), so no row ends before it starts.
- **Next review** (`nextReview(cadence, lastVerified)`): last verified plus one month for daily, weekly and monthly jobs; three months for quarterly; twelve for annual, continuous and as-needed. Month ends clamp (31 January + 1 month = 28 or 29 February). Never verified gives null, which counts as overdue. Overdue is `next < today`.

## Actions

Every route is under `/api/org`, takes `orgId` (query on GET and DELETE, body otherwise), checks a zod body, loads the record and refuses with 404 unless it belongs to `orgId`. Every target, project and file it is given must belong to `orgId` too: members, vendors and teams by their `organization`, users by an `hoa_members` row there, files by `filesOutsideOrg`. Every write logs one `hoa_activity` row (`event_type` `responsibility` or `board_term`) with the actor and a sentence: "Treasurer ended on Reconciles bank statements; CPA added".

| Route | Who | Does |
|---|---|---|
| `GET responsibilities?asOf=` | read | Every row with its holders as of the date, every assignee row (history), next review, unassigned since, the visibility switches and `viewer { canEdit, isAdmin }` |
| `GET responsibilities/published` | live member | See "What each audience reads" |
| `POST responsibilities` | edit | A job, with optional first holders |
| `PATCH responsibilities/[id]` | edit | Facts. `status` only active ↔ disputed (a retired job may be made active again). `last_verified` stamps `last_verified_by` with the caller |
| `POST responsibilities/[id]/retire` | edit | `status` retired; open rows end on `effective − 1`. No delete route |
| `POST responsibilities/[id]/assignees` | edit | Opens a row beside the others (a backup, a second performer): target, role, `start_date` (default today) |
| `POST responsibilities/[id]/hand-over` | edit | `{ assignee, effective, next? }`. Ends that open row on `effective − 1` and opens `next` from `effective`, keeping its role unless `next.role` says otherwise. Without `next` the row just ends. Refuses the same target. One call: if opening fails, the end is undone |
| `PATCH responsibilities/assignees/[id]` | edit | Correction only: `notes`, `role`, `start_date`, and `end_date` on a row that has already ended. Never the target; an open row is ended by hand-over |
| `POST responsibilities/apply-template` | edit | `{ template }`. Adds the seed rows whose title the community lacks (trimmed, any case, retired rows included). Returns the counts |
| `PATCH responsibilities/visibility` | **admin** | `{ published?, showUnassigned? }`. The work switch is not enough: the delegate may be the party who is not answering. One activity row per switch changed |
| `GET responsibilities/export.pdf?asOf=` | read | Grouped by category. Job · Who · Cadence · Basis · Last verified. An empty Who is an empty cell. The as-of date in the header |
| `GET responsibilities/service-history?member=` | read | One member's offices held and jobs held, with dates: rows naming them, and office rows clipped to their terms of that office |
| `POST board-terms` | admin | `{ hoa_member, title, term_start?, term_end?, message?, icon?, status? }`. Adds a term; the person must be a member of the community. Added after Session 6 for the Members page: the HOA Admin policy has no create on `hoa_board_members`, because Directus cannot check the person a term names |
| `POST board-terms/[id]/end` | admin | `{ lastDay, reason }` (term_ended · resigned · removed). Freezes the name. Refused once `end_reason` is set |
| `POST board-terms/[id]/change-office` | admin | `{ effective, office }`. Ends the term on `effective − 1` with `changed_office`, and opens one for the same member from `effective`, keeping the planned `term_end` when it is later |
| `PATCH board-terms/[id]` | admin | Correction only: office, dates, message, icon, status, end reason. Never the member. The activity row carries before and after |
| `DELETE board-terms/[id]` | admin | "Entered by mistake" only. 409 while an office row of that title overlaps the term's dates, or a meeting attendance links it |

**read** is admin, the `responsibilities` grant, or a board seat (`responsibilities:read`, every office). **edit** is admin or the grant (`requireAdminOrManagerGrant`). The hat gives nothing. Board terms stay admin-only, as the Board tab is today.

`planHandOver(current, next, effective)` and `planTermChange(term, action)` (the date travels in the action) are the pure plans the routes write: the row to end, the row to open, or the patch.

## What each audience reads

| Audience | Reads |
|---|---|
| Admin, the grant, a board seat | Everything, any date, through `GET responsibilities` and the PDF |
| Owner or tenant | `GET published` only. Nothing until `responsibilities_published` is on and the module is on: `{ published: false }`, and the page says "The board hasn't published who handles what yet." Then active and disputed rows with `member_visible`, with today's holders: `{ id, title, category, cadence, lastVerified, who: [{ kind, name, role }] }`. A vendor is its company only. A job nobody holds is left out, unless `responsibilities_show_unassigned` is on: then `{ id, title, category, unassignedSince }` and nothing else. A disputed job shows its holder, or shows as unassigned; never "disputed". Never basis, notes, files, history or contact fields |
| Directus | No policy reads or writes the two collections or their file junction: every read and write is a route. This keeps vendor contact fields, basis, notes and history from owners, keeps "no delete" true at the API, and keeps the register out of the HOA Admin policy's any-membership scope (Session 2 TODO 5). Members and managers read `hoa_board_members` without `end_reason` and `holder_name` |

Gap, stated once: an admin can still flip the two switches on `hoa_organizations` through Directus, without the activity row. The app writes them only through the route.

## The pages (Session 7, built 2026-11-16)

- **Admin register** `/{slug}/admin/responsibilities` (`app/pages/[slug]/admin/responsibilities/index.vue`) on `AppResourceIndex`, rows grouped by the five categories (`group` and `groups`, `REGISTER_GROUPS`). `useResponsibilitiesResource` (`core/app/composables/`) is its `def.load` (`GET responsibilities`), the shared `asOf` day and the writes. Record route `/admin/responsibilities/:id` and panel type `responsibility` (`ResponsibilityPanel.vue`), resource key `responsibilities`. Forms in `app/components/Responsibilities/`: `JobForm`, `HolderForm` (hand over, assign), `HolderCorrectForm`, `HolderPicker`, `VisibilityMenu` (admin only), `HolderChips`.
- **Owner view** `/{slug}/responsibilities` on `GET published`, its own registry entry (`responsibilities`, the module only). The pure helpers for both are `core/shared/responsibilities/register-view.ts`.
- **Board tab** (`MembersPage.vue`, `app/components/Members/BoardTermSheets.vue`): End term, Change office and Correct, Delete in the overflow, an As of date. **Service history** is `Members/ServiceHistory.vue`, under the Edit Member form.
- **Nav.** Two registry entries on `/admin/responsibilities`, because needs are ANDed: `responsibilities-register` (`responsibilities:read`: admins and every board seat; in the admin and member docks) and `responsibilities-mgr` (the `responsibilities` area: managers). `entriesForPath` treats entries that tie on a path as any-of for the gate, as `documents` and `documents-mgr` already do. Module key `responsibilities` is in `ModuleKey` and Settings → Modules.
- **Permissions.** The Board tab no longer writes `hoa_board_members` with the user's token: add, end, change office, correct and delete are the routes above. The HOA Admin create, update and delete on it are all in `REMOVED_ADMIN_RULES`; the delete is an operator `pnpm setup:permissions` to apply.
- **Map mode** (Session 9, built 2026-11-18; plan §3.4 "Map view"). Both pages have Grid | Map (`AppSegmentedControl`, `?view=map` through `useTabQuery`, no history entry). No schema, no route: the map reads the rows its page already has.
  - **Pure core** `core/shared/responsibilities/map.ts`, tested in `tests/shared/responsibilities-map.test.ts`. `holdersOnDay(row, day)` resolves who holds a job on any day from the row's `assignees` and their office `terms` alone; a differential test holds it equal to `registerRows(…, day).holders` across a resignation, a vacant month, an election and a hand-over (the view has no `sort`, and two directors' terms are clipped, so those two orders could differ). `mapModel(rows, day)` gives the rail (offices by rank with the people for the day, then members, users, vendors, teams, names, each with a job count; a member's count includes jobs held through an office they hold), the attention groups (vacant offices; unassigned jobs with their "since"), and the held jobs in the five categories. Retired jobs are out, and so is a job on a day before it existed (before it was entered and before its first holder). `lit(model, pick)`: a holder's jobs, or a job's holders by role. `changeDays(rows)`: the slider's snap days (a job entered, a row starts, the day after one ends, an office term starts or the day after it ends). `changedJobs(a, b)`: hand-overs, holders ended or added, and elections (the office stays, the person changes); a job on only one of the two days is not counted. `changeAnnouncement(day, changes)` is the live region's sentence.
  - **Admin** (`ResponsibilitiesMap`, `ResponsibilitiesMapSlider` in `app/components/Responsibilities/`). The page owns one `AppPageHeader` for both modes (the grid's count moved into its toolbar; New job sits in the header). The slider is a native range over the snap days and today, with `aria-valuetext` "As of 12 October 2026"; the date field beside it is the same state. Dragging sets the shared `asOf` with no request. A typed date inside the days the rows cover sets it the same way; outside them it reads once (`setAsOf`). The grid and the panel draw what the route built for `meta.asOf`, so switching to Grid, or Open Job on a picked card, reads once for the slider's day first. A picked job offers Open Job (the panel); there is no second detail sheet.
  - **Owner** (`/{slug}/responsibilities`): the same map for today, no slider, built only from `GET published` through `publishedMapRows()` (`publishedHolder` gives each holder its shape). Those rows carry no history, basis, notes or member ids, so the model cannot hold them (a test reads the model's JSON for them); unassigned jobs appear only when the route sent them. Picking lights; nothing opens.
  - **Material and motion** (§2.4). The rail and the slider are `glass-surface`; job cards are `ios-card`. The rail is a radio group (arrows move and pick, Home and End, "Everyone" first); job cards are toggle buttons (`aria-pressed`); Escape clears the pick. When the day moves, changed jobs pulse, new chips slide in (`TransitionGroup`), and a job that gains or loses its last holder travels between its section and Unassigned (`useFlipList`, which now finishes a running flip before the next capture). Under `prefers-reduced-motion` all of it is instant; the polite live region says what changed either way ("As of 1 October 2026. Elevator service contract: Lift Co to nobody."). On a phone the sides stack, the rail sticks and scrolls sideways, and every target is at least 44 px.
- **Not built:** the discussion thread (`hoa_channels` links a request, a project or a vendor, not a job: a schema script and `channel-scope` rules first), a way to attach files (the panel lists what the route returns).

## Hook points (not built)

Map mode (Phase 2c) is built (above). The director survey, the monthly review and the home tile (Phase 11) add their own collections. Reminders on next review read `nextReview()`. `area` is where a later check compares the register with `manager_areas.notify`; nothing syncs. No billing.

## Named tests

- `tests/shared/responsibilities.test.ts`: `validateTarget` (none, two, each kind, a bad office, a blank label) · `holdersAsOf` (bounds inclusive, a hand-over leaves one holder each day, future rows) · `currentHolders` · `unassignedSince` · `officeHolderAsOf` (held, vacant, two directors, a resignation gap) · `officeTermsWithin` · `nextReview` per cadence, month-end clamp, never verified · `planHandOver` (end and open, no next, same target, effective on start) · `planTermChange` (end, change office keeps the planned end, correct) · the seed (five categories, no duplicate titles, every cadence valid).
- `tests/shared/areas.test.ts`, `tests/shared/nav-registry.test.ts`: `responsibilities` is grantable with its gate; it waits for its page in Session 7.
- `tests/server/responsibilities-routes.test.ts`: 401, 400, 403 for a plain member, and 404 for a row of another org, on every route; read for a board seat; edit refused to a board seat; visibility 403 for a non-admin editor; hand-over ends and opens in one call; published hides basis, notes and contact fields, leaves out the unassigned until the switch, never says disputed; apply-template twice adds nothing; the PDF's header carries the as-of date.
- `tests/server/board-terms-routes.test.ts`: admin only; end freezes the name; change office opens a term for the same member; correct never changes the member; delete refused while a job depends on the term.
- `tests/server/register-pdf.test.ts`: the server renders a real PDF.
- Service history, in the routes test: offices and jobs, a job held through an office clipped to the term, 404 for another community's member.

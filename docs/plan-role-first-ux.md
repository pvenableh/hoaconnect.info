# Plan — role-first UX, one resource grammar, invoices and vendors

Written 2026-11-14 from three read-only surveys (HOA Connect roles/nav, HOA Connect features/UI, Earnest channels/email).
Nothing here is built. Claims marked **(verify)** come from a survey excerpt and should be confirmed in the session that touches them.

## 0. What the surveys changed about the ask

Round 3 already shipped most of the plumbing this request needs. This plan is a delta, not a rebuild.

| Asked for | Already here | Actually missing |
|---|---|---|
| Earnest channels | Channels with DMs, presence, edit window, moderation — ahead of Earnest, which has no DMs or presence | Embedded thread on vendor/contract/invoice detail; roster polish |
| Earnest email | Send queue, scheduling, recurrence, auto-pause, MJML branding, signed webhook | Test-send-first, dry-run recipient count, per-send failure rollup, audience picker by role/team, held drafts for money email |
| Invoice reminders | Reminder engine (hourly, once-only log, org time zone) with a dues rule; a second, older path in the billing worker | "Invoice issued" email (`email_sent` is never written), manual send, a tracking view, one reminder path instead of two |
| Vendor tracking | `hoa_vendors`, coverage reminder on `active_until`, project and channel links | Contracts, deliverables, assignments, vendor bills (expenses store the vendor as free text) |
| Consistent CRUD | The primitives exist (`AppDataTable`, `AppPageHeader`, `AppBottomSheet`, slide-over stack, `useConfirm`) and audits enforce some rules | Pages pick different ones: 4 create surfaces, 2 filter styles, 2 header styles, search on one page |
| Liquid glass | One glass theme, light/dark/system | Glass is applied broadly rather than as a layer; 6 appearance knobs compete for attention |
| Role clarity | A capability matrix and 10 delegation grants on the server | Navigation branches on one boolean (`appsFor(isAdmin)`), so four of the five roles get the same dock |

The root cause of "not intuitive" is the last row. The server knows what each person can do; the interface does not ask it.

## 1. The five people, and what each opens the app to do

One rule for every home screen: **what needs you, then what's new, then everything else.** A role never sees a control it cannot use.

| Person | Opens the app to… | Home leads with | Today's friction |
|---|---|---|---|
| **Tenant** | Report a problem, read notices, find a rule or a contact | Notices · my requests · contacts | Shown as "Resident" in one place and "Member" in another; sees money and votes they may not have |
| **Owner** | Pay, see what they owe, vote, attend, request | Balance and Pay · open votes · next meeting · my requests | A new charge arrives silently; no history of what was sent to them |
| **Board member** | Approve, decide, keep an eye on money and vendors | Approvals waiting · votes · arrears snapshot · contract dates coming up | Gets the owner dock; board rights (money, governing review, unit detail) exist with no way to reach them |
| **Property manager** (not admin) | Work a queue on behalf of the board, within what was delegated | My queue: inquiries · assigned deliverables · invoices to chase | The portal has no desktop entry (mobile sheet only); not routed to it on login; no badge; 5 of 10 grants have no page behind them |
| **Property manager who is admin** | The same queue, plus everything | PM queue first, admin apps in the dock | Roles are exclusive, so taking admin erases the PM identity and the queue |
| **Admin** | Set up, delegate, see everything | Setup health · what's overdue across the community · recent activity | Settings live in four places; dock labels don't match destinations ("Requests" opens `/admin/more`, "Records" opens reporting) |

## 2. Design rationale

### 2.1 Identity is layered, not a single role

Resolve one `RoleContext` per membership, server-side, and hand it to the client whole:

- **Residency:** owner, tenant, or none (an outside manager).
- **Hats:** board (from active terms), property manager, admin. Hats add; they never replace each other.
- **Grants:** the delegation keys an admin turned on, from the single list in `core/shared/transition/grants.ts`.

Every part of this is per membership (`hoa_members` is already one row per person per community), so one person can be an owner in one community, a board member in a second and a manager in a third. The organization switcher shows the hat beside each name.

#### The property-manager relationship (decided 2026-11-14: a hat, not a role)

Today one word, "property manager", answers three different questions. Split them:

| Question | Answered by | Exists? |
|---|---|---|
| Who pays for and owns the account? | The billing account and its owner (`billing_accounts`, `billing_account_members`) | Yes — built for agencies |
| Which company manages this community? | An engagement: the community's link to a management company (the vendor record of category management, with start and end dates) | Partly — `hoa_vendors` has management routing and a linked user **(verify)** |
| What may this person do here? | Their membership: the manager hat plus either full access (admin) or a set of grants | Grants yes; the hat is new |

The two ways a manager arrives then differ only in the first row:

| | The management company created the community | The board added a manager |
|---|---|---|
| Account owner | The company's billing account (one account, many communities) | The board's |
| Manager's membership | Manager hat + admin | Manager hat + grants from a preset, or + admin if the board chooses |
| Board's membership | Invited by the company, with whatever access the company gives | Admin |
| Ending the engagement | Board or company ends it; the existing transition flow (`core/shared/transition/`) hands over | Admin removes the hat and grants |

Rules that keep this safe:

- **The hat never implies access.** It decides identity: the badge, the queue-first home, "Managed by" contact routing, who assignments default to. Access comes only from admin or grants.
- **The account owner decides** (decided 2026-11-14). Whoever owns the billing account — the payer — has the final say over who is admin and who is removed, whether that is the board or a management company. No seat is protected from the account owner.
- **A community can have several managers, each with a different job** (decided 2026-11-14). Each manager membership carries a title ("Accounting", "Maintenance") and one row per area with two switches:

  | Area | Can work on it | Is notified about it |
  |---|---|---|
  | Invoices and payments | ✓ | ✓ |
  | Vendors and contracts | ✓ | — |
  | Requests (by type) | — | — |
  | Projects | ✓ | ✓ |

  "Can work on it" is the grant. "Is notified" is the responsibility: reminder rules and events addressed to "the manager for invoices" resolve to the members with that switch on, and fall back to admins when nobody has it. One list of areas, defined once beside the grants, drives both columns. A person's own notification preferences still choose bell, push or email.
- **A manager with several communities** gets a portfolio home at `/dashboard`: one queue across communities, grouped by community, each row opening in that community's context.
- **Staff of a company** are members with the hat who share the same engagement, so ending the engagement removes all of them at once.

### 2.2 Navigation is the capability matrix, rendered

One app registry. Each entry names the capability it needs; the dock, the phone App Library, the section pills and the route middleware all read the same entry. Consequences:

- A board member's dock gains Money and Approvals because they hold the capability, not because someone remembered to add a link.
- A PM's dock shows exactly the delegated areas, on desktop too.
- A grant with no page (`projects`, `activity`, `feedback`) is either given one or deleted from the list.
- The client stops keeping its own copy of 5 grant keys.

### 2.3 One grammar for every resource

| Moment | Pattern | Why |
|---|---|---|
| **Index** | `AppPageHeader` (title, count, one primary "New …" button) · search · one segmented status filter · `AppDataTable` on desktop, the same rows as cards on phones · `AppEmptyState` that offers the create action | Same eye path on every page |
| **Detail** | Slide-over from the index on desktop; the same component as a full page on phones and for deep links | Keeps the list in view; every record still has a URL |
| **Detail layout** | Summary strip (status, the one next action) · facts · timeline (who did what, what was sent) · discussion (embedded channel thread) | The next action is always top right |
| **Create / Edit** | One form component per resource in `AppBottomSheet`; edit opens the same form filled in | Learning create teaches edit |
| **Delete** | In the overflow menu, never beside the primary action; `useConfirm` naming the record and what goes with it; archive with an Undo toast where the data allows | No surprise losses |
| **Feedback** | Toast for the result of an action; banner only for page state | Already the norm |

Exception, stated once: composing an email stays a full page.

Build this as a scaffold (`AppResourceIndex`, a resource entry in the panel registry, `useResource` for list/search/filter/remove) so new pages are compliant by construction, then enforce it with three new audits beside the existing sixteen: raw `<h1>` on a page, raw `Dialog` used for a form, `filter-pill`.

### 2.4 Glass as a layer, fewer knobs

Apple's Liquid Glass puts glass on the controls that float above content — bars, dock, sheets, menus — and leaves the content itself solid and legible. The app already has the material; the change is where it is used.

- **Glass:** top bar, dock, section pills, sheets and slide-overs, menus, toasts.
- **Not glass:** tables, cards of content, form fields (already solid for performance).
- **Details:** nested corner radii that share a centre, a soft fade where content scrolls under a bar, the accent tint reserved for the one primary action per screen, no glass on glass.
- **Accessibility:** honour `prefers-reduced-transparency` and `prefers-contrast` instead of a manual "glass chrome" switch.
- **One left edge** (asked 2026-11-18, Phase 4). Text outside a card or container (page titles and descriptions, section labels, counts, toolbar text, summaries) starts on the same left edge as the cards and containers beside it, so each page has one clear vertical line. This reverses the iOS grouped-list inset: `--surface-inset: 1.25rem` (`core/app/assets/css/theme-app.css`), which `AppPageHeader` and `AppHeaderOutlet` use to indent headings to the text inside cards. Text inside a card keeps the card's own padding. The token goes to zero (or away) in Phase 4 part 1; part 2's sweep removes the one-off horizontal padding and margins on text outside containers page by page.
- **Attention on a solid card** (asked 2026-11-18, Phase 4). No coloured strip down one side of a rounded box: a side strip fights the corner radius. Cards stay solid (no glass on content); one attention treatment replaces the strip everywhere, e.g. a faint warning tint across the card or a warning rim that follows the radius, beside the icon and words that already say why. Its colour pair is contrast-checked in light and dark with the tints. Census 2026-11-18, rounded cards with a strip: `app/components/Responsibilities/Map.vue` (`.rmap-job--attention`, the Unassigned cards), `app/pages/payments/index.vue` (two `ios-card border-l-4`), `app/pages/[slug]/payments/index.vue` (`ios-card border-l-4`), and the marketing `ResidentPortalMock.vue` (its own palette; match it if the public site adopts the treatment). Not in scope: a strip on square text as a quote or indent rule (`StatuteFlag.vue`, `ChannelMessage.vue` replies, `SeoSettingsForm.vue`, `your-data.vue`, `DocReaderMock.vue`, the governing review page) and the landing drawer's edge.

Appearance settings go from six to two (decided 2026-11-14):

| Setting | Options | What it does |
|---|---|---|
| **Appearance** | Light · Dark · Auto | As today |
| **Tint** | On · Off | Off: clear, neutral glass that takes its colour from what is behind it. On: the glass carries the community's accent colour and is slightly more opaque, as iOS's tinted glass is — more colour and more contrast in one switch |

Removed: dock palettes (Fresh, Aurora, Neutral — the tint replaces them), the glass chrome toggle (the OS reduced-transparency setting decides), the dock label toggle (labels on), and dock position from the appearance panel.

Decided 2026-11-18 (Session 12, Peter, as recommended):

1. **Swatches:** six. The community's accent first (`block_settings.colors[0].primary`, the colour the PWA theme and the emails already use; HOA Connect cyan when a community has none), then five fixed hues: Blue, Teal, Violet, Rose, Slate. No red, amber or green, so a tint never reads as destructive, warning or success. Every fixed swatch's ink is solved for AA by `deriveInkAccent` and recorded as a token pair graded by `audit:contrast-pairs`.
2. **Tint default:** On, with the community's accent (today's look: the glass is already accent-tinted).
3. **Dock position:** gone entirely; the dock is bottom only (a top dock collides with the top bar).
4. **`vivid`:** removed with the other palettes. The public landing's dock keeps the old "fresh" ramp and glass chips, fixed, so the landing does not change.
5. **Attention:** a faint warning tint across the solid card (a rim fought the map's picked-card ring). On Payments only an overdue charge takes it; the active, partly paid and paid strips go, since each card's status badge already says it.

Each person picks their own tint colour (decided 2026-11-14) from a short row of swatches shown when Tint is on; the first swatch is the community's accent and is the default. It is stored with the per-user app preferences that already hold the dock settings. `core/shared/branding/accent.ts` already resolves one accent from a hex and is the single place the choice feeds. Tinted and clear glass each need a contrast-checked pair in light and dark (every swatch in both modes, added to `audit:contrast-pairs`, which is why the swatches are a fixed set and not a colour picker). The public site keeps its three styles; that is a one-time board choice, not a daily one.

## 3. Features

### 3.0 Work: requests, tasks and projects

The schema for this already exists and mirrors Earnest's; what is missing is one clear mental model and the screens that show it. No new "ticket" collection: a request is the ticket.

| Thing | Meaning | Who creates it | Collection |
|---|---|---|---|
| **Request** | Someone asks for something. It has a requester who is kept informed. | Anyone | `hoa_requests` |
| **Task** | One piece of work with an assignee and a due date. | Whoever does or directs the work | `hoa_tasks` (subtasks, links to request / project / event) |
| **Project** | A body of work with a budget and a timeline — the roof, the 40-year recertification. | Admin, board, or a manager with the grant | `hoa_projects` (`parent_project` for nesting) |
| **Timeline event** | A phase, milestone, inspection, meeting or payment on a project. Tasks hang from it; it can need approval and carry a cost. | Same | `hoa_project_events` (`depends_on`, `approval`, `cost_amount`) |

Every path between them, as one "Move to…" menu on each detail:

| From | To | State |
|---|---|---|
| Request | Task(s) | Built (`spawnTask`) |
| Request | New project | Built (`promote.post.ts`) |
| Request | Existing project, or a phase of one | **(verify; likely missing)** |
| Task | Project (the task becomes its first task) | Missing |
| Timeline event | Sub-project (spawned from that event) | Built (`spawn-project.post.ts`) |
| Project | Child project | Field exists; needs the action |
| Template | Project with its phases and tasks filled in | Missing — see below |

Lineage is always visible in both directions ("From request: leak in unit 4B" / "Became project: Roof replacement"), and closing the work updates the requester through the existing request-status reminder.

**What a project page shows, top to bottom:**

1. **Progress** — one ring: milestones reached of total, with child projects rolled up into the parent. Derived by a pure shared function; no stored percentage to drift.
2. **Health** — On track · At risk · Blocked, also derived: an overdue milestone or task makes it at risk; an unapproved event past its date or an unmet dependency makes it blocked.
3. **Needs** — the short list that answers "what is this waiting on?": approvals pending, overdue tasks, tasks with no assignee, spend against budget, contracts expiring inside the project's dates.
4. **Phases** — a stepper of phase events in order, the current one expanded to its tasks.
5. **Timeline** — the existing Gantt (`ProjectGantt.vue`), compared against Earnest's lane-based `ProjectTimeline/*` and upgraded only where Earnest is clearer.
6. **Tabs** — Tasks · Sub-projects (a tree) · Vendors and contracts · Money · Files · Discussion.

Owners see a reduced version when `member_visible` is on: the ring, the phase stepper and posted updates — "Roof: phase 2 of 4, inspection on 3 December".

**Attaching work to projects and vendors** (decided 2026-11-14). A task or a request carries at most one project and at most one vendor, both optional. That is enough to answer every question without a second kind of link:

- A project's vendors are the existing many-to-many list (`hoa_projects_vendors`), so a project can have several.
- The **vendor** on a task or request is the outside party doing the work; the **assignee** is the member responsible for seeing it done. Vendors are not assignees.
- A task that belongs to a contract takes its vendor from the contract; nobody picks it twice.
- On screen each is one chip in the detail's summary strip — "Roof replacement" · "Apex Roofing" — and one optional field in the form.

The vendor page then needs no new data: **Projects**, grouped Current · Upcoming · Past from the project's status and dates; **Open work**, one list of that vendor's tasks and requests; then Contracts, Bills and Discussion. The same work-list component renders on the project page, the vendor page and the home queue, with a different filter each time.

**Templates.** A project template is a saved set of phases, milestones and tasks with relative dates: 40-year recertification, roof replacement, reserve study, annual meeting, insurance renewal. Built-in ones ship with the paid module; a community can save its own.

**Across projects.** The projects index is a portfolio: one row per top-level project with ring, health, next milestone and needs count (`OrgTimeline.vue` is the start of this).

### 3.1 Owner invoices (today's "charges", `payment_requests`)

Decided 2026-11-14: "invoices" covers both owner invoices and vendor bills, owner invoices first; owners and admins see the word **Invoice**.

- **Issued notice.** Activating a charge sends an essential-class email and push, and finally writes `email_sent`. Bulk issues from a schedule can wait as held drafts for one approval (Earnest's `held_emails` idea).
- **One reminder path.** The reminder engine owns all dues reminders, including owners with no app account (email only); step 4 of the billing worker is deleted **(verify the engine can address email-only members first)**.
- **Manual send.** "Send reminder" on a row, on the detail, and in bulk. The confirm shows who receives it and a preview, and warns if one went out in the last 3 days. It writes to `hoa_reminder_log` like an automatic one.
- **Tracking.** Index filter: Open · Overdue · Paid · Draft. Columns: unit, remaining, due, last notified, next reminder. Aging strip above (current, 1–30, 31–60, 61–90, 90+). Detail timeline: issued → emailed (delivered or bounced, from the webhook) → each reminder (automatic or by whom) → payments.
- **Owner side.** The same timeline, read-only, so "I never got it" has an answer.
- **Fix in passing.** Cancelling a charge has no confirm.

### 3.2 Vendors, contracts, deliverables, bills

New Directus collections, created by scripts in the house style:

| Collection | Key fields |
|---|---|
| `hoa_vendor_contracts` | vendor, title, status (draft · active · ended), start, end, auto-renews, notice days, amount and cadence, files, **responsible** (a member) |
| `hoa_tasks` (extend) | contract link, recurrence, evidence file — a deliverable is a task that belongs to a contract |
| `payment_expenses` (extend) | vendor as a relation (free text kept for old rows), contract, invoice number, due date |

Decided 2026-11-14: deliverables are tasks, following §3.0. Tasks already have a due date, assignees and a slide-over panel, so a deliverable shows up in the same "assigned to me" list as everything else. A contract can also be linked to a project, which is how a roofing contract's deliverables appear on the roof project's timeline.

Vendors, contracts and project templates are one paid module (decided 2026-11-14), switched by the existing module toggles; the portfolio queue across communities is its agency tier.

- **Pages** (all on the §2.3 scaffold): Vendors index → vendor detail with tabs Contracts · Deliverables · Bills · Discussion (the vendor's channel, embedded).
- **Reminder rules** added to `core/shared/reminders/rules.ts`: contract renewal notice and expiry → the responsible person; deliverable before / due / overdue → the assignee, escalating to the responsible person after N days; bill due → whoever approves. Manual "Remind" uses the same button as invoices.
- **Who sees it.** Two new grant keys, `vendors` and `billing`. Admins see everything; a delegate sees the area they were granted; an assignee without the grant sees only their own items, in their queue.
- **Assigned to me.** One list on the home screen for every hat: deliverables, requests, approvals.

### 3.3 Taken from Earnest

| From Earnest | Lands as |
|---|---|
| `SendNewsletterModal`: test send first, dry-run count, From line | The send step of `EmailComposePage` |
| `email/activity.vue`: per-send rollup with failure counts | The email index and detail |
| Audience segments | A role/team picker (board, managers, owners, tenants, a team, owners with a balance) replacing the `@board` tokens; decide the fate of the unused `hoa_mailing_lists` |
| `ChannelThread` embed | Vendor, contract and invoice detail |
| Channels roster (categories, archived, search) | Compare and close gaps only |

Not taken: Earnest's WebSocket realtime. HOA Connect polls on purpose **(verify why)**; revisit only if polling cost shows up.

### 3.4 Responsibilities register

Added 2026-11-14. A register of standing jobs: one row per job, who holds it today, how often, what document says so. The board reviews it line by line; owners read the published version. It is not a task list: "reconcile the bank statements every month" is a responsibility, "reconcile October" is a task it can spawn (`hoa_tasks.responsibility`).

How it sits beside what §2.1 and §3.2 already decided:

| Question | Answered by |
|---|---|
| Who gets the reminder or the event for an area? | `manager_areas.notify` (§2.1). Unchanged. |
| Who answers for one contract? | `responsible` on the contract (§3.2). Unchanged. |
| Who does each standing job, in words a board and an owner can read, and who did it before? | The register. |

The register describes; the areas route. Each row may name one area from `AREAS`, which is how a later phase can show "the register says the CPA, the notify switch says the manager". Nothing syncs in the first slice.

**Who can hold a job.** Each assignee row points at exactly one of: a board office, a member, a user, a vendor, a team, or a free-text label ("City of Miami Beach", "Nobody"). A board office is the preferred target for board jobs: the row says "Treasurer", and the person is read from the board terms for the date in question, so an election changes no register rows.

**Access.** A new area, `responsibilities`, in `AREAS` with its gate file. Admins and members with that area's work switch edit; the hat alone gives nothing. Board members read everything. Owners and tenants read the published register only.

**Publishing.** One switch per community, off by default. Until it is on, owners see "The board hasn't published who handles what yet." Published rows show job, who, cadence and last verified; never basis, notes, disputes or history.

**Showing unassigned jobs** (decided 2026-11-14). A second switch, "Show unassigned jobs to owners", off by default. It exists for the case where a board or a manager will not say who does a job: the admin can still publish the gap. When on, a published job with no current holder appears to owners as "Unassigned since 12 October 2026", in its own group at the top of its category. Rules that keep it a statement of fact and not an accusation:

- Owners see the job, the word "Unassigned" and the date. No notes, no names of who was asked, no "disputed". A disputed job shows its current holder, or shows as unassigned if it has none.
- The date is derived: the day the last holder's row ended, or the day the job was added.
- Only an admin can turn either switch on or off. The `responsibilities` work switch does not include it, because the delegate may be the party who is not answering. Under decision 6 the account owner still has the final say over who is admin.
- Each change of either switch is written to `hoa_activity` with who made it.
- `member_visible` off still hides a single row, assigned or not.

**Screens.** On the §2.3 scaffold: index grouped by five categories (finance · building · mechanical and safety · compliance and records · people and community), detail in the standard layout with the assignee timeline as its timeline. PDF export of the grid, the document handed to the board. A seed list applied in one click; the first one is labelled "Florida condominium" because it names Chapter 718, SIRS and the 40-year recertification, and other states get their own.

**Map view** (decided 2026-11-14, Phase 2c). A second mode on the same page, Grid | Map, for admins and for owners. It adds no schema and reads the same routes.

- Holders on one side (offices with the person for the date, members, vendors, teams, each with a job count), jobs on the other in their five categories.
- Pick a holder: their jobs light up and the rest dim. Pick a job: its owner, backup and oversight light up.
- The "As of" control is a slider. Crossing a hand-over or an election animates the job from one holder to the next.
- Unassigned jobs and vacant offices sit in their own group in the attention colour.
- Following §2.4: job cards are solid content; the holder rail, the slider and the detail sheet are glass. Motion uses Vue transitions and honours `prefers-reduced-motion`.
- Not a node-and-line graph: about 45 jobs and a dozen holders tangle, and it fails on phones. On a phone the two sides stack and the holder rail scrolls sideways.
- Owners get the present day only, with no slider.

**Second slice, later:** the "who does this today?" survey of directors with a side-by-side diff, the monthly line-by-line review, the admin home tile. Their collections are not created until then.

#### History: end, don't erase

Decided 2026-11-14. Board seats change every year and sometimes mid-year, and "who was responsible then?" must stay answerable. One rule for both board terms and job assignments: **a change of holder closes one dated row and opens another. Nothing is overwritten and nothing is deleted.**

| Record | Today | Change |
|---|---|---|
| Board term (`hoa_board_members`: member, office, `term_start`, `term_end`) | The shape already holds history, and the Board tab lists past terms. But Edit overwrites the person and office in place, and Remove hard-deletes the row (`MembersPage.vue`). | Three separate actions. **End term** sets `term_end` and an `end_reason` (term ended · resigned · removed · changed office). **Change office** ends the row on a date and opens a new one for the same person. **Correct** fixes a typo in place and is the only in-place edit. Delete remains only for a row entered by mistake, behind a confirm that says so. |
| Job assignment (`hoa_responsibility_assignees`: target, role, `start_date`, `end_date`) | New | **Hand over** asks for the date, ends the current row and opens the next in one server call. No delete route. |

What that buys:

- **"Treasurer was responsible for this until October 2026."** One assignee row: office treasurer, ended 2026-10-31, followed by the row for whoever took it over.
- **"Who was the treasurer then?"** Read from the board terms for that date. A mid-year resignation shows as two terms inside one assignment.
- **As of.** A date control on the register and on the Board tab shows either one as it stood on any day. The PDF prints its as-of date.
- **Service history** on a member's detail: every office held and every job held, with dates.
- **Names survive departures.** When a row is ended, the server freezes the holder's display name on it, as meeting attendance already freezes the title "for history". A later archived or removed member still reads correctly.
- **Vacancy is visible.** An office with no current term shows as "Treasurer (vacant)" on every job it holds.

Owners see the present only. History is for admins, the board and the `responsibilities` area.

## 4. Phases

Each phase is one or two sessions and leaves `main` green (tests, 16+ audits, typecheck, build).

| # | Phase | Sessions | Model | Depends on |
|---|---|---|---|---|
| 1 | **Role context and capability nav** — `RoleContext`, one registry, PM hat, desktop PM entry, login routing, one grant list, naming and badge cleanup, denial redirects to home | 2 | Opus | — |
| 2 | **Resource scaffold** — `AppResourceIndex`, `useResource`, panel registry entries, the three audits as ratchets; convert Charges as the proof | 1 | Opus | — |
| 2b | **Responsibilities register, first slice** — §3.4: two collections, the `responsibilities` area and gate, board-term history actions, grid on the scaffold, hand-over, as-of, seed list, PDF, published owner view | 2 | Opus for schema and routes, Sonnet for pages | 1, 2 |
| 2c | **Responsibilities map** — §3.4: the Map mode for admins and owners, time slider, transitions, glass rail and sheet | 1 | Opus | 2b; glass polish after 4 |
| 3 | **Sweeps** — Members, Documents, Email, Meetings, Requests, Vendors onto the scaffold; ratchets to zero | 2 | Sonnet | 2 |
| 4 | **Glass layer and appearance** — material rules, clear and tinted glass in light and dark, accent wiring, remove the old knobs, reduced-transparency, one attention treatment for solid cards in place of side strips, one left edge for text outside cards (§2.4) | 1–2 | Opus for the material, Sonnet for the sweep | — |
| 5 | **Invoices** — issued notice, single reminder path, manual send, timeline, aging | 2 | Opus | 2 |
| 5b | **Money approvals** — decisions 16 and 17: the approval rule, `money_approvals`, routes as the only write path, Ledger entries, waivers, the Approvals page | 2 | Opus | 1 |
| 5c | **Correcting a charge** — what an admin may change on a charge an owner owes; lowering it, moving it or withdrawing it takes the board (§7, "Queued: correcting a charge") | 1 | Opus | 5b |
| 6 | **Work** — §3.0: the "Move to…" menu and its missing paths, lineage chips, derived progress and health, the Needs list, phase stepper, portfolio index, owner view | 2–3 | Opus | 1, 2 |
| 7 | **Vendors** — contracts, deliverables as tasks, bills, reminder rules, grants, project templates, module toggle | 2–3 | Opus, then Sonnet for pages | 6 |
| 8 | **Email and channels uptake** — §3.3 | 1 | Sonnet | 2 |
| 9 | **Role homes and settings** — five home screens on the §1 rule, the manager's portfolio home, one Settings tree; delete `/admin/email/*`, `/admin/announcements` and the legacy `useAnnouncements` source | 2 | Opus | 1, 5, 6, 7 |
| 10 | **Walk-through** — seed one login per role (manager with and without admin, and one person holding different hats in two communities); browser pass per role, phone and desktop | 1 | Sonnet | all |
| 11 | **Responsibilities, second slice** — §3.4: director survey and diff, monthly review, home tile, `next review` wired to the reminder engine | 2 | Opus, then Sonnet | 2b, 9 |

Phase 2b has a date: the 1033 Lenox board is seated 2026-12-09 and needs the grid and the PDF by then. Order to meet it: Session 2 (Phase 1b), Phase 2, Phase 2b. If Phase 2 slips, 2b builds its index on `AppDataTable` directly and Phase 3 converts it. Prompt: `docs/prompts/responsibilities-register.md`.

About 21–25 sessions. Phases 1, 2 and 4 are independent and can run in parallel worktrees. Phase 1 now includes the engagement record and the per-area manager switches from §2.1.

## 5. Keeping token use low

- **Scaffold before sweep.** Phase 2 makes Phase 3 mechanical, which is what lets it run on the cheaper model.
- **Audits instead of reading.** A session checks compliance by running `pnpm audit:all`, not by re-reading pages.
- **One section per session.** The kickoff prompt names this file's section and the files to open; nothing else is read up front. Surveys go to read-only subagents that return conclusions.
- **Spec first for the two risky pieces** (role context, the single reminder path): a short spec with named tests, then build — the pattern `spec-email-send-queue.md` used.
- **Shared code over copies.** One grant list, one nav registry, one reminder button, one form per resource.
- **Log deviations here**, a few lines per session, so the next session does not rediscover them.

## 6. Decisions

Settled 2026-11-14:

1. "Invoices" is both owner invoices and vendor bills, owner invoices first, and the word is Invoice.
2. Property manager is a hat on a membership, separate from account ownership and from access (§2.1).
3. Deliverables are tasks; requests, tasks and projects are one work model with no ticket collection (§3.0).
4. Appearance is Light / Dark / Auto plus a Tint switch (§2.4).
5. Vendors, contracts and project templates are a paid module.

6. The account owner (the payer) decides who is admin and who is removed; no protected board seat.
7. A community can have several managers, each with a title and per-area access and notification switches.
8. Each person picks their own tint colour from a fixed set of swatches.
9. Tasks and requests carry at most one project and one vendor.
10. A responsibilities register is added (§3.4). It describes who does each standing job; `manager_areas.notify` keeps routing.
11. History is kept by ending dated rows, for board terms and job assignments alike. In-place edits are corrections only.
12. A job can be held by a board office, so elections do not rewrite the register.
13. Owners see the register only after the community publishes it, and see the present only.
14. An admin can choose to show unassigned jobs to owners, as a dated fact with no commentary. Admin only.
15. The register gets a Map mode (Phase 2c): two-sided highlight with a time slider, not a network graph.
16. Money is overseen, not delegated: every board seat reads the books; no single officer writes them. Money going out needs approval by two of the operating committee (President, Treasurer, Secretary), or a board majority where there is no committee, never by the person who entered it, and each approval is in the Ledger.
17. Money approvals, confirmed with the operator 2026-11-14 (`docs/spec-money-approvals.md`): recording an expense paid before approval is allowed and flagged for good, with the whole board notified, because the books must match the bank. Waiving or cancelling an owner charge needs the same approval as spending. Every expense needs approval, with no small-amount limit for now. The HOA Admin role approves nothing; approval comes from board seats only.

## 7. Status

Legend: `[ ]` not started · `[~]` in progress · `[x]` shipped and green.

| Session | Phase | State | Notes |
|---|---|---|---|
| 1 | 1a — Role context: spec, resolver, one area list, schema script | [x] | Spec `docs/spec-role-context.md`. Schema script run by the operator 2026-11-14; types regenerated. Prompt: `docs/prompts/role-first-s1-role-context.md` |
| 2 | 1b — Capability nav: one registry, manager entry on desktop, badges, login routing | [x] | Spec `docs/spec-capability-nav.md`. Registry `core/shared/nav/registry.ts`. Prompt: `docs/prompts/role-first-s2-capability-nav.md` (Opus 5.5) |
| 3 | 2 — Resource scaffold: AppResourceIndex, useResource, panel registry, three ratchets, Charges | [x] | Spec `docs/spec-resource-scaffold.md`. Landed in one session, so 2b builds on it. 19 audits. Prompt: `docs/prompts/role-first-s3-resource-scaffold.md` (Opus 5.5) |
| 4 | 5b — Money approvals, part 1: rule, schema, routes, Ledger, notifications, Expenses and Approvals pages, expense write lock | [x] | Shipped 2026-11-17/18 in six gated commits (`3ba94a8`…`b388dfc`) and one refinement (`9dabcf1`: early edits amend, small boards approve, board changes settle). Spec `docs/spec-money-approvals.md`. Schema applied to the instance and types regenerated; the write lock applied (HOA Admin delete on `payment_expenses` removed; audit 0/0/0), both at Peter's go-ahead. Title reshapes an expense like amount and vendor (asked, 2026-11-17). Checked in the browser as the demo admin only. **Operator TODO:** deploy (until then the live Expenses page cannot delete). Not pushed. Prompt: `docs/prompts/role-first-s4-money-approvals.md` (Opus 5.5) |
| 5 | 5b — Money approvals, part 2: waivers, "Ask to waive" on Charges, receipts through the server, charge cancel lock | [x] | Shipped 2026-11-18 in four gated commits (`23565b4`, `a61e827`, `597799a`, `9859725`) and one follow-up (`68b3830`: raced requests and paid charges close their approvals). No schema run. The charge cancel lock removes the HOA Admin's update and delete on `payment_requests` (create and read stay): applied 2026-11-18 at Peter's go-ahead (#184, #185); second dry run nothing, `pnpm setup:permissions:audit` 0/0/0. Checked by the route and composable tests only, not in the browser (Session log). **Operator TODO:** deploy, then push. Not pushed. Prompt: `docs/prompts/role-first-s5-money-waivers.md` (Opus 5.5) |
| 6 | 2b — Responsibilities register, part 1: spec, shared code, area, schema script, routes (brief commits 1–5) | [x] | Spec `docs/spec-responsibilities.md`. All five landed, plus the service-history route. Schema script and permissions run by the operator 2026-11-15; types regenerated. The permissions run widened three older reads and edits, and channel access did not follow membership: both fixed and applied 2026-11-15 (Session log TODO 2b, 2c). The admin scope (TODO 6) applied 2026-11-15; the shared-write and relation-rule fixes, with routes for attendees, pets and vehicles, and board terms, applied 2026-11-16 and checked through the API and in the app. Owners report leases from My Household (2026-11-16, Session log TODO 8; its schema script not run). Invitations can be accepted again, by new accounts and by people with an account elsewhere, and the admin lease form keeps its PDF (TODO 9). An existing account gets its new community role's access, the dead accept pages are gone, and expense receipts are kept (TODO 10). Expense creates and edits are routes that check the project and receipt; the two HOA Admin rules are removed (TODO 12, applied 2026-11-16). The HOA Admin writes on documents, meetings and amenities lose their file fields, a new document's file is checked by the proxy, and document upload works again (TODO 13, applied 2026-11-16). No community policy places a file or folder any more, the routes do, and receipts and lease PDFs are filed in each community's Records folder (TODO 14; rules, file scopes and backfill applied 2026-11-16). Brief: `docs/prompts/responsibilities-register.md`. Prompt: `docs/prompts/role-first-s6-responsibilities.md` (Opus 5.5) |
| 7 | 2b — Responsibilities register, part 2: Board tab, admin register, owner view, service history (brief commits 6–9) | [x] | Shipped 2026-11-16 in five commits (`1149c6f`, `6fdba19`, `8512d54`, `4d0752a`, `9e3750e`). Checked in the browser as the demo admin only; a board seat, a manager with the grant and a plain owner could not be reached (Session log). Pushed and deployed 2026-11-17; the permission change is applied; the Florida list is applied in 1033 Lenox. Due before that board is seated 2026-12-09: its board terms, holders and publishing (TODO 2). Follow-up: the register's rows collapse badly (Session log). Spec `docs/spec-responsibilities.md`. Prompt: `docs/prompts/role-first-s7-responsibilities-pages.md` (Sonnet 5.5) |
| 8 | Delegation to members: volunteer and committee grants (spec first, then build) | [x] | Shipped 2026-11-17 in seven build commits after the spec (`1dfef57`…`c10b1fb`) and five fixes from the live check (`ede6551`…`82b8ba9`). Spec `docs/spec-delegation.md` (decisions confirmed with Peter). `hoa_area_grants` created on the live instance 2026-11-17 and types regenerated. Checked in the browser as Oscar, Peter (admins), Obie (a helper, board seat) and Tester Two (a committee member, tenant) on 1033 Lenox; everything granted was ended and the test team deleted. **Operator TODO:** apply the 3 HOA Admin removals on `hoa_team_members` (`pnpm setup:permissions`). Not pushed. Prompt: `docs/prompts/role-first-s8-delegation.md` (Opus 5.5) |
| 9 | 2c — Responsibilities map: the Map mode beside the grid, for admins and owners | [x] | Shipped 2026-11-18 in three gated commits (`10b1b71`, `5b2b5d4`, `623685a`) and a docs commit. No schema, no route, no permission change. Grid \| Map (`?view=map`) on the register and on the owner page; the admin's slider resolves any day from the rows already loaded. Checked in the browser as the demo admin only (Session log), at 375, 768 and 1280 px, light and dark; reduced motion through a stubbed `matchMedia`, not the OS setting. **Operator TODOs:** clear the demo rows (`scripts/clean-demo-responsibilities.ts`, at Peter's go-ahead), push, then deploy. Not pushed. Prompt: `docs/prompts/role-first-s9-responsibilities-map.md` (Opus 5.5) |
| 10 | Restricted members: posting paused, membership kept (and archived members stop writing) | [x] | Built 2026-11-17 in six gated commits after the spec (`01457c9`…`4ad8bac`) and three fixes from the live check (`1b9fefc`, `c1ec2ba`, `67beb41`). Spec `docs/spec-member-restrictions.md`. `hoa_member_restrictions` created on the live instance and types regenerated (at Peter's go-ahead). Checked in the browser as Peter (admin), Tester Two (paused) and Obie (board seat); both test pauses lifted. **Operator TODOs:** deploy, `pnpm add:admin-scope` (creates and back-fills `active_in`, `posts_in`, `posts_to`), then `pnpm setup:permissions` — until then archived and inactive members can still write through Directus and a pause rests on the server checks alone. Not pushed. Prompt: `docs/prompts/role-first-s10-member-restrictions.md` (Opus 5.5) |
| 11 | 5c — Correcting a charge: what an admin may change on a charge an owner owes, and which changes need the board | [x] | Shipped 2026-11-18 in seven gated commits (`19340c1`…`a26aa01`). Spec `docs/spec-charge-corrections.md`, the six decisions confirmed with Peter as recommended. Admins edit the words, raise the amount and move a due date before it is due, and withdraw a hand-entered charge within 24 hours; lowering a charge is a partial waiver and the wrong household a `move` approval, both for the board; a full waiver takes its late fees. Schema applied to the instance at Peter's go-ahead (second dry run nothing; types regenerated); no permission changed. Checked in the browser as the demo admin only (Session log). **Operator TODO:** deploy, then push. Not pushed. Prompt: `docs/prompts/role-first-s11-charge-corrections.md` (Opus 5.5) |
| 12 | 4 — Glass and appearance, part 1: glass as a layer, Light/Dark/Auto and Tint with per-person swatches, reduced transparency and contrast, one attention treatment for solid cards, one left edge | [x] | Shipped 2026-11-18 in three gated commits (`bd1d44b`, `410b0b1`, `229edc2`). The five answers confirmed with Peter as recommended (§2.4). No schema, no route, no permission change (`/api/user/app-prefs` now carries `{ tint }`). Checked in the browser as the demo admin only, at 375, 768 and 1280 px, light and dark, Tint on (Violet, Teal) and off; the demo admin's prefs put back (Auto, Tint on, community). Reduce Transparency and Increase Contrast read from the compiled CSS, not the OS. Census and the sweep prompt written. Not pushed. Prompt: `docs/prompts/role-first-s12-glass-appearance.md` (Opus 5.5) |
| 13 | 4 — Glass and appearance, part 2: the sweep — glass off 16 content surfaces, per-page accents removed, text outside cards on one left edge | [x] | Shipped 2026-11-18 in two gated commits (`7d4a9e7`, `ce5e520`). No schema, no route, no permission change. Sixteen content surfaces and the three state cards are solid `ios-card`; five page headers are no longer boxes; `WidgetGlass` is deleted; every per-page `accent-*` is gone; the `overlay-boxes` baseline went 27 to 26. Checked in the browser as the demo admin only, at 375 and 1280 px (Section 4 of the log). Not pushed. Prompt: `docs/prompts/role-first-s13-glass-sweep.md` (Sonnet 5.5) |


### Queued: correcting a charge (Session 11)

Asked 2026-11-18. Since Session 5's cancel lock, no policy updates or deletes a charge (`payment_requests`), and the app never had an edit screen, so a charge entered wrong (amount, household, title, due date) can only be waived, with the board's approval, and entered again. Found in the code that day:

- The New charge form creates through Directus with the admin's token, status `active` at once: there is no draft, so a mistaken charge is live (and can be reminded) as soon as it is saved.
- Late fees are separate charges made by the billing worker from a charge's `due_date` and the grace days, pointing back by `source_id` (`lateFeesToApply`). Moving a due date earlier can make a household late; later can avoid a fee. Waiving a charge leaves its late fees owing.
- A Stripe payment is split across the charges it names, oldest due first, when the webhook arrives: a correction during a payment in flight lands on whatever remains.
- A charge from a recurring schedule (`source: schedule`) can be corrected alone; its schedule makes the next one the same way.

What each correction gives up (recommended answers, to confirm in the spec):

| Change | Gives up income? | Recommended |
|---|---|---|
| Title, description, notes | No | Free for an admin; a board-only Ledger entry |
| Amount up | No: the household owes more | Free for an admin; the owner is told; Ledger (board) |
| Amount down | Yes | A partial waiver: `waive` with an amount, the same rule; approved, the amount and what remains drop |
| Due date | Can avoid or cause a late fee | Free while the charge is not yet due and no late fee is charged; never to a past date; otherwise refused |
| Household (member, unit) | Yes, for one household | Only before any payment, through the same approval as a waiver |
| Withdraw a charge made in error | Yes | A short window: whoever created it, or an admin, may withdraw an unpaid charge with no reminder sent, within 24 hours; after that it is a waiver |

Decisions for the operator (Session 11 asks them in one message, then writes the spec):

1. Amount down: a partial waiver through the board (recommended), or free for an admin below some amount?
2. The withdraw window: yes or no, and how long (recommended: 24 hours, unpaid, no reminder sent).
3. Wrong household: the correction approval (recommended), or always waive and enter again?
4. Late fees: when a charge is waived, are its late fees waived with it in the same approval (recommended), or each on its own?
5. Does the owner hear of every correction, or only of the amount and the due date (recommended)?
6. Who corrects: admins only, as charges are created today (recommended), or every `money:enter` holder?

Likely shape, for the spec to settle: `PATCH /api/org/money/charges/[id]` for the free corrections; `POST …/waive` taking an optional amount; `POST …/withdraw` if decision 2 is yes; `money_approvals` gains an `amount` (and perhaps a `correct` kind with the proposed change); a `charge_corrected` Ledger event (board, it names a household); a "Correct charge" sheet in the Charges panel. No policy gains update or delete on charges.

### Queued: delegation to members (Session 8)

Asked 2026-11-16; prompt written 2026-11-17 (`docs/prompts/role-first-s8-delegation.md`). Found by reading the code that day:

- **Grants reach property managers only.** The ten grantable areas (`AREAS`, `core/shared/transition/grants.ts`) go to `hoa_members` rows with the Property Manager role: `getManagerGrants` reads only those (`core/server/utils/manager-access.ts`), and `POST /api/org/managers/grants` refuses anyone else ("That member is not a property manager."). The admin switches them in Settings → Property management. A volunteer or committee member cannot be given one.
- **No area covers announcements, events or meetings,** the things a committee most often posts. `vendors` and `billing` are notify-only.
- **Teams give two things, one of them in the page only.**
  - A team lead gets `projects:write` and `milestone:approve` on their team's projects, and the server checks it (`board-access.ts`, `project-access.ts`).
  - A team whose domain matches a request's type gets board-style controls on that request, but only in `app/pages/[slug]/requests/[id].vue` (`isBoard`); no server route was found that honours it, so those controls may fail or rest on other rules.
- **Two board capabilities are in the matrix and nowhere else:** `communications:send` (President) and `violations:manage` (board) in `core/shared/permissions.ts`. Sending email checks `requireAdminOrManagerGrant(…, "communications")`, which admits admins and managers only.
- Polls and reactions already work for residents: a member votes on a poll card (polls page, the feed, the home glance) and reacts to channel messages, feed items and comments; admins, board seats and managers with the `feedback` grant create polls. One loose end: `vote()` in `core/app/composables/usePolls.ts` takes the community from `selectedOrgId`, where every other poll call uses the page's slug.

Scope for Session 8, to settle in its spec with the operator:
1. Who can hold a grant: any member of the community, one at a time ("helper"), and a team as a whole ("committee"), whose members hold its grants while they are on it. The grant list stays `AREAS`; the record of who holds what moves off the Property Manager role check.
2. New areas: announcements (post and edit), events and meetings (create and edit, not minutes approval), and perhaps documents for a committee's own folder. Each one checked on the server, as `requireAdminOrManagerGrant` checks today.
3. Server checks for the team-domain request controls, or the controls go.
4. Enforce or drop `communications:send` and `violations:manage` for board seats.
5. The admin's UI: grant from the member's page and from the team page, with the same switch list and presets as Property management. Every grant change goes in the activity log.
6. What a holder sees: the area's pages in their dock, as a manager's grants do (§2.2), and nothing else of the admin's.

### Session log

(Each session appends: shipped, deviations, operator TODOs.)

#### Session 1 — Phase 1a, role context (2026-11-14)

**Operator TODOs (schema script first)**

1. ~~Run `scripts/add-manager-hat.ts`, then `pnpm generate:types`.~~ **Done 2026-11-14 by the operator.** The regenerated types are committed. Rows now resolve with `source: "hat"`. The back-fill turned every `notify` off, so `resolveNotified` still returns the admins until someone switches an area on. Any environment the script has not reached still resolves as `"legacy"`, which is today's behaviour.
2. Read the script's list of "admins linked from a management vendor". For each admin who manages the community, set `is_manager` (and `manager_title`) by hand. The script changes no admin rows.
3. If the `hoa_members` read policies are field-limited, the three new fields are invisible to app users. That is fine for now, because the server reads them with the admin token. Session 2 needs them only if the client reads them.
4. Later, in one change: move `manager_areas.work` from mirror to source. The grants route, invitations and transition revocation write it, and `getManagerGrants`, poll, project and activity access read it.

**Shipped** (each commit gated: typecheck 0, vitest green, lint 138 against a cap of 148, build green, 16/16 audits)

- `c8eef40` `docs/spec-role-context.md`: the shape, where each field comes from, the area list, the notify fallback and the named tests.
- `2ceb0de` one area list: `AREAS` in `core/shared/transition/grants.ts` (11 areas). `MANAGER_GRANT_KEYS`, labels and type derive from it, in the old order. `vendors` and `billing` added. The client's private five-key copies in `useCurrentDomainAccess` and `middleware/manager.ts` are deleted.
- `1c7ddbf` `resolveRoleContext()` in `core/shared/roles/role-context.ts`, with table tests (22).
- `6d36fd1` `scripts/add-manager-hat.ts`: idempotent, with `--dry-run`. Commits 3 and 4 were gated together, since the script is imported by nothing.
- `a0c449d` `GET /api/org/role-context` with org-scope tests, `useRoleContext()`, and a shared `resolveCapabilities()`. `useCapabilities` and `useCurrentDomainAccess` are re-pointed. An equivalence test runs the old rules against the new composable over 2,304 input combinations.
- `a9300e9` `resolveNotified(orgId, area)` with the pure `pickNotified()`, and tests. It is not wired into the reminder engine.

**Deviations and decisions**

- `projects`, `activity` and `feedback` are **kept**. Each already has a real server gate:
  - `projects`: `project-access.ts`, `expenses/record`, `requests/[id]/promote`;
  - `activity`: `GET /api/org/activity` data scope;
  - `feedback`: `poll-access.ts`.

  What they lack is a manager page, and that is Session 2's nav work. Every grantable area names its gate file in `AREAS`, and a test checks that the file exists and names the key.
- `vendors` and `billing` are **notify-only** (not grantable) until they have gates. Adding them as grants would have changed presets, the "Full service" match for existing managers, the settings switches and the ledger.
- `canWork` reads `manager_permissions`, not `manager_areas.work`. Every enforcement path and every writer uses `manager_permissions`, so reading a second store would drift. Access via a grant also requires the Property Manager role, as `getManagerGrants` does today. The hat is identity only.
- `useCurrentDomainAccess` answers synchronously, because middleware runs before any fetch. It runs the shared resolver over the cached membership and keeps four client-only rules as named compat:
  - any status counts as live;
  - the legacy Administrator role counts as admin;
  - the HOA Admin global role plus any membership counts as admin;
  - the client's own board-term date filter.

  `isPropertyManagerOfCurrentDomain` stays the role check, because `manager.ts` uses it for access. `currentDomainManagerPermissions` now returns all nine grant keys; the five it returned before keep their values.
- `/api/org/capabilities` now calls the shared `resolveCapabilities()`, with the same output. `useCapabilities` reads the role-context response. A non-member gets the same empty arrays (now from a 403), plus one console line.
- The plan's "10 grant keys" was 9; there are now 11 areas.
- Plan §2.1 "(verify)": confirmed with a correction. `hoa_vendors` links both `user` and `hoa_member`. Only `user` is read, by inquiry routing for the in-app recipient. Neither is used for access, and nothing ties a membership to an engagement yet.
- Self-billed communities have no owner field, so `isAccountOwner` there means an HOA Admin on an active membership. Platform staff are never the account owner.
- Existing tests are untouched. New files: `tests/shared/areas.test.ts`, `tests/shared/role-context.test.ts`, `tests/server/role-context-org-scope.test.ts`, `tests/composables/useCurrentDomainAccess.test.ts`, `tests/server/resolve-notified.test.ts`.

#### Session 2 — Phase 1b, capability nav (2026-11-14)

**Operator TODOs**

1. ~~**Payments read policy (security).**~~ **Done 2026-11-14.** The Member policy read `payment_requests`, `payment_schedules` and `payment_transactions` with the org-wide filter, so any member could read every charge in their community through the API. Org-wide money is now read only through `GET /api/org/money/charges`, `/api/org/money/schedules` and `/api/org/expenses`, which check admin or `money:read` (`core/server/utils/money-access.ts`). A member's own Payments page and home read only their own rows. `pnpm narrow:payment-reads --apply` ran against the live instance: it narrowed the HOA Member policy's three reads to `member.user = $CURRENT_USER`, the filter `payment_methods` already uses, and a dry run afterwards found nothing left to change. `setup-directus-permissions.ts` carries the same rule, so a full re-run keeps it.
2. Give a manager who is also an admin the hat (`is_manager`, `manager_title`) by hand, as in Session 1 TODO 2. Until then their dock has no Queue and they land on the org root. **1033 Lenox, 2026-11-14:** at the operator's request, `is_manager` is now on its two active HOA Admin rows, which are the operator's test accounts. No title was set.
3. ~~Decide whether the Treasurer should write.~~ **Decided 2026-11-14 (decision 16): no office writes money.** `money:write` is now held by no office, and every board seat reads. Money going out gets a two-person approval in its own session.
4. If a treasurer holds the HOA Admin role, they can still record and approve anything in the app, because admin bypasses every money gate. The account owner can remove the role (decision 6). The approval session will close this gap for admins too. **Spec'd 2026-11-14** (decision 17): the HOA Admin role approves nothing, and every expense write goes through routes.
5. **HOA Admin policy scope (security, review).** **Fixed in code 2026-11-15, `1a5ef6d`; apply steps in the Session 6 log, TODO 6.** The dry run shows the HOA Admin policy's money reads filtered by `organization in $CURRENT_USER.hoa_members.organization`, meaning any community the user belongs to in any role. An admin of one community who is a plain member of another can therefore read the second one's charges through the API. That is likely true of every admin-level permission. Narrowing it means filtering on memberships with the HOA Admin role: one change across the admin policy, not just money.

**Shipped** (each commit gated: typecheck 0, vitest green, lint 138 against a cap of 148, build green, 16/16 audits)

- `922a8a1` `docs/spec-capability-nav.md`: entry shape, layouts, every entry and its gate, and the two decisions below. The layout rule was simplified in the next commit: the manager layout is "not admin, with a `canWork` area".
- `860d5c7` the registry, `core/shared/nav/registry.ts`, the only source of nav entries. `module.global.ts` builds its route table from it, and the new `nav-gate` middleware admits a page when an entry covering it meets its access needs. `useNavContext()` builds the context. `useRoleContext` now forwards the cookie during SSR (`useRequestFetch`) and runs one fetch and one watcher per org. Test: `tests/shared/nav-registry.test.ts` (75): every entry's gate against its page's middleware for 16 personas, the old module table, no grant without a gate, and each role's dock.
- `6a5cb03` the dock, App Library, section pills, Spotlight, mobile sheet and Breadcrumbs read the registry. `appsFor(isAdmin)` is deleted. `ADMIN_APPS`, `MEMBER_APPS` and `ADMIN_SECTION_LINKS` are derived from the registry, so page transitions are unchanged.
- `2a68949` the manager entry on desktop: Queue as the first slot for an admin with the hat. `GET /api/user/hats` and the switcher badge (`core/shared/roles/hat-badge.ts`). The `manager` middleware admits on areas. `/manage` lands in registry order. Test: `tests/server/user-hats.test.ts`.
- `6082097` login routing: `resolveHomePath()` sends a manager (hat) who can work an area to `/[slug]/manage`, from login and from `/dashboard`. Everyone else lands as before. Test: `tests/composables/useHomeRoute.test.ts`.
- `1c82217` the four client compat rules are retired. `useCurrentDomainAccess` uses the server context once it is loaded for the org on screen, and the `admin`, `admin-or-board` and `manager` middleware load it first. The cached membership now carries `status`. Board terms use the server's rule (`isCurrentBoardTerm`, both ends inclusive, UTC dates). Test: `tests/composables/useCurrentDomainAccess.test.ts`, rewritten against the server's rules.

**What a user sees change**

| Who | Before | Now |
|---|---|---|
| Every board seat | Owner dock | Owner dock plus Money (Payments, Expenses, read-only: no new charge, mark paid, cancel, edit or delete; no receipt links yet). Approvals (member changes) still waits |
| Property manager, not admin | Resident dock; manager links only in the phone sheet | Queue plus one slot per area they can work, on desktop and phone. The resident apps leave their dock |
| Property manager with no grants | Sheet showed "Overview"; `/manage` showed "no permissions yet" | Resident dock; `/manage` redirects to Documents |
| Manager with only Feedback, Projects or Activity | `/manage` said "no permissions yet" | `/manage` opens Polls, Projects or Activity |
| Manager with Projects | `/admin/projects` refused | Opens it (the server already let them write) |
| Manager with Directory | Approvals reachable only by URL | Approvals slot |
| Admin with the manager hat | No queue | Queue first in the dock; lands on the queue at login |
| Everyone, org switcher | One role label | Every hat ("Admin · Board · Owner"), and a "Manager · title" chip |
| Admins | Teams pill showed with Directory off, then bounced | Teams hides with Directory off; People hides when Directory, Board and Vendors are all off |
| Admins | `/admin/files`, `/admin/vendors` opened with their module off | Redirect home, like every other module route |
| Members | Dock Board ignored `show_board`; sheet Board and Documents ignored their modules | Both honour both, the same everywhere |
| Legacy Administrator membership role | Admin chrome (the server refused its calls) | No admin chrome |
| HOA Admin global role with a member row | Admin chrome (the server refused its calls) | No admin chrome |
| Archived or inactive membership | Hats and grants still showed | None; pending keeps admin only, as the server does |
| Board term on its last day | Lost the board hat at 00:00 UTC | Board through the end date |

**Deviations and decisions**

- **Asked and decided with the operator, then revised the same day:** Money is read-only oversight for **every board seat**, not just Treasurer and President (decision 16). The operator's community has a treasurer acting without approval, so visibility goes to the whole board, and no office writes. Members have no Directus access to `payment_expenses`, so the first version showed board seats an empty expenses list. `GET /api/org/expenses` (admin or `money:read`) now serves it read-only. Receipts stay admin-only until they are served through the server too.
- The first answer was Money for Treasurer and President only, because §2.2 said "a board member's dock gains Money and Approvals because they hold the capability" and only those two seats held `money:read` then. No capability covers Approvals, and `isChangeReviewer` admits only admins and managers with Directory. So Approvals waits until it has a board capability and a server gate. Managers with Directory get it now.
- **Asked and decided with the operator:** a manager's dock is Queue plus their areas (§2.2 "exactly the delegated areas"). The resident apps leave it.
- The hat picks the layout and the home, never a need. Layout: admin (admin hat, not previewing), manager (not admin, with any `canWork` area), member (everyone else, and an admin previewing).
- `projects`, `activity` and `feedback` each have an entry now: `/admin/projects` (moved to `nav-gate`), `/admin/activity` (its page and route already admit the grant) and `/polls` (the server's `viewer.canManage`).
- **Waits, with reasons:** `violations` is worked on the inquiries page and has no page of its own. `contact_platform` is an action, not a destination. `vendors` and `billing` are notify-only, so they have no entry.
- `isPropertyManagerOfCurrentDomain` stays the role check. It only drives copy, the assistant launcher and record search. Access reads areas. Making it "any `canWork` area" would have made it true for every admin, and three callers test `isPM && !isAdmin`.
- `manager_title` and `is_manager` are not added to the client's membership read. Naming a field that does not exist fails the whole read, and environments before the schema script have no such field. The hat comes from the server: `GET /api/user/hats` and the role context.
- The member Payments and Requests slots are `pay` and `my-requests`, because one registry cannot hold two `payments` ids. The admin Money hub keeps `payments`. Badges map to both ids.
- The Records hub keeps its module gate (any of its five modules), even though its Ledger pill is ungated. That carries today's rule over unchanged.
- `projects` is a module key with no switch in Settings → Modules. The registry test allows it and says so.
- The member home page's tiles (`MemberDashboardPage`) do not read the registry yet. That belongs to the role homes (Phase 9).
- Phase 1 items not in this session's brief, carried: naming cleanup ("Resident" vs "Member"), denial redirects to home (denials still go to `/documents`), and the engagement record (§2.1).
- Existing test changed: `useSectionNav.test.ts`. With Directory, Board and Vendors off, People resolves to nothing instead of `/admin/teams`, which `module.global` refused. `useCurrentDomainAccess.test.ts` is rewritten. Its oracle is now the server's rules instead of the pre-Session 1 client rules, with one case per retired rule.

#### Session 3 — Phase 2, resource scaffold (2026-11-14)

The scaffold landed in one session, so Phase 2b builds on it, not on `AppDataTable` directly.

**Operator TODOs**

1. Look at Charges on a board seat's login (money:read, not admin). The tests and the template gates say a board seat sees the rows, filters and the charge panel with no New charge, no Mark paid and no overflow menu. The demo login is an admin, so this session could not check it in a browser.
2. Session 5 ("Ask to waive", the charge cancel lock) works on the converted page. Cancel has one path, `remove.run` in `core/app/composables/useChargesResource.ts`, used by the row's overflow menu and the panel's. Lock it there. "Ask to waive" belongs in the same two overflow menus.

**Shipped** (each commit gated: typecheck 0, vitest green, lint 138 against a cap of 148, build green, audit:all green)

- `c746564` `docs/spec-resource-scaffold.md`: `useResource`, `AppResourceIndex`, the panel registry entry, Charges, and the three audits.
- `92dd9bd` `useResource` (`core/app/composables/useResource.ts`). Rows sit in `useState("resource:<key>")` with their org, so an index and its panel share them and make one request between them. It also holds the search, one status filter, more filters, the selection, the open panel on `?slide=`, and remove through `useConfirm`. Loads run on the client only, as the page's `server: false` reads did. Panel registry entries gain `resource`, `index` and `page`, with `getPanelEntry()` and `recordPath()`. Tests: `tests/composables/useResource.test.ts` (27), `tests/components/panel-registry.test.ts`.
- `62501d0` `AppResourceIndex` (`app/components/App/ResourceIndex.vue`), rendered in `/ui-kit` on the sample members.
- `e0d6ea1` Charges on the scaffold. `useChargesResource` (definition, helpers, Mark paid), `ChargePanel`, `PaymentChargeForm`, `AppResourceRecordPage` with the route `/admin/payments/charges/[id]`, and `AppSlideOverShell`'s `page` mode. Test: `tests/composables/useChargesResource.test.ts` (the read goes through `/api/org/money/charges` and never through Directus; the default view; filters; the cancel confirm; Mark paid once).
- `b8f2bf9` The three audits as ratchets in `audit:all` (19 now): `page-h1` at 42, `form-dialogs` at 27, `filter-pills` at 8. Matchers in `scripts/lib/audit-matchers.ts` with table tests. Each gate failed on one added violation (checked, then reverted).

**What a user sees change** (Finances, `/admin/payments`)

| Who | Before | Now |
|---|---|---|
| Everyone who opens Finances | "Finances" as a heading in the page | The title in the shell header, the Stripe badge beside it, New charge top right (admins) |
| Everyone | Tabs and filters as pills | Tabs as a segmented control. On Charges: a search box (new), one Outstanding · Paid · All control, and the type as a select |
| Everyone | A charge was a row only | Clicking a row opens the charge (status, amount due, details, timeline). A link to it opens as a full page |
| Admins | New charge opened a card inside the page | It opens a sheet (a centred dialog on desktop) with the same form |
| Admins | Cancel was an X beside Mark paid, with no confirm | Cancel is in a `…` menu on the row and in the charge, and asks: "Cancel “Roof”? Ann Lee will no longer owe $450.00." |
| Admins | With no charges, "No matches" | "No charges yet", with New charge |
| Board seats (money:read) | Read-only | Read-only, and they can open a charge too |

**Deviations and decisions**

- **Deep links get a full page.** §2.3 says the detail is "the same component as a full page on phones and for deep links". From the index the record opens as `?slide=charge:<id>`, which is full width on phones. A deep link uses the route `/admin/payments/charges/<id>`, which renders the same `ChargePanel` with `page` set. `AppSlideOverShell` then draws `AppPageHeader` with Back instead of its slide-over header. A test checks the route's middleware matches the index's and that the nav registry gates the two paths the same way.
- **The count leads the toolbar on a hub page.** Finances owns its header (title, badge, New charge) across four tabs. So the Charges index is headless, and its count ("15 charges") opens the toolbar. A page that is one resource passes `title`, and the count sits in the header.
- **The type filter is a select.** §2.3 allows one segmented status filter, so the type pills became a `Select` in the `#filters` slot.
- **Cancel has no Undo.** Reopening a charge bills the member again, which is its own decision. Session 5 puts cancel behind approval.
- **The panel shows what the route returns.** `/api/org/money/charges` returns no description or email. The route is unchanged, so neither read widened. The timeline has the two dates the route carries: created and paid.
- `reset()` clears search and filters but keeps the status segment, which is a view.
- **Build heap.** `pnpm build` ran out of heap at the default size. Every gate in this session ran it with `NODE_OPTIONS=--max-old-space-size=6144`, as the typecheck already did.
- **Census against matcher.** The census (a plain grep) found 48 h1s, 39 Dialog lines and 12 pills. The matchers skip comments and count Dialog elements, which gives 43, 27 and 11 before Charges.
- The `/ui-kit` hydration warning comes from the existing `DateTimeInput` demo, not from this work.
- Existing tests are untouched. New files: `tests/composables/useResource.test.ts`, `tests/components/panel-registry.test.ts`, `tests/composables/useChargesResource.test.ts`, plus three blocks in `tests/scripts/audit-matchers.test.ts`.
- Out of scope, per the brief: invoices, vendors, work and glass. The Recurring tab stays a plain table: schedules are a resource of their own, for Phase 3 or Phase 5.

#### Session 6 — Phase 2b part 1, responsibilities register (2026-11-15)

All five commits landed in one session, plus one more: Session 7 builds only pages.

**Operator TODOs (schema script first)**

1. ~~Run `pnpm create:responsibilities --dry-run`, read it, then `pnpm create:responsibilities`, then `pnpm generate:types` and commit the types.~~ **Done 2026-11-15 by the operator.** The regenerated types are committed. A second dry run afterwards found nothing left to do (7 communities, 0 to update). Every field list the routes request reads cleanly from the live instance. 1033 Lenox has the module on and both switches off. Dry run before it ran, 2026-11-15 (field lines folded):

   ```
   🚀 create-responsibilities-collections (dry run — nothing is written)
   📋 hoa_responsibilities              would create the collection, 22 fields, 5 relations
   📁 hoa_responsibilities_files        would create the collection, 2 fields, 2 relations (CASCADE)
   👥 hoa_responsibility_assignees      would create the collection, 18 fields, 8 relations
                                        (member, user, vendor, team: SET NULL; responsibility, organization: CASCADE)
   🏛️  hoa_board_members                would create end_reason, holder_name
   ✅ hoa_tasks                         would create responsibility → hoa_responsibilities (SET NULL)
   🏢 hoa_organizations                 would create responsibilities_published, responsibilities_show_unassigned
   🧩 modules.responsibilities          would add responsibilities: true to the field default
                                        would set it on Park Terrace 2, 11 Lincoln, Harborview Lofts,
                                        The Beaumont Residences, Transition Test HOA [TEST FIXTURE],
                                        1033 Lenox, 605 Lincoln Road
                                        7 communities · 7 to update · 0 with no stored map
   📈 hoa_activity.event_type           would add choices responsibility, board_term
   🧾 Managers who held every old grant none
   🪪 Board terms with no member        none
   ```

   <details><summary>The dry run as printed</summary>

   ```
   🚀 create-responsibilities-collections (dry run — nothing is written)
   📡 admin.hoaconnect.info
   📋 hoa_responsibilities
      🔎 would create collection hoa_responsibilities
      🔎 would create field hoa_responsibilities.organization (uuid)
      🔎 would relate hoa_responsibilities.organization → hoa_organizations (CASCADE)
      🔎 would create field hoa_responsibilities.title (string)
      🔎 would create field hoa_responsibilities.description (text)
      🔎 would create field hoa_responsibilities.category (string)
      🔎 would create field hoa_responsibilities.cadence (string)
      🔎 would create field hoa_responsibilities.basis (string)
      🔎 would create field hoa_responsibilities.basis_reference (string)
      🔎 would create field hoa_responsibilities.evidence (alias)
      🔎 would create field hoa_responsibilities.area (string)
      🔎 would create field hoa_responsibilities.status (string)
      🔎 would create field hoa_responsibilities.last_verified (date)
      🔎 would create field hoa_responsibilities.last_verified_by (uuid)
      🔎 would relate hoa_responsibilities.last_verified_by → directus_users (SET NULL)
      🔎 would create field hoa_responsibilities.member_visible (boolean)
      🔎 would create field hoa_responsibilities.project (uuid)
      🔎 would relate hoa_responsibilities.project → hoa_projects (SET NULL)
      🔎 would create field hoa_responsibilities.notes (text)
      🔎 would create field hoa_responsibilities.assignees (alias)
      🔎 would create field hoa_responsibilities.tasks (alias)
      🔎 would create field hoa_responsibilities.sort (integer)
      🔎 would create field hoa_responsibilities.date_created (timestamp)
      🔎 would create field hoa_responsibilities.date_updated (timestamp)
      🔎 would create field hoa_responsibilities.user_created (uuid)
      🔎 would relate hoa_responsibilities.user_created → directus_users (SET NULL)
      🔎 would create field hoa_responsibilities.user_updated (uuid)
      🔎 would relate hoa_responsibilities.user_updated → directus_users (SET NULL)
   📁 hoa_responsibilities_files
      🔎 would create collection hoa_responsibilities_files
      🔎 would create field hoa_responsibilities_files.hoa_responsibilities_id (uuid)
      🔎 would relate hoa_responsibilities_files.hoa_responsibilities_id → hoa_responsibilities (CASCADE)
      🔎 would create field hoa_responsibilities_files.directus_files_id (uuid)
      🔎 would relate hoa_responsibilities_files.directus_files_id → directus_files (CASCADE)
   👥 hoa_responsibility_assignees
      🔎 would create collection hoa_responsibility_assignees
      🔎 would create field hoa_responsibility_assignees.organization (uuid)
      🔎 would relate hoa_responsibility_assignees.organization → hoa_organizations (CASCADE)
      🔎 would create field hoa_responsibility_assignees.responsibility (uuid)
      🔎 would relate hoa_responsibility_assignees.responsibility → hoa_responsibilities (CASCADE)
      🔎 would create field hoa_responsibility_assignees.office (string)
      🔎 would create field hoa_responsibility_assignees.member (uuid)
      🔎 would relate hoa_responsibility_assignees.member → hoa_members (SET NULL)
      🔎 would create field hoa_responsibility_assignees.user (uuid)
      🔎 would relate hoa_responsibility_assignees.user → directus_users (SET NULL)
      🔎 would create field hoa_responsibility_assignees.vendor (uuid)
      🔎 would relate hoa_responsibility_assignees.vendor → hoa_vendors (SET NULL)
      🔎 would create field hoa_responsibility_assignees.team (uuid)
      🔎 would relate hoa_responsibility_assignees.team → hoa_teams (SET NULL)
      🔎 would create field hoa_responsibility_assignees.label (string)
      🔎 would create field hoa_responsibility_assignees.role (string)
      🔎 would create field hoa_responsibility_assignees.start_date (date)
      🔎 would create field hoa_responsibility_assignees.end_date (date)
      🔎 would create field hoa_responsibility_assignees.holder_name (string)
      🔎 would create field hoa_responsibility_assignees.notes (text)
      🔎 would create field hoa_responsibility_assignees.sort (integer)
      🔎 would create field hoa_responsibility_assignees.date_created (timestamp)
      🔎 would create field hoa_responsibility_assignees.date_updated (timestamp)
      🔎 would create field hoa_responsibility_assignees.user_created (uuid)
      🔎 would relate hoa_responsibility_assignees.user_created → directus_users (SET NULL)
      🔎 would create field hoa_responsibility_assignees.user_updated (uuid)
      🔎 would relate hoa_responsibility_assignees.user_updated → directus_users (SET NULL)
   🏛️  hoa_board_members
      🔎 would create field hoa_board_members.end_reason (string)
      🔎 would create field hoa_board_members.holder_name (string)
   ✅ hoa_tasks
      🔎 would create field hoa_tasks.responsibility (uuid)
      🔎 would relate hoa_tasks.responsibility → hoa_responsibilities (SET NULL)
   🏢 hoa_organizations
      🔎 would create field hoa_organizations.responsibilities_published (boolean)
      🔎 would create field hoa_organizations.responsibilities_show_unassigned (boolean)
   🧩 hoa_organizations.modules.responsibilities
      🔎 would add responsibilities: true to the field default
      🔎 would set modules.responsibilities on Park Terrace 2
      🔎 would set modules.responsibilities on 11 Lincoln
      🔎 would set modules.responsibilities on Harborview Lofts
      🔎 would set modules.responsibilities on The Beaumont Residences
      🔎 would set modules.responsibilities on Transition Test HOA [TEST FIXTURE]
      🔎 would set modules.responsibilities on 1033 Lenox
      🔎 would set modules.responsibilities on 605 Lincoln Road
      7 communities · 7 to update · 0 with no stored map (read as enabled)
   📈 hoa_activity.event_type choices
      🔎 would add choices responsibility, board_term
   🧾 Property Managers who held every grant before `responsibilities` (listed only — not changed)
      none
   🪪 Board terms whose member row is gone (listed only)
      none
   ✅ Done (dry run). Next: pnpm setup:permissions, then pnpm generate:types
   ```

   </details>
2. ~~Then `pnpm setup:permissions`.~~ **Done 2026-11-15 by the operator.** The audit afterwards reads create 0, update 0, remove 0. It applied nine items: the two from this session (the `hoa_board_members` read for HOA Member and Property Manager, now an explicit field list without `end_reason` and `holder_name`) and the seven the audit already listed before this session (the `hoa_members` read on three policies, the `hoa_email_recipients` read on two, and an `hoa_channel_messages` update permission on two). The three new collections have no permissions on any policy, as intended.

   **Three of the seven older items widened access**, read from Directus's revision history afterwards:
   - `hoa_members` read (HOA Admin, HOA Member, Property Manager) went from a field list to `*`. Members could read every member's `unsubscribe_token`, the email-bounce fields and the manager-hat fields.
   - `hoa_email_recipients` read (HOA Admin, Property Manager) went from a field list to `*`, adding `claim` and `member_fields`.
   - `hoa_channel_messages` gained an update permission (HOA Admin, HOA Member) filtered only by organization, so any member could rewrite anyone's message through the API. The app edits and moderates through server routes and never needed it.

   `de0a221` makes the script keep yesterday's state: `READ_FIELDS` pins the two lists as they were on 2026-11-14, and `WITHHELD_ACTIONS` keeps update off channel messages. The audit now shows exactly the reversal: update 5, remove 2.
2b. ~~Apply the reversal and the channel scopes together.~~ **Done 2026-11-15**, at the operator's go-ahead: the audit showed exactly update 11, remove 8; the run updated 11 and removed 8 with no errors; the audit afterwards reads 0, 0, 0. Read back from the live instance: `hoa_members` and `hoa_email_recipients` reads are field lists again (no `unsubscribe_token`); members read channels, memberships and messages only where enrolled; delete is the author's; no policy writes `hoa_channel_members`. Not yet checked in the app as a plain member and as a board seat.
2c. Found in passing and fixed in `29f96a0` (not yet applied): channel access did not follow membership. Any member could read every channel, private channel and direct message in their community, delete anyone's message, and create their own `hoa_channel_members` row in any channel. Now, matching the server's search rule (`channel-scope.ts`): members read the channels, memberships and messages of channels they are enrolled in; admins read messages of their channels plus every non-private channel of their orgs; delete is the author's only (moderators hide and remove through `/api/hoa/channels/moderate`); nobody writes `hoa_channel_members` on their own token (invites, read markers, mute and presence are server routes). Checked against live data first: every admin and board member is enrolled in every non-private channel, so nobody loses access they should have. Applied in 2b. The HOA Admin policy reading every channel's name in any community the admin belongs to is TODO 6.
3. **Publishing for 1033 Lenox**, after 1 and 2 and before the board is seated on 2026-12-09: an admin applies the Florida condominium list, assigns the holders, and turns on "Published to owners" (the switch is the Visibility menu on `/admin/responsibilities`, built in Session 7). Leave "Show unassigned jobs to owners" off unless the board decides otherwise.
4. After Session 7 moves the Board tab onto the term routes, take update and delete on `hoa_board_members` away from the HOA Admin policy, so history cannot be overwritten through the API. **Written in Session 7** (`1149c6f`; Session 7 TODO 1); the operator applies it.
6. ~~**HOA Admin policy scope (Session 2 TODO 5), fixed in `1a5ef6d`, to apply in this order.**~~ **Done 2026-11-15, at the operator's go-ahead** (record below the steps). The policy scoped every rule with "every community I belong to", so an admin of one community who is a plain member of another held admin-level reads and writes in both, channel names included. Now `hoa_members.admin_of` holds the organization only on an active or pending HOA Admin membership; the policy reads `$CURRENT_USER.hoa_members.admin_of` in all 136 org-scoped rules (files and folders included); and the HOA Admin role also carries the HOA Member policy, so such a person keeps member-level access where they are a member. Dry runs 2026-11-15: 136 memberships, 9 administer a community, all 9 to back-fill; no global HOA Admin has a non-admin membership, so nobody's access changes today.
   1. `pnpm add:admin-scope --dry-run`, then `pnpm add:admin-scope` (the field and the back-fill). Changes nobody's access.
   2. Deploy the app: `POST /api/internal/sync-admin-scope` must exist before the Flow calls it.
   3. `pnpm create:admin-scope-flow --dry-run`, then `pnpm create:admin-scope-flow`: "Admin scope sync" on every `hoa_members` create and update, and "Admin scope reconcile (nightly)" at 02:30. Both post to `https://www.hoaconnect.info` with the cron secret.
   4. `pnpm setup:permissions:audit` (expect create 1: the HOA Member policy on the HOA Admin role; update 138: the 136 admin rules and the `hoa_members` read field lists, which gain `admin_of`), then `pnpm setup:permissions`. The script scopes the policy only when every membership's `admin_of` is right; otherwise it stays on the old scope and says why.
   5. `pnpm generate:types`, and commit them.
   6. Check in the app: an admin's own community works as before (members, documents, channels, money). If an account can be set up as admin in one test community and member in another, the second shows member-level only.
   If a Flow call fails, the row keeps its old value until the next write or the nightly reconcile: a new admin waits for admin access, a removed one keeps it at most a day.

   **What ran, 2026-11-15.** `admin_of` was already back-filled (9 admin memberships of 136). `main` pushed (25 commits); the route was live about four minutes later, and a call with the cron secret checked 136 and wrote nothing. Both Flows created. End to end: a wrong `admin_of` set by hand on a plain member was put back by the sync Flow within about two seconds. Then `setup:permissions`: 1 created (the HOA Member policy on the HOA Admin role), 138 updated. Two bugs were found and fixed on the way:
   - `58b3dbd`: the readiness guard read no rows and passed vacuously, and the role-policy check would have added a duplicate access row on every run (`directusApi` already unwraps `data`).
   - `82fba90`: the read-back found 63 HOA Admin rules on 18 collections were made by the per-feature schema scripts, which `setup:permissions` does not manage, and still used the any-membership path. A final pass now scopes every HOA Admin rule, whichever script made it. Applied: 63 updated.

   Read back afterwards: the audit is 0, 0, 0; the HOA Admin role carries HOA Admin + HOA Member; 199 of the policy's 227 rules read `admin_of` and none read the any-membership path (the rest are catalog and self-access rules). The nightly reconcile and the sync Flow log each run in Directus activity. **Not checked in the app yet:** an admin's own community (members, documents, channels, money, meetings, polls, requests), and a person who is admin in one community and member in another. The Property Manager policy still scopes by any membership; a manager's grants are enforced on the server, so it is a ceiling, not this hole.

   **Property Manager policy, by grant** (`b6b58f7`; **applied 2026-11-15**, at the operator's go-ahead: pushed and deployed; the three fields created, nothing to back-fill; the sync Flow cleared a hand-set wrong `manager_of` and `inquiries_of` within about four seconds; `setup:permissions` created 1, updated 23, removed 1; the audit is 0, 0, 0. Read back: the Property Manager role carries its policy + HOA Member; of the policy's 23 rules, emails and recipients read `communications_of`, requests (read, edit) and comment reads read `inquiries_of`, 16 read `manager_of`, 2 are self-only, none reads the any-membership path, and the vendor rule is gone). The manager policy had both holes: every community the person belongs to, and all 24 rules whatever the grants. Measured live, 17 of the 24 equal the member rule, so the Property Manager role now also carries the HOA Member policy and only the five that reach beyond it are gated: emails and recipients by `communications_of`, requests (read, edit) and internal comments by `inquiries_of`, the rest by `manager_of` (an active Property Manager membership, the `getManagerGrants` rule). The vendor read (every vendor, with contact fields) is removed: no manager page reads vendors, and the area has no grant yet, so managers see the vendors residents see. Nobody holds the role today. Apply in this order: push and deploy (the sync route must know the new fields); `pnpm add:admin-scope` (creates the three fields; back-fills nothing today); `pnpm setup:permissions:audit` (expect create 1, the member policy on the manager role; about two dozen updates, a removal of `hoa_vendors.read`; the scoped preview double-counts the 11 managed rules); `pnpm setup:permissions`; `pnpm generate:types`. The directory and documents grants have no API meaning: residents already read both. They gate the manager pages and server routes only.

   **Cross-community test account** (created 2026-11-15): `cross-community-test@example.com` ("Cross Community (test)"), global role HOA Admin, **HOA Admin of Park Terrace 2** and **owner-member of 605 Lincoln Road**. The sync Flow set `admin_of` on the Park Terrace membership only. No password was set: set one in Directus (Users → Cross Community (test)) to sign in. Expected: in Park Terrace 2, admin as usual; in 605 Lincoln Road, member-level only. Through the API with this user's token, `PATCH /items/hoa_members/<a 605 member>` and `PATCH /items/hoa_documents/<a 605 document>` answer 403, while the same against Park Terrace 2 succeed. Before 2026-11-15 both would have succeeded. Remove the account (user and both memberships) when it is no longer needed.

   **Checked 2026-11-15** through the Directus API with a temporary static token on the account (generated in the check script, never printed, removed afterwards; the old token then answered 401):
   - Writes, each a no-op (a field set to the value it already held): `PATCH hoa_members/<a Park Terrace 2 member>` → 200; `PATCH hoa_members/<a 605 member>` → 403; `PATCH hoa_documents/<a 605 document>` → 403. Park Terrace 2 has no documents, so the document write there was not tried.
   - Reads in 605 Lincoln Road, member-level as designed: invitations 0 of 1, member change requests 403, activity 403, the one channel (`general`, not private, which the account has not joined) with its member and message 0 of 1. Members 34 of 34, documents 9 of 9, vendors 1 of 1 (`show_to_members`) and the announcement are what any resident reads.
   - Park Terrace 2 holds almost no data (2 members, 1 unit), so the reads show only the 605 side; the write is the positive control.
   - Field list on another member's row: the same 31 of 41 fields in both communities, because `READ_FIELDS.hoa_members` applies to every policy. That is the open member-fields card, not this fix.
   - Found while reading the create rules: the HOA Admin create rule on `hoa_meetings_files` has no validation, so an admin of one community could attach a file to another community's meeting. Every other HOA Admin create is on `admin_of`, own user, or a Directus system collection.

   **Shared writes and meeting links (2026-11-15, Peter: "Yes, fix it").** Built while fixing the meeting-files rule; applied 2026-11-16 (below).
   - **Found: Directus ANDs validations across policies.** 11.13.4 (the deployed version) checks a write with `validatePayload({ _and: validationRules }, payload)`, one rule per matching permission from every policy the user holds; a maintainer calls it intended (directus/directus#25162). Item filters are ORed, validations are not. Since the HOA Member policy joined the HOA Admin role (admin scope, above), an admin's create had to pass the member rule as well: **no internal note** (`hoa_comments.is_internal = false`) and **no task or violation request** (the member's type list), in their own community; and in a community where they are only a member, the admin rule too: no comment, vote, reaction, report or request. Read from the source, not seen in the app: no admin has written these since (every org is test data).
   - **Fix: one validation per shared write** (`scripts/lib/shared-write-validations.ts`, pass `alignSharedWrites` in `setup-directus-permissions.ts`, run last on the live rules). Every policy's rule for the pair carries the member's own validation OR each other policy's own behind a guard, so a role's AND of identical rules is the union. The guard needs `organization` submitted and not null, so the branch turns on the role's scope field (`admin_of`, `manager_of`, …), null on every other membership; without it a resident could pass the admin branch by leaving `organization` out (an absent field is not checked) or sending null (`_in` a list of nulls holds for null). Aligns 15 rules on six writes: comment reports, comments (create and update), poll votes, reactions, requests. Pets, vehicles and member units, whose admin validation followed a relation, are not shared any more (below).
   - **Meeting links:** the HOA Admin create and update on `hoa_meetings_files` are removed (`REMOVED_ADMIN_RULES`); no page writes these links, and `/api/directus/items` keeps its check. The update rule on `hoa_email_templates` now repeats its filter as validation (`PINNED_ADMIN_UPDATES`), so an edit cannot point the template at another community. `create-email-templates-collection.ts` writes the same. (This commit also pinned the attendee update; that pin was on a relation and did not hold, so the rule is removed instead, below.)
   - Tests: `tests/scripts/shared-write-validations.test.ts` evaluates the validations as Directus does and shows the admin cases failing before and passing after, and a resident's result unchanged for every payload tried, including no organization and a null one.

   **Admin writes that name another row (2026-11-15, Peter: "Fix them and commit").** Built on the fix above; applied 2026-11-16 (below).
   - **Found: a validation on a relation cannot be made safe.** Directus 11.13.4 checks a nested path (`meeting.organization`) against the payload only (`generate-joi.ts`: a nested path is `Joi.object`, an absent key is not checked). A plain id, which every page sends, fails it, so these admin saves were refused: **meeting attendees** (`MeetingsAdminPage.vue`) and **a unit's pets and vehicles** (`useUnitRecords.ts`). An object holding only the id passes it, and `processM2O` (`api/src/services/payload.ts`) then links the row after checking only that the id exists, with no permission check on it. So through the API an admin could add attendees to another community's meeting. For pets, vehicles and unit links the AND with the member rule refuses the object today, by accident. The attendee pin above was passable the same way.
   - **Fix: the writes move to routes that check both sides.**
     - `POST /api/org/meetings/[id]/attendees`: admin of the meeting's community. Each person must be its member and each board term that person's; people already attending are skipped (`core/shared/meetings/attendee-writes.ts`). Removing an attendee stays a Directus delete, which checks the row.
     - `POST` and `PATCH /api/hoa/units/records`: admin of the community. The unit and the person must be its, and a photo must be an image, in its library, or already claimed by one of its records (`filesOutsideOrg` with `allowPublicImages`). A row to change must be its by its own organization, its unit's and its person's together (`recordCommunity`, `core/shared/units/record-writes.ts`). The bodies are strict, so the unit and organization are set by the server and cannot be moved. Leases are unchanged: their rule checks the lease's own `organization`.
     - The HOA Admin create and update on `hoa_meeting_attendees`, `hoa_pets`, `hoa_vehicles` and `hoa_member_units` are removed (`REMOVED_ADMIN_RULES`, now also applied by the main pass). Unit links were already written only by `/api/hoa/member-units/assign` and `/remove`, with the app's token. Read and delete stay. `create-meetings-collections.ts` writes the same.
   - Tests: `tests/server/admin-relation-writes.test.ts` (16). Who may call: residents, board seats and managers get 403, and an admin of another community gets 403 too. Covered: another community's meeting, person, board term, unit, file or row; a row that straddles two communities; strict bodies; skips; defaults. Also the evaluator cases: a plain id fails, an object holding only the id passes, and a field of the row itself holds either way.
   - **The rest of the relation rules (2026-11-15, Peter: "Yes fix it").** After the fix above, every other HOA Admin create and update that followed a relation (measured live; no HOA Member or Property Manager rule does):
     - **Board terms.** The Members page's board-position save was refused the same way (`hoa_member: id`). New `POST /api/org/board-terms`: admin only, as the other board-term actions are; the person must be a member of the community; strict body (`createTermBody`); logs "Added Ann Lee as Treasurer". The page now adds through it and edits through `PATCH board-terms/[id]` (Correct, which never changes the person; the page's picker was already locked when editing). Removing a position is still a Directus delete. The spec's route table and the Session 7 prompt list the new route.
     - **Nine tables nothing writes with the user's token** (census by grep of every client writer, nested writes through a parent, and the user-token server routes; not tried in the app): email recipients and activity (written by `/api/email/send` and `/api/email/activity`), mailing-list members (nothing in the app writes them), mention edits (nothing in the app edits a mention, and no other policy may), and the project, event and task links (the project and task routes). Their create and update rules are removed; read and delete stay. `create-projects-collections.ts` no longer writes the link tables' create and update back, since it upserts.
     - **Residents' pets, vehicles and unit links** are read only (`memberLevel: "read_only"`; reads unchanged). The write rule could check only `member_id`, so a resident could send a row with no person or with another community's unit. Nothing in the app wrote them on a resident's token: residents change theirs through change requests, and unit links are made by the assign, invitation and join routes.
     - Also checked: no community policy has a create with no validation on a community table, apart from `block_hero` (heroes are linked after they are made, above) and the Directus system collections.
     - `REMOVED_ADMIN_RULES` now holds all 29 rules. Tests: `tests/server/board-terms-routes.test.ts` (+3: adds a term, admin only, refuses another community's person, dates out of order, a title that is not an office, a field it does not take), and the removed list in `tests/scripts/shared-write-validations.test.ts`.
   - **Audit before apply** (all three fixes): update 16 (15 aligned, the template pin), remove 38 (HOA Admin 29, HOA Member 9: create, update and delete on pets, vehicles and unit links), create 0; no other drift. The audit's summary says remove 63: in a dry run the final pass lists again the 25 HOA Admin rules the main pass removes.
   - **Applied 2026-11-16** (Peter: "push, deploy and apply all four now, and check it with a temporary token on the test account"). `ef7b862`…`7dc42c0` pushed; the new build was live about four minutes later, and the new routes (`POST board-terms`, `POST` and `PATCH units/records`, `POST meetings/[id]/attendees`) answered 401 to a call with no session, where an unknown route answers 404. `pnpm setup:permissions:audit` matched the dry run above; `pnpm setup:permissions` created 0, updated 16, removed 38; a second audit wants 0, 0, 0. Read back from Directus: no create or update in the HOA Admin, HOA Member or Property Manager policies has a validation that follows a relation; on the 15 tables HOA Admin keeps read and delete and residents keep read (mentions keep their create for both); the template update's validation equals its filter.
   - **Checked 2026-11-16** through the Directus API with a temporary static token on the cross-community test account (set in the check script, never printed, removed afterwards; the old token then answered 401):
     - Go through: an internal note in Park Terrace 2, a public comment in 605 Lincoln Road (both deleted straight after), a no-op edit of a Park Terrace 2 member, a read of Park Terrace 2's pets.
     - Refused: an internal note in 605 (400, the member validation: "is_internal has to be false"); an attendee on another community's meeting, both as `{"meeting": {"id": …}}` and as a plain id (403: no rule); a board term in Park Terrace 2 itself, and one naming a 605 person as `{"id": …}` (403); a pet and a vehicle on a Park Terrace 2 unit (403), a pet on the account's own 605 unit as a resident (403); a unit link from a Park Terrace 2 person to a 605 unit (403). Neither community has a meeting, so the attendee check used a meeting of a community the account is not in.
     - **The pages, checked 2026-11-16** in the app, signed in as Cross Community (test) (Peter set the password and signed in), in Park Terrace 2: a pet added to unit 102 and edited (`POST`, then `PATCH /api/hoa/units/records`, 200); a board position added as a hidden draft and corrected twice on the Members page (`POST board-terms`, then `PATCH board-terms/[id]`, 200; the member picker is locked when editing; three activity rows by Cross: "Added Cross Community (test) as Secretary" and two "Corrected…"); an unpublished meeting created with Cross as attendee (`POST meetings/[id]/attendees`, 200; the attendee row took the board term and "Secretary" as of the meeting date). Read back from Directus, every row was Park Terrace 2's. All of it deleted afterwards, the activity rows included.
     - Seen while checking, not changed: (1) rows the routes write carry `user_created` of the app's token, which is the operator's own Administrator account; a board term's actor is in `hoa_activity`, a pet's or an attendee's is nowhere. (2) The pet, vehicle and lease forms (`app/components/units/*Form.vue`) save a picked date as midnight UTC and the unit page shows it in local time, so a date reads a day early west of UTC (picked 11/16, shown Nov 15). Older than these fixes. **Fixed 2026-11-16** (Peter: "Yes, fix it"): `core/shared/units/record-dates.ts` saves a picked day as noon UTC, the same day in every zone from UTC−11 to UTC+11, and reads a stored time back as its day in the viewer's zone, as the page shows it; the three forms use it. Rows already saved at midnight UTC still read a day early (all test data). Test: `tests/shared/record-dates.test.ts` (17, eleven zones).
     - **Who adds a unit's records, and two gaps (2026-11-16, Peter: "fix both gaps").** Pets and vehicles: an admin of the community on the unit page (the records route), or a resident by change request, approved by an admin or a manager with the directory grant. Leases: an admin only; residents read their own.
       - **An approved resident pet or vehicle had no unit:** the approval wrote the person and no `unit_id`, so the row showed in My Household and on no unit page. Now the request records the unit (`currentUnitsInOrg`, `chooseRecordUnit` in `core/shared/units/record-writes.ts`): the one the resident picks, which must be one of their current units here (400 otherwise), or their only one; the dialog asks only a resident with several. The approval writes it if it is still theirs, else their only unit, and writes only the pet's or vehicle's own fields. The reviewer's line shows "· Unit 4B". A resident's photo must be one the community may use, as on the unit page. Rows approved before this have no unit (test data).
       - **The lease rule named rows it did not check:** its validation held the lease's own `organization`, but not the unit, tenant or owner, so through the API an admin could save a lease in their community naming another's unit or person. Leases now go through `POST` and `PATCH /api/hoa/units/records` (`kind: "lease"`): the unit, tenant and owner must be the community's, the row must be its by `leaseCommunity`, and a document must be one of its files or one the admin uploaded and filed nowhere (`assertDocumentInOrg`; the lease form uploads with no folder). The HOA Admin create and update on `hoa_leases` join `REMOVED_ADMIN_RULES`; `create-leases-collection.ts` skips them.
       - Tests: `tests/server/admin-relation-writes.test.ts` (+10: leases, the unit choice), `tests/server/change-request-units.test.ts` (8). Dry run against production: remove 2 (`hoa_leases` create and update), nothing else.
       - **Applied 2026-11-16** (Peter: "merge all of it into main locally and then Push and apply"), with the lease reports (TODO 8): `4dd1b90`…`28e3d47` pushed after the gate on the merged tree (typecheck 0, lint 137, 3,845 tests, build, 19 audits); the new build was live about five minutes later. `pnpm setup:permissions` removed 2 (`hoa_leases` create and update), created and updated nothing; a second audit wants nothing. Read back: `hoa_leases` keeps HOA Admin read and delete and HOA Member read. Not tried in the app: an admin adding a lease on the unit page through the route (the tests cover it).
7. Known gap, not fixed: an admin can still flip the two publishing switches on `hoa_organizations` through Directus, without the activity row. The app writes them only through the route. Closing it needs an explicit field list on the HOA Admin policy's update of `hoa_organizations`.
8. **Owners report leases from My Household (2026-11-16).** An owner says their unit is rented; one approval records the lease on the unit and links or invites the tenant. Built from the session that fixed the two gaps above; leases stay admin-only otherwise, and no HOA Member rule on `hoa_leases` was added.
   - **The owner:** My Household has a Leases section when the community's Leases module is on and the person owns a unit here, or is on an active lease. "Report a lease" asks for the tenant's first and last name and email, start and end dates, the signed lease as one PDF (4 MB at most), and an optional note; the unit only when they own several. No rent. The section lists their active leases (Unit 4B · Jane Doe (invited) · Dec 1, 2026 – Nov 30, 2027, with the PDF) and the reports waiting for review.
   - **Who is an owner:** a current link to the unit (not archived, not ended) whose `hoa_member_units.member_type` is owner, or says nothing for a person whose own `member_type` is owner, as `residencyFor()` reads it (`ownedUnitsInOrg`, `core/shared/units/lease-requests.ts`). A tenant, or an owner naming a unit they rent or another community's, is refused.
   - **The request:** kind `lease`, action create, `target_collection` `hoa_leases`. `buildLeaseChange` (`core/server/utils/lease-requests.ts`) checks the unit is one they own, the document is a PDF they uploaded and filed in no folder (`assertOwnLeaseUpload`, stricter than `assertDocumentInOrg`: no library file and no other record's file, which the lease would then open to them and the tenant), the dates are days and in order, and the email is not their own. Days are stored at noon UTC (`record-dates.ts`).
   - **The upload** is its own route, `POST /api/org/change-requests/lease-document`, with the app's token and `uploaded_by` set to the owner. Found and seen in the app: `/api/directus/files/upload` uploads with the user's token, and a member or HOA Admin may read only files in their community's library folders, so Directus answers the upload of a PDF in no folder with 204 and no id. The owner's form could never learn the file's id that way.
   - **The reviewer** (admin, or a manager with the directory grant) sees "Lease · Unit 4B · Jane Doe · Dec 1, 2026 – Nov 30, 2027", the tenant's email, the note, and the PDF through `GET /api/org/change-requests/[id]/document`: a reviewer while it waits, an admin at any time, the owner who sent it.
   - **Approval** (`applyLeaseRequest`): the unit must still be the owner's (409 otherwise). If the email is an active member here, they become the tenant and are linked to the unit as its tenant when no current link exists (primary only when they have no other). If it is only a former member's, 409: restore them first; never automatically. Otherwise they are invited as the unit's tenant with the Members page's invitation, moved to `core/server/utils/invitations.ts` (`issueInvitation`, which `invite-member` now calls too); a pending invitation is reused. The invitation says it is from the owner, whose name the tenant knows, when their account can sign it. Then the `hoa_leases` row as the records route writes it: unit, organization, owner = the submitter's member row, status active, dates, document. The request keeps the lease id (`target_id`) and the invitation id, so running it again after a failure writes no second lease. The reviewer's toast and the owner's bell say what became of the tenant. Rejection tells the owner, as for other kinds.
   - **Decision: the lease is written at approval with no tenant, and gets one when they join** (`claimInvitedLeases`, called from `accept-invitation`). Waiting on the request instead would leave the unit with no lease until a stranger signs up, if they ever do; this way the unit page shows it rented, with its dates and PDF, from the day it is approved, and nobody comes back to finish it. Until then the unit page and My Household show the tenant as "Jane Doe (invited)" from the approved request (email to admins and the owner only).
   - **Who opens the lease PDF:** the asset proxy served any file a record claims to every member of that record's community, so every resident could open any lease by its id. A lease's document is now its owner's, its tenant's and the community's admins' (`mayOpenLeaseDocument`, `core/server/utils/lease-documents.ts`); a board seat or manager no longer can through the proxy. A file with no folder: Directus serves it to no one but the app's token (members' and HOA Admins' read is by library folder; public read is images only), and the proxy refuses it until a record claims it. The unit page's Doc link used the bare Directus URL, which refuses every PDF; it now goes through the proxy.
   - Tests: `tests/server/lease-requests.test.ts` (26): owned units, the reviewer's line, submit, refusals (not an owner, not their unit, someone else's or a filed file or none, not a PDF, dates out of order or the same day or not a day, missing tenant, own email, not an add), approval (member linked, link kept, invited, pending invitation reused, run twice, former member and sold unit refused), the decide route (manager approves, admin rejects, both tell the owner; a resident and a manager without the grant get 403), joining, and who opens the PDF before and after approval. The fixture gains `_gt`/`_lt`, `readUser` and object field lists.
   - **Checked 2026-11-16 in the app** on localhost against the live Directus, signed in with the login page's demo button (Demo Admin), in Harborview Lofts, after giving Demo Admin a temporary owner link to unit 102: the form uploaded a test PDF (read back: `uploaded_by` Demo Admin, no folder), the request stored `kind: "lease"` (Directus does not enforce the field's choices), the owner's Lease link served the PDF while the asset proxy and the public Directus URL answered 403; Approvals showed the line, email, note and PDF link; Approve wrote the lease (owner, no tenant, noon UTC days, the PDF, no rent) and a pending HOA Member invitation as tenant of 102 (demo email suppressed), toast "Lease recorded on Unit 102 · Jane Leasecheck was sent an invitation as its tenant", bells "Demo Admin reported that Unit 102 is rented" and "Your lease for Unit 102 is recorded. We've invited Jane Leasecheck to join."; the unit page showed "Jane Leasecheck (invited) · owner Demo Admin" and its Doc link served the PDF; My Household showed the lease. Accepting the invitation was not tried (it creates an account); the tests cover it. Everything was deleted afterwards (lease, request, invitation, file, two bells, the link) and read back gone.
   - **Operator TODO:** `pnpm add:change-request-lease-kind --dry-run`, read it, then without the flag, then `pnpm generate:types`. It only adds the Lease choice to `hoa_member_change_requests.kind` (and `hoa_leases` to `target_collection`'s note) so the Directus admin labels it; the app works without it. Dry run against production 2026-11-16: would add `{"text":"Lease","value":"lease"}` to contact, mailing_address, vehicle, pet, and set the note. Not run. The `kind` union in `core/types/directus.ts` already says `'lease'` by hand.
   - **Not done, for later:** (1) the admin lease form on the unit page uploads through `/api/directus/files/upload`, so its PDF gets the same 204 and the lease is saved with no document (seen for the route, not tried in that form); it should use a route like the owner's. (2) Accepting an invitation refuses an email that already has an account anywhere ("A user with this email already exists"), so a tenant who is a member of another community cannot join from it; the lease waits with no tenant and an admin sets it on the unit page. Older than this. (3) A PDF over 4 MB is refused (one request; the governing upload's parts would lift it). (4) A PDF uploaded and never sent stays in no folder. (5) A community setting "Leases need board approval" would make this an application with a board decision, an application fee and tenant screening: the paid step the brief set aside.
   - (1) and (2) are fixed: item 9.
9. **Invitations can be accepted again, by new and existing accounts; the admin lease form keeps its PDF (2026-11-16).** The two problems item 8 left. The second turned out bigger than reported.
   - **No invitation could be accepted.** Every invitation email links to `/{slug}/accept-invite?token=…` (`invitations.ts`, `resend-invitation`, `add-property`), and no such page existed: a 404, as far back as git goes. The page at `/accept-invite` sent only the password, and the route refused anything without a first and last name. Now `app/pages/[slug]/accept-invite.vue` is the page, `/accept-invite` takes the same token (an invitation from a community with no slug links there), and neither is guest-only, since someone with an account may be signed in when they open it. A signed-in user is not moved from `/accept-invite` to their own community's twin: the token names the community and the move would drop it (`UNREDIRECTED_TWINS`, `core/shared/domains/org-routes.ts`; the page-tree test reads it).
   - **An existing account joins with that account.** One account serves every community a person belongs to (`hoa_members` has one row per community), but the route refused any email that already had an account. Now (`core/server/utils/accept-invitation.ts`): no account, name and a new password of 8 or more, as before; an account, signed out, its password, checked with Directus before anything is written (wrong or missing: 401 or 400, nothing written; a suspended account: 403 saying so); signed in as that account, nothing to type. Their name comes from the account. The roster row for the email is adopted as before; if the account is already an active member here, no second row (the invitation is marked accepted); if its membership here was ended, 409: restoring it is the community's call, as `invitability.ts` says. The unit link, the lease claim (item 8) and the inviter's email follow, as before. The account's Directus role is not changed, as `approve-join-request` does not: the community role is on the membership, which the app's admin checks read.
   - **The page** (`InvitationAcceptForm.vue`) asks for what that case needs: a name (offered from the roster row) and a password, or the account's password with "Forgot your password?", or one Join button; signed in as someone else, it says so and offers Sign out. `verify-invitation` now says whether the email has an account and the community's slug, for the page and for where to go after.
   - **One sign-in.** `/api/auth/login`, `/api/demo/login` and the acceptance each had their own copy of Directus login plus the session; the acceptance's stored a different shape (`first_name`, a placeholder community, no role). All three now call `passwordTokens` and `startPasswordSession` (`core/server/utils/password-session.ts`).
   - **The admin lease form** uploaded through `/api/directus/files/upload` with the admin's token, got no id back for a PDF in no folder, and saved the lease with no document, quietly. It now uses `POST /api/hoa/units/lease-document` (admin of the community), which shares `storeLeaseDocument` (`lease-documents.ts`) with the owner's upload: PDF only, 4 MB, app token, no folder, `uploaded_by` the admin, which the records route accepts. PDF only on purpose: the public file rule serves any image to anyone with its id, and the form used to accept images. Upload errors show; "View current" shows only the saved document, since a new upload opens only once the lease names it.
   - Tests: `tests/server/accept-invitation.test.ts` (16): what the page is told; a new account (created with the invitation's role, member, unit, session, inviter told; name and password required; roster row adopted); an existing account (password, wrong or no password with nothing written, signed in as it, signed in as someone else, roster row adopted, already a member, ended membership refused, suspended refused, the reported lease's tenant); expired and used invitations. `tests/server/lease-document-upload.test.ts` (7): the admin's upload and the records route taking its id, refusals (not an admin, not a PDF, over 4 MB, no file), and the owner's upload on the shared helper. The fixture gains `createUser`, `uploadFiles`, `updateFile` and the invitation relations. `tests/shared/domains-org-routes.test.ts` (+1). Gate on the final tree: typecheck 0, vitest 225 files / 3,869 tests, lint 137 warnings (cap 148), build, 19/19 audits.
   - **Checked 2026-11-16 in the app** on localhost against the live Directus, as Demo Admin. The admin form on Harborview unit 102: the PDF uploaded (200), the lease saved with it (read back: no folder, `uploaded_by` Demo Admin), and the unit page's Doc link served it. The invitation page: `/demo/accept-invite` was a 404 before; with an invitation to another email it said "You're signed in as demo@hoaconnect.info. This invitation is for …" and offered Sign out; `verify-invitation` said `hasAccount: false`. A real join with an existing account: Demo Admin's Beaumont membership was detached from the account, an invitation to demo@hoaconnect.info sent there, and Join (signed in, nothing typed) put the account back on that roster row, no second row, invitation accepted, member count unchanged, landing on `/demo-classic`; the row read back identical to before. The inviter's email was suppressed for the demo community. `/api/demo/login` on the shared sign-in: 200, the session holds the account, and a user-token call answered 200. Not tried in the app: a new account, or a password typed on the page (both would mean creating an account or entering a password on the live Directus); the tests cover them. Everything was deleted afterwards (the lease, its file, both invitations) and read back.
   - **Not done, for later:** (1) a person whose account has the HOA Member role, made an admin of a second community by invitation, keeps that role, so Directus calls on their own token get member rules there; the app's own admin routes are unaffected. (2) `app/pages/auth/accept-invitation.vue` posts to `/api/auth/accept-invitation`, which does not exist, and `app/pages/auth/accept-invite.vue` uses Directus's own invitations; nothing links to either. (3) Expense receipts upload through `/api/directus/files/upload` with no folder too (`useExpenses`), so a PDF receipt likely gets the same empty answer; not checked. (4) The account-email log prints "sent" after the demo guard has suppressed the email.
   - (1), (2) and (3) are fixed: item 10.
10. **An existing account gets its new community role's access; the dead accept pages are gone; expense receipts are kept (2026-11-16).** Item 9's first three loose ends.
   - **Role access.** An account has one Directus role, and its role's policies decide what calls on the person's own token may do. An existing account that joins another community, by invitation or by an approved join request, kept its role, so an HOA Member account made an admin there had no HOA Admin policy. Changing the account's role would be wrong (the roles are not a ladder: a Property Manager account made an admin elsewhere would lose its manager policy), so `grantRoleAccess` (`core/server/utils/account-access.ts`) attaches the community role's missing policies to the account itself, as Directus 11 allows (`directus_access` with a `user`). It widens nothing: the HOA Admin and Property Manager policies reach only the communities in `admin_of` / `manager_of`, which come from memberships. Only the three community roles, only for an account whose own role is one of them (a platform account is left alone), and nothing it already has, through its role or directly. Called, best-effort, from `accept-invitation` for an existing account and from `approve-join-request`. Read against the live Directus (no write): a member account's role gives HOA Member, the HOA Admin role gives HOA Admin and HOA Member, so it would attach HOA Admin alone; `directus_access` has a `user` field and already holds user rows. Not seen end to end in the app: no HOA Member test account was invited as an admin (that means creating or signing in to one).
   - **Dead pages.** Removed `app/pages/auth/accept-invitation.vue` (posted to `/api/auth/accept-invitation`, which never existed), `app/pages/auth/accept-invite.vue` and its `Auth/AcceptInviteForm.vue`, and what only they used: Directus's own invitations, `POST /api/directus/users/invite` and `/accept-invite`, and `useDirectusUser().inviteUser` / `acceptInvite`. The public-page list loses `/auth/accept-invitation`. `/auth/accept-invite?token=` now lands on the community invitation page with "auth" as the slug, which says the invitation can't be used.
   - **Expense receipts were lost the same way.** The expense form uploaded through `/api/directus/files/upload`; a PDF receipt came back with no id and the expense was saved without it, and the receipt link used the bare Directus address, which refuses every PDF (seen: 403). Now `POST /api/org/expenses/receipt` (admin, or a manager with the projects grant, as for entering an expense) stores it through `storeUnfiledUpload` (`core/server/utils/private-uploads.ts`, now shared with the lease upload): a PDF or a photo (JPEG, PNG, WebP, by its bytes), 4 MB, app token, no folder, `uploaded_by` the sender. The link goes through the asset proxy, where a receipt is for whoever reads the books (`mayOpenExpenseReceipt`, `canReadMoney`: admins and board seats); it was every member's. A photo receipt stays readable by its id through the public file rule, as every image is.
   - **An audit blind spot, found on the way.** The file input's old `accept="image/*,application/pdf"` holds `/*`, which `blankComments` (`scripts/lib/audit-kit.ts`) reads as an unclosed block comment and blanks to the end of the file, so every template audit skipped the rest of the expenses page. Changing the accept list showed two findings that were always there: the category filter's pill row (now a `<Select>`, as plan §2.3 asks, like the payments page's type filter) and a `text-[10px]` badge (now `type-micro`). Other files with `image/*` in a template are likely hidden the same way.
   - Tests: `tests/server/account-access.test.ts` (6), `tests/server/expense-receipts.test.ts` (8), `tests/server/accept-invitation.test.ts` and `tests/server/invitation-gates.test.ts` (+1) assert who gets the role's access. Gate on the final tree: typecheck 0, vitest 227 files / 3,884 tests, lint 133 warnings (cap 148), build, 19/19 audits.
   - **Checked 2026-11-16 in the app** as Demo Admin in Harborview Lofts: an expense with a PDF receipt saved with it (read back: no folder, `uploaded_by` Demo Admin); "View receipt" served it (200, PDF) where the bare Directus address answered 403. Deleted afterwards and read back gone. The category Select filters (Landscaping: 12 rows, all Landscaping). `/auth/accept-invitation` is a 404.
   - **Not done, for later:** (1) expense writes still go through Directus on the admin's token, and the HOA Admin rule checks only the expense's organization, so through the API an admin could name another community's file as a receipt and open it here; as for leases, the fix is a server route for expense writes and dropping those two rules. **Routes now: item 12.** (2) The expenses page's total showed $NaN: fixed, see below. (3) Keeping photo receipts private needs the public file rule to leave them out, as it does `governing-` files. (4) The audit kit's comment blanking should ignore `/*` inside attribute values; fixing it will surface whatever `image/*` has been hiding, so it needs its own pass.
   - **The expenses total showed $NaN** (fixed the same day). Directus sends a decimal column as text, so `0 + "175.00"` joined strings. The money reads now hand the pages numbers (`numericMoney`, `core/server/utils/money-access.ts`): `amount` on `GET /api/org/expenses` and `/api/org/money/schedules`, and `amount`, `amount_paid`, `amount_remaining` on `/api/org/money/charges`, which the payments page adds the same way; sorting by amount is numeric too. Test: `tests/server/money-reads.test.ts` (+2). Checked in the app: Harborview's expenses total $10,860.00, the sum of its 50 rows; the payments page reads $3,000.00 outstanding and $10,625.00 collected, no NaN.
   - (4) is fixed: item 11.
11. **The audits read past `accept="image/*"` (2026-11-16).** Item 10's (4).
   - **The kit.** `blankComments` (`scripts/lib/audit-kit.ts`) ran one `/*…(*/ or the end)` regex over the whole file, template included, so the `/*` in `accept="image/*"` blanked the rest of the file. A `"image/*"` string or a `// …/api/*` comment in a script did the same up to the next `*/`. Now a template loses only `<!-- -->` (an unclosed one stops at the next `<script>` or `<style>`). `<script>`, `<style>` and `.ts` / `.css` files are scanned left to right, stepping over strings, template literals and regex literals first; a quote left open ends with its line. `findDeadThemeClasses` reads a `.ts` file with the TypeScript rules (it had used the SFC ones).
   - **What it uncovered: 26 findings in five files**, each fixed or tagged. The other files with `image/*` (`OriginalDocuments`, `ImageField`, `PetForm`, `VehicleForm`, `governing/upload`, `ChannelEditor`) hid nothing.
     - `settings-boxes` 15: `account.vue` 11, `BrandingSettingsForm` 3, `SeoSettingsForm` 1. All three are one card of flat `.form-section` groups now (the ui-kit pattern in `earnest-ui.css`). The account page's tabs are `AppSegmentedControl` and `AppTabPanels` (a raw button row before: `raw-buttons` 1 of the 26); the profile picture moved into the Profile tab; About is the last group of the same card, under every tab; Connected Accounts are divided rows. The SEO form's old second card went too.
     - `color-literals` 4: the push "browser is blocking" box (amber palette, and a box) is a flat line with a `text-warning` glyph; the file picker's folder icon is `text-warning` (was `amber-400`); the Branding email preview's white frame is tagged `allow-color-literal` (it is the email's canvas, white in every mail client), and the iframe's second `bg-white` is gone.
     - `dead-theme-classes` 3, all false: `push.unsupportedReason.value === 'ios-install'` read as a class. The matcher now skips a whole string being compared (`===`, `!==`, `case`); a class in a ternary, or keyed by a comparison, still counts.
     - `empty-states` 1 and `raw-buttons` 1 in the site builder's gallery editor: `AppEmptyState size="sm"`, and a `<Button variant="destructive" size="icon">` remove badge with the same look. The account page's avatar badge is the same button now.
   - **Ratchets lowered:** `color-literals` 609 → 592, `raw-buttons` 313 → 307, `settings-boxes` 24 → 23, `page-h1` 42 → 41 (already under before this). Nothing raised; one `allow-*` tag added.
   - Tests: `tests/scripts/audit-kit.test.ts` (22): `accept="image/*"` followed by a finding in the raw-buttons, type-scale, color-literals and box matchers; template text that looks like a comment; HTML comments, an unclosed one stopping at its template; script and style blocks; strings, template literals, regexes, division, an unterminated quote; `.ts` comments for the dead-class matcher. `tests/scripts/audit-matchers.test.ts` (+5, compared strings). Gate on the final tree: typecheck 0, vitest 228 files / 3,913 tests, lint 133 warnings (cap 148), build, 19/19 audits.
   - **Checked 2026-11-16 in the app** as Demo Admin on localhost: the account page's three tabs (light and dark) and the push warning line; Settings → Organization → Branding and SEO; the site builder's gallery editor, with a gallery section added and an image put in its draft to see the empty state and the remove badge, then left unsaved (the builder reloads with no gallery); the file picker's folder icons. The Branding email preview did not load in the preview browser, which blocks the sandboxed frame (`ERR_BLOCKED_BY_CLIENT`); only the frame's background changed.
   - **Not done, for later:** `RemindersSettingsForm` has the same white email-preview frame, untagged and in the old count. The SEO form's search-preview box (a mock of a search result) is still counted by `settings-boxes`.
   - Both fixed the same day. The Reminders frame is tagged as the Branding one is, and its iframe's second `bg-white` is gone. The SEO search preview sits flat, set off by a left rule, since a results page shows a listing as plain text, not a card. (`ios-card--thing`, which the audit suggests for an object, is not defined in any stylesheet.) Ratchets: `color-literals` 592 → 590, `settings-boxes` 23 → 22. Checked in the app as Demo Admin: the SEO tab's preview, and the Reminders preview frame still white. Gate on the final tree, rebased on item 12: typecheck 0, vitest 229 files / 3,927 tests, lint 133, build, 19/19 audits. Left as they were: the preview's blue title and green URL (`text-blue-600`, `text-green-700`, a search engine's own colours) are still in `color-literals`.
12. **Expense writes are routes; the HOA Admin create and update on `payment_expenses` go (2026-11-16).** Item 10's first loose end, done as leases were (item 6).
   - **The gap:** the expense form created and edited `payment_expenses` through Directus on the admin's token, and the HOA Admin rule's validation held only the row's own `organization`. Through the API an admin could set `receipt` to another community's file, which the asset proxy then opened to them as their receipt (`mayOpenExpenseReceipt`), or `project` to another community's project, whose budget the amount then rolled into.
   - **The routes:** `POST /api/org/expenses` (`{ orgId, expense }`) and `PATCH /api/org/expenses` (`{ orgId, id, patch }`), written with the app's token, for an admin or a manager with the projects grant (`requireAdminOrManagerGrant`, as `record.post.ts`). The bodies are zod and strict (`core/shared/expenses/expense-writes.ts`): no `organization`, `id` or nested objects; an amount is a number over zero; a date is a day or a timestamp. The row must be the community's (`expenseCommunity`: its own organization and its project's agree). A project must be one of its (`assertProjectInOrg`, the register's). A receipt must be one of its files or one the caller uploaded and filed nowhere (`assertReceiptInOrg` in `expense-receipts.ts`, on `assertDocumentInOrg`, which now takes a message); an edit that sends back the receipt the row already has is not checked again, so a colleague's receipt survives an edit. Never `paid`: a create refuses it, and an edit refuses it unless the row is paid already (the form sends a paid expense's status back unchanged), so `record.post.ts` stays the only way to paid and to its Ledger entry. Deletes stay on Directus: the delete rule checks the row as it is.
   - **The page:** `useExpenses().create` and `update` call the routes; a refusal shows the server's message.
   - **Rules:** `payment_expenses` create and update join `REMOVED_ADMIN_RULES`; `create-expenses-collection.ts` skips them. HOA Admin keeps read and delete; HOA Member has no rule, as before; the Property Manager policy has none. Dry run against production 2026-11-16 (`pnpm setup:permissions:audit`): remove 2 (`payment_expenses.create`, `payment_expenses.update`), create 0, update 0, nothing else.
   - Tests: `tests/server/expense-writes.test.ts` (14): who may call (signed out, a resident, a board seat, a manager without the grant and another community's admin are refused; a manager with it may); create (a draft unless approved, the community set by the server, a project of its own and a receipt of its own or the caller's loose upload; refused: another community's project or file, an unknown project, a filed upload, someone else's loose upload, `paid`, and fields or values of the caller's choosing); edit (keeps a receipt a colleague attached; refused: another community's row, a straddling row, a missing one, another community's project or file, someone else's upload, a move to `paid` or another community, an empty patch; `paid` sent back on a paid row); the pure checks. `tests/scripts/shared-write-validations.test.ts` (+4 expectations). The fixture gains the expense relations. Mutation check: dropping the receipt and project checks, or the paid check, fails the tests. Gate on the final tree, rebased on item 11: typecheck 0, vitest 229 files / 3,927 tests, lint 133 warnings (cap 148), build, 19/19 audits.
   - **Checked 2026-11-16 in the app** on localhost against the live Directus, as Demo Admin in Harborview Lofts: Add expense with a PDF receipt (`POST /api/org/expenses/receipt`, then `POST /api/org/expenses`); the row showed $123.45, Draft, and "View receipt" served the PDF (200). Edited to $150.00 and Approved (`PATCH`), receipt kept. Called from the page as Demo Admin: another community's file (a 605 Lincoln Road document) as the receipt, on create and on edit, 403 "That receipt isn't one of this community's files."; an unknown project, 400; `paid` on create and on edit, 400; `organization` in a patch, 400; another community's `orgId`, 403; `paid` sent back on a paid seeded expense, 200. The refused calls wrote nothing. Deleted afterwards: the expense from the page, its PDF by id; the list reads 50 rows, $10,860.00. Harborview has no projects, so the page showed no project picker; the tests cover projects.
   - **A misclick while checking.** The expense list loaded after the page was read, the element references moved, and a click meant for the form deleted the seeded "Landscaping and pool care — November 2026" (Bayside Grounds & Pool, $175). Found with the demo seed's dry run (49 of 50 seeded expenses) and restored with exactly the row the seed writes (same fields and marker); the seed's own comparison reads 50 of 50 again. The nightly demo reset would also have restored it. An edit form opened by the same misclick was cancelled; the comparison shows no seeded expense changed.
   - **Operator TODO:** push and deploy first, then `pnpm setup:permissions:audit` (expect remove 2: `payment_expenses` create and update, nothing else), then `pnpm setup:permissions`, then a second audit (0, 0, 0). In that order: the live site's expense form writes through Directus until the new build is out, so removing the rules first would break saving an expense there. Until it runs, the old rules and the API gap stay; the page no longer uses them. Applied 2026-11-16 with item 14's steps (see there).
   - **Not done, for later:** (1) **Any file can be made a community's.** The HOA Admin create and update on `hoa_documents`, `hoa_meetings` and `hoa_amenities` validate only `organization` and take every field (read live 2026-11-16), so through the API an admin can save a document, meeting or amenity in their community naming another community's file id. `fileOwnerOrgIds` then counts the file as theirs: the asset proxy opens it to their members, and the receipt and lease-document checks pass for it. Likely, from the rules; not tried, since trying means writing another community's file into a live row. The fix is the one used here (routes that check the file, or validations that pin the file fields), across those tables. (2) Within one community a receipt may be any of its files, a lease's PDF included, which the receipt rule then opens to board seats; the lease form has the mirror case. (3) An edit may still move a paid expense back to approved or draft, and marking it paid again records a second Ledger entry, as before.
   - (1) is fixed: item 13.
13. **No admin can make another community's file theirs (2026-11-16).** Item 12's (1).
   - **The gap:** the HOA Admin create and update on `hoa_documents`, `hoa_meetings` and `hoa_amenities` validated only the row's own `organization` and took every field (read live). A file id carries no tenancy, and a row naming a file makes it its community's (`fileOwnerOrgIds`). So through the Directus API an admin could save a document, meeting or amenity in their community naming another community's file: the asset proxy then opened it to their members, and `filesOutsideOrg`, with the lease-document and receipt checks built on it, counted it as theirs. No other create or update on the three community policies writes a file field that `fileOwnerOrgIds` counts (pets, vehicles, leases, expenses and the junctions are routes; newsletter blocks and governing files have no rule). Read against live data first: no row names a file outside its own community (9 documents: 8 in their library, 1 unfiled 605 Lincoln Road PDF from its seed; no meeting files, no amenity images).
   - **The fix:** those two rules keep every field but the file fields, `file`, `notice_file`, `recording_file` and `image` (`core/shared/roles/admin-file-fields.ts`). `setup-directus-permissions.ts` reads the live fields and writes the list: in the main pass for documents and amenities, and in the pass over other scripts' rules for meetings, whose rules `create-meetings-collections.ts` makes (it writes the same list now). Directus then refuses those fields on the admin's own token, however they are sent. The app writes one of them, a new document's file: `/api/directus/items` holds a named file field back from the caller's own write, checks that the caller is an admin of the row's community and that the file is one of its files or one they uploaded and filed nowhere (`assertDocumentInOrg`; the file a row already has is not checked again), and sets it with the app's token (`core/server/utils/admin-file-writes.ts`). An object for a file (a nested write) and several rows at once are refused; if the file cannot be set, the new document is taken away again. Read and delete keep every field. A field added to one of these tables later is not writable by admins until `pnpm setup:permissions` runs again.
   - **Claims stay as they are.** Counting a claim only for a file in the community's library was the other way, but it would have shut 605's unfiled PDF away from its members. With every write that can make a claim checked, a claim can be trusted again.
   - **Document upload was broken; fixed here.** `/api/directus/files/upload` put the file before its title and folder in the form it sends Directus, which reads only the fields that come before the file, so every upload landed in no folder and untitled. Since the public file rule went images-only (2026-11-12) the uploader may not read a PDF in no folder, so Directus answered with no id and the document form said "Failed to upload document" (seen in the app before the fix; the stray upload deleted). Images, from the landing builder, still came back, unfiled. The metadata goes first now.
   - Tests: `tests/server/admin-file-writes.test.ts` (12), with a caller's client that refuses the held fields as the narrowed rules will: a new document's file from the library or the admin's loose upload, set with the app's token and never sent on the caller's own; refused: another community's file, an upload filed outside the library, someone else's upload, another community's document, a resident, a board seat, a manager, no community, an object for a file, several rows; the document taken away when its file cannot be set; writes naming no file untouched; a meeting's notice and an amenity's image set and cleared; a row's own file kept; another community's row and a missing one refused. Mutation check: dropping the file check or the admin check fails them. `tests/server/caller-library.test.ts` (+1: title and folder before the file). Gate on the final tree: typecheck 0, vitest 230 files / 3,940 tests, lint 133 warnings (cap 148), build, 19/19 audits.
   - **Dry run against production 2026-11-16** (`pnpm setup:permissions:audit`): update 6, the HOA Admin create and update on `hoa_documents`, `hoa_amenities` and `hoa_meetings` (their field lists: 12 of 13, 11 of 12 and 21 of 23 fields); remove 2, `payment_expenses` (item 12); create 0.
   - **Checked 2026-11-16 in the app** on localhost against the live Directus, as Demo Admin in Harborview Lofts. Documents → Upload with a PDF, as a draft: before the upload fix, "Failed to upload document" and the PDF in no folder; after it, the PDF filed in Harborview's root folder with its title, the document created on Demo Admin's token with its file set by the proxy, the page on to Documents, and the PDF opened through the asset proxy (200). Called from the page as Demo Admin: a document naming a 605 Lincoln Road file, on create and as a swap, and an amenity naming it, 403 "That file isn't one of this community's files."; an object for a file, 400; a document in another community, 403; a rename that sends the file back, 200. Nothing refused was written. The test document and its PDF were deleted afterwards and read back gone. Until the rules are applied, Directus itself still takes the fields on an admin's own token.
   - **Operator TODO:** push and deploy first (until then the live document form sends `file` on the admin's token, so applying first would make every document upload fail with a field error), then `pnpm setup:permissions:audit` (expect update 6, and remove 2 with item 12's), `pnpm setup:permissions`, and a second audit (0, 0, 0). Applied 2026-11-16 with item 14's steps (see there).
   - **Not done, for later:** (1) the `directus_files` and `directus_folders` create and update rules have no validation, so on their own token a member or admin can put a file they uploaded, or one in their library, into another community's library folder through the Directus API (the app's routes check this, `assertFolderInCallerLibrary`). That plants a file there rather than reading one; the fix is a validation pinned to the caller's library. (2) Within one community, a document, meeting or amenity may name a file another record of it claims (a lease's PDF, a receipt), which then opens to every member. Admin-only, as before.
   - (1) is fixed: item 14.
14. **No one can plant a file or folder in another community's library; every community's files sit in its own folders (2026-11-16).** Item 13's (1), with Peter's ask to "keep files in the organization/community folders for organizational purposes".
   - **The gap (read live):** the HOA Member and HOA Admin create and update on `directus_files` and `directus_folders` had no validation and took every field. On their own Directus token a member could upload a file into any folder, move a file they uploaded (or any file up to three levels deep in their library) into another community's folder, create a folder under another community's, and re-parent a folder of their library into another community's tree; an admin could do the same with their library's root. Admins carry the HOA Member policy too. A file or folder placed in another community's library is that community's (`filesOutsideOrg`), so its members see it in their library. Directus cannot check a placement: a validation on a relation refuses the plain id the app sends, and the tree nests.
   - **The fix:** no community policy writes where a file or folder sits. Their create and update on `directus_files` list every field but `folder`, and on `directus_folders` every field but `parent` (`PLACEMENT_FIELDS`, `core/shared/roles/admin-file-fields.ts`). `setup-directus-permissions.ts` reads the live fields, writes those lists in the main pass for the HOA Admin rules it owns, and narrows the rest (HOA Member, and other scripts' rules) in a closing pass. Renames, titles and deletes stay on the person's own token. The app's routes place files and folders with the app's token, after their checks (`core/server/utils/caller-library.ts`):
     - uploads and imports (`/api/directus/files/upload`, `/files/import`, `/api/org/storage/upload`) go into a folder in the caller's library, then `uploaded_by` is set to the caller, as Directus would have (`storeAsCaller`);
     - a file move (`/api/directus/files`) stays within the file's own community's library or takes it out of every library; a loose file only if the caller uploaded it (`assertFileMove`);
     - a new folder goes under the caller's library; a folder move (`/api/directus/folders`) stays within its own library, never moves a library's root, and never goes inside itself (`assertFolderMove`). Someone in two communities still cannot carry a file or folder from one library to the other.
   - **Records: receipts and lease PDFs are filed with their community.** They used to be stored in no folder. Each community's library now has Records › Expense receipts and Records › Leases (`STORAGE_TREE`), and `storeRecordUpload` (`private-uploads.ts`, formerly `storeUnfiledUpload`) files them there with a `record-` mark (`core/shared/records/files.ts`). They are not library documents. The library shows Records to the community's admins only. The storage library's and the general file route's rename, move and delete refuse a record file (409): it changes with its record. The asset proxy serves a marked photo by its record's rule, not to anyone signed in. The mark joins `PRIVATE_FILE_PREFIXES`, so once the two file-rule scripts run, the public rule leaves a photo receipt out (item 10's (3)) and members cannot edit, replace or delete a record file through Directus. Without the mark, filing them in the library would have let any member edit them: the member update rule reaches every file three levels deep. An owner's lease report takes their own PDF from Records › Leases, or an older loose one (`assertOwnLeaseUpload` now takes the community). A record file in Records is the community's file for `assertDocumentInOrg`, so a colleague may attach it; another community still may not.
   - **The SEO share image** was the one upload that named no folder; it is filed with the community's other files now.
   - **Found while checking, fixed:** `isWithinOrgRoot` caches folder parents per server process and nothing cleared a moved folder's entry, so a cycle check could pass on a stale parent. That was seen on the live Directus: Harborview's Documents was moved under a test folder that was itself inside Documents, leaving the two pointing at each other. It was repaired the same minute (Documents back under Harborview's root, read back). Cycle checks now read fresh (the Directus folders route and the storage library's move), and a move forgets the moved folders' cached parents. Which community a folder is in cannot change through the app, so tenancy checks keep the cache.
   - **Existing files:** `pnpm backfill:storage` (dry run by default) now also files what sits in no folder with its community: receipts and lease PDFs (lease records and owners' lease reports) into Records with the mark, documents' files into Documents, logo, icon and footer photo into Branding, landing hero images into Images. Every move is guarded: it moves only a file in no folder, or one already inside this community's library, never one in another community's (the existing comment, message and email sorts did not check that). Dry run against production 2026-11-16: create Records › Expense receipts and Leases in all 7 communities (Harborview's since exist: the app check below made them), and The Beaumont's whole tree, which it had none of; file 5 files (a Harborview hero image, 1033 Lenox's logo and hero image, 605 Lincoln Road's loose document and one channel-message attachment); leave 2 of 11 Lincoln's hero images, which sit in another library. Of the 23 files in no folder, the other 17 are named by nothing, or are a user's avatar, and stay as they are.
   - Tests: `tests/server/caller-library.test.ts` (9, rewritten): folders created and moved with the app's token and refused into another community, as a root, into themselves, or when missing; files moved within their library or out of every library, a loose file only by its uploader, never across libraries, even for someone in both; renames on the caller's token; record files refused; uploads stored as the caller's, metadata before the file. `tests/server/record-files.test.ts` (5): Records hidden from non-admins in the library and refused by id, record files refused by the storage library's actions, a record photo served by its rule while an ordinary image needs only a session. `tests/server/org-storage-parents.test.ts` (2): the stale parent, fresh reads and forgetting. `tests/server/expense-receipts.test.ts`, `lease-document-upload.test.ts`: uploads filed in Records with the mark. `tests/scripts/public-files.test.ts`, `member-files.test.ts`: the `record-` prefix. Mutation checks: dropping the proxy's record check or the library's Records check fails the tests. The fixture gains `ensureOrgStorage` and a library-aware `filesOutsideOrg`. Gate on the final tree: typecheck 0, vitest 232 files / 3,950 tests, lint 133 warnings (cap 148), build, 19/19 audits.
   - **Dry runs against production 2026-11-16:** `pnpm setup:permissions:audit`: update 14, remove 2, create 0. The 14 are TODO 13's 6 and 8 placement lists: HOA Admin file create/update and folder update in the main pass; HOA Member file create/update and folder create/update, and HOA Admin folder create, in the closing pass. The 2 removals are TODO 12's. `pnpm scope:public-files`: the public read gains `record-` and nothing else. `scripts/scope-member-file-writes.ts`: the HOA Member file update and delete gain `record-`, 2 rows.
   - **Checked 2026-11-16 in the app** on localhost against the live Directus, as Demo Admin in Harborview Lofts: an expense with a PDF receipt saved, and the receipt opened (200, PDF); read back, it sat at "Harborview Lofts › Records › Expense receipts" with the mark and Demo Admin as uploader. The first upload created Harborview's Records folders. Through the routes the Documents page uses: an upload into Documents stored as Demo Admin's, a folder created under Harborview's root, the file moved into it, the folder renamed (caller's token) and moved under Documents. All 200. Refused: a file into 605 Lincoln Road's root, an upload into it, a folder under it, a folder moved there (403); Harborview's root moved (403); renaming or deleting the receipt (409); and, after the cache fix, Documents into its own child (400, "A folder can't go inside itself"). Before the fix that last move went through, which is how the cycle was found. Everything created was deleted and read back gone; the seeded expenses read 50 of 50, and Documents is under Harborview's root.
   - **Operator TODO, in this order:** (1) push and deploy (until then the live upload and move routes write `folder` on the caller's token, so narrowing first would break every upload); (2) `pnpm setup:permissions:audit`, expect update 14 and remove 2 while TODO 12 and 13 are unapplied, then `pnpm setup:permissions`, then a second audit (0, 0, 0); (3) `pnpm scope:public-files`, then with `--apply`; (4) `pnpm exec dotenv -- tsx scripts/scope-member-file-writes.ts`, then with `--apply`; (5) `pnpm backfill:storage`, then `pnpm backfill:storage -- --apply`. Steps 3 to 5 can run in any order after 1. All run 2026-11-16, see below.
   - **Applied 2026-11-16 (items 12, 13 and 14).** Gate on main at `f767c9c`: typecheck 0, lint 133 warnings, 3,950 tests in 232 files, build, 19 audits. Pushed `7da701b..f767c9c`; the new build was live after about 4 minutes, and `POST`/`PATCH /api/org/expenses` and `POST /api/hoa/units/lease-document` answer 401 signed out. Then, in this order: `pnpm setup:permissions` (audit first: update 14, remove 2) updated 14 and removed 2 (`payment_expenses` create and update); `pnpm scope:public-files --apply` added `record-` to the public read, and a public image still serves (200); `scope-member-file-writes.ts --apply` scoped the HOA Member file update and delete; `pnpm backfill:storage -- --apply` created the Records > Expense receipts / Leases folders (and the folders The Beaumont lacked) and moved 6 files, one more than the dry run's 5: a dry run doesn't count a file whose folder doesn't exist yet, and The Beaumont had no Images folder, so its demo image was filed only once the folder was made. Second dry runs: permissions 0, 0, 0; public files and member writes already scoped; backfill moves 0 (2 left in another library, as designed). Not checked in the app: an upload, a receipt or a lease PDF after the rules changed.
   - **Not done, for later:** (1) Inside one community, any member may still rename, re-describe or replace (through Directus) any non-record file up to three levels deep in its library, and delete a library folder (the HOA Member folder delete rule); the app never does either on a member's token. (2) The 17 loose files named by nothing could be deleted after a look; nothing here deletes them. (3) A record file stays in Records when its record is deleted.

**Shipped** (each commit gated: typecheck 0, vitest green, lint 138 against a cap of 148, build green, 19/19 audits; commit 4 touches only `scripts/` and `package.json`, so its build ran with commit 5's)

- `c1ef959` `docs/spec-responsibilities.md` (89 lines): shapes, the exactly-one-target rule, current / as-of / vacant / unassigned since, effective dates, every route with who may call it, what each audience reads, Session 7's names, hook points, named tests.
- `3401ec3` `core/shared/responsibilities/`: `config.ts` (categories, cadences, bases, roles, offices, end reasons, the Florida condominium seed of 45 rows, `rowsToAdd`), `holders.ts` (`validateTarget`, `holdersAsOf`, `currentHolders`, `unassignedSince`, `officeHolderAsOf` and `officeTermsWithin` on `isCurrentBoardTerm`), `review.ts` (`nextReview`), `plan.ts` (`planHandOver`, `planTermChange`), `activity.ts` (the sentences). Test: `tests/shared/responsibilities.test.ts` (40).
- `90f15ea` the area. `responsibilities` in `AREAS`, grantable, gated by `core/server/utils/responsibility-access.ts`. New capability `responsibilities:read` for every board office. The settings switch "Edit the responsibilities register" and the ops view-as label.
- `2eb00e4` `scripts/create-responsibilities-collections.ts` (`pnpm create:responsibilities`, `--dry-run`) and the permission entries.
- `2e69822` the routes: eleven under `core/server/api/org/responsibilities/`, four under `core/server/api/org/board-terms/`, with `core/server/utils/responsibilities.ts` (loads, names, org checks, activity), `core/server/utils/register-pdf.ts`, and the pure `views.ts` (what each audience reads) and `schemas.ts` (zod bodies, shared so forms can use them). Tests: `tests/server/responsibilities-routes.test.ts`, `tests/server/board-terms-routes.test.ts`, `tests/server/register-pdf.test.ts`.
- `e93c5f5` `GET /api/org/responsibilities/service-history?member=` with the pure `history.ts`, so Session 7 builds no route.
- `9c53f4a` the regenerated types, and the register in the Data Trust export map (both tiers; notes blanked in the shareable copy). The export completeness test caught the gap.
- `de0a221` `setup-directus-permissions.ts` stops widening `hoa_members`, `hoa_email_recipients` and channel-message edits (TODO 2).
- `29f96a0` channel reads follow membership and delete is the author's (TODO 2c).
- `1a5ef6d` the HOA Admin policy reaches only communities a person administers: `admin_of`, its sync route and Flows, the scope swap and the member policy on the admin role (TODO 6). Tests: `tests/shared/admin-scope.test.ts`, `tests/server/sync-admin-scope.test.ts`, `tests/scripts/admin-scope-perms.test.ts`.

**What a user sees change**

| Who | Before | Now |
|---|---|---|
| Admin, Settings → Property management | Nine switches per manager | A tenth: "Edit the responsibilities register". A manager who had all nine reads as Custom, not Full service, until an admin picks Full service again (the dry run found none) |
| Platform staff, ops "view as" | — | A board seat lists "See who handles what, with history" |
| Everyone else | — | Nothing until Session 7's pages |

**Deviations and decisions**

- **`hoa_board_members.holder_name` added.** The brief listed only `end_reason`, but says ending any row freezes `holder_name`. The live schema deletes a member's terms' link (`hoa_member` is SET NULL), so a term needs its own frozen name. End term and Change office write it.
- **Effective dates.** Hand-over, Change office and retire take the first day of the new state; the old row ends the day before, so no day has two holders and no day has none. End term takes the last day served, which is the `term_end` it writes. "Unassigned since" is therefore the day after the last end, which is the date the admin entered; the brief's "the last holder's end date" would read one day early.
- **Hand-over without a next holder ends the row.** No other route ends an open row, and §3.4's "unassigned since the day the last holder's row ended" needs one. Correct cannot end an open row.
- **Full service includes the register.** It is every grant key by construction. Nobody's access widens: a stored grant set without the key reads false. Session 1 kept vendors and billing notify-only because they had no gate; this area has one.
- **The board reads by capability, not by the grant:** `responsibilities:read` for every office, checked through `getBoardPosition` as milestone approval is. Editing is admin or the grant (`requireAdminOrManagerGrant`'s rule). The hat gives nothing.
- **No Directus policy on the three new collections, admins included** (the brief named members). That keeps "nothing is deleted" true at the API and keeps the register out of the HOA Admin policy's any-membership scope (Session 2 TODO 5).
- **Board-term routes are admin only**, as the Board tab is; managers have read-only on `hoa_board_members` today.
- **Delete of a term is also refused when a meeting's attendance links it**, beside the brief's "an assignee row depends on it". Attendance freezes history too.
- **Correct on a term** may change office, dates, message, icon, status and end reason, never the member (the body is strict, so `hoa_member` is a 400). The activity row carries before and after.
- **The owner view also needs the module on**, and each row carries `id` and `category` beside the four columns, for grouping. Office holders carry the people's names, which owners already see on the Board page.
- **Evidence files** must pass `filesOutsideOrg`. They are not added to `file-owner.ts`: that would let any member open them through the asset proxy.
- **The PDF renders on the server** with jsPDF (landscape letter), from the pure `registerPdfDoc`, in the Finances report's look. Retired jobs are left out; every category prints, empty or not.
- **Activity types `responsibility` and `board_term`** are written only by the server and are not in the client's `ACTIVITY_EVENT_TYPES`, so no client can forge one. The Activity page shows the raw type until it has labels.
- **Next review:** one month after the last verification for daily, weekly and monthly jobs, three for quarterly, twelve for the rest. Never verified counts as overdue.
- Tool shells here had node and pnpm on PATH; fnm is at `/opt/homebrew/bin`, not `/usr/local/bin`.
- Existing tests changed: `tests/shared/areas.test.ts` (the grant order gains `responsibilities`) and `tests/shared/nav-registry.test.ts` (`responsibilities` waits for its page, Session 7). New: the five files named above and `tests/server/__fixtures__/responsibilities-db.ts`.

#### Session 7 — Phase 2b part 2, the pages (2026-11-16)

Local, on `main`, not pushed. Brief commits 6 to 9, one commit each, plus one the brief asked for inside commit 7. Every commit passed the full gate before it landed: typecheck 0, vitest green (3,985 tests at the last), build green, `audit:all` 19 of 19, lint 132 of 148 warnings. Audit baselines unchanged.

**Shipped**

- `1149c6f` **Board tab.** End term · Change office · Correct on each row, each one form in `AppBottomSheet` (`app/components/Members/BoardTermSheets.vue`) over `POST board-terms/[id]/end`, `…/change-office` and `PATCH board-terms/[id]`. Delete is in the overflow behind `useConfirm` ("for a term entered by mistake"), through `DELETE board-terms/[id]`, with the route's 409 shown as it comes. An As of date filters the list (`isCurrentBoardTerm`), and each ended term shows why. The HOA Admin delete on `hoa_board_members` joins create and update in `REMOVED_ADMIN_RULES`.
- `6fdba19` **Grouped rows in the scaffold.** `group` and `groups` on `AppResourceIndex` and `AppDataTable`: sections under sticky headers with a count; `groupRows()` is the pure split (table-tested); `/ui-kit` has a "Grouped index" demo; `docs/spec-resource-scaffold.md` has the two props.
- `8512d54` **Admin register.** `/admin/responsibilities` and its panel (`?slide=responsibility:id`, `/admin/responsibilities/:id`), the forms, the Visibility menu, the nav entries, the module key and its Settings row. `WAITS` in `tests/shared/nav-registry.test.ts` no longer lists `responsibilities`.
- `4d0752a` **Owner view.** `/{slug}/responsibilities`, its own registry entry, in the member dock.
- `9e3750e` **Service history** under the Edit Member form: offices held and jobs held, with dates.

**What each role now sees**

| Who | Before | Now |
|---|---|---|
| Admin | A Board tab whose Edit overwrote the person and office, and whose Remove deleted the row | Board tab: End term, Change office, Correct, As of; Delete is in the overflow and says it is for mistakes. A Responsibilities icon in the dock (after People): the register, its panel, hand-over, assign, edit, retire, the Florida list, Export PDF, and the Visibility menu. Service history on each member |
| Board seat (not admin) | Nothing | The register, read-only: the same rows, filters, panel, history and PDF, with no New job, no template, no hand-over and no Visibility menu. Also the owner page |
| Manager with the `responsibilities` grant | Nothing | The register in the manager dock, with the editors' controls; no Visibility menu (admin only) |
| Owner, tenant | Nothing | "Who handles what" in the member dock: published jobs, today's holders, cadence, last verified, in five sections. Until the board publishes: "The board hasn't published who handles what yet." |

**Deviations and decisions**

- **Nav: two entries on one path, not an any-of need.** Needs are ANDed, so the register's two doors (`responsibilities:read` for admins and board seats; the area for managers) are `responsibilities-register` and `responsibilities-mgr`, as `documents` and `documents-mgr` already are. `entriesForPath` treats entries that tie on a path as any-of for the gate, and a test says so. An any-of need would have taught `holds`, `meetsAccess`, the audits and every reader of `needs` a new shape. The register is a top-level dock entry (like Money), in the admin and member layouts, not a pill under People: a pill needs its hub, and the People hub is admin-only, which would hide it from board seats. The admin dock gains one icon.
- **Create stays as it was.** "Add Board Position" is still the same `Dialog`; the three new actions are the bottom sheets. `form-dialogs` is unchanged at 27.
- **Term dates read as days.** The Board tab showed a term starting 2025-01-01 as "Dec 31" west of UTC (the date was read as midnight UTC). The Board tab, the register and the owner view read a date-only value as that day.
- **A confirm on turning "Published to owners" on**, beside the brief's one for "Show unassigned jobs". The first sends owners the register; an admin should be able to repeat what they will see.
- **A Correct form on a holder row (not in the brief).** A hand-over dated on or before the row's start is refused with "Correct the row instead" (`planHandOver`); without this form there was no way to. It changes role, notes and dates, never who.
- **Holder pickers** read members, vendors and teams from Directus with the viewer's own token (an admin sees all; a manager with the grant sees only vendors residents see). The schema's Directus-user target is not offered: anyone who works for the community is a member.
- **Not built, said once:** the discussion thread (`hoa_channels` links to a request, a project or a vendor; a job link needs a schema script and `channel-scope` rules); a way to attach files (the panel lists what the route returns); the Map mode (`index.vue` has the place, a comment and `data-register-view="grid"`).
- **Service history is in the Edit Member sheet**, which is the member detail in this app (`?member=<id>` opens it). Its jobs part shows only while the `responsibilities` module is on.
- **A grouped card clips, not hides.** `overflow: hidden` made the index's card a scroll container, so the sticky headers stuck inside it. The grouped card uses `overflow: clip`, and the table's own wrappers do not scroll.
- **The gate has a blind spot for new files.** `pnpm audit:all` reads tracked files, so a new untracked file passes it and the pre-commit hook then fails. Run `git add -N <new files>` first. Caught here once (two `type-scale` and one `empty-states` finding in the first attempt at commit 8512d54, fixed before it landed).
- **`/ui-kit` could not be opened in the preview** (a signed-in user is bounced to their org; signed out, to login). The grouped demo type-checks and builds, and the same component was checked on the register.

**Checked in the browser, and not**

- **Done**, signed in as the demo admin (Harborview Lofts, `is_demo`): Board tab (end term, change office, As of, the delete confirm and delete, the correct form), the register (apply the Florida list, sticky section headers on desktop and a phone width, the panel over the index and as a deep link, assign, the hand-over refusal shown as a toast, correct a holder row, the Visibility menu and the "44 unassigned jobs" confirm), the owner view through the admin's member preview (published rows, "Unassigned since 16 November 2026", no basis, notes or history), service history, the member dock's new icon.
- **Not reachable:** a login as a board seat, as a manager with the grant, and as a plain owner or tenant (the member preview keeps the admin's session). Those roles are covered by the route tests and the nav tests, not seen. The PDF link was not opened.
- **The checks left rows in the demo community** (a sandbox, `is_demo`): 45 jobs, 1 holder row, 3 board terms, 11 activity rows, and both switches on. **Removed 2026-11-17** at Peter's go-ahead (a script that checks `is_demo`; the community reads 0 of each, both switches off).

**Operator TODOs**

1. ~~Apply the permission change.~~ **Done 2026-11-17 by Peter.** `pnpm setup:permissions:audit` reads 0, 0, 0 afterwards: the HOA Admin delete on `hoa_board_members` is gone.
2. **Publish for 1033 Lenox** before 2026-12-09. **Pushed and deployed 2026-11-17** (`cbe63b9`, per Peter). **The Florida list is applied in 1033 Lenox (2026-11-17, 45 jobs, all unassigned)**, from the app, as an admin. Done 2026-11-17: a test board (terms from that day) and 31 holders by office (above). Still to do: name who does the 14 unassigned jobs (1033 Lenox has no vendors or teams in the system, so a typed name is what owners would see), replace the test board with the real one on 2026-12-09, run a manager check (a Property Manager membership). **Published 2026-11-17** (above). Leave "Show unassigned jobs to owners" off unless the board decides.
3. ~~Decide the demo clean-up.~~ **Done 2026-11-17** (above).
4. **A later session**: the discussion thread (schema), attaching files; the Map mode is Session 9 (`docs/prompts/role-first-s9-responsibilities-map.md`).
5. ~~Follow-up task: the register's rows collapse badly~~ **Done 2026-11-17** (below).

**Confirmed afterwards (2026-11-17, with Peter signed in on the preview pane)**

- **Deployed.** Peter reports Session 7 deployed (`cbe63b9`). Not seen from here: there is no `gh` in the tool shell, so the deploy status could not be read.
- **Permissions applied.** `pnpm setup:permissions:audit` reads 0, 0, 0, so the HOA Admin delete on `hoa_board_members` is gone.
- **1033 Lenox, read from Directus:** a real community (`is_demo` false), the `responsibilities` module on, both switches off. It had no jobs and one board term, the President's, which ended 2025-12-31, so every office reads "(vacant)" until the new board is entered. It has no vendors and no teams in the system, so a holder there is a board office, a member or a typed name.
- **The Florida list is applied in 1033 Lenox** (45 jobs: Finance 14, Building 10, Mechanical and safety 7, Compliance and records 9, People and community 5), through the app's own confirm, as an admin. All unassigned, nothing published.
- **The PDF route answers for a real list:** HTTP 200, `application/pdf`, 9.3 KB, `%PDF-1.3` to `%%EOF`, named `responsibilities-1033-lenox-2026-11-17.pdf`. Its contents were not read: open it from the register before 12-09.
- **The demo community is clean** (see above), and both switches are off.
- **Rows are two lines at every width** (the follow-up below). Seen on 1033 Lenox's list at 375, 640, 900 px and desktop, plus a simulated three-holder row, with sorting and row click. The owner view's stacked layout was not seen with rows: 1033 Lenox is unpublished.
- **Seen as a board seat, 2026-11-17** (signed in on the preview pane as Obie, a plain HOA Member with the Secretary's term, in 1033 Lenox): the register opens with all 45 jobs, the filters, the panel, the timeline and Export PDF, and has no New job, no Florida list and no Visibility menu; a job's panel has no Hand Over, Assign, Edit, Correct or menu. The routes agree: the register, the PDF and service history answer 200; apply-template, hand-over, visibility and a board-term delete each answer 403 (each request was chosen so it could change nothing even if the gate had failed). `/admin/members` sends Obie to Documents. His app menu lists both "Duties" (the register) and "Jobs" (the owner page); the owner page says "The board hasn't published who handles what yet." while unpublished. **A finding:** a board seat sees two near-synonyms for two different pages; worth one name each (the register is "Duties" in the dock and "Responsibilities" on the page, the owner page is "Jobs" and "Who handles what").
- **Seen as a tenant, 2026-11-17** (signed in on the preview pane as Tester Two, an active tenant, plain HOA Member, no board term): the app menu has "Jobs" (the owner page) and no "Duties" and no Money; the owner page says "The board hasn't published who handles what yet."; `/admin/responsibilities` sends the tenant to Documents. The routes: the published route answers 200 with `published: false` and no rows; the register, the PDF and service history answer 403, and so do apply-template, hand-over, visibility and a board-term delete.
- **Published 2026-11-17 by Peter** (Visibility menu, as the community admin), with **both switches on**: "Published to owners" and "Show unassigned jobs to owners" (the second was meant to stay off; whether to keep it on is Peter's call). Read back through the published route on Peter's session: `published: true`; 45 rows; the 31 held rows carry exactly `id, title, category, cadence, lastVerified, who` and each `who` exactly `kind, name, role, people`; the 14 unassigned rows carry exactly `id, title, category, unassignedSince`; no basis, notes, status, files, history or the word "disputed" anywhere in the payload. The owner page renders the stacked rows with it: a held job as its holder chip, cadence and last verified; an unassigned one as "Unassigned since 17 November 2026"; the Director job as "Director (vacant)"; no status chip and no basis column. Seen on Peter's admin session, and again on Obie's own (a non-admin board seat; `viewer` read `canEdit: false, isAdmin: false`): the unpublished message is gone, 45 jobs render, the held, unassigned and vacant rows read the same, and the published route answers `published: true` with 45 rows.
- **Seen again as the tenant after publishing, 2026-11-17** (Tester Two): the published page shows all 45 jobs and the unpublished message is gone; the register, the PDF and service history still answer 403; the app menu has "Jobs", no "Duties" and no Money.
- **Still not seen:** a manager with the grant (needs a Property Manager membership). `/ui-kit` still bounces a signed-in user to their org, and the cause is not found: `orgScopedRedirect` returns null for it, so it is not the org redirect.

- **1033 Lenox's five active members are Peter's test accounts** (Peter, Oscar, Camila, Obie, Tester Two; the 56 inactive and 27 archived members are the earlier roster). Roles: Peter is the global Administrator; Oscar and Camila are HOA Admin; Obie is a plain HOA Member (owner, unit 100, has a login) and so is the one non-admin board seat; Tester Two is a tenant (unit 202); it had no login until 2026-11-17, when Peter linked a personal address to it. No property manager exists, so a manager-with-the-grant check needs a Property Manager membership.
- **Entered 2026-11-17 at Peter's go-ahead** (through the same routes the pages use, signed in as Peter): three published board terms from 2026-11-17, Oscar as President, Camila as Treasurer, Obie as Secretary; and 31 holder rows by office, all role owner, from 2026-11-17: Treasurer 14, President 9, Secretary 7, Director 1. The register reads those offices with their people, the Director job reads "Director (vacant)" (no Director term), and **14 jobs are left unassigned** until someone is named: nine building jobs (cleaning, laundry room, storage and bike areas, trash, pest control, roof and drainage, exterior paint and gates, landscaping, pool) and five mechanical and safety jobs (elevator contract, elevator permit, fire inspections, backflow, after-hours emergencies). Not published.
- **The test board is the real record until it is ended.** The three terms show on 1033 Lenox's public Board page. When the real board is seated they are ended (End term, or Change office), not deleted: a term cannot be deleted while a register row for its office overlaps it.

**How the preview behaves (so the next session does not rediscover it)**

- The local dev server uses the **live Directus** (`DIRECTUS_URL` is `admin.hoaconnect.info`): what a session writes in the browser is real data. Test in the demo community (`POST /api/demo/login`, slug `demo`, an admin there), never in 1033 Lenox.
- The environment refused a bulk delete on the live instance until Peter said so in chat; a clean-up script that checks `is_demo` is the pattern.
- The scratchpad was cleared overnight, taking the clean-up script with it.
- The admin's "Member" preview persists across page loads and redirects admin routes to member pages until Exit is pressed.
- `pnpm audit:all` reads tracked files (see the deviation above).

**Follow-up: the register's rows collapse badly** (reported by Peter 2026-11-17, seen on 1033 Lenox's real list). **Fixed 2026-11-17, in the commit after `930a12d`: `AppDataTable` and `AppResourceIndex` take a `stack` (spec-resource-scaffold.md); the register and the owner view use it. Checked at 375, 640, 900 px and desktop on 1033 Lenox's list and on a simulated three-holder row, with sort and row click; the owner view's stacked layout was not seen with rows (1033 Lenox is unpublished).** The note as written:

- **Seen.** At a 900 px window the Who cell is 191 px wide, so "Unassigned since Nov 17, 2026" breaks onto two lines inside its pill, and each row grows from one line to 57 px. All six columns stay until 640 px; below that the table flips to cards in which every row is six label-and-value lines, so 45 jobs run to many screens. A job with an owner, a backup and an oversight holder, or an office with two people, will be worse than the unassigned rows seen so far.
- **Idea (Peter): two nested rows per job.** Line one: the job, with its status at the right. Line two, muted and smaller: who · cadence · basis · last verified as inline meta. The same on a phone, so wide and narrow stop being two layouts. The Who column could stay a real column only on wide screens.
- **Constraints.** `AppDataTable` collapses by column (`hideOnMobile`, cards under 640 px), so a nested row is a `stacked` mode or a row slot on `AppDataTable` and `AppResourceIndex`, not a one-off in the register; every grouped index then gets it. Keep the sticky section headers, sorting on Job and Last verified, and the row click that opens the panel. The owner view (`/responsibilities`) has the same columns and takes the same layout. Shorten the unassigned chip to "Unassigned" with the date in the meta line, and keep the full text as its title.
- **Check at** 375, 640, 768, 900 and 1280 px, with a job that has three holders and an office held by two people. Files: `app/components/App/DataTable.vue`, `app/components/App/ResourceIndex.vue`, `app/components/Responsibilities/HolderChips.vue`, `app/pages/[slug]/admin/responsibilities/index.vue`, `app/pages/[slug]/responsibilities/index.vue`.

#### Session 8 — delegation to members: helpers and committees (2026-11-17)

Spec first (`docs/spec-delegation.md`), its nine decisions confirmed with Peter, then built in the spec's order, one gated commit each (typecheck 0, vitest green, lint 132 against a cap of 148, build green, 19/19 audits).

**Shipped**

- `1dfef57` the spec.
- `3c452a9` the shared model: `HELPER_AREA_KEYS` (documents, feedback, projects, responsibilities), `holdsAt`, `helperAreasFor`, `planGrantChange` (`core/shared/roles/area-grants.ts`). `resolveRoleContext` takes helper areas: `canWork` adds them on an active membership only, and the new `helps` field lists them. Ledger types `helper_grant_changed` and `committee_member_changed` (owner-visible). `communications:send` and `violations:manage` are dropped (checked nowhere); request search is admin-only (its hits open an admin-only page).
- `56f8c53` `scripts/create-area-grants-collection.ts` (`pnpm create:area-grants`). No policy reads or writes the collection.
- `93b412f` the server layer. `getHelperAreas` reads open rows naming the caller's active membership, or an active team they are on; it fails closed and is cached per request. `requireAreaWork` admits admin, a manager grant or a helper area. Helpers pass: documents/publish and governing (documents), promote and project-access (projects), poll-access (feedback), responsibility-access (responsibilities), and `projects:write`/`milestone:approve`. The four expense routes keep `requireAdminOrManagerGrant`. `getManagerGrants` is unchanged, so a helper is never the `property_manager` actor. Transitions see and end helper rows (`end_reason` transition). Ops lists helpers and committees. Admin-only `GET`/`POST /api/org/area-grants`.
- `ee7ecc5` committee membership through admin routes with ledger entries (`POST /api/org/teams/[id]/members`, `PATCH`/`DELETE /api/org/teams/members/[id]`); the HOA Admin's create, update and delete on `hoa_team_members` move to `REMOVED_ADMIN_RULES`. The request page's team-domain controls are removed (`isBoard` is admin or a board seat); the domain is a label.
- `ea37291` "Helps with" switches (`DelegationHelperAreaSwitches`) on a member's sheet and a team page; "Helps" chips on the Members and Teams lists; a `/ui-kit` demo (not seen: the page bounces in the preview).
- `c10b1fb` the dock: a person whose every area is a helper area keeps the member layout, with `projects-mgr` in place of the resident Projects and `responsibilities-mgr` added unless the register is already there.
- From the live check: `ede6551` types and a one-line log when the reader fails; `6bea2b0` the export map decides `hoa_area_grants` (both copies); `a804d6a` the ledger names the admin, not their login (the first live entry reads "huestudios.com@gmail.com"); `982697e` no "committee committee"; `82b8ba9` team rosters show the membership's name before the login's (Peter's call: the admin keeps it, and a member without a login has no user row).

**What each role sees now**

| Who | Sees |
|---|---|
| Admin | "Helps with" switches on a member's sheet and a team page, with recent changes; "Helps" chips on the Members and Teams lists. For an admin, a property manager, an inactive member or an archived committee, the reason instead of switches |
| Helper (any active member, owner or tenant) | The member dock, plus Projects (managing) and Responsibilities (editing) for those areas; Documents and Polls show their manage controls. Never grant switches, committee membership, board terms, money (expenses refuse them), register visibility or modules |
| Committee member | The same, for the areas the committee holds, while on it. A lead keeps their project rights |
| Property manager, plain member, tenant | Unchanged |
| Board seats | Lose request search (dead links before). Team-domain request controls are gone for everyone |

**Seen in the browser, 2026-11-17 (1033 Lenox, identity read each time)**

- **Oscar (HOA Admin):** gave Obie Projects from his member sheet; the row (granted by Oscar), the owner-visible ledger entry and the Members chip read back. Creating a team failed: Oscar's own Directus user has the global role HOA Member with no policies, so every HOA Admin rule misses his token (finding below).
- **Obie (board secretary, helper):** `helps` and `canWork` = projects; member layout with one Projects slot that opens `/admin/projects` with New project; a valid expense refused 403 (the body named a project that does not exist, so nothing could be written); `area-grants` and widening their own grants 403.
- **Peter (global Administrator):** created "Test committee (Session 8)", added Tester Two through the route, gave the committee the register; ledger entries name Peter; ops lists the helper and the committee.
- **Tester Two (tenant, committee member):** `helps` = responsibilities, no hat, no `projects:write`; the register opens with New job, the Florida list and Export PDF, no Visibility menu; dock gains Responsibilities; publishing, committee changes and self-granting 403.
- **Cleanup (Peter):** both grants ended (rows kept, ended by Peter), Tester Two taken off, the test team deleted. Left on purpose: two ended `hoa_area_grants` rows (the committee's now has no team, its name frozen) and six ledger entries. No grant is open in 1033 Lenox.
- **Not seen:** a property manager (none exists), the demo community, `/ui-kit`.

**Deviations**

- Request search became admin-only rather than "admin or a manager with violations": every hit opens `/admin/requests/:id`.
- The prompt called Obie a plain member: they are (HOA Member role), with the Secretary's term from 2026-11-17, so they tested a helper who is also a board seat.
- The register page first stuck on its skeleton for Tester Two with a Vue patch error while the dev server hot-reloaded my edits; a full reload loaded it.

**Findings (not fixed)**

- **Admins' Directus role.** Oscar's (and likely Camila's) global Directus role is HOA Member with no policies, so writes the app makes with their own token (teams, documents, meetings) are refused. The Members page also logs a 500 fetching board terms through the proxy. Worth a check of every HOA Admin's global role.
- Board seats change requests with their own token through the member policy (from the spec).
- Archiving or deleting a team goes through Directus with no ledger entry; its areas stop at once (derived).

**Operator TODOs**

1. ~~Run `pnpm create:area-grants`, then `pnpm generate:types`.~~ **Done 2026-11-17** (by the session, at Peter's go-ahead); the audit read 0 to create or update afterwards.
2. **Apply the narrowing:** `pnpm setup:permissions` removes the HOA Admin create, update and delete on `hoa_team_members` (the audit shows exactly these 3). Until then an admin could still change committee membership through the Directus API without a ledger entry.
3. Push and deploy (asked at the end of the session).
4. **Later sessions:** meetings as an area (routes and a gate first); routes that make inquiries, violations, directory and communications holdable; moving managers' grants into `hoa_area_grants`; a committee's own documents folder.

**Follow-up the same day: whose name others see** (asked by Peter: "we should prioritize the hoa_members name … not all members will have a directus_users entry")

- **The rule** (`core/shared/members/display-name.ts`): wherever one person's name is shown to someone else, the membership's name (`hoa_members`, kept by the admin) wins; the login's (`directus_users`, which the person renames at will on `/account`, limited there to first name, last name, avatar and password) is the fallback for someone with no membership in that community. A person's own account page shows their login's.
- `b20f3f6` **a resident asks to change the name on file** from their profile, as a change request an admin approves on Approvals (like the phone number): only `first_name`/`last_name` travel, trimmed, 100 characters each. Email stays out (account security). Seen on Peter's session: the Name card and its dialog, prefilled from the membership (not submitted).
- `34a83ec` **others see the membership name**: one server helper (`member-names.ts`: `memberNamesFor`, `memberNamePartsFor`, `memberNameFor`, `ledgerActorFor`), `GET /api/org/member-names` (members and admins of that community, names only), and `useMemberNames` (a batched, cached client lookup). Converted: chat (message authors, search, who's here, DM titles, members panel and picker, push and email fanout), comments and the moderation queue, request detail and list, task and project assignees, inquiry notices, mention and comment notifications, and the actor in ledger entries (delegation and manager grants, document publishing, recorded payments and expenses, poll close and reopen, transitions). Seen: the endpoint on 1033 Lenox returns "Tester Two" for the login named "Abby Hoffman". 1033 Lenox has no channels, comments or requests, so those screens were not seen with data.
- **Not converted yet** (from the census, lower traffic or no membership to use): the governing audit trail (`governingActor`, about 15 callers), director minutes and board sessions, the AI assistant's context lines, invitation emails (the inviter's name), admin-only lists (AI spend, exports, the Members page "Invited by"), billing team lists (no membership link), pending join requests and admin user search (no membership yet).
- **Operator TODO 5:** `pnpm add:change-request-name-kind` adds "Name" to the request kind dropdown in Directus (metadata only; Directus does not enforce choices, so requests work without it), then `pnpm generate:types`.
- **No "restricted" member state exists**: today a problem member is archived (everything stops) or their comments are moderated one by one. If wanted, it is its own spec.
- **Restricted members, specced 2026-11-17** (Peter: "I want something in between" archiving and per-comment moderation): `docs/spec-member-restrictions.md`, queued as Session 10. The census behind it found that archived and inactive members can still write through Directus (comments, reactions, reports, poll votes, requests; chat while their channel rows remain), because every member rule is scoped by `ANY_MEMBERSHIP`; the spec fixes that first.

#### Session 10 — restricted members: posting paused, membership kept (2026-11-17)

Built in the spec's order, one gated commit each (typecheck 0, vitest 4168 green, lint 132 against a cap of 148, build green, 19/19 audits), the archived-member gap first and on its own.

**Shipped**

- `01457c9` **the archived-member gap.** Scope fields `active_in` (an active membership) and `posts_in` (the same, unless paused) on `hoa_members`, mirrors for Directus like `admin_of`, computed by `scopeFieldsOf` and kept by the existing sync Flow and nightly reconcile. Chat needed a third mirror (below): `hoa_channel_members.posts_to`, the row's channel when its person posts in the channel's community; the sync keeps it for the people it names and the six routes that create channel rows (create, dm, invite, backfill-board, mute, read) set it at once. `setup:permissions` scopes the HOA Member writes once the fields exist and are right on every row (`postingScopeReadiness`; before that it keeps the old scope): comments (create, edit), reactions and reports through `posts_in`; requests (create, edit their own) and poll votes through `active_in`; chat and mention creates through `posts_to` for every policy. Reads and deleting one's own rows keep any membership. `posts_in` and `posts_to` are not readable by members (they would show a neighbour's pause); `hoa_channel_members` reads now list every field there was. `pnpm add:admin-scope` creates and back-fills the three.
- `3b39e75` the shared model `core/shared/members/restrictions.ts` (in force at t, `planImpose`, `planLift`, `canPost`, the copy); the sync, `add:admin-scope` and the readiness check read the pauses in force (a missing collection is none; any other read failure throws, so nothing reopens posting because it could not read).
- `6016208` `scripts/create-member-restrictions-collection.ts` (`pnpm create:member-restrictions`), run on the live instance at Peter's go-ahead; types regenerated. No policy reads or writes it. Full export only.
- `cd93cfa` the routes (`GET`/`POST /api/org/member-restrictions`, `POST …/[id]/lift`, `GET …/mine`), ledger types `member_restricted` and `member_restriction_lifted` (board-visible, never the internal note), a bell through `notifyUsers`' new `mustReach` (the Membership bell can be switched off, and `_all` mutes every bell; with `mustReach` the row is written anyway while push and email keep their switches). `requireCanPost` / `canPostIn` in the chat fan-out (the author), channel notify, message edit and notify-event; `getHelperAreas` returns nothing while paused.
- `4ad8bac` the UI: "Posting" on a member's sheet (pause, the pause in force with Lift, earlier pauses; the reason for an admin, a manager, an inactive member or a board seat), a "Posting paused" chip on the Members list, the member's banner on every workspace page with Contact the board (their requests page), the chat and comment composers replaced by one line, reactions frozen, Reply, Edit and Report hidden; `usePostingPause` asks `mine` once per community; a `/ui-kit` demo (not seen: the page bounces in the preview).
- From the live check: `1b9fefc` an App Administrator membership (Peter's in 1033 Lenox) cannot be paused either; `c1ec2ba` the pause form opens in place in the sheet (a sheet opened from the sheet lost the first clicks to the form behind it); `67beb41` every confirm shows above a sheet (`ConfirmDialog` was z-50 under the sheet's 70, so "Lift the pause?" opened hidden and the page looked stuck — this affects any confirm asked from a sheet).

**Proved before writing a rule (read-only, Peter accepted the analogue)**: `posts_in` did not exist, so the live analogue was read back: `admin_of` has the same shape (a plain uuid on `hoa_members`, null on most memberships) and already scopes rules #229, #237, #253. Directus 11.13.4 resolves `$CURRENT_USER.hoa_members.<field>` through `UsersService` without the user's accountability (`permissions/utils/fetch-dynamic-variable-data.ts`), one value per membership, nulls included. An item filter is SQL `IN`, which never matches null; a validation's `_in` is Joi `equal(...)`, which would admit a null organization, but `organization` is required and NOT NULL on all five collections (read live), so the database refuses it.

**What each role sees now**

| Who | Sees |
|---|---|
| Admin | "Posting" on a member's sheet: Pause posting (the day posting resumes, default 30 days on, or until lifted; a note the member sees; a note for admins; "Check your governing documents…"), the pause in force with Lift, earlier pauses with who did each. A "Posting paused" chip on the Members list. The reason instead of the control for an admin (HOA Admin or App Administrator), a property manager, a membership that is not active, a current board seat |
| Board seat | The ledger entries ("Tester Two's posting was paused until December 17, 2026."). No controls; the routes answer 403 |
| Paused member | A banner on every page of that community ("Posting is paused in 1033 Lenox until …", the note, what they keep, Contact the board). Composers give way to one line; reactions, Reply, Edit and Report gone. Dues, household, requests, polls, reading, deleting their own comments unchanged. Their chat fan-out, edits and notify-event are refused by the server; once the operator applies the rules, Directus refuses their comments, reactions, reports and chat too |
| Archived or inactive member | Once applied: no comment, reaction, report, vote, request or chat write through Directus (reads unchanged) |
| Everyone else | Nothing; past posts stay |

**Seen in the browser, 2026-11-17 (1033 Lenox, identity read each time)**

- **Peter (App Administrator membership):** the history route's reason for each active member (Peter, Oscar, Camila: admin; Obie: board seat; Tester Two: can be paused; Octavio, inactive: not active). Paused Tester Two (first through the page's session while the pane was hidden, then a second full pass through the inline form): row, board-visible entry without the internal note, the member's bell, the chip and the sheet read back. Lifted both through the sheet's confirm (after the z-index fix): rows kept with `lifted_by` Peter, entries and bells written, chip and section update.
- **Tester Two (paused):** the banner after a reload; `mine` returned only `{ restricted, endsAt, memberNote, until }`; lifting their own pause and reading the history 403; notify-event on a real 1033 Lenox meeting refused ("not authorized for this organization"); Pay dues and Submit a request still there.
- **Obie (board seat):** the `member_restricted` entry in the ledger, board-visible, no internal note; the pause routes 403.
- **Left on purpose:** two ended `hoa_member_restrictions` rows (Tester Two, both lifted by Peter), four ledger entries, four bells on Tester Two. No pause is open anywhere.
- **Not seen:** Oscar and Camila in the browser (their reasons read through Peter's session); the composer line, frozen reactions and hidden Report (1033 Lenox has no channels, documents or comment threads a resident may post in; meetings are read-only to residents); the Directus refusals themselves (the rules are not applied); a property manager (none exists); the demo community; `/ui-kit`.

**Deviations**

- **Chat:** the spec scoped chat by `posts_in` beside the channel-membership check, but a message names a channel, not a community, and a validation on `channel.organization` refuses a plain id. Peter chose a third mirror, `hoa_channel_members.posts_to`; the chat create rule is `channel in $CURRENT_USER.channel_memberships.posts_to`, for the HOA Admin policy too (Directus ANDs the validations a role holds, so it binds admins either way).
- Requests: editing one's own request is scoped by `active_in` as well as creating one (the spec named create).
- Support's "ask the community" is not a route: it is a link to `/{slug}/requests?ask=1`, a request to the board a paused member keeps, so it is not gated. Four server places, not five.
- `POST` takes `endsOn`, the day posting resumes, which the server turns into midnight on the community's clock; `mine` also returns `until` (that date as the member reads it).
- `holder_name` is written when a pause is imposed and refreshed when it is lifted: a pause that ends by its date writes nothing.
- An App Administrator membership is refused like an HOA Admin one.
- A pending membership has no `active_in` either (none exist live: 54 active, 57 inactive, 27 archived).
- Session 8's operator TODO 2 (the three `hoa_team_members` removals) was already applied: the audit read 0/0/0 at the start.

**Findings (not fixed)**

- Signing in as another person in the same tab kept the previous person's client state (Tester Two saw Peter's admin tabs and no banner) until a reload.
- The member sheet's sections (service history, helps with, posting) fetch several times as it opens; the Members page logs hydration mismatches in the people glance.
- A pause's end date reaches Directus on the next sync for that member: the nightly reconcile, or their own first page load after it (`mine` heals the mirror). The server checks and the banner are derived, so they are right at once.
- Directus caches the `$CURRENT_USER` context per field set when its cache is on; with auto-purge off a pause would reach Directus only when that cache expires. The instance's cache settings were not checked.
- `setup:permissions` falls back to the old scope when any membership's `active_in`/`posts_in` or any `posts_to` is wrong, as it does for `admin_of`: a broken Flow would widen member writes again on the next run. It prints why.
- Out of scope, as a question: should archived members still read?

**Permission audit (read-only throughout; nothing applied)**

- Before: 0 create, 0 update, 0 remove.
- After the gap commit (`01457c9`), and unchanged after each later commit: 0 create, **2 update** (the HOA Admin and HOA Member reads of `hoa_channel_members`, now a field list without `posts_to`), 0 remove. With `--preview-admin-scope` (as if the fields were ready): 0 create, **13 update**, 0 remove — the 2 reads, the 4 chat and mention creates (both policies), and 7 HOA Member rules on 5 collections (comments create and edit, reactions, reports, poll votes, requests create and edit). Applying also re-combines **15** shared-write validations afterwards (computed from the live rules; the audit cannot show them before the member rules change): 28 rules written in all.

**Operator TODOs**

1. Deploy the app first: the sync writes the new fields and the channel routes set `posts_to`.
2. `pnpm add:admin-scope`: creates `hoa_members.active_in`, `hoa_members.posts_in`, `hoa_channel_members.posts_to`, and back-fills them (dry run: 54 memberships written, 14 channel rows set, 5 left closed — all five rows point at channels that no longer exist).
3. `pnpm setup:permissions:audit` should then print the 13 updates without the preview flag; `pnpm setup:permissions` applies them (and the 15 re-combinations). Until then archived and inactive members can still write through Directus, and a pause rests on the server checks and the hidden controls.
4. `pnpm generate:types` after step 2.
5. Push (asked at the end of the session).

#### Session 4 — Phase 5b part 1, money approvals (2026-11-17/18)

**Shipped** (each commit gated: typecheck 0, vitest green, lint 132 against a cap of 148, 19/19 audits, build green)

- `3ba94a8` the rule, `core/shared/money/approval-rule.ts`, pure. Committee mode (two of President, Treasurer, Secretary) when two committee members are not excluded; otherwise a majority of all seats, `floor(seats/2)+1`, never fewer than two. Excluded people count as seats and never vote; a person counts once whatever offices they hold; a decision keeps its office. Test: `tests/shared/money-approval-rule.test.ts` (29), every case the spec names.
- `5ceb647` `scripts/add-money-approvals.ts` (`pnpm add:money-approvals`): both new collections, the expense statuses and fields, `payment_requests.waiver`. Applied 2026-11-17 at Peter's go-ahead (41 writes; a second dry run wants nothing); types regenerated. The regeneration also brought Session 10's `active_in`, `posts_in`, `posts_to` into the committed types (they were on the instance, not yet committed).
- `89c36c8` `money:enter` replaces `money:write` (every seat; admins; a manager with the projects grant through `resolveCapabilities`; never a helper). `requireMoneyEnter` and `canEnterMoney`. The routes: `POST /api/org/expenses` (draft or submit), `PATCH`/`DELETE /api/org/expenses/[id]`, `[id]/submit`, `[id]/pay`, `[id]/void`, `GET /api/org/money/approvals` (open, awaiting-me, all), `[id]`, `[id]/decide`. `GET /api/org/expenses` adds `approval_summary`, `void_pending`, `actions` and `viewer.canEnter`. Ledger: `money_decision` (board), `expense_approved` (owners), `expense_voided` (owners once approved or paid, else board); `expense_recorded` adds `approved_by`, `paid_by`, `paid_reference`, `paid_without_approval` and ends "…before it was approved." when flagged. Notices as the spec lists them; approvers and paid-before-approval are `essential`. Export map: `money_approvals` both tiers, decisions full only. `record.post.ts` and `index.patch.ts` deleted. Test: `tests/server/money-approvals.test.ts` (24).
- `fd863c6` the Expenses page: Save Draft, Submit for Approval, Record Paid (a sheet: date and reference), Void or Ask to Void, Delete for a draft. Progress per row and a lasting "Paid before approval" badge. Controls come from the row's `actions`.
- `3f577eb` the Approvals page, `/[slug]/approvals`: `money-approvals` (member layout, after Money) and `money-approvals-admin` (a Money pill) on the same path, both `money:read` plus the Money modules. Approve and Reject only where `canDecide`.
- `b388dfc` the write lock: `pnpm add:money-approvals --lock`, `scripts/lib/money-approval-perms.ts`, `REMOVED_ADMIN_RULES` gains expense delete. Applied 2026-11-18 at Peter's go-ahead: it removed the HOA Admin delete on `payment_expenses` (#289), the only write left (create and update went 2026-11-16). No policy has a rule on the approval collections. Second dry run: nothing; `pnpm setup:permissions:audit`: 0/0/0. Test: `tests/scripts/money-approval-perms.test.ts`.

**What a user sees change**

| Who | Before | Now |
|---|---|---|
| Every board seat | Expenses read-only | Enters, submits, records paid and asks for voids; Approvals in the dock after Money |
| President, Treasurer, Secretary | Nothing to approve | Approve or reject what waits on them, with a note |
| Admin with no seat | Recorded anything paid; status was a form field | Enters and records paid like a seat; approves nothing; sees Approvals as a Money pill |
| Manager with Projects | Entered and recorded paid | The same, through the new routes; no Approvals page (no `money:read`) |
| Whoever records an expense paid before approval | Nothing happened | The row keeps "Paid before approval"; every seat gets an essential notice; the board can still ratify |
| Owners (Ledger) | "X was paid $Y for Z." | Also "…was approved by A (President) and B (Secretary).", and voids of approved or paid expenses |
| A board too small, or everyone excluded | n/a | "Cannot be approved"; it can still be recorded paid, flagged |

**Deviations and decisions**

- **Asked and decided with Peter (2026-11-17):** the spec's "payee" has no field: `vendor` is who is paid. Amount, vendor and **title** reshape an expense, because the approval sentence names the title. Notes, category, receipt, description, project and date change freely; a paid expense changes only notes and receipt.
- **Refined with Peter (2026-11-18, `9dabcf1`):**
  - *Free until the first decision.* Before anyone decides, a change to the amount, vendor or title changes the open round in place, and the editor joins its excluded. After a decision it starts a new round. (First built: every such change started a new round.)
  - *Small boards.* On a board of one or two seats, the majority need drops to the seats who may vote, so one eligible seat can approve. Whoever asked is always excluded, so a seat never approves its own entry. A board of three or more keeps the ordinary majority. (First built: never fewer than two approvals, so a one-seat board could never approve.)
  - *Board changes settle; reads never write.* The five board-term routes resettle the community's open approvals after they write, credited to whoever changed the board, and an approval that reopens from "cannot be approved" tells the people it now waits on. A daily job (`money-approvals-settle`, 00:20 UTC) catches terms that end on their date and memberships that end elsewhere. Until then a read shows the stored state, waiting on nobody. (First built: settled on the next Approvals read, credited to "HOA Connect".)
- `rejected` returns to `submitted` through Submit (a new round), or at once when a reshaping edit is saved. `submitted` with decisions is voided by a void approval, as `approved` and `paid` are; at once only for a draft, a rejection, or an undecided submission, by the enterer or an admin.
- One decision per person is enforced in the database by a unique `unique_key` ("{approval}:{user}"): Directus cannot make a two-column unique index.
- The row summary is `approval_summary`, not `approval`, so rows stay `PaymentExpense` and the Charges page (Session 3's) needed no change.
- `decide` refuses `waive` (409) until Session 5. Receipts stay admin-only links through the asset proxy until Session 5 serves them.
- Existing tests changed: `expense-writes` (new paths, no status field, board seats now enter), `expense-receipts` and `money-reads` (the new gate and the extended read), `area-access` (expense routes ask `requireMoneyEnter`; `money:enter` never comes from a helper area), `permissions` and `ledger-visibility` (the new capability and events), `export-collections` (two new collections), `nav-registry` (the new pill), `shared-write-validations` (expense delete is now removed).
- Three messages were reworded because the detached-promise audit reads "void it" as `void <call>`.
- Seen in passing: `pnpm setup:permissions:audit` printed 0/0/0, so Session 10's permission steps appear applied.

**Not checked:** the browser check was the demo admin only (the list, a draft saved and deleted, the empty Approvals page). No approval was opened on the instance, so the decide flow is covered by the route tests, not seen in the app. A board seat and a manager were not signed in.

**Operator TODOs**

1. Deploy. Until then the live Expenses page deletes through the rule the lock removed, so Delete fails there; everything else on the live page still works through its old routes. The deploy also registers the new daily cron (`/api/money/approvals/settle`, in `vercel.json`); check it on the operator console's job health after its first run.
2. Session 5 (waivers, receipts through the server, the charge cancel lock) needs no schema run. The Charges page's money overview sums every expense, voids and drafts included; its prompt asks it to count only submitted, approved and paid.
3. Push (asked at the end of the session).

#### Session 5 — Phase 5b part 2, waivers, receipts, the charge cancel lock (2026-11-18)

**Shipped** (each commit gated: typecheck 0, vitest green, lint 132 against a cap of 148, 19/19 audits, build green)

- `23565b4` waivers, end to end on the server. `POST /api/org/money/charges/[id]/waive` (`money:enter`) opens a `waive` approval with a reason, sets `payment_requests.waiver` and tells the approvers (essential): "Waiving a $300.00 charge to Bob Diaz for March dues needs your approval." A charge already paid or canceled, or with a waiver open, is 409; another community's charge, or one whose household is another community's, is 404. `decide` accepts `waive` (the 409 is gone). `settleApproval` hands a waiver to `settleWaiver`: approved, the charge becomes `canceled` and `charge_waived` goes to the Ledger (board); rejected, the charge stays as it was; the requester is told either way. `resettleCommunity` settles waivers too. The Approvals routes fill the charge subject (title, amount, amount remaining, status, household) and the page's headline reads "Waive $300.00 owed by Bob Diaz for March dues". New Ledger pieces: `ChargeSubject`, `chargePhrase`, `buildChargeWaivedEntry`; `buildMoneyDecisionEntry` takes a charge ("Pat Park (President) approved waiving a $300.00 charge to Bob Diaz for March dues."). Test: `tests/server/money-waivers.test.ts` (14 then, 16 after commit 3).
- `a61e827` receipts through the server. `GET /api/org/expenses/[id]/receipt` (`money:read`) streams the receipt, untransformed, reached by the expense through the community filter; a draft's receipt only to those who can enter. `POST /api/org/expenses/[id]/receipt` (`money:enter`) attaches one to a saved expense, filed as any receipt; a void expense is 409. The Expenses page links the receipt for every reader through the GET, and an edit attaches a new receipt through the POST. Test: `tests/server/expense-receipt-routes.test.ts` (9).
- `597799a` the Charges page. Cancel is gone from the rows and the panel; "Ask to Waive" (a reason, required) is in their menu for `money:enter` holders on an open charge. A charge with a waiver pending shows "Waiver awaiting approval" instead. `GET /api/org/money/charges` adds `waiver_pending` per row and `viewer.canEnter` (not for `view=glance`). Mark Paid stays an admin's. The money overview, the recent activity, the glance and the Reports tab on that page count only submitted, approved and paid expenses (`isCountedExpense`, shared with the Expenses page). Tests: `tests/composables/useChargesResource.test.ts` (the cancel test became the no-direct-cancel and Ask to waive tests), `money-waivers` (the charges read), `money-reads` (stubs the waiver read).
- `9859725` the charge cancel lock. `pnpm add:money-approvals --lock` also removes every policy's update and delete on `payment_requests`; `REMOVED_ADMIN_RULES` gains both, so `pnpm setup:permissions` never puts them back. Test: `tests/scripts/money-approval-perms.test.ts` (7). Applied 2026-11-18 at Peter's go-ahead, delete included: it removed the HOA Admin update (#184) and delete (#185) on `payment_requests`; create (#182) and the two reads (#183, #211) stay. Second dry run: nothing; `pnpm setup:permissions:audit`: 0/0/0.

**What a user sees change**

| Who | Before | Now |
|---|---|---|
| Admin | Cancel Charge, at once | Ask to Waive, with a reason; the board approves it; nothing changes until then. Mark Paid unchanged |
| Every board seat | Charges read-only | Ask to Waive on an open charge; "Waiver awaiting approval" on one that is waiting; receipts open from the Expenses page |
| President, Treasurer, Secretary (or a majority) | n/a | Waivers on the Approvals page, named by household, amount and title; approve or reject as for spending |
| Whoever asked | n/a | Told of each decision and of the outcome |
| Board (Ledger) | A canceled charge left no entry | "A $300.00 charge to Bob Diaz for March dues was waived, approved by Pat Park (President) and Sam Lee (Secretary): Storm damage." |
| Anyone on the Charges page | Expenses total counted drafts and voids | Only submitted, approved and paid |

**Deviations and decisions**

- **The cancel lock removes update and delete, not a validation.** A validation refusing `status: canceled` on the HOA Admin update would have held for the status, but left delete, which gives up the same income with no record at all. After commit 3 the app writes no charge through Directus: Mark Paid, reminders and waivers are routes on the app's token. So both rules go; create (the New charge form) and read stay. Delete goes beyond the spec's words ("cannot set a charge's status to canceled") for the same reason; Peter chose both (2026-11-18).
- **`charge_waived` names the household in its sentence.** The spec's sentence ("A $300.00 charge for {title} was waived…") does not, but the same row says it names a household and is board-only for that reason, and a board reading the Ledger needs to know whose charge it was. When part was paid, it says what was given up: "The remaining $200.00 of a $300.00 charge…". The payload's `amount` is what was waived; `charge_amount` the whole charge.
- **A waiver whose charge is paid or canceled first closes as `superseded`** (a decide on it is 409 and writes no decision); the Approvals page says "Closed: the charge was settled".
- Two waives of the same charge at the same instant could both open: the check is a read before the write, as the void route's is. The same race could open two voids of one expense, and approving the second wrote a second, false "was voided" entry, owner-visible for a paid expense. **Fixed in `68b3830`** (asked by Peter, 2026-11-18): settling a waiver or a void closes any other open one on the same charge or expense; a void of an expense already void closes with nothing, at decide (409, no decision recorded) and at settle. Stopping the duplicate from opening at all would need a unique key on open approvals, a schema field; not done.
- **A waiver closes when its charge is paid in full** (`68b3830`): Mark Paid and the Stripe webhook call `closeWaiversOfPaidCharge`, which closes it as superseded and tells whoever asked. Before, it stayed "waiting" on the Approvals page until someone tried to decide it. A partial payment leaves it open: it then gives up what is still owed.
- **Correcting a charge is queued** as Session 11 (Phase 5c, spec first): since the lock, a charge entered wrong can only be waived and entered again.
- Existing tests changed: `useChargesResource` (no remove; Ask to waive), `money-reads` (stubs `loadApprovals`), `money-approval-perms` (charges are locked now, not left to Session 5), `ledger-visibility` (`charge_waived` board-only). The shared fixture gains `payment_requests` relations.

**Not checked:** no browser check this session. The waiver flow (ask, decide, cancel), the receipt routes and the Charges controls are covered by the route and composable tests; no waiver was opened on the instance.

**Operator TODOs**

1. Deploy, then push (both Session 4's and this session's commits). Until the deploy, the live Charges page still offers Cancel Charge, which now fails (the lock removed its rule), and has no Ask to Waive.
2. After the deploy, check once as a board seat that isn't an admin: Ask to Waive on a charge, approve it as two other committee members, and see the charge canceled and the Ledger entry.

#### Session 11 — Phase 5c, correcting a charge (2026-11-18)

Spec `docs/spec-charge-corrections.md`, confirmed by Peter 2026-11-18 with the six decisions as recommended: lowering a charge is a partial waiver through the board, with no small-amount limit; a 24-hour window to withdraw a charge entered by hand; the wrong household is a `move` approval; a full waiver takes the charge's unpaid late fees; the owner hears when what they owe, or when it is due, changes; admins make the free corrections and `money:enter` asks for the rest.

**Shipped** (each commit gated: typecheck 0, vitest green, lint 132 against a cap of 148, 19/19 audits, build green)

- `19340c1` the spec, the pure rules (`core/shared/money/charge-corrections.ts`: withdraw, due date, amount up only, the partial cut, move) and the schema script. `pnpm add:charge-corrections`: `money_approvals.kind` gains `move`; `money_approvals.amount` and `.proposed`; `payment_requests.withdrawn_at`, `withdrawn_by`, `withdrawn_reason`. It writes no permission and refuses to run while any policy can update or delete a charge. Applied 2026-11-18 at Peter's go-ahead; second dry run nothing; types regenerated. Tests: `tests/shared/charge-corrections.test.ts` (18), `tests/scripts/charge-corrections-perms.test.ts` (3).
- `5836faf` `PATCH /api/org/money/charges/[id]` (admins): title, description, notes; the amount up only (lowering it is 422); the due date while the charge is not yet due and no late fee is charged, never to a past date. The amount and due date are locked (409) while a waiver or move waits; the words stay free. `charge_corrected` (board). The household is told of a new amount or due date. `core/server/utils/charge-corrections.ts` reads what the rules need. Test: `tests/server/charge-corrections.test.ts`.
- `d3e72f2` `POST …/withdraw` (admins, a reason): a hand-entered charge (no source, or `manual`), within 24 hours, nothing paid or recorded, no reminder, no late fee, nothing waiting; otherwise 409 says why and points to Ask to Waive. Canceled and kept, never deleted. `charge_withdrawn` (board); the household is told.
- `b277733` `POST …/waive` takes an optional amount: a partial waiver, more than zero and less than what remains (422 otherwise). Approved, the amount and what remains drop by the cut, or by what remains if payments since left less (the charge is then paid). A full waiver cancels the charge's unpaid late fees and closes their own waivers. The approvers' notice names the cut or the late fees' total; the household is told the outcome.
- `ff43da6` `POST …/move` (`money:enter`, a household and a reason): a `move` approval with the proposed household and its unit, by the same rule. Approved: member and unit change, unpaid late fees canceled, `charge_moved` (board), both households told. A charge paid on, settled, or whose new household left closes the move as superseded and tells whoever asked why. `decide` accepts `move`.
- `2fdd5cc` the Approvals routes add `waive_amount`, `late_fees` and `move` to a charge subject; the headline is a tested helper (`core/shared/money/approval-headline.ts`): "Waive $50.00 of $300.00 owed by Bob Diaz for March dues", "Move $300.00 for March dues from Bob Diaz to Carol Eve". Test: `tests/shared/approval-headline.test.ts` (5).
- `a26aa01` the Charges page and panel: Edit Charge, Ask to Waive (all or part), Move to Another Household and Withdraw Charge, each shown only where the server would accept it (the read's new `approval_pending`, `late_fees_open`, `withdrawable`, `movable`, `due_date_lock`, and `viewer.canCorrect`). One sheet (`PaymentChargeCorrectionSheet`) for Edit, Waive and Move; Withdraw is a prompt. A withdrawn charge reads "withdrawn". Tests: `useChargesResource` (15), `charge-corrections` (35 in all).

**What a user sees change**

| Who | Before | Now |
|---|---|---|
| Admin | A charge entered wrong could only be waived and entered again | Edit Charge (words, a higher amount, a due date not yet passed); Withdraw Charge within 24 hours of entering it, before anything is paid or reminded |
| Every board seat, admins, a manager with Projects | Ask to Waive, all of it | Ask to Waive all or part; Move to Another Household while nothing is paid |
| President, Treasurer, Secretary (or a majority) | Waivers on the Approvals page | Also partial waivers ("Waive $50.00 of $300.00 …") and moves ("Move $300.00 … from Bob Diaz to Carol Eve"); a full waiver names the late fees it takes |
| Owner | Heard nothing when a charge was waived | Told when what they owe or when it is due changes: amount, due date, withdrawn, waived, moved to or away from them |
| Board (Ledger) | `charge_waived` only | Also `charge_corrected`, `charge_withdrawn`, `charge_moved`; `charge_waived` names a partial cut and late fees |

**Deviations and decisions**

- **`REMOVED_ADMIN_RULES` lives in `scripts/lib/admin-scope-perms.ts`**, not `money-approval-perms.ts` as the prompt said; it still removes update and delete on charges. The new check (`chargeWriteRules`) sits in `money-approval-perms.ts` beside `CHARGE_WRITES`.
- **A hand-entered charge has no `source`** (the New charge form sets none), so the withdraw window takes an empty `source` or `manual`.
- **A moved charge's unit** is the new household's primary unit, or its only current one; none when it has several and none is primary. The spec said "the new member's".
- **409 or 422.** A charge's state (settled, something waiting, paid on, outside the window) is 409; a value the rules refuse (a lower amount, a past date, a cut out of range, the wrong household) is 422.
- **A waiver now also waits on a move**, and vice versa: one approval per charge. The waive route's 409 says "A waiver or move of this charge is awaiting approval." A charge paid in full closes a waiting move as it closes a waiver.
- **Ask to Waive no longer prompts**: the sheet collects the reason and, for part, the amount. `askWaive(row, { reason, amount })`.
- **A payment counts** (for withdraw and move) when `amount_paid` is above zero or a `succeeded` or `refunded` transaction names the charge.
- Owner notices are not essential (a household may mute payments); approvers' notices stay essential.
- Existing tests changed: `useChargesResource` (Ask to waive takes its reason from the sheet; three fixture rows added, so two counts grew), `money-reads` (stubs the read's new helpers), `money-waivers` (the viewer adds `canCorrect`; a charge subject adds `waive_amount`, `late_fees`, `move`). `ledger-visibility` gains the three new events, board-only.

**Checked in the browser** as the demo admin (Harborview Lofts): the row menu (Edit, Ask to Waive, Move; no Withdraw on charges older than 24 hours), the Edit sheet (a lower amount turns the hint red and disables Save; raising Sofia Marchetti's "Monthly dues — 2026-12" from $250.00 to $260.00 saved, refreshed and toasted), the Waive sheet (All or Part, the amount, the reason; not sent), the Move sheet (the community's other active households; not sent). **Not checked:** Withdraw (no fresh charge), a waiver or move decided in the app, a board seat or manager signed in, a phone width.

**Fixed after the build** (asked by Peter, 2026-11-18): the Charges table showed a due date of "2026-12-01" as Nov 30, 2026 west of UTC, because the page read the day as UTC midnight in local time; the Edit sheet showed Dec 1. Present before this session. `core/shared/calendar-day.ts` (`formatCalendarDay`) shows a date-only value as written for every viewer and keeps timestamps local; the Charges page, the charge panel and both owner Payments pages use it. Test: `tests/shared/calendar-day.test.ts` (five time zones). Not seen in the browser: port 3000 was another project's dev server, and the pane would not open 3001.

**Operator TODOs**

1. Deploy, then push (Sessions 4, 5 and 11). The schema is already applied, so the deploy needs no script. Until it, the live Charges page has none of the corrections.
2. After the deploy, check once as a board seat that isn't an admin: Ask to Waive part of a charge, and Move one, then approve each as two other committee members; see the amount drop, the charge move, and the Ledger entries.
3. The demo charge raised to $260.00 during the check stays so (test data); lowering it would be a waiver.

#### Session 9 — Phase 2c, the responsibilities map (2026-11-18)

Local, on `main`, not pushed. Three commits, each through the full gate (typecheck 0, vitest green, build green, `audit:all` 19 of 19 at or under baseline, lint 132 of 148 warnings), then this docs commit. No baseline changed. No schema, no route, no permission change.

**Shipped**

- `10b1b71` **The pure core**, `core/shared/responsibilities/map.ts`, with `tests/shared/responsibilities-map.test.ts`: `holdersOnDay`, `mapModel`, `publishedMapRows`, `lit`, `changeDays`, `changedJobs`, `changeAnnouncement`. The differential test builds the register for one day and resolves twelve other days from it, each equal to the route's own `holders` for that day: a Treasurer who resigns mid-year, a vacant month, the next Treasurer, two directors, a draft term that never counts, a hand-over by name, a vendor row that ends.
- `5b2b5d4` **Map mode on `/admin/responsibilities`**: `ResponsibilitiesMap` and `ResponsibilitiesMapSlider`. One `AppPageHeader` for both modes; Grid \| Map under it. The slider is a native range over the change days and today; dragging sets `asOf` with no request (checked: one read for the page, none while stepping). Picking a job offers Open Job, which opens the panel for the slider's day. Also two fixes found in the browser: a job whose recorded history began before it was entered stays on the map from its first holder (it vanished in the gap after one ended), and `useFlipList` finishes a running flip before the next capture (a fast drag stacked them).
- `623685a` **The owner map** on `/{slug}/responsibilities`: the same Grid \| Map for today, no slider, nothing opens, built from `GET published` through `publishedMapRows`. Also: offices rank President first on the owners' map too (the route names them by label, not key).

**What each role now sees**

| Who | Before | Now |
|---|---|---|
| Admin, manager with the grant | The register as a grid | Grid \| Map. The map: a holder rail (vacant offices first, in the attention colour), jobs in an Unassigned group and five sections, an As of slider and date, Open Job on a picked card. Editing stays in the panel |
| Board seat (not admin) | The register, read-only | The same Grid \| Map; Open Job opens the read-only panel. Not seen in the browser this session |
| Owner, tenant | "Who handles what" as a list | Grid \| Map for today: who holds what, vacant offices, and the unassigned jobs only when the board shows them. No slider, no history, nothing to open. Not seen as a real owner (the admin's view of the owner page was checked) |

**Deviations and decisions**

- **"Outside the loaded range."** The register's route returns every holder row and every office term inside it, so every day resolves locally. The brief's "a typed date outside the loaded range refetches once" is read as: outside the slider's days (the first change to the last change or today). That read is harmless and keeps the grid and the panel on the same day.
- **The grid and the panel are synced lazily.** Dragging changes `asOf` without a read; the grid's rows and the panel still carry the route's `holders` for `meta.asOf`. Switching to Grid, or Open Job, reads once for the slider's day first.
- **One header for both modes.** The grid's count moved from the header into its toolbar (`AppResourceIndex` without `title`), and New job is a header button the page draws.
- **A member's job count includes jobs held through an office they hold that day**, as the grid's holder filter already matched. The owners' map cannot do this (the route sends names, not member ids), so there a person's count is their named jobs only.
- **A job not yet on the books is off the map** on days before it was entered and before its first holder. Otherwise every early day read the whole Florida list as "Unassigned since" a later date.
- **"Changed holder" includes an election** (the office stays, the person behind it changes), not a job that was entered between the two days.
- **The animation.** Changed jobs pulse, a new chip slides in (`TransitionGroup`), and a job that gains or loses its last holder travels between its section and Unassigned (`useFlipList`). Chips do not fly from one rail entry to another: a cross-pane flight was judged not worth its cost on a phone, where the rail is a sideways strip.
- **No second detail sheet**, as decided: a picked job offers Open Job. **No `/ui-kit` demo**: the map is the register's own component, not a kit primitive.
- **The two directors' order** in `holdersOnDay` is by their clipped start, where the route orders by the term's own start; and the view carries no `sort`. Both are said in the function's comment.

**Checked in the browser, and not**

- **Done**, signed in as the demo admin (Harborview Lofts, `is_demo`), after seeding it through the app's own routes: the Florida list, five board terms (a Treasurer who resigned 2026-06-30, a new Treasurer from 2026-08-01), 39 holder rows with a hand-over and an ended vendor row, and both switches on. At 375 px (light and dark): the sides stack, the rail sticks and scrolls sideways, no sideways page scroll, every target at least 44 px. At 768 px dark and 1280 px light: rail beside jobs. Picking a holder and a job; the slider by keyboard (End, Left); "As of 1 July 2026. 10 jobs changed holder." in the live region and "Treasurer (vacant): 10 jobs." over the jobs; no request while stepping; Open Job reads once for 1 July and the panel says "Treasurer (vacant)"; Grid then shows "As of Jul 1, 2026" with no further read. The FLIP: 31 cards in flight as the elevator job moved into Unassigned, and the sentence "Elevator service contract and monthly visits: Lift Co to nobody." The owner page's map: no slider, no Open Job, offices by rank, 14 unassigned jobs, none of basis, notes, ended holders or member names in the page.
- **Reduced motion** was checked by making `matchMedia` report it (no card animated, the change still announced) and by reading the compiled `@media (prefers-reduced-motion)` rules; the pane cannot emulate the OS setting.
- **The motion itself was not watched**: the browser pane was hidden, so animation frames were paused (one frame in 500 ms); the FLIP was read from the DOM mid-flight.
- **Not reachable:** a board seat, a manager with the grant, a plain owner or tenant (the owner page was seen through the admin's session). The route and nav tests cover those roles as before.
- **The demo community holds this session's rows**: 45 jobs, 39 holder rows, 5 board terms, 49 activity rows, both switches on. `scripts/clean-demo-responsibilities.ts` (refuses a community whose `is_demo` is not true; report only without `--apply`) reports exactly those counts. Not deleted yet: waiting for Peter's go-ahead.

**Operator TODOs**

1. **Clear the demo rows** when you say so: `pnpm exec dotenv -- tsx scripts/clean-demo-responsibilities.ts demo --apply`.
2. **Push, then deploy.** `origin/main` has everything up to `3c5092b`; only this session's commits are ahead.
3. **Look at the map on a real phone** once deployed: the motion was read from the DOM, not watched, and 1033 Lenox's real list (31 held, 14 unassigned) is the better test.
4. ~~No session is queued after this one.~~ **Session 12 queued 2026-11-18**: Phase 4 part 1, glass and appearance (`docs/prompts/role-first-s12-glass-appearance.md`, Opus 5.5).

#### Session 12 — Phase 4 part 1, glass and appearance (2026-11-18)

Local, on `main`, not pushed. Three commits, each through the full gate (typecheck 0, vitest 4,417 green, build green, `audit:all` 19 of 19 at or under baseline, lint 132 of 148 warnings), then this docs commit. No schema, no route, no permission change.

**The five answers** (asked in one message after showing both attention treatments on the map's Unassigned cards in the browser; Peter: as recommended). Recorded in §2.4.

1. Swatches: the community's colour, then Blue, Teal, Violet, Rose, Slate. No red, amber or green.
2. Tint is on for a new person, in the community's colour.
3. Dock position is gone: bottom only.
4. `vivid` went with the other palettes.
5. Attention is a faint warning tint across the card (a rim fought the map's picked-card ring). On Payments only an overdue charge takes it.

**Shipped**

- `bd1d44b` **The rules.** `accent.ts`: `TINT_SWATCHES`, `resolveTint` (a stored choice, a mode and the community's colour in; glass tier, ink, ink hover and the tinted ground out), a `neutral` option so Slate stays slate, `inkHover`, `tintedGround`. `app-prefs.ts`: `{ tint: { on, swatch } }`; the old `dock` keys are dropped on read and left out of the next write, and a default is never stored. `theme-app.css`: `--tint-*-ink`, `-ink-hover`, `-glass` for the five fixed swatches and `--attention-bg`; `audit:contrast-pairs` grades them all in light and dark (152 pairs). `tests/shared/tint-swatches.test.ts` holds the tokens equal to what `accent.ts` computes; `tests/server/app-prefs.test.ts` is now a table over the tint shape.
- `410b0b1` **The material.** `--glass-tint` (1 on, 0 off via `html[data-tint='off']`) scales every tint stop of `glass-surface`, `--strong`, toasts and the top bar; Tint on is a little more opaque. `ios-card` left the glass token list and is the solid content card (opaque, a neutral ring and lift, no accent hue). `.glass-field` lost its blur. Reduce Transparency turns every glass surface solid (the tinted ground in `--glass-solid`, or the card; `.dark .glass-surface` is covered now, which it was not before); Increase Contrast gives glass an outline. `.card-attention` replaced the strips on the map's Unassigned cards and the Payments cards. One left edge: `--surface-inset` and the content-column rules are gone, `AppPageHeader` and `AppHeaderOutlet` start on the cards' edge, and the dead `type-flush` / `content-column` classes are removed.
- `229edc2` **The settings.** Appearance (Light, Dark, Auto) and Tint (On, Off, six swatches when on) in the account menu, everywhere, and on the Account page. `useAppearance` owns the tint and writes the accent, ink, hover, `data-tint` and `--glass-solid`; the prepaint script sets `data-tint` for the first frame; the choice syncs through `/api/user/app-prefs`. Dock palettes, dock position, the label switch and the glass chrome switch are gone with their code (`useAppNav`, `Dock.vue`, `AppLibrary.vue`, `useDockApps`, the auth layout); `ThemeSelector.vue` had no other users and is deleted.

**What each role now sees** (everyone has the same panel: appearance is personal)

| Who | Before | Now |
|---|---|---|
| Everyone in the workspace | Light/Dark toggle; on a community page, a dock panel with four palettes, two switches and a position picker | Appearance: Light, Dark, Auto. Tint: On or Off, and six colours when on. Shown with or without a community |
| Admins and anyone with a dock | A rainbow dock (one hue per app), optional labels, optional top dock | A bottom dock in their tint with labels on; the open app's label in the ink |
| Everyone, on any page | Headings indented 1.25rem past the cards; glass-tinted content cards | Titles, descriptions, toolbars and cards on one left edge; content cards solid |
| Owners on Payments, admins on the register's map | Coloured strips down the left of a card | A faint warning tint across an overdue charge or an Unassigned job |
| A community with a brand colour set | The workspace in HOA Connect cyan | The workspace in its own colour by default (swatch one); no live community has one set today |

**Deviations and decisions**

- **The community's colour was not connected.** `getAdminAccent()` was always called with nothing; the first swatch now reads `block_settings.colors[0].primary` (the PWA theme colour), falling back to cyan.
- **Fields are not glass already**, as §2.4 said, except `.glass-field`'s blur, which is gone; its name and rim stay.
- **Dark muted text fails on any warm ground** (4.63:1 on the card itself), so `.card-attention` steps muted text up to tertiary inside the card, and the audit grades tertiary on `--attention-bg`.
- **The ink hover now moves with the ink** (`--theme-button-hover-bg`, `--theme-accent-hover`, `--theme-link-hover`), or a Rose button would hover cyan. Cyan's own hover moved by one step (`#00668a` → computed `#00678a` in light, `#6fe0fa` → `#71d7f9` in dark); the resting CSS values are unchanged.
- **The public landing's dock** read the dock palette and the glass switch. It now uses the fixed "fresh" ramp (every visitor's default) and glass chips; a visitor who had picked another palette on their device sees "fresh".
- **Per-page `.accent-*` classes** (projects, payments, units, communications) still set the glass hue on their pages and override a person's tint there. They are content-level and left to Session 13.
- **`page-h1` reads 40 against a baseline of 41**, as it did before this session; not this session's to lower.

**Checked in the browser, and not**

- **Done**, as the demo admin (Harborview Lofts): the register (grid, map, a job's slide-over), Members and Finances at 375, 768 and 1280 px, light and dark; title, description, toolbar, count and first card at one `left` (119 px at 1280, 15 px at 375, 23 px at 768), no sideways scroll. The menu's panel: Violet and Teal repaint the dock, rail, slider, top bar and primary button; Tint off gives clear glass, neutral dock icons and the community's ink, and keeps the swatch; the account stores only non-defaults (`{ swatch: "violet" }`, then `{ on: false, swatch: "violet" }`); with this device's cache cleared, a reload brings the account copy back. The App Library at 375 takes the tint (read from the DOM).
- **Reduce Transparency and Increase Contrast** were read from the compiled `@media` rules in the built CSS; the pane cannot emulate them.
- **Not seen:** an overdue charge on Payments (the demo admin owes nothing; the class is the map's); `/ui-kit` (bounces a signed-in user; its Tint preview and materials updated anyway); a real board seat, manager, owner or tenant. Motion was not watched: the pane was hidden, so screenshots caught entries mid-animation and opacity was read from the DOM.
- **The demo admin's prefs were put back**: Auto, Tint on, community swatch (stored `{}`). Its row's old `dock` keys were dropped by the first write, as designed.

**Operator TODOs**

1. **Push, then deploy.** `origin/main` has everything up to `5ababa3`; only this session's three commits and this docs commit are ahead.
2. **Look at it with Reduce Transparency and Increase Contrast on** (macOS Accessibility → Display) once deployed: checked from the CSS only.
3. **Session 13 is queued**: the glass sweep (`docs/prompts/role-first-s13-glass-sweep.md`, Sonnet 5.5).

#### Session 13 — Phase 4 part 2, the glass sweep (2026-11-18)

Local, on `main`, not pushed. Two commits, each through the full gate (typecheck 0, vitest 4,417 green, build green, `audit:all` 19 of 19 at or under baseline, lint 132 of 148 warnings), then this docs commit. No schema, no route, no permission change, no new class or token.

**Shipped**

- `7d4a9e7` **Glass off content; accents gone.** Solid `ios-card`: the dashboard's "What needs you" band (its comment no longer says it adopts `glass-refract`), the profile's Email section (its siblings are `ios-card`), the install notice (no accent), the embedded discussion on a request and the embedded channel, the file browser, the Payments hero with the amount due, the kit's and ChannelThread's "Posting paused" (`ios-card card-attention`), and the three state cards on `signup` (loading, not found) and `unsubscribe`. Not boxes any more: the Board Room header, the minutes header, My Payments, Audience and Channels (the Channels page keeps its heading and New channel button). The credit packs in the buy dialog are hairline rows (`border-b t-border`), no box. `AskTheHoa` lost `glass-refract`. `Widget/Glass.vue` is deleted (nothing else used it; `unresolved-components` still 0). The 10 per-page accents in Census A2 are removed. `audit:overlay-boxes` baseline 27 to 26 (the pack rows), in the script and in the round 3 table.
- `ce5e520` **One left edge.** Census B items 1, 2, 3, 4, 6, 7, 8 as written. The governing review's toolbar row takes `gap-2` instead of `ml-2` on the link.

**What each role now sees**

| Who | Before | Now |
|---|---|---|
| Everyone | Glass on the dashboard band, the profile's Email section, embedded discussions and channels, the composer and the file browser; each of those over the page's backdrop | Solid cards on the page's ground, the person's tint on the floating layer only |
| Owners on Payments, admins on projects, units and communications | The page forced its own accent (emerald, violet, cyan) over the person's tint | The person's tint, as everywhere |
| Admins and board | The Board Room and minutes headers in glass boxes, 1024 and 768 px wide and centred | Header with no box, on the same left edge and width as every other page; at 375 px the description no longer collapses beside Convene the board |
| A paused member | A glass line where the composer was | A solid card with the warning tint |

**Judgements and deviations**

- **The composer is a solid card** (census A9): it sits below the message list in a flex column, in flow, not over scrolling messages. Inside the embedded channel it is a card in a card (the 1rem radius and the 12 px gap share a centre, as the card rule allows).
- **Left as written** (census B5): the archived-channels line in the sidebar keeps `px-3`, because the rows above it (buttons with a hover ground) carry `px-3` too; the line matches them.
- **`ProjectTimeline.vue` has no users** (nothing in `app/` or `tests/` imports it). Its `px-2` is gone; it is not deleted. **Peter: delete it?**
- **Two page roots had their own container**: the Board Room (`max-w-5xl mx-auto`) and the minutes page (`max-w-3xl`) put their left edge 60 px and 100 px in from every other page at 1280 px. Both use `PageContainer` now (the minutes page keeps its reading column through `[&>*]:max-w-3xl`). The Board Room header's text block takes `min-w-[10rem]` under `sm` so the Convene button wraps below it.
- **`signup` and `unsubscribe` status cards** are `ios-card` (Peter's rules, no new one): they are status cards, not forms, and they no longer float anything.
- **`.accent-*` presets**: no workspace page sets one now. The only writer left is `AppStatCard`'s `accent` prop, used by `/ops`. The presets stay in `earnest-ui.css`.

**Checked in the browser, and not**

- **Done**, as the demo admin (Harborview Lofts), measured with `getBoundingClientRect().left`: the dashboard, Profile, Payments, Audience, Channels (and a channel's composer), Projects, Admin projects, Rules, Files and the Board Room at 1280 px (title, description, toolbar and first card at 118.5 px; the Board Room's icon at 118.5 px); the dashboard, Payments, Channels, Audience, Projects and the Board Room at 375 px (15 px, `scrollWidth` 375); the Board Room and dashboard in dark. Every converted card read `backdrop-filter: none`.
- **Not seen:** the minutes page, the install notice, an embedded discussion on a request, an embedded channel, a paused member's notice, the credit packs dialog, the signup and unsubscribe cards, the governing review toolbar, Admin units, a project's detail page, `/ui-kit` (bounces a signed-in user; its specimen was updated), and Tint off or a swatch on the converted pages. The demo admin's app prefs were not touched.

**What remains** (grep for `glass-surface|glass-widget|glass-edge|glass-refract|WidgetGlass`, public landing and `ui/` excluded)

| Where | Why it stays |
|---|---|
| `App/BottomSheet`, `AppLibrary` (two), `Dock`, `UpdatePrompt`, `ChannelsPanel` | The floating layer: a sheet, the library, the dock, a prompt, a slide-over |
| `Auth/LoginForm`, `RegisterForm`, `PasswordResetForm`, `PasswordResetRequestForm` | Forms that float over the auth backdrop |
| `Responsibilities/Map` rail, `MapSlider` | Controls floating over the map |
| `StorageManagerPage:777` | The floating bulk bar |
| `ChannelThread:663` | The search popover |
| `ui-kit` (334-339, 590) | The material specimens and the create-verbs menu |
| `ChannelEditor:183` and `Home/Stacks:21` | A comment each, no class |
| `ui/` (tooltip, alert-dialog, dropdown, combobox, dialog, popover, select, sheet) | Floating, vendored |
| `ui/card/Card.vue` | **Vendored and still `glass-edge glass-refract`** (a rim, no blur: no `backdrop-filter` on any card read). Left for a decision: the rim is the old content-card look beside `ios-card`'s neutral ring |

**Left for a later session** (page roots with their own width, found while grepping): `CommunityLedgerPage` (`max-w-4xl`), `account.vue` (`max-w-4xl`), `settings/subscription.vue` (`max-w-3xl px-6`) and `payments/index.vue` (`container max-w-6xl py-8 px-4`, the owner's own payments page) each centre a narrower column than `PageContainer`, so their edge differs at desktop. Pages not touched here may also keep their own glass-era spacing.

**Operator TODOs**

1. **Push, then deploy.** Everything from `88823763` on is local: Session 12's docs commit, these two commits and this one.
2. **Decide:** delete `ProjectTimeline.vue`? Give `ui/card/Card.vue` the `ios-card` ground?
3. **Look at it** on a real phone with Reduce Transparency on, once deployed.

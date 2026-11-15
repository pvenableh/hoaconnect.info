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

Appearance settings go from six to two (decided 2026-11-14):

| Setting | Options | What it does |
|---|---|---|
| **Appearance** | Light · Dark · Auto | As today |
| **Tint** | On · Off | Off: clear, neutral glass that takes its colour from what is behind it. On: the glass carries the community's accent colour and is slightly more opaque, as iOS's tinted glass is — more colour and more contrast in one switch |

Removed: dock palettes (Fresh, Aurora, Neutral — the tint replaces them), the glass chrome toggle (the OS reduced-transparency setting decides), the dock label toggle (labels on), and dock position from the appearance panel.

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
| 4 | **Glass layer and appearance** — material rules, clear and tinted glass in light and dark, accent wiring, remove the old knobs, reduced-transparency | 1–2 | Opus for the material, Sonnet for the sweep | — |
| 5 | **Invoices** — issued notice, single reminder path, manual send, timeline, aging | 2 | Opus | 2 |
| 5b | **Money approvals** — decisions 16 and 17: the approval rule, `money_approvals`, routes as the only write path, Ledger entries, waivers, the Approvals page | 2 | Opus | 1 |
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
| 4 | 5b — Money approvals, part 1: rule, schema, routes, Ledger, notifications, Expenses and Approvals pages, expense write lock | [ ] | Spec `docs/spec-money-approvals.md` (confirmed 2026-11-14). Not alongside Session 3 in one checkout; leaves the Charges page alone. Prompt: `docs/prompts/role-first-s4-money-approvals.md` (Opus 5.5) |
| 5 | 5b — Money approvals, part 2: waivers, "Ask to waive" on Charges, receipts through the server, charge cancel lock | [ ] | Prompt written by Session 4 |
| 6 | 2b — Responsibilities register, part 1: spec, shared code, area, schema script, routes (brief commits 1–5) | [x] | Spec `docs/spec-responsibilities.md`. All five landed, plus the service-history route. Schema script and permissions run by the operator 2026-11-15; types regenerated. The permissions run widened three older reads and edits, and channel access did not follow membership: both fixed and applied 2026-11-15 (Session log TODO 2b, 2c). Brief: `docs/prompts/responsibilities-register.md`. Prompt: `docs/prompts/role-first-s6-responsibilities.md` (Opus 5.5) |
| 7 | 2b — Responsibilities register, part 2: Board tab, admin register, owner view, service history (brief commits 6–9) | [ ] | Due before the 1033 Lenox board is seated 2026-12-09. The schema is live. Prompt: `docs/prompts/role-first-s7-responsibilities-pages.md` (Sonnet 5.5) |

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
5. **HOA Admin policy scope (security, review).** The dry run shows the HOA Admin policy's money reads filtered by `organization in $CURRENT_USER.hoa_members.organization`, meaning any community the user belongs to in any role. An admin of one community who is a plain member of another can therefore read the second one's charges through the API. That is likely true of every admin-level permission. Narrowing it means filtering on memberships with the HOA Admin role: one change across the admin policy, not just money.

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
2c. Found in passing and fixed in `29f96a0` (not yet applied): channel access did not follow membership. Any member could read every channel, private channel and direct message in their community, delete anyone's message, and create their own `hoa_channel_members` row in any channel. Now, matching the server's search rule (`channel-scope.ts`): members read the channels, memberships and messages of channels they are enrolled in; admins read messages of their channels plus every non-private channel of their orgs; delete is the author's only (moderators hide and remove through `/api/hoa/channels/moderate`); nobody writes `hoa_channel_members` on their own token (invites, read markers, mute and presence are server routes). Checked against live data first: every admin and board member is enrolled in every non-private channel, so nobody loses access they should have. Applied in 2b. Still open: the HOA Admin policy reads every channel's name in any community the admin belongs to (Session 2 TODO 5).
3. **Publishing for 1033 Lenox**, after 1 and 2 and before the board is seated on 2026-12-09: an admin applies the Florida condominium list, assigns the holders, and turns on "Published to owners" (Session 7 builds the switch; until then it is `PATCH /api/org/responsibilities/visibility`). Leave "Show unassigned jobs to owners" off unless the board decides otherwise.
4. After Session 7 moves the Board tab onto the term routes, take update and delete on `hoa_board_members` away from the HOA Admin policy, so history cannot be overwritten through the API. Session 7 writes the change; the operator applies it.
5. Known gap, not fixed: an admin can still flip the two publishing switches on `hoa_organizations` through Directus, without the activity row. The app writes them only through the route. Closing it needs an explicit field list on the HOA Admin policy's update of `hoa_organizations`.

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

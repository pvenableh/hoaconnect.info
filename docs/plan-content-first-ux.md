# Plan — content-first navigation, and visuals that say something

**Status:** in progress · started 2026-08-23 · branch `feat/content-first-ux`
**Supersedes the open items in** `~/.claude/plans/hoaconnect-next-session-prompt.md`
(the UX refresh's nine phases, PR #305, and the 1033 landing work are all
merged; `origin/main` is at `6cc82d6`).

## The two complaints this answers

Peter, 2026-08-23:

1. **"On some of the app pages it lands to just cards that navigate to the
   inner app pages — I don't like this because it is unnecessary clicking.
   Make the app land on meaningful content for that app, or the first of the
   inner content."**
2. **"Improve the overall UX to be more informative and visually appealing —
   can we use charts and Gantt charts or some type of modern visuals?"**

## Why the card hubs exist, and why they can go

The dock was consolidated 12 slots → 6 section hubs (People · Comms · Records ·
Money · Requests · Settings). Each consolidated slot needed *somewhere* to land,
so `AdminSectionHub` was written: a glass hero plus grouped cards that drill in.

That was the right call **before** `AppSubNav` existed. It doesn't hold now:
`app/layouts/auth.vue:98` renders `AppSubNav` on every workspace page, and that
bar already lists the active section's children as pills (Members · Units ·
Board · Teams · Vendors). Both read the same `useSectionNav` source, so **the
hub page and the sub-nav bar show the identical link set**. One of them is a
full screen the user must click through; the other is always on screen anyway.

So the hub card grid is pure toll. Removing it costs no discoverability.

### Which surfaces are affected

| Dock slot | Route today | Renders | Verdict |
|---|---|---|---|
| People | `/admin/people` | `PeopleHubPage` — cards only | **replace** → Members |
| Records | `/admin/reporting` | `ReportingHubPage` — cards only | **replace** → Meetings |
| Requests | `/admin/more` | `MoreHubPage` — cards only | **replace** → Requests |
| Comms | `/admin/communications` | `EmailPage` — real content | fine |
| Money | `/admin/payments` | payments page — real content | fine |
| Settings | `/admin/settings` | `SettingsHubPage` — 12 grouped cards | **keep, but make it informative** |
| PM portal | `/manage` | card grid of granted capabilities | **replace** → first granted area |

**Settings is the deliberate exception.** A settings index *is* a map, and its
hub lists twelve destinations against the sub-nav's five curated ones — landing
straight on "Organization → General" would hide the other seven. Instead of
deleting it, the plan gives it something to say: a configuration-health strip
above the cards (plan and renewal, modules on, custom-domain status, Stripe
payouts connected, last data export). Cards stay; the screen stops being *only*
cards. Flagged here because it's the one place the plan declines the blunt fix.

## Phase A — no dock slot lands on a menu

1. **`resolveSectionHome(key)` in `useSectionNav`.** Returns the section's real
   landing route: an explicit `home` override on the section if one is declared,
   otherwise the first module-enabled child. Module-aware by construction, so an
   org with Directory off lands on Board rather than a dead Members link.
2. **The dock and sidebar route through it.** `useAppNav`'s hub `path` resolves
   via `resolveSectionHome`, so a click goes straight to content — no redirect
   flash. `match` is untouched, so the active-slot highlight still covers every
   route in the section.
3. **The old hub routes become redirects,** not deletions: `/admin/people`,
   `/admin/reporting`, `/admin/more` `navigateTo(..., { replace: true })` onto
   the resolved home. Typed URLs, bookmarks, `org-redirect.global`, and the
   custom-domain `orgScopedRedirect` map all keep working, and `replace: true`
   keeps the back button from bouncing.
   *Reachability is enforced by a test — the same walk-`app/pages` test that
   guards the allowlist regression.*
4. **`/manage`** resolves to the first granted capability the same way. The
   "no permissions yet" state stays exactly as it is.
5. **Delete** `PeopleHubPage`, `ReportingHubPage`, `MoreHubPage`.
   `Admin/SectionHub.vue` survives — Settings still renders it.

**Net effect:** four screens' worth of clicking removed; nothing becomes
unreachable; the sub-nav does the job it was already doing.

## Phase B — the landing screens earn the visit

Landing on the first child is the floor, not the ceiling. Each new landing gets
an at-a-glance band above its existing content — small, factual, and drawn from
data the page already loads where possible.

- **People → Members.** Occupancy donut off `hoa_units.occupancy`
  (owner / tenant / vacant — the field the 1033 migration added), plus counts:
  members, units, board seats filled.
- **Records → Meetings.** A twelve-month meeting strip (held · scheduled ·
  minutes published), so the year is legible without opening anything.
- **Requests → Requests.** Open by type as a stacked bar, and an ageing
  breakdown (<7d · 7–30d · 30d+) — the queue's health in one row.
- **Settings.** The configuration-health strip described above.

## Phase C — a chart kit, then charts that answer a question

The three charts that exist (`dashboard/EmailActivityChart`,
`MembershipDonutChart`, `ActivityTimelineChart`) are off-system: raw `<Card>`
and `text-muted-foreground` instead of `ios-card` and the `t-*` tokens. They
predate the UX refresh. So Phase C starts by building the kit, then moves them
onto it.

1. **`App/Chart/*` kit**, themed and `ClientOnly` by construction (unovis leaves
   a duplicate empty `<svg>` under SSR — see `unovis-charts-client-only`):
   `ChartCard` (glass frame, title, hint, empty state), `Trend` (line/area),
   `Bars` (grouped/stacked), `Donut`, `Sparkline`, and `Timeline` — a
   Gantt-style row renderer generalised out of `Projects/ProjectGantt.vue`,
   which today only knows about projects.
2. **Money.** Collections trend by month, paid vs outstanding donut, ageing
   buckets. This is the screen where a chart is worth the most and there is
   currently none.
3. **Requests.** The Phase B band, plus resolution-time distribution.
4. **Meetings.** The year strip, on the shared `Timeline`.
5. **Projects.** The Gantt already exists behind a third view toggle; promote it
   — default to Timeline when enough projects carry dates — and add progress
   bars to the bars themselves.
6. **Dashboard.** New widgets for the above (`collections`, `requests-health`,
   `occupancy`), appended to `DASHBOARD_WIDGETS` **default-off** — appending a
   widget default-on is exactly the bug the landing widget registry already
   made once (`1033-landing-migration`, "a bug worth remembering").
7. **Retire the off-system originals** onto `ChartCard`.

## Rules this work runs under

- Every chart is `ClientOnly` with a height-reserving fallback, or it stacks a
  phantom `<svg>` under the real one.
- Colours come from `--chart-1…5` (defined light and dark in
  `core/app/assets/css/tailwind.css`), never literals.
- `t-bg-accent` has exactly three opacity suffixes — `/10`, `/15`, `/20`, each
  written out by hand in `theme.css`. Any other suffix is a silent no-op, and
  never pair `t-bg-accent` with `t-text-accent` (both resolve to the accent).
- Measure styles with `getComputedStyle`; reading a rule is not evidence.
- After every change: `pnpm typecheck && pnpm test && pnpm build`
  (`eval "$(/usr/local/bin/fnm env)"` first — there is no node on PATH in a
  tool shell). A template restructure needs the real build; typecheck does not
  catch a broken `v-if`/`v-else` chain.

## Progress

- [x] **Phase A — sections resolve to content** (`61aa706`). People → Members,
  Records → Meetings, Requests → the queue, /manage → first granted area.
  Roots kept as redirect shims; `sectionHomeFor` is module-aware and covered by
  `tests/composables/useSectionNav.test.ts` (6 tests, including a
  never-redirect-to-itself guard).
- [x] **Phase C.1 — the chart kit** (`3e274a6`). `AppChartCard` / `Trend` /
  `Bars` / `Donut` / `Timeline` / `Legend`, colour from `--chart-1…5` via
  `useChartColors`, all in `/ui-kit` with fixed sample data.
- [x] **Phase B — landing bands** (`3e274a6`, `af37fc3`). People (counts +
  members-by-type + homes-by-occupancy), Records (year-in-meetings Gantt +
  three counts), Requests (queue health + ageing), Money (cash in/out +
  outstanding by age).
- [x] **Settings health strip** (`7348904`). `Admin/SettingsGlance.vue` above
  the cards, in a new `intro` slot on `AdminSectionHub`: plan, modules on,
  public-site/domain status, Stripe payouts, last data export — each tile
  linking to the tab that fixes it. The module catalogue moved out of
  `ModulesForm` into `useModules` as `MODULE_GROUPS` so both count the same
  list.
- [x] **Projects** (`906e70f`). A project with two dated milestones opens on
  the Gantt; the index opens on the timeline when two non-archived projects
  carry dates. Both rules live in `core/shared/projects/timeline.ts` with 14
  tests. Bars carry task progress — length is WHEN, fill is HOW FAR.
- [x] **Dashboard widgets** (`2f88f7f`). `collections`, `requests-health`,
  `occupancy`, appended default-off, each fetching its own data, and
  `WidgetDef` grew a `modules` gate so a community with Payments off is never
  offered a Collections card. 8 tests.
- [x] **Retire the three off-system charts** (`5f86137`). All three on
  `AppChartCard`, each with a real empty state; props unchanged so
  `DashboardPage` needed no edits.
- [x] **`group-hover:t-*` was dead** (`9a2943a`). 19 usages compiling to
  nothing; the nine variants are now written out beside the `hover:` ones
  rather than stripped from the call sites, which were right.
- [ ] **stone-\* palette sweep** — ~18 components still hardcode grey and
  don't follow dark mode. Spun out as its own task; the Requests filter pills
  in `af37fc3` are the reference conversion.

## What running it taught (not readable from the source)

- **`<component :is="'NuxtLink'">` renders a literal `<nuxtlink>` element.** A
  string `is` only resolves against LOCALLY registered components, and Nuxt's
  auto-import is not that. It looks correct on screen while every tile has
  silently stopped being a link. `resolveComponent("NuxtLink")` once, up front.
- **`server: false` means the first client paint has `pending === false` and
  `data === null`.** The Settings strip spent one frame confidently reporting
  "No plan" and a landing URL with no slug for a community that was fully set
  up. Gate on `pending || !data`, and give a failed read its own state rather
  than letting five tiles compute off a null.
- **`--theme-bg-secondary` against `--theme-bg-elevated` is three points per
  channel in dark mode.** A recessed tile inside a card needs
  `--theme-border-primary`; `--theme-border-light` disappears.
- **Nothing stores a subscription renewal date.** Stripe holds the period end;
  there is no `current_period_end` anywhere in the repo. The org row carries
  `billing_cycle`, `trial_ends_at` and `grace_ends_at`, and grace has to be
  checked BEFORE status — the status underneath still reads `canceled` by
  design.

- **A moment is not a span.** A zero-length meeting on a 250-day axis draws as
  a 2px sliver. Faking a one-day duration lies about the date; unovis'
  `showEmptySegments` + `lineCap` draws a dot of the line's own width.
- **`hoa_board_members` has no `organization`.** The scope goes through
  `hoa_member`, and filtering on the absent field is a FORBIDDEN 500 rather
  than an empty list. Any band with several independent counts uses
  `Promise.allSettled` so one gap can't blank the rest.
- **The Browser pane reports `document.hidden`,** which freezes unovis' rAF
  transitions mid-enter. A screenshot catches whatever frame the animation
  stalled on — measure geometry and resolved fills instead.
- **Deleting a project does not delete its tasks.** The confirm says "Its
  milestones and tasks will be removed"; the events go, the tasks survive with
  `project: null` and `project_event: null` and `category: "event"`, as
  un-attributable orphans. Found while clearing up seeded demo data. Spun out
  as its own task.
- **`--warning` and `--destructive` exist as `light-dark()` pairs,** so
  `color-mix` between them stays theme-aware. That is where `severe` comes
  from; there is no orange token.

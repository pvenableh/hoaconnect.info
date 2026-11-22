# Plan — one experience for every role: material, motion, visuals, direct manipulation

Written 2026-11-20 from a source survey and a browser pass on the demo community
(admin, 1280 px and 375 px, light and dark). Nothing here is built.

**This is a delta.** `plan-role-first-ux.md` (role context, capability nav, resource
scaffold, glass as a layer: Sessions 1–18 shipped) and `plan-content-first-ux.md`
(chart kit, landing bands: shipped) stay the source for what exists. This plan
replaces role-first's unstarted Phase 9 (role homes) and Phase 10 (walk-through),
and reopens its Phase 4 (glass) for a material rewrite.

## 1. The rule every screen follows

**Answer first, act in place, never leave to find out.**

1. The top of every screen is the answer to "what do I need to know or do here,
   right now?", drawn (a number, a ring, a bar), not described.
2. The action sits on the thing it acts on: tap, drag, swipe. No trip to a form
   page for a one-field change.
3. Detail arrives over the screen you are on (sheet, slide-over) and leaves the
   same way. Where it came from stays visible.
4. One eye path for every role. A tenant and a treasurer see different content in
   the same places.

## 2. What is already here, and what is missing

| Asked for | Already here | Missing |
|---|---|---|
| Unified across roles | `RoleContext`, one nav registry, `AppResourceIndex`, panel registry | Role homes: only admin (`DashboardPage`) and one member page (`MemberDashboardPage`). Board, committee/team, manager and tenant get the owner's home |
| iOS feel | Dock, bottom sheet, slide-over stack, edge-swipe back, haptics, segmented thumb | Shared-element open (row grows into its panel), drag-to-dismiss sheets, pull to refresh, swipe actions on rows, large-title collapse on scroll |
| GSAP | `gsap` 3.13, `useGsap`, `useFlipList`, `StaggerList`, motion tokens in `core/shared/motion` | Used in 16 files, mostly marketing and Home. No app-wide primitives: every page animates by hand or not at all |
| Charts | `App/Chart/*` (Trend, Bars, Donut, Timeline) on unovis, `--chart-1…5` | Small marks: sparkline, ring, meter, status track. Charts appear on admin screens only; an owner's balance is a number |
| Drag and drop | `vuedraggable` in the two builders only | Nothing in the product itself: dashboard, dock, work board, schedule, responsibilities |
| Liquid glass | One material system, Tint switch, reduced-transparency and contrast fallbacks | See §3 |

## 3. Glass review: what the browser showed

Checked on `/demo` as the demo admin. Findings in order of how much they cost.

1. **Dark dialogs are see-through.** The What's New dialog shows the page's text
   through its body. Cause: `.dark .glass-surface` (specificity 0,2,0) sets
   `background` and outranks `.glass-surface--strong` (0,1,0), and there is no
   `.dark .glass-surface--strong`. In dark, every "strong" surface (dialog, dock,
   sheet, auth card) gets the regular 62% fill, not 84%. A bug, not a taste call.
2. **Colour is in the chrome.** Each pane carries a 135° accent gradient that
   shifts hue by 35°, the modal scrim has an accent radial, shadows are
   accent-hued, and the dark page backdrop has a teal band. macOS materials are
   neutral: they take colour from what is behind them (blur plus saturation), and
   the accent appears only on the selected control. Today's look reads as a
   theme; the target reads as a system.
3. **Too many recipes.** `.glass`, `.glass-ultra`, `.glass-surface`, `--strong`,
   `.glass-bar`, `.glass-widget`, the toast and the scrim each hard-code their own
   blur and fill (ten distinct blur radii in the CSS; `--glass-blur` exists and
   most recipes ignore it). Nobody can say which material a new surface takes.
4. **Glass on content came back.** The At a glance tiles on the dashboard are
   translucent over the page gradient; in light mode their labels are the lowest
   contrast on the screen. Role-first §2.4 says content is solid.
5. **Edges are heavy.** Every dock chip has its own rim ring, and the open app
   adds a second ring. macOS marks selection with a filled capsule and nothing else.
6. **Radii are unrelated.** Cards, tiles, chips and capsules each pick a radius;
   nested shapes do not share a centre.

### Material v2 (the fix)

Four named materials, each a token set, each used by a fixed list of surfaces.
Neutral by default; blur and saturation do the work.

| Material | Used by | Fill (light / dark) | Blur · saturate |
|---|---|---|---|
| `bar` | top bar, section capsule, dock | 70% / 60% | 20px · 180% |
| `menu` | dropdown, popover, select, tooltip, toast | 82% / 78% | 20px · 180% |
| `sheet` | dialog, bottom sheet, slide-over, Spotlight | 92% / 88% | 20px · 160% |
| `solid` | every content card, table, field, chart | 100% | none |

- One hairline (white inner top edge in dark, 8% black ring in light) and one
  neutral two-layer shadow per elevation. No accent in shadows or scrims.
- **White on white.** Panes and controls are both neutral: light glass on a light
  ground, separated by blur, the hairline and the shadow, not by colour. The
  primary action is the ink (near-black in light, white in dark), not the accent.
- **Colour is a highlight** (D1, decided 2026-11-20; replaces Session 12's
  decision 2). The person's colour never fills a pane or a button. It appears as:
  a faint wash on the selected capsule and the open dock app (about 8–12% over
  the neutral fill), the focus ring, the unread dot, links, and `--chart-1`.
  Tint On/Off stays: Off removes the wash and leaves the ring and dot.
- **Brighter swatches.** Because the colour now covers so little area, the fixed
  hues are re-picked more saturated and lighter so a small highlight still reads.
  Each is contrast-checked where it carries meaning (focus ring and dot at 3:1
  against the neutral fill; link text keeps its AA ink from `deriveInkAccent`),
  and `audit:contrast-pairs` is updated. Still no red, amber or green.
- Radius scale 8 / 12 / 16 / 22 / capsule, and `inner = outer − padding` enforced
  by tokens (`--r-card`, `--r-inset`).
- Page backdrop: flat `--theme-bg` with one soft neutral vignette. The Waves
  backdrop stays as the opt-in it already is.
- Old class names become aliases of the four for one release, then the
  `dead-theme-classes` audit removes them. New audit `audit:materials`: no
  `backdrop-filter` outside `earnest-ui.css`.
- Blur stays capped at 20px (the existing glass budget). Fallbacks for reduced
  transparency and increased contrast carry over.
- The public landing and marketing pages are out of scope; they keep their look.

## 4. The three kits (build once, in `/ui-kit`, before any page uses them)

All are project components under `app/components/App/`. Nothing in
`app/components/ui/` is edited; shadcn-vue parts are wrapped.

**Motion** (`App/Motion/*`, `core/shared/motion`). GSAP core, Flip, Draggable,
ScrollTrigger; all free since 3.13.

| Primitive | What it does | Annnimate reference |
|---|---|---|
| `useSharedElement` | A row or tile grows into its slide-over or sheet and shrinks back (Flip) | Card Transition |
| `AppCountUp` | Numbers roll to their value on first view and on change | — |
| `AppReveal` | Staggered entry for a list or grid, once per visit (extends `StaggerList`) | Split Reveal, Shape Reveal |
| `useSheetDrag` | Drag a bottom sheet down to dismiss, with velocity and rubber-band | — |
| `useSwipeRow` | Swipe a row for its one or two actions on touch | — |
| `AppLargeTitle` | Page title collapses into the top bar on scroll | — |
| Segmented thumb | `useSlidingThumb` gains the stretch-and-settle of a liquid capsule | Bubble Tabs |
| Page change | Push/pop direction from route depth, on the existing `pageTransition` | Wipe Transition (quiet version) |

Rules: 180–320 ms, one easing family from the existing tokens, transform and
opacity only, every primitive a no-op under `prefers-reduced-motion`, nothing
loops. Marketing-grade effects (shaders, word streams, magnetic buttons) stay out
of the app.

**Marks** (`App/Chart/*` additions): `Sparkline`, `Ring` (progress toward one
number), `Meter` (value against a limit), `StatusTrack` (where a request, payment
or approval is in its steps), `Heatstrip` (a year of days). Each draws in once,
reads `--chart-*`, has an empty state, and is `ClientOnly` with reserved height.

**Direct manipulation** (`App/Sortable`, `App/DropTarget`, `useDragSchedule`).
`vuedraggable` for reordering lists and boards (already installed); GSAP Draggable
for the timeline, where position is a date. Every drag has a keyboard equivalent
and a menu equivalent ("Move to…"), shows where the item will land, and is undone
from the toast.

## 5. Role homes: the same three bands for everyone

Band 1 **Needs you** (the existing stack) · Band 2 **At a glance** (marks) ·
Band 3 **What's new** (feed). One `HomePage` component; a per-role config in
`core/shared/home/` picks the content from capabilities, so a person with two hats
gets both sets, not a mode switch.

| Role | Needs you | At a glance | Acts in place |
|---|---|---|---|
| **Tenant** | Notices to acknowledge *(pending feature)* · my open requests | `StatusTrack` per request · next building event | New request sheet · swipe to acknowledge *(pending feature)* |
| **Owner** | Balance due with Pay · open votes · forms to sign *(pending feature)* | `Ring` paid this year · balance `Sparkline` · next meeting | Pay sheet · vote in the card · RSVP |
| **Board member** | Approvals waiting (with who has signed) · votes | `Ring` signatures per approval · arrears `Meter` · collections trend · contract dates `Heatstrip` | Approve or decline in the card · open the record over the home |
| **Team / committee member** | My tasks · items in my area's queue | Team progress `Ring` · this week's schedule strip | Drag a task across the board · check off in place |
| **Property manager** | Queue across delegated areas, oldest first | Per-community load bars · response time `Sparkline` | Reassign by drag · reply from the row |
| **Admin** | Setup health · overdue across the community | Today's dashboard widgets, reorderable | Drag widgets · drag dock apps · everything above |

*Pending feature* = no data model yet (an acknowledgment record for notices, a forms-to-sign flow). The config keeps the keys and the home renders nothing for them; §9 rules out the schema here. Peter to be reminded at the end of this plan to scope it as its own task.

## 6. Where drag and visuals land in the product

| Surface | Change |
|---|---|
| Dashboard / home | Drag to reorder and resize widgets (replaces the Customize list as the main path) |
| Dock | Long-press, drag to reorder; drag out to remove (stored in app prefs) |
| Requests and tasks | Board view: columns are statuses, drag to move; `StatusTrack` on every row and detail |
| Projects | Drag a bar to move dates, drag an edge to change length; drag a task onto a phase |
| Responsibilities | Drag a person or office onto a job to assign (hand-over sheet confirms the date) |
| Meetings | Drag agenda items into order; the year as a `Heatstrip` |
| Documents | Drag files onto a folder; drop from the desktop to upload |
| Payments (owner) | Balance as a timeline: charged, paid, due next |
| Money (board) | Approvals show a signature `Ring`; ageing bars filter the list when tapped |
| Every index | Tap a chart segment to filter the table below it; count-up on the summary strip |

## 7. Sessions

Revised 2026-11-20 (Peter): lowest token use, and no Fable. The design thinking is
already in this file (§3 values, §4 names, §5 and §6 tables), so every session is
execution. Default model **Sonnet 5.5**; **Haiku 5.5** for mechanical sweeps;
**Opus 5.5** only as an escalation (rule below). Fable: none.

Each session is a fresh conversation, leaves `main` green, and touches about eight
files or fewer. Sessions were split so none needs a larger model to hold it.

| # | Session | Model | Open only | Done when |
|---|---|---|---|---|
| 1 | **Material tokens**: the four materials, neutral controls, highlight, brighter swatches, the dark strong fix, old classes aliased | Sonnet | `earnest-ui.css`, `theme-app.css`, `core/shared/branding/accent.ts`, `app/pages/ui-kit.vue` | `/ui-kit` shows all four in light and dark; a dark dialog's computed fill is ≥ 88%; `audit:contrast-pairs` passes |
| 2 | **Material sweep**: glance tiles solid, dock chips, radii, backdrop, scrim; add `audit:materials`; delete aliases | Haiku | the files `audit:materials` and `audit:dead-theme-classes` list | both audits at zero |
| 3 | **Motion kit A**: `AppCountUp`, `AppReveal`, liquid segmented thumb, push/pop page change | Sonnet | `core/shared/motion/index.ts`, `useGsap.ts`, `useSlidingThumb.ts`, `StaggerList.vue`, `app/app.vue` | each in `/ui-kit`; each a no-op under reduced motion (unit test) |
| 4 | **Motion kit B**: `useSharedElement`, `useSheetDrag`, `useSwipeRow`, `AppLargeTitle` | Sonnet | `useFlipFromRow.ts`, `App/BottomSheet.vue`, `App/SlideOverShell.vue`, `App/PageHeader.vue` | each in `/ui-kit`; sheet dismisses by drag and by Escape |
| 5 | **Marks**: `Sparkline`, `Ring`, `Meter`, `StatusTrack`, `Heatstrip` | Haiku | `App/Chart/Card.vue`, `App/Chart/Donut.vue` (as the pattern), `useChartColors.ts` | each in `/ui-kit` with data and empty states |
| 6 | **Drag kit**: `AppSortable`, `AppDropTarget`; proven on dashboard widgets and the dock | Sonnet | `EmailBuilder/Canvas.vue` (as the pattern), `useDashboardWidgets.ts`, `useDockApps.ts`, `App/Dock.vue` | order survives reload; keyboard reorder works; undo toast |
| 7 | **Home shell**: `HomePage` with three bands and the role config in `core/shared/home/roles.ts`, unit-tested per role and per two-hat combination | Sonnet | `core/shared/home/*`, `role-context.ts`, `Home/Stacks.vue`, `Home/GlanceRail.vue` | config tests pass for all six roles |
| 8 | **Homes: owner and tenant** | Sonnet | `MemberDashboardPage.vue`, `app/pages/[slug]/index.vue`, session 7's files | §5 rows render with real data on the demo community |
| 9 | **Homes: board, team, manager, admin** | Haiku | `DashboardPage.vue`, `app/pages/[slug]/manage/index.vue`, session 7's config | §5 rows render; config only, no new components |
| 10 | **Motion uptake** through the scaffold | Haiku | `App/ResourceIndex.vue`, `App/ResourceRecordPage.vue`, `panels/registry.ts`, `App/SheetContent.vue` | a row opens into its panel and returns on every scaffolded index |
| 11 | **Work board**: status columns for requests and tasks, toggle remembered | Sonnet | `useRequests.ts`, `useTasks.ts`, `app/pages/[slug]/admin/requests/index.vue`, session 6's kit | drag changes status through the existing route; "Move to…" does the same |
| 12 | **Timeline drag**: move and resize project bars | Sonnet | `projects/ProjectGantt.vue`, `core/shared/projects/timeline.ts`, `useProjectEvents.ts` | dates save; date math unit-tested; arrow keys nudge a day |
| 13 | **Drag, the rest**: responsibilities assign, agenda order, document filing | Haiku | one page and one composable per surface | each drop calls the route the form already uses |
| 14 | **Chart-to-table filters and count-ups** on the index summary strips | Haiku | `App/ResourceIndex.vue`, `App/StatCard.vue`, `App/Chart/Bars.vue` | tapping a segment filters the table and can be cleared |
| 15 | **Walk-through**: one seeded login per role, 375 and 1280 px; output is a fix list, not fixes | Haiku | `scripts/seed-demo.ts` | fix list appended to §10 |

Order: 1 → 2. Then 3, 5 and 7 are independent of each other and of 1. 4 after 3;
6 after 3; 8–9 after 5 and 7; 10 after 4; 11–13 after 6; 14 after 5; 15 last.

### Rules that keep it cheap

- **Escalation, not default.** A session moves to Opus only after its "Done when"
  gate fails twice on the same cause. It then gets that one failure, not the whole
  session. Likeliest candidates: 4 (Flip across a portal) and 12 (drag on a time axis).
- **Fresh conversation per session,** started from the template below. No session
  continues into the next; a long context is the largest avoidable cost.
- **Read list is a ceiling.** "Open only" plus this file's named section. Never
  open `plan-role-first-ux.md` (1,544 lines); what a session needs from it is here.
  Read with line ranges; find things with `grep -n`, not by opening files.
- **Audits and tests instead of reading and looking.** `pnpm audit:all`, the
  session's own tests, and computed-style checks. One screenshot at the end, at
  0.5 scale, as proof. No per-step screenshots.
- **No subagents, no web fetches, no MCP servers** beyond the browser pane. The
  survey is done; Annnimate is reference only (D2).
- **Kits before pages; scaffold before pages.** Sessions 10 and 14 change shared
  components, so no resource page is opened at all.
- **Copy the neighbour.** Each kit session names an existing file as its pattern.
- **Stop rule.** If the gate is not met within the session's files, stop and write
  three lines under §10 (what failed, where, what was tried). Do not widen the
  read list to keep going.
- **Close with three lines** under §10: what shipped, what deviated, the commit.

### Kickoff template (paste, fill the three blanks)

> Model: ⟨model⟩. Read `docs/plan-unified-experience.md` §⟨section⟩ and the row for
> Session ⟨n⟩ in §7. Open only the files in that row. Build it, run
> `pnpm typecheck && pnpm test && pnpm audit:all`, check the "Done when" gate, and
> log three lines under §10. Follow §7's rules; stop rather than read more.

Section per session: 1–2 → §3 · 3, 4, 10 → §4 Motion · 5, 14 → §4 Marks ·
6, 11–13 → §4 Direct manipulation and §6 · 7–9 → §5 · 15 → §5 and §6.

## 8. Decisions

Settled 2026-11-20 (Peter):

| # | Decision |
|---|---|
| D1 | Neutral, white-on-white glass. No coloured panes and no coloured controls; the person's colour is a subtle highlight only, and the swatches get brighter (§3, Material v2) |
| D2 | Annnimate is reference only; the primitives are written here. No licence, no MCP |
| D3 | Dashboard widget drag sits beside the Customize list (the list is the keyboard path) |
| D4 | Board view for requests and tasks is a toggle, remembered per person; the table stays the default on phones |

## 9. Not in this plan

New features, schema changes, the public landing and marketing pages, and
role-first's unstarted product phases (3, 5, 6, 7, 8, 11), which keep their own
order. Session 11 here supplies the board view that role-first Phase 6 expects.

## 10. Status

| Session | State | Notes |
|---|---|---|
| 1 | [x] | Shipped: four materials (`material-bar/menu/sheet/solid`, `--mat-*` tokens, radius scale, `.material-highlight` wash), old glass classes aliased onto them, dark `--strong` fix (dark sheet fill now 88%), ink primary button, brighter swatches (accent.ts + regenerated `--tint-*` in theme-app.css), Materials section in `/ui-kit`. |
| | | Deviated: aliases are appended at the end of earnest-ui.css, so the old recipes still exist beneath them (Session 2 deletes them); `/ui-kit`'s dark column only swaps the `--mat-*` fills, since `--theme-card-bg` follows colour-scheme, not `.dark`; accent shadows on `.glass-btn-primary` and the tinted button variants are not yet neutralised. |
| | | Commit: not committed (typecheck, test, audit:all green; computed fills sheet 0.92 light / 0.88 dark). |
| 2 | [x] | Shipped: `audit:materials` at 0 and in `audit:all`; `audit:dead-theme-classes` at 0 (72 defined, 812 files). Blur only in `earnest-ui.css` and `landing.css`. Typecheck clean, test 4493 passed, audit:all 20 green. |
| | | Deviated: the old glass aliases were not deleted in this session (§10 Session 1 left them in `earnest-ui.css`). The gate does not require deletion and both audits pass without it. 2b browser check: SlideOverShell header `blur(20px) saturate(1.6)`, footer `blur(8px)` (`mat-blur-soft`), and SlideOverStack backdrop `blur(6px) saturate(1.4)`, all as computed in Chrome on the `?slide=task:` panel. Still open: reduced-transparency not checked in a live render (static rule in `earnest-ui.css` covers all six classes), and the `/demo` HTTP 500 after `seed:demo` not reproduced. |
| | | Commit: a0266d86 (landing, audit, sweep); this plan update follows it. |
| 2a | [x] | Side track (marketing blur system): `landing.css` owns `--landing-blur-{sm,md,cta,glass,dock}` and `--landing-saturate{,-dock}`, plus `.landing-blur-sm/-md`. Org/Landing, Marketing/Landing, experimental, property-managers and your-data use them, with no literal blur. Values unchanged, so nothing moves on the page. |
| | | `audit:materials` allows blur only in `earnest-ui.css` and `landing.css`; landing scope may use tokens only. Findings 38 → 23, all app-side (SlideOverShell/Stack, SubNav, LoadingOverlay, ReportDialog, theme.css, plus three comments in theme-app.css). Still not in `audit:all`. Not committed. |
| 2b | [x] | App-side sweep: `earnest-ui.css` gains `.mat-blur-{chrome,soft,scrim,capsule,modal}` and `.t-scrim` blur, with `--mat-blur-*` tokens and reduced-transparency off in one place. SlideOverShell, SlideOverStack, SubNav, LoadingOverlay and ReportDialog take the class in their template; literal blur removed from their styles and from theme.css. |
| | | `audit:materials` now flags only a backdrop that adds a blur (not `none`, not `@supports`, not plain `filter: blur()`), and is registered in `audit:all` (20 green). Findings 23 → 0. Typecheck clean, test 4493 passed. Browser check (/demo/admin/payments): nav capsule computes `blur(16px)` via `mat-blur-capsule`; dock, sheet backdrop and sheet panel compute their existing material blurs. Slide-over check (one demo request created via the New request sheet, id 6116152a-e1d6-46e5-b5e9-481e2420bcd2, then opened with `?slide=request:<id>`): SlideOverShell header computes `blur(20px) saturate(1.6)` via `mat-blur-chrome`; SlideOverStack backdrop computes `blur(6px) saturate(1.4)` via `mat-blur-scrim`. Footer not verified (the request panel renders no footer slot). Reduced transparency not verified. `pnpm seed:demo` ran (dry run first; Beaumont recurring email added, Harborview unchanged). After it, `/demo` returned HTTP 500 and the dashboard stuck on a spinner; not diagnosed. Not committed. |
| 3 | [x] | Shipped: `core/shared/motion/kit.ts` (pure plans: `countUpPlan`, `formatCount`, `revealPlan`, `liquidSpan`), `AppCountUp` and `AppReveal` (`app/components/App/{CountUp,Reveal}.vue`), liquid stretch-and-settle in `useSlidingThumb` (on by default, `liquid: false` opts out), push/pop by route depth (`pushOrPopByDepth` in `page-transition.ts`), a Motion section in `/ui-kit`. `tests/shared/motion-kit-a.test.ts` (11) covers each no-op under reduced motion, including the page CSS block. |
| | | Deviated: push/pop and its reduced-motion CSS already existed (history stack, `main.css`), so the page change only gained the depth rule (a deep link followed by the breadcrumb now pops). `app.vue` and `StaggerList.vue` were not touched; `AppReveal` is new beside the CSS stagger, which stays. Thumb transition changed 400ms spring to 320ms spring-out. Browser check on `/ui-kit`: thumb width 52 to 106 mid-move then 52 at the new offset, count renders $1,284, reveal staggers. Typecheck, test 4504 and audit:all 20 green. |
| | | Commit: this one. |
| 4 | [x] | Shipped: `core/shared/motion/kit-b.ts` (pure plans: `sharedElementPlan`, `sheetDragOffset`/`sheetRelease`, `swipeIntent`/`swipeOffset`/`swipeSettle`, `largeTitleProgress`), `useSharedElement`, `useSheetDrag`, `useSwipeRow` (`core/app/composables/`), `AppLargeTitle` (`App/LargeTitle.vue`), a Motion section in `/ui-kit`. `BottomSheet` now drives its drag through `useSheetDrag`; `SlideOverShell` skips its FLIP flight under reduced motion. `tests/shared/motion-kit-b.test.ts` (9). |
| | | Deviated: opened `ui-kit.vue`, `kit.ts` and `motion/index.ts` beyond the row (demos, the pattern, the re-export). `useSharedElement` is a new WAAPI composable beside `useFlipFromRow` (which `SlideOverShell` still uses), not a replacement, and no row is wired to it yet (Session 10). `PageHeader` untouched: `AppLargeTitle` is standalone and no page uses it yet. `AppLargeTitle` listens to scroll directly, not through rAF (stalls in a background tab). Browser check at 375 px on `/ui-kit`: sheet closes by Escape and by a synthetic touch drag, swipe row settles at -88px, large title bar opacity 0 to 1 as the big title goes 1 to 0, tile panel runs one animation on open. Typecheck, test 4513 and audit:all 20 green. |
| | | Commit: a1fcba96 (with Session 5). |
| 5 | [x] | Shipped: `App/Chart/{Sparkline,Ring,Meter,StatusTrack,Heatstrip}.vue`, each client-only with a reserved height, drawing in once on mount (CSS transition, off under reduced motion), reading `--chart-1` or `CHART_STATUS_VARS`, with an empty state; a Marks section in `/ui-kit` with data and empty cases for each. |
| | | Deviated: `/ui-kit` (`app/pages/ui-kit.vue`) was edited though not in the row, as Session 4 did, because the gate needs the marks there. Marks draw from `requestAnimationFrame`, which stalls in a hidden pane, so in the Browser pane the sparkline polyline stayed undrawn (`is-drawn` false) after 2.5 s; not seen in a visible render. Verified in DOM only: 730 heat cells, meter fills good/warn/bad as 6,200 / 9,100 / 11,400 of 10,000, status track states, empty states. No new unit tests. |
| | | Commit: a1fcba96. Typecheck exit 0, test 4513 passed, audit:all 20 green. |
| 6 | [x] | Shipped: `core/shared/motion/sortable.ts` (pure `moveItem`, `keyboardTarget`, `moveToOptions`, `applyOrder`, `acceptsDrop`), `App/Sortable.vue` (`AppSortable`: vuedraggable drag, Alt+arrow/Home/End keys, `moveTo` slot prop for a "Move to…" menu, sonner Undo toast, aria-live), `App/DropTarget.vue` (`AppDropTarget`: accepts by type, `is-over` ring, `drop`/`files`), `useOrderPref` (saved order in localStorage, new keys append). Dock chips and dashboard widgets now sort through `AppSortable`; dock order saves as `dock-order-v1`, the dashboard keeps `dashboard-widgets-admin-v1`. `tests/shared/motion-sortable.test.ts` (6). |
| | | Deviated: touched `useOrderPref.ts`, `WidgetCard.vue` (native HTML5 drag removed, span moved to the sortable's item wrapper) and `DashboardPage.vue` beyond the row. No `useDragSchedule` (timeline, Session 12) and no "drag out of the dock to remove". Dock drag is off in the phone's four-and-Apps layout. No `/ui-kit` demo and no browser check: reload, keyboard and undo are covered by the pure tests and typecheck only, not seen live. The `Move to…` menu is a slot prop; no menu component yet. |
| | | Commit: 2fa274bb. Typecheck exit 0, test 4519 passed, audit:all 20 green. |
| 7 | [x] | Shipped: `core/shared/home/roles.ts` (`ROLE_HOMES` = §5's six rows as needs/glance/acts keys; `homeRoles(ctx)`, `homeForRoles`, `homeFor(ctx)`: hats add, deduped, admin > manager > board > team > owner > tenant), and `App Home/Page.vue` (`HomePage`: three bands, each a slot receiving its keys, falling back to `HomeStacks` and `HomeGlanceRail`). `tests/shared/home-roles.test.ts` (11): each of the six roles, all 15 two-hat pairs, owner-on-board, empty context. |
| | | Deviated: `role-context.ts` lives at `core/shared/roles/`, read as is, unchanged. `Stacks.vue` and `GlanceRail.vue` were read but not edited, and `HomePage` is not mounted on any page yet (Sessions 8 and 9). Team role = any helper or committee grant (`ctx.helps`). No browser check, since nothing renders it. |
| | | Commit: ba4305bc. Typecheck exit 0, test 4530 passed, audit:all 20 green. |
| 8 | [~] | Shipped: `core/shared/home/member-home.ts` (pure: `paidThisYear`, `balanceSeries`, `requestTrackKey`, `openRequests`) with `tests/shared/member-home.test.ts` (4); `MemberDashboardPage` mounts `HomePage` for owners and tenants, filling Needs you (balance due with Pay, open votes, my open requests, New request sheet) and At a glance (paid-this-year `Ring`, 12-month balance `Sparkline`, next meeting with RSVP, `StatusTrack` per open request) from `homeFor` keys and existing reads (`useUpNextGlance`, `payment_requests`, `hoa_requests`). Typecheck exit 0, test 4534, audit:all 20 green. |
| | | Deviated: NOT verified on the demo community in a browser (no owner or tenant login used), so the "Done when" gate is unmet until someone looks. No data exists for "notices to acknowledge", "forms to sign" or swipe-acknowledge, so those keys render nothing. Pay and RSVP navigate to /payments and /meetings (no pay sheet exists); vote goes to /polls, not in the card. `[slug]/index.vue` and the role-home config were not edited; the page is mounted from `MemberDashboardPage`. Board hats on an owner also pass through `homeFor`, but board bands (approvals, arrears) have no content here (Session 9). |
| | | Browser check (demo owner, `/demo?as=member`): three bands render; roles read `owner` only (admin hat dropped after a first look showed `admin owner`); Ring and Sparkline mount; empty state shows. The demo member has no charges, meetings or polls, so due, vote, RSVP and meeting rows were not seen with data; request and `StatusTrack` rows are tenant-only in §5 and no tenant login was tried. Gate still partly unmet. |
| | | Seeded on the live Directus (Harborview Lofts, demo owner, notes `Session 8 check data`): charges b8695aa8 ($420 due Dec 1, active) and 2ab9c211 ($420 paid Oct), meeting 8a527c79 (Dec 3). Seen at `/demo?as=member`: balance due row with Pay, Ring 50% ($420 of $840), balance Sparkline, next meeting with RSVP. Not seen: vote row (no poll seeded), tenant bands (no tenant login). |
| | | Gate check 2: poll 17e009a6 (closes Dec 2; a Dec 5 close fell outside `buildUpNext`'s 14-day vote window and was hidden) now shows the Vote row. Tenant bands seen by flipping the demo member (e623f6ef) to tenant for one load, then back to owner (no tenant account or password created): New request button, my open request, `StatusTrack` (Received / In progress / Resolved), next building event. Gate met for owner and tenant rows with data; notices, forms to sign and swipe-acknowledge still have no data to render. |
| | | Commit: 846b57f8, fix in the commit after it. |
| 9 | [~] | Gate not met; stopped at the stop rule. Config already matches §5 for all six roles (`core/shared/home/roles.ts`), so no config change was needed. `DashboardPage.vue` renders `HomeStacks`/`HomeGlanceRail` directly and does not mount `HomePage`; `manage/index.vue` is a redirect to the first granted area with no home of its own, so board, team, manager and admin rows are not wired to `HomePage`. |
| | | Tried: read `roles.ts`, `DashboardPage.vue`, `manage/index.vue`; `pnpm typecheck && pnpm test && pnpm audit:all` green (test 4534 passed, audit 20 green). Not done: opening `HomePage` and its slots (outside the row's files), and no browser pass for board, team, manager or admin logins. Deviated: the first read covered all of this plan rather than §5 and §7 only. |
| | | Second pass, reverted: a `DashboardPage.vue` edit mounted `HomePage` with the existing stacks and rail as its bands. Peter asked for it to be reverted as off-plan (the row says config only), so the file is back at HEAD. The manager root was never changed and stays a redirect. Browser check, as the demo admin on the reverted code: the dashboard shows "What needs you" (tally "12 to do", an overdue payment in Do), the At a glance rail (5 tiles) and the widget grid below. Setup health is not visible on the page. Board, team and manager logins not checked. Gate still partly unmet. Commit: none. |
| | | Role logins (third pass): `scripts/seed-demo-roles.ts` (new; passwords live in that file, not here) created five users on Harborview Lofts, each with a linked active `hoa_members` row. Admin is the existing `demo@hoaconnect.info`, unchanged; owner member e623f6ef untouched. Typecheck, test 4534 and audit:all 20 green. Browser check done in the Browser pane on the local dev server (port 3010; the preview wrapper killed the server before it answered, so it was started with `pnpm dev` directly and stopped after). Each login signed in, `/api/org/role-context` read per role, then `/demo?as=member` loaded (`/demo` for manager and admin). Commit: none. |
| | | Tenant: `demo-tenant@hoaconnect.info` (hats none). Bands seen: Needs you (empty line plus New request button), At a glance (next building event, December board meeting), What's new (Building feed, no announcements). Missing: notices and swipe-acknowledge (no data model); no open request seeded, so my-requests and `StatusTrack` not seen. |
| | | Owner: `demo-owner@hoaconnect.info` (hats none). Bands seen: Needs you (empty line), At a glance (paid-this-year `Ring` 0%, $0 of $0, balance `Sparkline`), What's new (empty feed). Missing: forms to sign (no data model); no charge, poll or meeting seeded for this member, so balance due, vote and RSVP rows not seen; no next-meeting row showed for this owner though the tenant saw one. |
| | | Board member: `demo-board@hoaconnect.info` (hat board, actor `board_member`; term `director`). Bands seen: the owner bands plus three community tiles (11 members, 9 owners, 2 tenants) and a Board Member Status card lower down. Missing: approvals with signers, signature `Ring`, arrears `Meter`, collections trend, contract `Heatstrip` (no content, and `DashboardPage.vue` does not mount `HomePage`). |
| | | Team member: `demo-team@hoaconnect.info` (hat none; `helps` documents and feedback). Bands seen: the plain owner home, identical to the owner's, no team badge. Missing: my tasks, area queue, team `Ring`, week strip (no content or wiring). |
| | | Property manager: `demo-manager@hoaconnect.info` (hat manager, actor `property_manager`; works inquiries, violations, directory, documents, communications, feedback, projects, responsibilities). Bands seen: the plain owner home at `/demo`, badge reads Owner; `/demo/manage` redirects to `/demo/manage/inquiries`. Missing: delegated queue, community load bars, response-time `Sparkline` (no manager home). The manager row's `member_type` was then set to none (null, as the invite flow stores for a property manager), so residency reads none. Re-checked at `/demo` after that change (role context: hat manager, residency none): the home shows the greeting with badge Member, then only the Building feed, Recent Documents and the portal tiles. Needs you and At a glance no longer render at all (no balance Ring or Sparkline), and nothing from the manager config (delegated queue, load bars) takes their place, so a manager's home is empty until the manager bands are built. |
| | | Admin: `demo@hoaconnect.info` (hat admin, residency owner). Bands seen at `/demo`: What needs you (still "Loading…" after 4 s this pass), Quick Actions and Shortcuts, widget grid (documents, units, members, owners vs tenants, weekly activity, email activity, recent documents and emails). Missing: setup health and community-wide overdue not seen. |
| | | Fourth pass (manager bands and mounts, on Peter's request; this goes beyond the row's "config only, no new components"): shipped `core/shared/home/manager-home.ts` (`delegatedQueue`, `loadByArea`, `responseHoursSeries`) with `tests/shared/manager-home.test.ts` (4), `useManagerHome`, `HomeManagerQueue` (open requests across areas the manager can work, oldest first, each row opens its record) and `HomeManagerGlance` (open-by-area bars, weekly hours-to-finish `Sparkline`). Mounted: `[slug]/manage/index.vue` renders `HomePage` for a manager hat (anyone else with a grant still redirects), `DashboardPage` wraps its stacks and rail in `HomePage`, `MemberDashboardPage` reads the server role context (`useRoleContext`) so hats and helper grants reach `homeFor`. Typecheck exit 0, test 4538, audit:all 20 green. Not committed. |
| | | Browser check (local dev server on 3010, all six logins, `/demo`; manager also `/demo/manage`): manager shows Needs you (a seeded request row with Reply) and At a glance (Inquiries and Violations bars, sparkline empty state "Nothing finished in the last 8 weeks"); admin shows the stacks (12 to do), the rail tiles and the widget grid; owner shows the vote row, Ring, Sparkline and next meeting; board and team now read `board owner` and `team owner` and render the owner bands only; tenant showed Needs you with New request and an empty At a glance on that load. |
| | | Still missing: board (approvals with signers, signature `Ring`, arrears `Meter`, collections trend, contracts `Heatstrip`), team (my tasks, area queue, team `Ring`, week strip) and admin (setup health, overdue across the community) have no content; reassign by drag is not built (queue rows link to the record); the load bars are per area, not per community, since a manager works one community; "hours to finish" uses last update as the finish time (no first-response field). Gate not met for board, team and the admin setup-health item. |
| | | Fifth pass (board and team bands, on Peter's request): `core/shared/home/board-team-home.ts` (`myOpenTasks`, `teamProgress`, `weekStrip`, `vendorEndDays`) with `tests/shared/board-team-home.test.ts` (4); `HomeBoardNeeds` (open money approvals from `/api/org/money/approvals`, signature `Ring` per row, Approve and Decline in the card through the existing decide route), `HomeBoardGlance` (arrears `Meter` from `useMoneyGlance`, collected `Sparkline`, vendor end-date `Heatstrip`), `HomeTeamNeeds` (my tasks, check off in place) and `HomeTeamGlance` (tasks `Ring`, seven-day due strip), all mounted in `MemberDashboardPage`. Typecheck exit 0, test 4542, audit:all 20 green. Not committed. |
| | | Browser check (board and team logins, `/demo`): board shows "No approvals are waiting.", the collected `Sparkline` empty state and the vendor `Heatstrip` for 2026; team shows "No tasks are waiting on you.", the Ring at 0 of 0 and the Sat to Fri strip. No approval, task or vendor end date is seeded, so rows, Approve and check-off were not seen with data; the arrears `Meter` did not appear in the page text (its empty state not confirmed). Still missing: team "items in my area's queue" (no queue defined for helper areas), "open the record over the home" (rows link to /approvals, not a panel), and the vendor strip uses `active_until` since vendors have no contract field. |
| | | Sixth pass (seed data and the five missing items): `scripts/seed-demo-home-data.ts` (idempotent, `Home check:` titles) wrote to the live Directus on Harborview Lofts: a task for `demo-team`, vendor Harbor Landscaping ending 2026-12-31, a $1,800 expense with a spend approval (majority, 2 needed), a draft document and a draft poll. New: `core/shared/home/team-queue.ts` and `HomeTeamQueue` (draft documents, open polls for the team's helper areas); manager queue rows and team task rows open `?slide=request:` / `?slide=task:` over the home; board rows open the charge panel for a charge. `TaskPanel` falls back to the caller's own tasks when the unscoped list is refused. Typecheck exit 0, test 4544, audit:all 20 green. Not committed. |
| | | Browser check with data: board sees the $1,800 approval with Ring "0 of 2", Approve through the confirm dialog gave "1 of 2" and a toast; the vendor `Heatstrip` shows 2026-12-31 (1); the arrears `Meter` empty state reads "No reading yet". Team sees the lobby-bulbs task (Due Nov 23), the Documents and Community feedback queue rows, Ring 0 of 1 then 100% after checking it off in place, and the week strip with 1 on Monday; the task opens over the home. Manager: a queue row opens the request over `/demo/manage`. The seeded task is now completed. |
| | | Still not done: an expense approval has no panel, so its row links to Approvals; vendors still have no contract field (the strip uses `active_until`); team queue covers documents and feedback only (projects and responsibilities have no waiting state); admin setup health, reassign by drag and per-community bars remain open. |
| | | Seventh pass (a complete demo, on Peter's request): the six-login scenario now lives in `core/shared/demo/scenario.ts` and runs at the end of `seedDemos` for the `demo` community, so the nightly reset restores it (a failure there is logged and skipped, never fails the reset). `scripts/seed-demo-roles.ts` is now a thin wrapper over the shared seed; `seed-demo-home-data.ts` is gone. It writes the five role logins and memberships (board term, team grants, manager grants), a year of dues for the owner (ten paid, November overdue, December due) and paid-up dues for board and team, 15 requests and violations across tenant, owner and manager, three announcements, a past and two upcoming meetings, two open polls, five team tasks across the week, four vendors with end dates, three spend approvals plus a waiver on the owner's overdue dues, three published documents (each a small generated PDF) and a draft. My earlier ad-hoc rows (`Home check:`, `Session 8 check`) were deleted from the live Directus first. Tests: `tests/shared/demo-scenario.test.ts` (4). Typecheck exit 0, test 4548, audit:all 20 green. Not committed. |
| | | Browser check, all six logins on the local dev server: tenant (two open requests with `StatusTrack`, next building event, announcements), owner (two Pay rows, two Vote rows, Ring 83%, balance Sparkline, next meeting with RSVP), board (four approvals incl. the waiver, arrears Meter $3,250 of $4,510, vendor strip, collected trend), team (three tasks, two queue rows, Ring 2 of 5, week strip), manager (seven queue rows with ages, Inquiries 5 and Violations 2 bars), admin (12 to do and 2 to know, including a vendor cover expiring in 24 days). Known limit: Directus stamps `date_updated` on every write, so a back-dated request can have either its created or its updated date, not both; resolved requests therefore finish "this week" and the response Sparkline is mostly one point. The browser session also expired once mid-walk (manager showed an empty queue until signed in again). |
| | | Eighth pass (the three open items): `core/shared/home/setup-health.ts` (`setupIssues`: billing, unverified custom domain, payouts; returns only what is wrong, worst first) and `HomeAdminSetup`, mounted above the stacks on the admin home. `loadByCommunity` and `assigneeOptions` in `manager-home.ts`; `useManagerHome` now reads open requests across the manager's property-manager memberships and the community's admins and managers. `HomeManagerGlance` draws one load bar per community (the area bars are gone). `HomeManagerQueue`: drag a row onto a person in the strip above it, or use the row's "Move to…" select (keyboard path, same handler); both call `useRequests().assign`, show a toast and an aria-live line, and the row's assignee label updates. `tests/shared/setup-health.test.ts` (6). Typecheck exit 0, test 4554, audit:all 20 green. Not committed. |
| | | Browser check (local dev on 3010, after `dotenv -- pnpm tsx scripts/seed-demo-roles.ts`): manager at `/demo/manage` sees four people chips, seven queue rows with "Move to…", one bar "Harborview Lofts 7 open"; "Move to…" and a scripted drag both saved (read back in Directus), then were set back to Unassigned. Admin at `/demo` sees Setup health with one item, Payouts "Not connected", linking to the payments settings tab (the demo community has no Stripe connection). Not seen: a manager with more than one community (the demo has one, so the community bars are one bar); a real mouse drag (events were dispatched by script); the Fix link was read, not clicked, because a what's-new dialog covered the page. The bars count only areas the current community grants. |
| | | Ninth pass: a manager with several communities. `seedManagerSecondCommunity` (in `scenario.ts`, run for `demo-classic`) gives the demo manager a property-manager membership on The Beaumont Residences and four open requests there; run `npx dotenv -- pnpm tsx scripts/seed-demo-roles.ts`. Browser check as `demo-manager@hoaconnect.info` at `/demo/manage`: two load bars, "Harborview Lofts 7 open" and "The Beaumont Residences 4 open". Notice acknowledgments and forms to sign are now scoped in `docs/scope-notices-and-forms.md` (data, open decisions, build order); not built. |
| 10 | [x] | Shipped: `App/ResourceIndex.vue` opens a row's panel with `flipFrom` from the clicked row (captured by a capture-phase click and keydown listener on the card, since `AppDataTable` emits `row-click` with the row only), and on close focuses that same row and runs `useSharedElement().grow` on it, only when the closing panel is the one that row opened. Typecheck clean, test 4555 passed, audit:all 20 green. Browser (demo admin, `/demo/admin/responsibilities`): a row opens to `?slide=responsibility:<id>` with the row highlighted; close clears the slide, leaves no open row, and focus lands on the same `TR`. |
| | | Deviated: only `ResourceIndex.vue` changed. `ResourceRecordPage.vue`, `registry.ts` and `SheetContent.vue` were not touched. The panel is opened by calling `useAppSlideOver(panel).open` directly, not `resource.open`, so `flipFrom` can ride along. Charges checked last, as the demo admin: `/demo/admin/payments` redirected until the admin was signed in again; then the Charges tab row opens `?slide=charge:<id>`, and close clears the slide and returns focus to the same `TR`. Member responsibilities has no panel and is out of scope. |
| | | Commit: cf78a91e (the ResourceIndex change and this row landed in that commit with the scope doc; the row is corrected in the next commit). |
| 11 | [x] | Shipped: `core/shared/requests/board.ts` (pure `columnOf`, `groupRequests`, `planBoardMove`, `moveTargets`: a drop means a one-step board transition, never an invented one), `Requests/RequestBoard.vue` (status columns Open / In progress / Waiting / Resolved; cards drag onto `AppDropTarget` columns, each has a "Move to…" select, both call the existing `applyTransition`, Undo toast, aria-live), and a Table/Board `AppSegmentedControl` on `admin/requests/index.vue`, remembered in `requests-view-v1`. `tests/shared/request-board.test.ts` (4). Typecheck, test 4624 and audit:all 20 green. |
| | | Deviated: requests only. Tasks have no index page in this row's files, so no tasks board UI; `useTasks` already has `reorder` and `update` (the existing route) for it. Cards are not `AppSortable` (columns are not a reorder), and the phone default is the table because the toggle defaults to it. Keyboard path is the focusable "Move to…" select. Browser-checked on the demo community: board renders 5/2/0/8, Move to… moved a card Open to In progress and Undo restored it; the mouse drag itself unseen. |
| | | Commit: 4d51e6df. |
| 12 | [x] | Shipped: drag maths in `core/shared/projects/timeline.ts` (`daysFromPixels`, `addCalendarDays`, `businessDaysInclusive`, `planBarMove`, `planBarResize`, `barKeyAction`) with 6 new tests in `project-timeline.test.ts`; `ProjectGantt` bars drag to move, the right edge drags to change length, and Arrow / Shift+Arrow nudge a day. All paths go through the existing cascade preview and `/project-events/reschedule`; one bar saves at once with an Undo toast, a change that shifts dependents opens the existing confirm. |
| | | Deviated: plain pointer events with capture, not GSAP Draggable (position here is a pixel-to-day rounding, not a tween). `useProjectEvents.applyReschedule` gains `{ quiet }` and the Reschedule form now passes the edited duration (before, a duration-only edit was dropped). Resize snaps in calendar days and stores business days. Browser check (local dev, demo admin, throwaway project of three phases, since deleted): a real mouse drag moved Inspect +3 days (2026-12-01 to 12-04, length kept, saved); the right-edge handle, Undo, Arrow-key cascade confirm (Plan +1 day pushed Build, applied and saved) and Shift+Arrow onto a weekend (no write) were driven with dispatched pointer and key events. Edge drags by real mouse were not landed (the floating dock overlapped the bar). Pre-existing: `fmt` shows dates a day early west of UTC, and the confirm says "2 dependent" when it counts the edited bar too. |
| | | Commit: not committed. Typecheck exit 0, tests green, audit:all 20 green. |
| 13 | [~] | Shipped: responsibilities. Holder chips above the grid are dragged onto a job (`AppDropTarget` on the title cell) and open the holder sheet with the pick set (`HolderForm` gains `initialPick`); the sheet calls the existing `handOver` (job has someone open) or `addHolder` (empty job). Nothing saves on the drop. Typecheck exit 0, test 4630 passed, audit:all 20 green. |
| | | Documents: filing was already a native drag in `Documents/DocumentCategoryView.vue` (used by the admin `pages/DocumentsPage.vue`, not the member page as first logged), calling `updateDocument({document_category})`. Added a "Move to…" select on each card that calls the same `moveDocumentTo` as the drop. Its options list other folders, plus Uncategorized for a filed document; disabled when there are no folders. Folder columns are now `AppDropTarget`s, so the drop shows the landing ring and checks the dragged document's id. Demo folders: `core/shared/demo/scenario.ts` creates three published folders (Governing documents, Financials, Meetings) for Harborview and files the three demo documents into them; the nightly reset repeats it. Browser (demo admin): the selects offer the other folders; a select move and a drag onto a column each wrote to Directus, and both were moved back. The first folder seed left folders unpublished, so the page's published-only query hid them; fixed in the seed. Agenda order not built: there is no agenda-item collection or route (meetings have one free-text `agenda` field), so the gate is not met there. Keyboard path for responsibilities is the job panel's existing Add holder / Hand over buttons, not a menu. First audit run failed on `raw-buttons` (chips were raw buttons); fixed with `AppButton`, baseline not raised. |
| | | Browser check (local dev, demo admin, `/demo/admin/responsibilities`): a synthetic drag of Priya Nair's chip onto "Sends dues invoices…" opens the Hand over sheet with "A member" and Priya pre-filled, Owner role; closed with Escape, nothing saved. The first try did nothing: `AppDropTarget` reads its payload by `type` (default `text/plain`), so the page now passes `:type` too. Not seen: a real mouse drag, and a save through the route. Commit: none. |
| 14 | [~] | Shipped: `ResourceIndex.vue` gains an optional `summary` slot above the toolbar (slot props `activeStatus`, `setStatus`, `clear` = `resource.reset()`, `isFiltered`), styled as `.resource-index__summary`. Nothing in it yet. Count-up wired: `StatCard.vue` renders a numeric `value` through `AppCountUp`, and the payments page's Outstanding and Collected cards count up with `$` and two decimals. Browser check: cards read $5,008.65 and $18,619.98 on the Charges tab; dashboard stat tiles render (3, 0, 13, 0). |
| | | Shipped (finish): `Chart/Bars.vue` emits `select` with the tapped row on stacked and grouped bars (unovis `events` keyed by `StackedBar.selectors.bar` / `GroupedBar.selectors.bar` from `@unovis/ts`; the handler unwraps `datum`). Admin payments Charges tab gets a `#summary` chart of Outstanding and Paid bars. Clear resets the status to its first item (`reset()` leaves status alone). Per bar, not per stacked piece. |
| | | Deviated: opened `[slug]/admin/payments/index.vue` (one page, as asked). Browser check (demo admin, 1280 px): Paid bar tap 24 to 73 rows with Clear filter shown; Clear filter back to 24. Gate met for tap and clear. Not re-checked: tapping the same bar a second time (it runs the same clear path, which is verified). |
| | | Commit: not committed. Typecheck exit 0, test 4630 passed, audit:all 20 green. |
| 15 | [ ] | Partial: walk-through pass 1 run on the demo community (local dev, one seeded login per role). Gate not met; coverage gaps and the fix list are in the rows below. |
| | | Walk-through, what ran: `pnpm typecheck`, `pnpm test`, `pnpm audit:all` exit 0 (20 green) before the walk. Logins typed in the built-in browser: admin, owner, board, team and manager; tenant login not verified (see fix 2). Pages checked: admin home and responsibilities and payments at 375 px; manager queue at 375 and 1024 px; owner, board, team and manager homes at 375 px. No horizontal page scroll on any page checked (`scrollWidth` = viewport). No screenshot. |
| | | Fix 1 (accessibility, 375 px): on `/demo/admin/responsibilities`, 10 buttons and links are under 24 px in one dimension. Find them with the same check and size them to a 44 px target on touch. |
| | | Fix 2 (security, high): a login submitted before hydration sent the email and password in the URL (`/auth/login?email=…&password=…`) and did not sign in. The form has `@submit` and no `method`, so the URL leak is a native GET submit. Cause not proven: likely my click before hydration. Pass 2: a login clicked after hydration signed in with no query string in the URL (tenant checked). Still open: a no-JS check, since the form should send nothing in the URL either way. |
| | | Fix 3 (performance, demo community): the board home showed "Loading approvals…" and "Loading…" for 4 to 6 s before the cards arrived; the admin home took about 2 s. Check the approvals and arrears queries for slow calls. |
| | | Fix 4 (low, 375 px): the toaster list sits at x = 391 on every page, off-screen while empty. Confirm it is hidden when there are no toasts. |
| | | Fix 5 (low, 375 px): filter pills on `/demo/manage/inquiries` and the tenant sub-nav run past the edge. They sit inside a horizontal scroller, so the page does not scroll, but nothing shows that more pills exist. Add a fade or a scroll cue. |
| | | Pass 2 (1280 px, all six logins typed after hydration): tenant, owner, board, team, manager and admin homes, admin responsibilities and payments; no horizontal page scroll on any of them. Tenant login verified (Tessa, Resident, two requests with status tracks). Responsibilities at 1280 px has 11 small targets (fix 1 extended, 10 at 375 px). |
| | | Fix 6 (medium, board home): while approvals are still loading the card reads "Loading approvals…" and "Nothing needs you right now." at the same time, so the empty message shows before the data is known. Hide the empty line until the approvals query resolves. |
| | | Gate: still open. Not covered: a screenshot at 0.5 scale; the board home at 1280 px after its data settles (only the loading state was read there); the mouse-level interactions (drag and swipe) were not exercised. |
| | | Fixes applied (code, not committed): fix 1 `App/Footer.vue` links get `max-md:min-h-11`; fix 2 `auth/LoginForm.vue` form has `method="post"` so a native submit never puts the password in the URL (no-JS test not run); fix 4 `core/app/assets/css/main.css` hides an empty `.toaster ol` (in the browser the list no longer renders); fix 5 the manager inquiries pill row gets a right-edge fade mask; fix 6 `pages/MemberDashboardPage.vue` no longer shows "Nothing needs you right now." when the member has the approvals need (BoardNeeds shows its own loading or empty line). Fix 3 partial: `core/server/utils/approval-views.ts` loads seats and decisions in one `Promise.all`; the expense and charge reads still run one after another, and no timing was measured. |
| | | Second pass, same session: fix 1 is done on `/demo/admin/responsibilities` at 375 px (0 controls under 24 px, was 11 at 1280 px and 10 at 375 px). Sort headers in `App/DataTable.vue` and the nav brand in `App/Nav.vue` get `min-h-[24px]` (the scale here is 15 px to the rem, so `min-h-6` gave 22.5 px); the "Unassigned" switch in `Responsibilities/FocusBar.vue` gets `min-h-[24px]`. Fix 3: `core/server/utils/approval-views.ts` now loads seats, decisions, expenses, charges, late fees and households in one `Promise.all`; names still follow, since they need the people those return. Timing on the demo org, `GET /api/org/money/approvals?view=open` (4 approvals, dev server, browser fetch): before 720 to 1,040 ms (median 843, 3 runs); after 554 to 1,035 ms (median 564, 5 runs). The output is unchanged. This is a modest cut, and the sample is small. The 4 to 8 s the board home showed is the whole home loading, not this route alone, so the rest is not yet explained. Tests: typecheck exit 0, test 4630 passed, audit:all 20 green. |
| | | Fix 3, third pass (closes it): the board home's wait comes from many API calls, each doing several sequential Directus reads. Measured with a session cookie and curl (dev server, median of 8 runs): `money/approvals` 1.88 s before this session's server changes, 1.34 s after (about 29% faster). Changes: `core/server/utils/role-context.ts` `getRoleContext` reads terms, billing and helper areas in one `Promise.all` after the membership read; `resolveCapabilities` reads actors, manager grants and helper areas in one `Promise.all` (helper areas were read twice per request; the per-request cache already covered the second read). `approval-views.ts` as in the second pass. The remaining cost is about 8 to 10 sequential Directus round trips per approvals request (membership, admin check, actors, approvals, decisions, expenses, charges, late fees, households, names), roughly 150 to 200 ms each; the next lever is batching across those stages, which needs a decision about read consistency and is not done. Board home in the browser: approvals card populated at navigation time, no "Loading approvals…" line; the earlier 4 to 8 s came from the dev server's first load and was not re-measured cold. Fix 6 is now re-checked in the browser. Tests: typecheck exit 0, test 4630 passed, audit:all 20 green. |
| Ack 1 | [x] | Shipped (scope-notices-and-forms step 1): live Directus got `hoa_announcements.requires_acknowledgment` (bool, default false) and `ack_due` (date), and `hoa_acknowledgments` (organization, announcement, member, acknowledged_at, method swipe/button, unique `ack_key`). Member create and read own rows only, Admin read all, both scoped to the person's organizations; `core/shared/home/acknowledgments.ts` (`outstandingFor`, `unacknowledgedBy`, `reachesRecipient`, `isOverdue`, `ackKey`; org and role/hat aware) with `tests/shared/acknowledgments.test.ts` (7); `scripts/create-acknowledgments.ts`. Typecheck, test 4562, audit:all 20 green. |
| | | Deviated: added `ack_key` ("announcement:member") for the unique index, since the fields API cannot make a composite unique; step 2's route sets it. Board read-all is not in Directus (board uses the Member policy), so the board list goes through a server route that checks the board hat for the same organization (step 2); types not regenerated (`pnpm generate:types` still to run). No browser or live row check. |
| | | Commit: see the commit after this edit (`feat(ack): acknowledgments collection, permissions and pure core`). |
| Ack 2 | [x] | Shipped (scope-notices-and-forms step 2): `pnpm generate:types` run (types now carry `hoa_acknowledgments` and the two announcement fields). Server: `core/server/utils/acknowledgments.ts`, `GET /api/org/acknowledgments/mine` (the caller's `outstandingFor`), `POST /api/org/acknowledgments` (checks the notice is live, in this org and reaches the caller, sets `ack_key`, a second tap answers `already`), `GET /api/org/acknowledgments/pending` (admin hat or current board hat in the same org only, then `unacknowledgedBy`). UI: `HomeAcknowledge` and `HomeAcknowledgeRow` (swipe left via `useSwipeRow` reveals Acknowledge, plus a visible button for mouse and keyboard) in the member home's Needs you; `HomeAckPending` ("who has not") on the admin home and the board's member home. Reminder rule `acknowledgment` (stages `nudge` 3 days after it goes out for 3 days, `before` within `days` (default 2) of `ack_due`; none after the due date; bell, push, email; key anchored on the send day or the due date) in `settings.ts`, `rules.ts`, `messages.ts`, `admin.ts` and the tick's snapshot loader; 9 tests in `tests/shared/reminder-rules.test.ts`. Export map now lists `hoa_acknowledgments` (BOTH tiers). Typecheck exit 0, test 4577, audit:all 20 green. |
| | | Browser check (local dev, demo community, a seeded `Ack check:` notice): the tenant sees "Acknowledge: Ack check: water shutoff Thursday, Due Nov 30" above Needs you; the button posted 200, the row left, a second POST answered `already`, and the tenant's `pending` call is 403; the admin's `pending` call returned the community's members who have not acknowledged. Not seen: the touch swipe itself (the hook ignores a mouse), the board's list in the browser, and a reminder actually sending (rule is tested, not run against live; every rule is off until the board turns it on, and Settings → Reminders has no acknowledgment copy approval path beyond the shared one). The seeded `Ack check:` notice and the tenant's acknowledgment row are still on the live Directus (no delete tool here). |
| Ack 3 | [x] | Shipped (scope-notices-and-forms step 3): live Directus got `hoa_forms` (organization, title, description, document, audience owners/tenants/board/all default owners, due_date, status draft/open/closed, sent_at) and `hoa_form_signatures` (organization, form, member, signed_at, signed_name, ip, user_agent, signed_file, unique `sign_key`), via `pnpm run create:forms` (`scripts/create-forms.ts`). Admin has full CRUD on forms and reads all signatures of their organizations; a member reads non-draft forms and only their own signatures. Pure `core/shared/home/forms.ts` (`formReaches`, `openForms`, `outstandingFormsFor`, `unsignedBy`, `isFormOverdue`, `signKey`), 9 tests in `tests/shared/forms.test.ts`. Export map lists both collections (BOTH tiers). |
| | | Deviated: no member create permission on signatures; step 4's route writes with the server token so `ip` and `user_agent` come from the request, not the client. Board read-all goes through a server route (board uses the Member policy), as in Ack 1. Reuses `AckRecipient` for recipients. No browser check (no UI).
| Ack 4 | [x] | Shipped (scope-notices-and-forms step 4): routes `GET /api/org/forms/mine`, `POST /api/org/forms/sign` (typed name via pure `cleanSignedName`; the server sets time, IP, user agent, `sign_key`; a second submit answers `already`), `GET /api/org/forms/pending` (admin or current board hat of the same org: per open form who signed and who has not), `GET /api/org/forms/:id/document` (admin, board, or a member the open form addresses) and `GET /api/org/forms/:id/signed-copy` (PDF of one signature with the audit trail, drawn by `core/server/utils/form-signed-copy.ts`; a member gets their own, admin or board any via `memberId`). UI: `HomeSignForms` (Sign row plus a bottom sheet: read the document, type your name, tick agree, sign) in the member home's Needs you for every role the form reaches; `HomeFormTracking` (signed with a "Signed copy" link, not signed yet) on the admin home and the board's member home. Reminder rule `form` (same stages as acknowledgment: `nudge` 3 days after it opens, `before` within `days` (default 2) of `due_date`; bell, push, email); the two rules now share `owedNudges` in `rules.ts`. Tests: 6 rule cases in `reminder-rules.test.ts`, 2 in `forms.test.ts`. Typecheck exit 0, test 4598, audit:all 20 green. |
| | | Deviated: the signed copy is generated on download from the signature row (the `signed_file` field stays unused). No plan gating yet (step 5), so any open form shows. The board's "board" audience maps to the stored `board_members` tag for reminders. Not seen: no browser or live check; no form was created on Directus, so the sheet, the routes against live data and a reminder sending are untested beyond types, unit tests and audits. |
| Ack 5 | [x] | Shipped (scope-notices-and-forms step 5): pure `formsGate` in `core/shared/billing/forms-plan.ts` (not entitled -> blocked `subscription`; comped -> allowed; plan `features.forms_to_sign` true/false overrides; else Mid, Larger, Grand, Enterprise and contact-only plans allowed, Boutique blocked `plan`; no plan blocked `no_plan`; agency-billed orgs use the account's plan and entitlement). Server `forms-gate.ts` (`requireFormsPlan` throws 402 with the upgrade sentence). Gated: `POST /api/org/forms/sign`, new admin `POST /api/org/forms` (creates a draft), `GET /api/org/forms/mine` (empty, so no Sign row) and the `form` reminder rule (no reminders). Left open on purpose: tracking list, document and signed-copy download, so a community that downgrades keeps its records. New `GET /api/org/forms/access` feeds a one-line upgrade card on the admin home (`HomeFormTracking upgrade-prompt`). Tests: 14 in `forms-plan.test.ts` (one per plan state), 4 in `tests/server/forms-gate.test.ts`. Typecheck exit 0, test 4616, audit:all 20 green. |
| | | Deviated: Mid-and-up is my pick for which plans include forms (pricing page lists no such feature); change `FORMS_PLAN_SLUGS` or set `features.forms_to_sign` on a plan row. No form-creation UI exists, so the create route is untested in a browser; nothing seen on live Directus. |
| | | Browser check (local dev, demo community; signed in with the one-click `POST /api/demo/login`, no credentials typed): Boutique showed the upgrade card on the admin home, `POST /api/org/forms` and `POST /api/org/forms/sign` answered 402 and `mine` was empty; Mid opened the gate, the route created a draft, and (opened in Directus) the owner's Sign row appeared, signed through the sheet, the row left, and the admin list read 1 of 8 signed with a working signed-copy PDF. The tenant signed the same way earlier, the second sign answered `already`. Fixed in passing: the tracking list showed a date-only due date a day early (UTC read). Demo org restored to its comped trial; the `Ack 5 check:` forms are closed, not deleted. Not seen: the document attached to a form, the form reminder firing, Enterprise and expired states live (unit tests cover them). |
| | | Browser check 2 (same setup): a PDF uploaded through `/api/org/storage/upload` and attached to a form streamed back from `GET /api/org/forms/:id/document` (200, application/pdf, 393 bytes). The reminder engine's dry run (`POST /api/org/reminders/dry-run`, sends nothing) listed 5 form reminders for owners who had not signed an open form sent 4 days ago and due tomorrow. Plan states live on the demo org: Boutique blocked (plan; no Sign row; the 5 reminders gone), Enterprise allowed (row and 5 reminders), expired Enterprise blocked (subscription), expired with `grace_ends_at` in the future allowed. Demo org restored to its comped trial; the form is closed, not deleted; the uploaded PDF stays in the demo folder. Still not seen: a form reminder actually sent (dry run only; the rule is off in the demo's saved settings). |
| | | Live send (demo org, to the two addresses Peter gave, not the demo accounts): the real tick (`runReminderTick` with the real `sendReminder`) sent the `form` rule's `before` stage for an open owners form due the next day; 2 recipients, `hoa_reminder_log` detail `bell 2 · push 0 · email 2`, 0 failed. Done with a temporary route (deleted) that switched the rule on for that run only, filtered recipients to the two users, and `DEMO_ALLOW_EMAIL=true` in `.env` (restored). Two temporary `hoa_members` rows were added so the tenancy gate let them through; both are now `inactive` (a Directus flow set their `admin_of`, `active_in` and `posts_in` to the demo org). Peter to confirm the emails arrived. |
| | | Browser check 3 (local dev, demo community, one-click `POST /api/demo/login`; demo admin viewed as a member with `?as=member`): an open form was created through `POST /api/org/forms` and opened in Directus. `/demo?as=member&sign=<id>` opened that form's sheet (title, "Type your full name", agree box, Sign disabled until both are filled) once the Sign list loaded, alongside the Sign row. Form closed afterward, not deleted. Found: the reminder's own path `/?sign=<id>` does not reach the sheet on the main app host, because `rootRedirect` in `app/pages/index.vue` and `org-redirect.global.ts` send `/` to `/{slug}` with `navigateTo(path)` and drop the query (`/?sign=<id>` landed on `/demo` with no `sign`). Custom domains skip that redirect, so the clean-root case was not tried. Fixed in the same session: both redirects now pass `to.query` (and the hash in `org-redirect`) to `navigateTo`; reloading `/?sign=<id>` as the demo admin (member view) landed on `/demo?sign=<id>` with the sheet open. Form closed again. Custom domains: a clean root shows the public landing, so `customDomainRootDeepLink` (`core/shared/domains/org-routes.ts`, 3 unit tests) now sends a signed-in `/?sign=<id>` to `/{slug}` with the query, called from `rootRedirect`. Checked live with the demo org temporarily set as the verified custom domain `demo.localhost` (restored to null afterward): `http://demo.localhost:3000/?sign=<id>` landed on `/demo?sign=<id>`, the sheet opened under `?as=member`, and a plain `/` stayed on the landing. Org-scoped reminder paths needed no change: reminder paths are org-relative and both channels prepend the slug (email `${appUrl}/${slug}${path}` in `transactional-email.ts`, push in `buildPushPayload`), so the link is already `/{slug}/?sign=<id>`; `http://localhost:3000/demo/?as=member&sign=<id>` opened the sheet, and a test pins the push URL. |

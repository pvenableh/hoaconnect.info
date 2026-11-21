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
| **Tenant** | Notices to acknowledge · my open requests | `StatusTrack` per request · next building event | New request sheet · swipe to acknowledge |
| **Owner** | Balance due with Pay · open votes · forms to sign | `Ring` paid this year · balance `Sparkline` · next meeting | Pay sheet · vote in the card · RSVP |
| **Board member** | Approvals waiting (with who has signed) · votes | `Ring` signatures per approval · arrears `Meter` · collections trend · contract dates `Heatstrip` | Approve or decline in the card · open the record over the home |
| **Team / committee member** | My tasks · items in my area's queue | Team progress `Ring` · this week's schedule strip | Drag a task across the board · check off in place |
| **Property manager** | Queue across delegated areas, oldest first | Per-community load bars · response time `Sparkline` | Reassign by drag · reply from the row |
| **Admin** | Setup health · overdue across the community | Today's dashboard widgets, reorderable | Drag widgets · drag dock apps · everything above |

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
| 8–15 | [ ] | — |

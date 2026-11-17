# Role-first UX — Session 9 (Phase 2c, the responsibilities map)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. This is the first screen in the programme that is not the resource scaffold: a bespoke layout with motion, a time slider and keyboard and screen-reader behaviour that has to be right the first time. Its pure core (who holds what on a day, what changed between two days) is the part to get exactly correct, and the phase table in the plan names Opus for it. Census and grep go to Haiku 5.5 subagents.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s9-responsibilities-map.md and carry out the prompt in its code block exactly: Phase 2c (responsibilities map) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build Phase 2c, the Map mode of the responsibilities register (plan §3.4,
decision 15). It adds no schema and no route: it draws what the register
already returns, in a second mode beside the grid.

Read, in this order: docs/spec-responsibilities.md (the contract, "The pages"
and "Hook points"), docs/ux-standards.md, and in docs/plan-role-first-ux.md
only §2.4, §3.4 (all of it: "Map view", "History: end, don't erase") and §7
with the Session 7 log. Do not read the rest of the plan.

What exists (do not rebuild):
- The grid: app/pages/[slug]/admin/responsibilities/index.vue, an
  AppResourceIndex marked data-register-view="grid", with a comment where the
  Map joins it. Its rows come from GET /api/org/responsibilities?asOf= through
  useResponsibilitiesResource (core/app/composables/): RegisterRow has
  `holders` (who holds it on the as-of day), `assignees` (every holder row
  ever, with start and end dates and, once ended, the frozen name) and, on an
  office row, `people` (who holds the office that day, empty = vacant) and
  `terms` (every term of the office inside the row, clipped to it). That is
  enough to resolve any day inside a row WITHOUT another request: the slider
  must not fetch per step. The shared `asOf` and setAsOf() are already the
  page's one as-of day.
- The owner view: app/pages/[slug]/responsibilities/index.vue on GET
  published: today only; `who` carries kind, name, role and, for an office,
  the people's names; a job nobody holds appears only when the community chose
  to show unassigned jobs, as { id, title, category, unassignedSince }.
- core/shared/responsibilities/: holders.ts (holdsOn, holdersAsOf,
  officeHolderAsOf, officeTermsWithin), views.ts, register-view.ts
  (holderOptions, matchesHolder, publishedHolder, REGISTER_GROUPS), config.ts.
- The panel for one job (?slide=responsibility:id), ResponsibilitiesHolderChips,
  AppSegmentedControl, useTabQuery, useFlipList, useHaptic, core/shared/motion,
  the glass classes in core/app/assets/css (glass-bar, glass-surface,
  glass-edge) and ios-card for solid content.

Decided in §3.4 (do not reopen):
- Not a node-and-line graph: about 45 jobs and a dozen holders tangle, and it
  fails on a phone.
- Holders on one side (offices with the person for the day, members, vendors,
  teams, labels, each with a job count); jobs on the other, in their five
  categories. Pick a holder: their jobs light up and the rest dim. Pick a job:
  its owner, backup and oversight holders light up.
- "As of" is a slider. Crossing a hand-over or an election animates the job
  from one holder to the next.
- Unassigned jobs and vacant offices sit in their own group in the attention
  colour.
- §2.4: job cards are solid content; the holder rail, the slider and the detail
  sheet are glass; no glass on glass. Motion uses Vue transitions and honours
  prefers-reduced-motion. On a phone the two sides stack and the rail scrolls
  sideways.
- Owners get the present day only, with no slider.
- Read-only. Hand over, assign and edit stay in the panel; the map opens the
  panel for a job instead of growing a second detail sheet.

Build, one commit each, gated as below:

1. The pure core, core/shared/responsibilities/map.ts, with table tests:
   - mapModel(rows, day): the holders (key, label, kind, job count, people for
     an office, vacant) and the jobs by category with their holders and roles;
     unassigned jobs and vacant offices as their own group; retired jobs out.
   - holdersOnDay(row, day): who holds a job on any day, from `assignees` and
     `terms` alone. A differential test: for several jobs and days, it equals
     `holders` from registerRows (views.ts) built for that same day, including
     an office row with a resignation inside it and a vacant gap.
   - lit(model, selection): the job ids lit for a picked holder; the holders lit
     for a picked job, by role.
   - changeDays(rows): the sorted days anything changes (a row starts, the day
     after one ends, a term starts or ends): the slider's snap points.
   - changedJobs(modelA, modelB): which jobs changed holder between two days,
     for the animation and for "3 jobs changed holder".
2. Map mode on /admin/responsibilities: a Grid | Map AppSegmentedControl
   (`?view=map`, kept in the URL as the Board tab keeps `?tab=`), for everyone
   who can read the register. The slider and the date field are the same
   state: dragging sets asOf without refetching, a typed date outside the
   loaded range refetches once. Snap to changeDays. Crossing a change animates
   the affected jobs' chips from the old holder to the new, with FLIP or a
   TransitionGroup; with prefers-reduced-motion the change is instant and
   announced. Phone: sides stack, the rail scrolls sideways, targets at least
   44 px, nothing hover-only. Keyboard: the rail is a radio group or listbox,
   the slider is a native range with aria-valuetext "As of 12 October 2026",
   and a polite live region says what changed.
3. The owner map: /{slug}/responsibilities gets the same Grid | Map for the
   present day, no slider, built only from GET published through the same
   mapModel (publishedHolder gives it the shape). It must be impossible for the
   map to show what the route did not send: no history, no basis, no names of
   who was asked. Unassigned jobs appear only if the route returned them.

Rules: a role never sees a control it cannot use; the hat never grants access;
no schema, no new route (if you find you need one, stop and ask me); a stored
value is never one that can be derived.

Out of scope: editing from the map (drag to reassign), the director survey and
diff, the monthly review, the home tile (Phase 11), a node-and-line view.

Learned the hard way in Session 7:
- The local dev server talks to the LIVE Directus (DIRECTUS_URL in .env is
  admin.hoaconnect.info). Never write test data in 1033 Lenox. Sign in to the
  sandbox demo community with POST /api/demo/login (slug `demo`, is_demo, an
  admin there) and apply the Florida list from the register to have rows. Clean
  up with a script that checks `is_demo`, and ask before any bulk delete.
- Leaving the admin's "Member" preview on redirects admin routes to member
  pages until you press Exit.
- The scratchpad can be cleared overnight. Keep scripts you need again out of it.
- /ui-kit cannot be opened in the preview (a signed-in user is bounced); add a
  demo anyway, and say it was not seen.
- pnpm audit:all reads tracked files: `git add -N` new files before the gate.
- Roles you can reach in the browser are the demo admin and whatever test
  accounts Peter signs in on the preview pane; say which roles you could not see.

Local session: work on main, ask before pushing. Run `eval "$(/opt/homebrew/bin/fnm env)"`
in a tool shell only if node is not on PATH (it usually is). Verify in the
browser preview at 375, 768 and 1280 px, in light and dark, and with reduced
motion emulated.

Rules, token rules and the quality gate are the earlier briefs': per commit,
typecheck 0, vitest green, build green (serially), pnpm audit:all at or under
baseline, lint under the warning cap. Run the typecheck and the build with
NODE_OPTIONS=--max-old-space-size=6144. Never raise an audit baseline.

When done: update the §7 Status row for Session 9, append to the Session log
(shipped, what each role now sees, deviations, operator TODOs), and add the Map
to docs/spec-responsibilities.md "The pages". End your reply with the "Start it
with" sentence of the next queued session's prompt (Session 4's,
docs/prompts/role-first-s4-money-approvals.md, unless §7 says otherwise), in a
code block. Then stop.
```

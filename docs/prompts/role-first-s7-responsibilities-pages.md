# Role-first UX — Session 7 (Phase 2b, responsibilities register, part 2: the pages)

Model: Sonnet 5.5 (`claude-sonnet-5-5`), high effort. Census and grep go to Haiku 5.5 subagents. The data model, routes and gates shipped in Session 6; this session builds only pages, the scaffold's grouping and nav entries on top of them.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s7-responsibilities-pages.md and carry out the prompt in its code block exactly: Phase 2b part 2 (responsibilities register: Board tab, admin register, owner view, service history) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build the second half of Phase 2b, the responsibilities register's pages.
The brief is the code block in docs/prompts/responsibilities-register.md:
read all of it. Do its commits 6 to 9 here: the Board tab, the admin
register, the owner view and service history. Commits 1 to 5 shipped in
Session 6.

Read, in this order: docs/spec-responsibilities.md (the contract: every
route, who may call it, what it returns, the names Session 7 must use),
docs/spec-resource-scaffold.md, docs/ux-standards.md, and in
docs/plan-role-first-ux.md only §2.3, §3.4 with "History: end, don't
erase", and §7 with the Session 6 log. Do not read the rest of the plan.

The schema script and setup:permissions ran on 2026-11-15 and the types
are committed (core/types/directus.ts has hoa_responsibilities), so the
routes answer against the live instance. Every community's register is
empty and unpublished: apply the Florida condominium list in a test
community to see the pages with rows, never in 1033 Lenox without asking
me.

What Session 6 left you (do not rebuild, do not change a route's shape
without a reason in the log):
- Routes under core/server/api/org/responsibilities/: GET index?asOf=
  (editors and board; { asOf, responsibilities, visibility, viewer }),
  GET published (owners; { published, responsibilities }), POST create,
  PATCH [id], POST [id]/retire, POST [id]/assignees, POST
  [id]/hand-over, PATCH assignees/[id], POST apply-template, PATCH
  visibility (admin only), GET export.pdf?asOf=, GET
  service-history?member=. Under core/server/api/org/board-terms/: POST
  (add a term), POST [id]/end, POST [id]/change-office, PATCH [id],
  DELETE [id]. Board terms are written only through these routes: the
  HOA Admin policy has no create or update on hoa_board_members.
- Response shapes: RegisterRow, HolderView, PublishedRow in
  core/shared/responsibilities/views.ts; ServiceHistory in history.ts.
  Labels, categories, cadences, offices, the seed list: config.ts. The
  forms check with the same zod bodies the routes use: schemas.ts.
- useResource (core/app/composables/useResource.ts), AppResourceIndex
  (app/components/App/ResourceIndex.vue), AppResourceRecordPage, the panel
  registry (app/components/panels/registry.ts). Charges is the worked
  example: core/app/composables/useChargesResource.ts,
  app/components/panels/ChargePanel.vue, app/pages/[slug]/admin/payments/index.vue.
- Names fixed by the spec: panel type `responsibility`, resource key
  `responsibilities`, index /admin/responsibilities, record route
  /admin/responsibilities/:id, owner view /responsibilities.

Build, one commit each, gated as below:

6. Board tab (app/components/pages/MembersPage.vue): replace
   updateBoardTerm and removeBoardTerm with the term routes. Row actions
   End term · Change office · Correct, each a form in AppBottomSheet.
   Delete in the overflow, behind useConfirm saying it is for a term
   entered by mistake; show the route's 409 message as it comes. An
   "As of" DateInput that filters the list. Create stays as it is. Then
   take update and delete on hoa_board_members away from the HOA Admin
   policy in scripts/setup-directus-permissions.ts (an operator TODO to
   apply), and run pnpm setup:permissions:audit before and after.
7. Admin register. First add grouped rows with sticky headers to
   AppResourceIndex itself (a `group` function and group labels), with a
   /ui-kit demo, so every grouped index gets them. Then the register on
   the scaffold, exactly as the brief's commit 7 says, reading GET index
   through def.load. Holder chips from HolderView. Header actions per
   the brief; the Visibility menu only when viewer.isAdmin; New job,
   hand-over and the template only when viewer.canEdit (a role never sees
   a control it cannot use). The confirm for "Show unassigned jobs to
   owners" counts the published, member_visible, non-retired rows with no
   holder today. Export PDF links to GET export.pdf with the as-of date.
   Leave room for a Map mode beside the grid; do not build it.
   Nav: the register needs `responsibilities:read` (board seats, admins)
   or the `responsibilities` area, plus the module. NavNeed entries are
   ANDed, so it takes either two entries (an admin/board pill and a
   manager-area entry) or an any-of need; choose, and say why in the log.
   Then remove `responsibilities` from WAITS in
   tests/shared/nav-registry.test.ts. Add `responsibilities` to ModuleKey
   and the Settings → Modules list.
8. Owner view at /{slug}/responsibilities on GET published, its own
   registry entry, as the brief's commit 8 says.
9. Service history on the member detail from GET service-history: offices
   held and jobs held, with dates, for editors and the board only.

Local session: work on main, ask before pushing. Tool shells may have no
node/pnpm: run `eval "$(/usr/local/bin/fnm env)"` in every one when fnm
is at that path (on this machine node is usually on PATH already).
Verify each page in the browser preview on a login per role you can reach,
and say which you could not.

Rules, token rules and the quality gate are the brief's: per commit,
typecheck 0, vitest green, build green (serially), pnpm audit:all at or
under baseline, lint under the warning cap. Run the typecheck and the
build with NODE_OPTIONS=--max-old-space-size=6144. Never raise an audit
baseline.

When done: update the §7 Status row for Session 7, append to the Session
log (shipped, what each role now sees, deviations, operator TODOs). End
your reply with the "Start it with" sentence of the next queued session's
prompt (Session 4's, docs/prompts/role-first-s4-money-approvals.md,
unless §7 says otherwise), in a code block. Then stop.
```

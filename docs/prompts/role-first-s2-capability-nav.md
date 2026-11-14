# Role-first UX — Session 2 (Phase 1b: capability nav)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. The registry and the four surfaces that read it are design work. Census and grep go to Haiku 5.5 subagents.

```
Continue the role-first UX programme with Phase 1b (capability nav). Read
docs/spec-role-context.md first (all of it), then in
docs/plan-role-first-ux.md only §1, §2.1, §2.2, the Phase 1b row of §4, and
§7 with its Session log. Do not read the rest and do not re-survey Earnest.

This session = Phase 1b ONLY: one app registry; the dock, App Library,
section pills and route middleware read it; the manager entry on desktop; the
hat badge; login routing. No invoices, vendors, work model or glass changes.
Local session: work on main, ask before pushing. Tool shells may have no
node/pnpm: run `eval "$(/usr/local/bin/fnm env)"` in every one when fnm is
at that path.

What Session 1 left you (do not rebuild it):
- RoleContext per membership: residency, hats (board, manager, admin),
  areas (canWork, isNotified), isAccountOwner, managerTitle, source.
  Pure resolver: core/shared/roles/role-context.ts.
- One area list: AREAS in core/shared/transition/grants.ts (11 areas; 9
  grantable; vendors and billing notify-only until they have gates).
- GET /api/org/role-context and useRoleContext(), which also carry actors
  and capabilities. useCapabilities already reads them.
- useCurrentDomainAccess resolves the cached membership with the same
  resolver and keeps four client-only compat rules (spec, "Client").
- scripts/add-manager-hat.ts: written, maybe not run. Everything you build
  must work with source "legacy" (no manager fields) as well as "hat".

Read before designing, and only these:
- core/app/composables/useDockApps.ts, useCreateVerbs.ts
- app/components/App/Nav.vue, SubNav.vue, Spotlight.vue
- core/app/middleware/manager.ts, admin.ts, admin-or-board.ts
- the organization switcher, for the badge (find it with a Haiku grep;
  it is not Org/ViewSwitcher.vue, which is the admin "View as" switcher)
- the login redirect (find it with a Haiku grep for the post-login
  navigateTo)

Build, in this order, one commit each:
1. docs/spec-capability-nav.md, under 120 lines: the registry entry shape
   (id, label, path, icon, needs: capability | area | admin | residency),
   every entry today's dock and pills show, and which RoleContext field
   gates each. Stop and ask me if it contradicts §2.2.
2. The registry in core/shared, the only source of nav entries. A test
   that every entry's gate matches the middleware on its route.
3. The dock, App Library, section pills and Spotlight read it, replacing
   appsFor(isAdmin). Board members gain Money and Approvals because they
   hold the capability. A manager's dock shows their canWork areas.
4. The manager entry on desktop, and the hat badge with managerTitle in
   the org switcher.
5. Login routing: a manager (hat) whose home is the queue lands on
   /[slug]/manage; everyone else as today.
6. Retire the client compat rules in useCurrentDomainAccess. Load the
   server context in the middleware that needs it, or fetch is_manager with
   the membership. Decide whether isPropertyManagerOfCurrentDomain becomes
   "has any canWork area". Log every change in what a user sees.

Rules: a role never sees a control it cannot use. The hat never grants
access; access comes only from admin or an area's work switch. No grant
without a gate: an area with no page or route stays out of the dock.
projects, activity and feedback have server gates but no manager pages.
Give each one an entry, or say in the log why it waits.
Phase 2b (plan §3.4) will add a `responsibilities` area and two nav entries,
an admin register and an owner view gated by a community publish switch, so
the registry entry shape must allow a gate that combines an area, a module
toggle and an org-level flag; build none of it in this session.

Token rules: subagents on Haiku 5.5 for census/grep; review diffs, not
files. Gates run in the background; read only the tail. Typecheck with
NODE_OPTIONS=--max-old-space-size=6144.

Quality gate, per commit: typecheck 0, vitest green, build green (serially),
`pnpm audit:all` at or under baseline, lint under the warning cap.
Unlike Session 1, user-visible nav changes are the point here. Each one is
named in the log, and every existing test passes or its change is
explained.

When done: update the §7 Status row, append to the Session log (shipped,
deviations, operator TODOs), write the Session 3 prompt with its model,
and stop.
```

# Role-first UX — Session 3 (Phase 2: resource scaffold)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. The scaffold and its ratchets are design work. Census and grep go to Haiku 5.5 subagents.

```
Continue the role-first UX programme with Phase 2 (resource scaffold). Read
docs/spec-capability-nav.md first (all of it), then in
docs/plan-role-first-ux.md only §2.3, the Phase 2 row of §4 and the
paragraph under the table, and §7 with its Session log. Do not read the
rest and do not re-survey Earnest.

This session = Phase 2 ONLY: AppResourceIndex, useResource, the panel
registry entries, the three audits as ratchets, and Charges converted as
the proof. No invoices, vendors, work model or glass changes. Local session:
work on main, ask before pushing. Tool shells may have no node/pnpm: run
`eval "$(/usr/local/bin/fnm env)"` in every one when fnm is at that path.

Time matters: Phase 2b (responsibilities register) builds its index on this
scaffold, and the 1033 Lenox board is seated 2026-12-09. If the scaffold
cannot land in one session, say so early in the log so 2b can build on
AppDataTable directly (plan §4).

What Sessions 1 and 2 left you (do not rebuild them):
- RoleContext per membership (docs/spec-role-context.md), served by
  GET /api/org/role-context and useRoleContext(); useCurrentDomainAccess
  prefers it once loaded for the org on screen.
- One nav registry, core/shared/nav/registry.ts: every dock slot, pill and
  route gate, with `needs` (admin, capability, area, residency, module,
  orgFlag) and layouts per role. useNavContext() builds the context. A new
  page that is a nav destination gets an entry there, and
  tests/shared/nav-registry.test.ts checks its middleware.
- Charges live on /admin/payments. It is open to holders of money:read
  (every board seat, decision 16) read-only through `nav-gate`, and its
  write controls hide behind `canWrite` (admin). The converted page must
  keep that: a role never sees a control it cannot use.
- Org-wide charges, schedules and expenses are read only through
  /api/org/money/* and /api/org/expenses (`requireMoneyRead`). The HOA
  Member policy reads only a member's own rows in Directus. The scaffold
  reads through those routes and must not widen either read.

Read before designing, and only these:
- app/pages/[slug]/admin/payments/index.vue and the components it mounts
- app/components/App/DataTable.vue, App/SlideOverShell.vue,
  App/SlideOverStack.vue, App/EmptyState.vue
- scripts/audit-all.ts and two existing audits as the pattern for the
  three new ratchets (pick ones with a baseline, e.g. audit-raw-buttons.ts
  and audit-empty-states.ts)

Build, in this order, one commit each:
1. docs/spec-resource-scaffold.md, under 120 lines: the AppResourceIndex
   props and slots, useResource's shape (list, filters, selection, the
   open panel), the panel registry entry shape, and the three audits with
   their baselines. Stop and ask me if it contradicts §2.3.
2. useResource and the panel registry, with tests.
3. AppResourceIndex, rendered once in /ui-kit.
4. Charges converted onto it, with no change a user sees except what §2.3
   names. Read-only Money for money:read holders still holds.
5. The three audits as ratchets at today's counts, wired into audit:all.

Token rules: subagents on Haiku 5.5 for census/grep; review diffs, not
files. Gates run in the background; read only the tail. Typecheck with
NODE_OPTIONS=--max-old-space-size=6144.

Quality gate, per commit: typecheck 0, vitest green, build green (serially),
`pnpm audit:all` at or under baseline, lint under the warning cap. Every
existing test passes or its change is explained in the log.

When done: update the §7 Status row, append to the Session log (shipped,
deviations, operator TODOs), write the Session 4 prompt with its model,
and stop.
```

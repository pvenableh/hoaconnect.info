# Role-first UX — Session 1 (Phase 1a: role context)

Model: Opus 5.5 (`claude-opus-5-5`), high effort.

```
Start the role-first UX programme. Read docs/plan-role-first-ux.md first —
only §0, §1, §2.1, §2.2, §6 and §7. Do not read the rest and do not
re-survey Earnest; this phase takes nothing from it.

This session = Phase 1a (role context) ONLY. No navigation, dock, badge or
page changes — those are Session 2. Local session: work on main, ask before
pushing. Tool shells have no node/pnpm: run `eval "$(/usr/local/bin/fnm env)"`
in every one.

Goal: one server-resolved RoleContext per membership that the whole app can
ask, replacing the scattered checks. Shape: residency (owner | tenant |
none), hats (board, manager, admin — additive), areas (per area: canWork,
isNotified), isAccountOwner, managerTitle.

Read before designing, and only these:
- core/shared/permissions.ts (capability matrix, board offices)
- core/shared/transition/grants.ts (the 10 grant keys and presets)
- core/app/composables/useCurrentDomainAccess.ts, useCapabilities.ts,
  useRoles.ts
- core/app/middleware/manager.ts and admin.ts
- core/server/utils/manager-access.ts, admin-auth.ts, board-access.ts
- the HoaMember, HoaVendor, BillingAccount and BillingAccountMember types in
  core/types/directus.ts

Build, in this order, one commit each:
1. docs/spec-role-context.md — under 150 lines: the shape, where each field
   comes from, the area list, the fallback when no manager is notified for
   an area, and the named tests. Confirm or correct the plan's "(verify)" on
   how a vendor record links to a manager's user. Stop and ask me if the
   spec contradicts §2.1.
2. One area list in core/shared (extending grants.ts, not beside it) that
   holds every area key with its label, and is the only source for server
   and client. Add `vendors` and `billing`. Delete the client's private copy
   of five keys. Give `projects`, `activity` and `feedback` a real gate or
   remove them — say which in the log.
3. A pure resolver, resolveRoleContext(membership, boardTerms, billing
   account), with table tests covering: tenant; owner; owner on the board;
   manager with grants; manager who is admin (hat kept); account owner who
   is a management company; two managers with different areas; one person
   with different hats in two communities; archived or pending membership.
4. scripts/add-manager-hat.ts in the house style (idempotent): on
   hoa_members add is_manager, manager_title and manager_areas (per area:
   work, notify), back-filled from the current Property Manager role and
   manager_permissions so nobody loses access. WRITE it; do not run it
   against any Directus without asking me. The resolver must degrade to
   today's behaviour until it has run.
5. GET /api/org/role-context (org-scoped, with org-scope tests) and a
   useRoleContext() composable. Re-point useCapabilities and
   useCurrentDomainAccess at it without changing what they return.
6. resolveNotified(orgId, area) on the server — members with the hat and
   notify on for that area, else admins — with tests. Do not wire it into
   the reminder engine yet.

Rules: the hat never grants access; access comes only from admin or an
area's work switch. The account owner decides — no protected seats. No
behaviour visible to a user should change this session; the proof is that
every existing test still passes untouched.

Token rules: subagents on Haiku 5.5 for census/grep; review diffs, not
files. Gates run in the background; read only the tail. Typecheck with
NODE_OPTIONS=--max-old-space-size=6144.

Quality gate, per commit: typecheck 0, vitest green, build green (serially),
`pnpm audit:all` at or under baseline, lint under the warning cap.

When done: update the §7 Status row, append to the Session log (shipped,
deviations, operator TODOs — the schema script first), write
docs/prompts/role-first-s2-capability-nav.md for Session 2 with its model,
and stop.
```

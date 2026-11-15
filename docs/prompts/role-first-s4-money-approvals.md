# Role-first UX — Session 4 (Phase 5b, money approvals, part 1)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. The rule, the routes and the write lock are security work. Census and grep go to Haiku 5.5 subagents.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s4-money-approvals.md and carry out the prompt in its code block exactly: Phase 5b part 1 (money approvals) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build the first half of money approvals (plan Phase 5b, decisions 16 and
17). Read docs/spec-money-approvals.md first (all of it): it is confirmed
with me and is the brief. Then in docs/plan-role-first-ux.md read only
§6 decisions 16 and 17, and §7 with the Session 2 log (operator TODOs 4
and 5). Do not read the rest of the plan.

This session = spending and voids, end to end: the rule, the schema,
the routes, the Ledger entries, the notifications, the Expenses page and
the Approvals page, then the write lock on expenses. NOT this session:
waivers of owner charges, the Charges page, receipts served through the
server, the charge cancel lock. Those are Session 5. If something in the
code makes the spec wrong, stop and ask me before departing from it.

Local session: work on main, ask before pushing. Tool shells may have no
node/pnpm: run `eval "$(/usr/local/bin/fnm env)"` in every one when fnm
is at that path. Every organization on the Directus instance is test
data, so the schema needs no migration. Still show me a script's dry run
and ask before any --apply or --lock against the instance.

Do not run at the same time as Session 3 in this checkout. Session 3
owns app/pages/[slug]/admin/payments/index.vue (Charges): do not touch it.
The Expenses page (app/pages/[slug]/admin/expenses/index.vue) is yours.

What earlier sessions left you (do not rebuild):
- RoleContext and GET /api/org/role-context (docs/spec-role-context.md).
  Board seats are published, current-term hoa_board_members rows;
  titles are president, vice_president, secretary, treasurer, director.
  Use isCurrentBoardTerm (core/shared/roles/role-context.ts) for the term
  rule. Look for an existing "all current seats in an org" reader before
  writing one.
- money:read in core/shared/permissions.ts (every board seat) and
  requireMoneyRead / moneyLimit in core/server/utils/money-access.ts.
  GET /api/org/expenses already reads through it.
- The nav registry, core/shared/nav/registry.ts, with nav-gate and
  tests/shared/nav-registry.test.ts. A new page gets an entry there.
- The Ledger: core/shared/ledger/entries.ts (buildExpenseRecordedEntry,
  pure builders) and core/shared/ledger/events.ts (event keys and
  default visibility), written with writeAuditEntry. Append-only.
- notifyUsers({ ..., essential: true }) in core/server/utils/notify.ts.
- POST /api/org/expenses/record owns the transition to paid today, for
  admins or a manager with the projects grant (requireAdminOrManagerGrant).
  It becomes /api/org/expenses/[id]/pay.
- Directus: the HOA Admin policy writes payment_expenses directly
  (scripts/create-expenses-collection.ts); members have no access.

Read before building, and only these:
- core/server/api/org/expenses/record.post.ts and index.get.ts
- core/app/composables/useExpenses.ts and the Expenses page
- core/shared/ledger/entries.ts around buildExpenseRecordedEntry, and
  the expense_recorded row in events.ts
- scripts/add-manager-hat.ts, as the pattern for a schema script

Build, in this order, one commit each:
1. core/shared/money/approval-rule.ts, pure, with
   tests/shared/money-approval-rule.test.ts covering every case the
   spec's "Tests to name" lists for it.
2. scripts/add-money-approvals.ts (pnpm add:money-approvals), dry run by
   default, --apply to write, idempotent. It creates the whole schema in
   the spec, including payment_requests.waiver, so Session 5 needs no
   schema run. No permission changes in this step. Show me the dry run,
   ask, apply, then regenerate types (pnpm generate:types).
3. money:enter replaces money:write (matrix, view-as label, the
   create-verbs comment), with a requireMoneyEnter helper. Then the
   expense and approval routes from the spec (all but waive and
   receipt), the Ledger builders and event keys, and the notifications.
   record.post.ts is deleted and its callers moved. Test:
   tests/server/money-approvals.test.ts, for the cases the spec names
   that are in scope.
4. useExpenses and the Expenses page onto the routes. The page offers
   Save draft, Submit, Record paid (date and reference) and Void. Each
   row shows its approval progress ("1 of 2 approvals") and a lasting
   "Paid before approval" badge. Every money:enter holder gets the write
   controls, so board seats can now enter. Everyone else sees none.
5. The Approvals page at /[slug]/approvals, with registry entry
   money-approvals (needs money:read): open items, who has decided and
   what each still needs. Approve and Reject, with an optional note,
   appear only where the server says canDecide. Extend the registry test.
6. The write lock: a --lock step in the script that removes the HOA Admin
   policy's create, update and delete on payment_expenses and gives no
   policy write on the two new collections. Change
   create-expenses-collection.ts to match, so a re-run keeps the lock.
   Add a test that checks the permission rows. Show me the dry run, ask,
   then lock.

A board with too few seats shows "cannot be approved". If 1033 Lenox has
no current seats yet, that is correct, not a bug.

Token rules: subagents on Haiku 5.5 for census/grep; review diffs, not
files. Gates run in the background; read only the tail. Typecheck with
NODE_OPTIONS=--max-old-space-size=6144.

Quality gate, per commit: typecheck 0, vitest green, build green
(serially), `pnpm audit:all` at or under baseline, lint under the warning
cap. Every existing test passes or its change is explained in the log.

Rules: a role never sees a control it cannot use; the client's canDecide
is never trusted; the HOA Admin role approves nothing; no grant without
a gate.

When done: update the §7 Status row, append to the Session log (shipped,
what a user sees change, deviations, operator TODOs), write the Session 5
prompt (waivers, the Charges page's "Ask to waive" on whatever page
Session 3 left, receipts through the server, the charge cancel lock)
with its model and a "Start it with" line under its Model line. End
your reply with that one sentence, in a code block. Then stop.
```

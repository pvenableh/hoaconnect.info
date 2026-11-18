# Role-first UX — Session 5 (Phase 5b, money approvals, part 2)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. The waiver route, the receipt route and the charge cancel lock are security work. Census and grep go to Haiku 5.5 subagents.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s5-money-waivers.md and carry out the prompt in its code block exactly: Phase 5b part 2 (waivers, receipts, the charge cancel lock) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build the second half of money approvals (plan Phase 5b, decisions 16 and
17). Read docs/spec-money-approvals.md first (all of it): it is confirmed
with me and is the brief. Then in docs/plan-role-first-ux.md read only
§6 decisions 16 and 17, and §7 with the Session 4 log. Do not read the
rest of the plan.

This session = waivers of owner charges, end to end, receipts served
through the server, and the charge cancel lock. If something in the code
makes the spec wrong, stop and ask me before departing from it.

Local session: work on main, ask before pushing. Tool shells may have no
node/pnpm: run `command -v node || eval "$(fnm env)"` in each one. Every
organization on the Directus instance is test data, so nothing needs a
migration. Still show me a script's dry run and ask before any --apply or
--lock against the instance.

Do not run at the same time as another session that edits
app/pages/[slug]/admin/payments/index.vue (Charges) in this checkout.
Check git log for that file first: build "Ask to waive" on whatever page
and panel Session 3 left there (today: the Charges page, its ChargePanel
and core/app/composables/useChargesResource.ts, whose Cancel action
writes status "canceled" through Directus on the admin's token).

What Session 4 left you (do not rebuild):
- The rule, core/shared/money/approval-rule.ts (pure, tested), and the
  server side in core/server/utils/money-approvals.ts: loadCurrentSeats,
  openApproval, viewOf, callerCanDecide, settleApproval, notifyApprovers,
  moneyEnterUserIds. settleApproval returns early for `waive`: that is
  where a met waiver cancels its charge.
- The schema is complete: money_approvals.kind includes `waive` and
  `charge` (M2O payment_requests), and payment_requests.waiver exists.
  No schema run is needed.
- POST /api/org/money/approvals/[id]/decide refuses `waive` with 409
  ("Waivers can't be decided yet"). Lift that here.
- GET /api/org/money/approvals and [id] (core/server/utils/approval-views.ts)
  already return a `charge` subject as { type: "charge", id } only. Fill it
  in (title, amount, the household) for money:read holders.
- The Approvals page (app/pages/[slug]/approvals.vue) shows any kind; its
  headline says "A charge" for a waiver until you give it the subject.
- money:enter and requireMoneyEnter (core/server/utils/money-access.ts).
- Ledger: core/shared/ledger/entries.ts has buildMoneyDecisionEntry (it
  takes an ExpenseSubject today; a waiver needs a charge subject) and the
  expense builders. `charge_waived` is not yet in events.ts.
- The write lock on expenses and the two approval collections:
  scripts/add-money-approvals.ts --lock, scripts/lib/money-approval-perms.ts
  and its test. Extend the same script and test for the charge lock.
- Receipts: POST /api/org/expenses/receipt uploads with money:enter. The
  Expenses page links a receipt for admins only, through the asset proxy
  (useDirectusFiles().getAuthUrl), because board seats cannot open it.

Read before building, and only these:
- the spec's waive rows, the charge_waived Ledger row, and "Nav (registry)"
- core/app/composables/useChargesResource.ts and app/components/panels/ChargePanel.vue
- core/server/utils/money-approvals.ts (settleApproval) and approval-views.ts
- core/server/utils/expense-receipts.ts (mayOpenExpenseReceipt, storeExpenseReceipt)
- scripts/add-money-approvals.ts and scripts/lib/money-approval-perms.ts

Build, in this order, one commit each:
1. POST /api/org/money/charges/[id]/waive (money:enter): opens a `waive`
   approval with a reason, sets payment_requests.waiver, notifies the
   approvers. A charge already paid or canceled, or with a waiver open,
   is refused. Decide accepts `waive`; settleApproval cancels the charge
   on approval and writes `charge_waived` (board: it names a household,
   like payment_recorded). Rejected leaves the charge as it was. Tests in
   tests/server/money-approvals.test.ts (or a sibling): the gate, the org
   filter, the requester excluded, cancel on approval, nothing on reject.
2. GET /api/org/expenses/[id]/receipt (money:read) streams the receipt
   through the server; POST /api/org/expenses/[id]/receipt (money:enter)
   attaches one to a saved expense. The Expenses page links the receipt for
   every money:read holder through the GET. Test both gates and the org
   filter.
3. The Charges page: Cancel becomes "Ask to waive" (a reason, required),
   shown to money:enter holders only. A charge with a waiver pending shows
   "Waiver awaiting approval" instead of the action. Nobody cancels a charge
   directly any more.
4. The charge cancel lock: find which Directus mechanism holds (a
   validation rule on the HOA Admin policy's update of payment_requests
   that refuses status "canceled", or moving charge updates to routes) and
   build it, with a --lock step in scripts/add-money-approvals.ts and a
   test on the permission rows. Show me the dry run, ask, then lock.

Also from Session 4's log: the Charges page's money overview sums every
expense the API returns, voids and drafts included. Total only
submitted, approved and paid expenses there, as the Expenses page does.

Token rules: subagents on Haiku 5.5 for census/grep; review diffs, not
files. Gates run in the background; read only the tail. Typecheck with
NODE_OPTIONS=--max-old-space-size=6144; build with 8192.

Quality gate, per commit: typecheck 0, vitest green, build green
(serially), `pnpm audit:all` at or under baseline, lint under the warning
cap. Every existing test passes or its change is explained in the log.

Rules: a role never sees a control it cannot use; the client's canDecide
is never trusted; the HOA Admin role approves nothing; no grant without
a gate.

When done: update the §7 Status row, append to the Session log (shipped,
what a user sees change, deviations, operator TODOs). End your reply with
the next prompt's "Start it with" sentence, in a code block. Then stop.
```

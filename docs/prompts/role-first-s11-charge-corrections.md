# Role-first UX — Session 11 (Phase 5c, correcting a charge)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. This is money design: what an admin may change on a charge an owner already owes, which changes give up income and so need the board's approval, and a record that cannot be rewritten. A correction that lowers what is owed without approval undoes Session 5's cancel lock, so the spec and the server layer are Opus work. Census and grep go to Haiku 5.5 subagents.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s11-charge-corrections.md and carry out the prompt in its code block exactly: Phase 5c (correcting a charge) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build a way to correct an owner charge that was entered wrong. Asked by me on
2026-11-18, after Session 5's cancel lock left no way to edit or delete a
charge. SPEC FIRST. Do not build until I have confirmed the spec.

Read, in this order: docs/spec-money-approvals.md (all of it), then in
docs/plan-role-first-ux.md only §6 decisions 16 and 17, the "Queued:
correcting a charge" section of §7 (the findings, the field table and the six
decisions) and the Session 5 log. Read docs/ux-standards.md before any UI.
Do not read the rest of the plan.

What exists today, read from the code on 2026-11-18: re-check each before
relying on it, and log any that has changed.
- No policy updates or deletes payment_requests (scripts/lib/money-approval-perms.ts,
  REMOVED_ADMIN_RULES). The HOA Admin policy keeps create and read; the New
  charge form (app/components/Payment/ChargeForm.vue) creates through Directus,
  status "active" at once. Server writes: Mark Paid
  (core/server/api/org/payments/record.post.ts), the Stripe webhook
  (updatePaymentRequest), reminders, waivers (settleWaiver in
  core/server/utils/money-approvals.ts).
- Waivers: POST /api/org/money/charges/[id]/waive opens a `waive` approval for
  the whole charge (what remains owed); approved, the charge is canceled and
  `charge_waived` is written (board). The rule: core/shared/money/approval-rule.ts.
- Late fees are separate charges the billing worker makes from a charge's
  due_date and grace days, pointing back by source_id
  (lateFeesToApply, core/shared/billing/engine.ts). Waiving a charge leaves its
  late fees owing.
- A Stripe payment is split across the charges it names, oldest due first, when
  the webhook arrives.

Step 1, the spec: write docs/spec-charge-corrections.md from the plan's field
table, with my answers to its six decisions (ask me them, one message, with
your recommendation for each), the routes, the schema (one script in the
house style, dry run shown before --apply), the Ledger rows, the notices, the
UI on the Charges page and its panel, and the tests to name. Stop and ask me
to confirm it.

Step 2, after I confirm: build it in gated commits, one per route or page, as
Session 5 did. Rules: a role never sees a control it cannot use; nothing that
lowers what an owner owes, or moves it to another household, happens without
the rule's approval unless the spec I confirmed says so; the HOA Admin role
approves nothing; no grant without a gate; no policy gains update or delete
on payment_requests.

Local session: work on main, ask before pushing. Tool shells may have no
node/pnpm: run `command -v node || eval "$(fnm env)"` in each one. Every
organization on the Directus instance is test data, so nothing needs a
migration. Still show me a script's dry run and ask before any --apply.

Token rules: subagents on Haiku 5.5 for census/grep; review diffs, not
files. Gates run in the background; read only the tail. Typecheck with
NODE_OPTIONS=--max-old-space-size=6144; build with 8192.

Quality gate, per commit: typecheck 0, vitest green, build green
(serially), `pnpm audit:all` at or under baseline, lint under the warning
cap. Every existing test passes or its change is explained in the log.

When done: update the §7 Status row, append to the Session log (shipped,
what a user sees change, deviations, operator TODOs). End your reply with
the next prompt's "Start it with" sentence, in a code block. Then stop.
```

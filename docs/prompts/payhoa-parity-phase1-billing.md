# Prompt — PayHOA parity, Phase 1: Billing engine + owner ledger

> Run as **four short sessions**, not one. Each has its own opening message
> below. The plan is **[docs/plan-payhoa-parity.md](../plan-payhoa-parity.md)**
> §0–§3; the inventory in this file replaces codebase exploration.
> Product: **HOA Connect**, a multi-tenant HOA SaaS (Nuxt 4 + Directus + Stripe).

## Model per session

| Session | Model | Why |
|---|---|---|
| 1A Schema + permissions + export map | Sonnet 5 | Mechanical; the script pattern is fixed |
| 1B Engine + tests | **Fable 5.1** | The math and idempotency everything else trusts |
| 1C Worker + autopay + webhook split | **Fable 5.1** | Off-session Stripe on a connected account; the one place a bug costs real money |
| 1D Admin preview + owner ledger + PDF | Opus 5 | UI over routes 1C already proved |

Fable only where a wrong answer is expensive. Keep effort at default on 1B and
1C; there is no reason to raise it if the session follows the discipline below.

## Session discipline (paste into every opening message; it is the part that saves tokens)

```
Token discipline for this session:
- The inventory in docs/prompts/payhoa-parity-phase1-billing.md is verified.
  Do not re-explore the codebase to confirm it. Do not spawn Explore agents.
- Read only the files this session's step names, and only the line ranges
  you need. No reading of docs/plan-earnest-parity-round2.md or the other
  phase prompts.
- Before writing code, post a plan of at most 10 lines and wait for my yes.
- Work in the order given. Commit at each checkpoint with a one-line message
  and stop; do not continue into the next session's scope.
- No browser verification unless the step says so. Prove backend work with
  `pnpm test` / a `--dry-run` paste, not screenshots.
- No summaries longer than 8 lines. No restating the plan back to me.
- If something in the inventory turns out to be wrong, say so in one line
  and ask before working around it.
```

## Session 1A — Schema (Sonnet 5, ~1 hour)

Opening message:

```
Read docs/prompts/payhoa-parity-phase1-billing.md (Session 1A + inventory) and
docs/plan-payhoa-parity.md §3 "Schema" only. Then: write
scripts/create-billing-engine.ts following scripts/create-leases-collection.ts
as the pattern, add the pnpm script, add the new fields/collections to
scripts/setup-directus-permissions.ts and core/shared/export/collections.ts,
and update tests/shared/export-collections.test.ts. Do NOT run the script
against Directus; show me the dry plan and stop.
[paste Token discipline block]
```

Deliverable: the script, permissions and export entries, one commit. I run the
script and `pnpm generate:types` myself, then start 1B.

## Session 1B — Engine + tests (Fable 5.1, ~1–2 hours)

Opening message:

```
Read docs/prompts/payhoa-parity-phase1-billing.md (Session 1B + inventory),
docs/plan-payhoa-parity.md §3 "Engine", and the PaymentSchedule /
PaymentRequest / HoaMemberUnit interfaces in core/types/directus.ts (grep for
them; do not read the whole file). Write core/shared/billing/engine.ts as a
pure module with chargesDueForPeriod, lateFeesToApply, autopayRunsFor, and
tests/shared/billing-engine.test.ts covering the cases listed in the prompt.
Tests first, then the module, then `pnpm test`. Stop after the commit.
[paste Token discipline block]
```

Deliverable: engine + green tests, one commit.

## Session 1C — Worker, autopay, webhook (Fable 5.1, ~2 hours)

Opening message:

```
Read docs/prompts/payhoa-parity-phase1-billing.md (Session 1C + inventory),
docs/plan-payhoa-parity.md §3 "Engine" (worker bullet) and "Autopay", the
header comment of scripts/notification-digest-worker.ts (first 40 lines),
core/server/api/stripe/paymentintent.post.ts, and the payment_intent.succeeded
handler in core/server/api/stripe/webhook.post.ts. Build
scripts/billing-worker.ts with --dry-run, the connect setup-intent route,
and the webhook change that splits one payment across several charge ids.
Extend tests/server/stripe-webhook.test.ts for the split. Prove with a
--dry-run paste against the demo org and `pnpm test`. Stop after the commit.
[paste Token discipline block]
```

Deliverable: worker, setup-intent route, webhook split, tests, `docs/billing-cron.md`, one commit.

## Session 1D — UI (Opus 5, ~2 hours)

Opening message:

```
Read docs/prompts/payhoa-parity-phase1-billing.md (Session 1D + inventory),
docs/plan-payhoa-parity.md §3 "Owner UX" and "Board UX", and skim
app/pages/[slug]/payments/index.vue and the Recurring tab of
app/pages/[slug]/admin/payments/index.vue. Build: the generation-preview route
and button on the Recurring tab, the owner ledger page over a new
core/server/api/org/my-ledger.get.ts, the autopay card, and the statement PDF
route. Verify the owner page once in the browser preview with a screenshot;
nothing else needs the browser. Stop after the commit.
[paste Token discipline block]
```

Deliverable: preview, owner ledger, autopay card, PDF, one commit. Then I run
the Connect activation runbook on the pilot org myself.

---

## Inventory (verified 2026-09-11 against `main`; do NOT re-verify)

- **Charges**: `payment_requests` { organization, member, amount, `request_type:
  monthly_dues | assessment | late_fee | other`, status `draft | active | paid |
  partially_paid | overdue | canceled`, due_date, amount_paid, amount_remaining,
  reminder flags }. Admin UI: `app/pages/[slug]/admin/payments/index.vue`
  (tabs: overview, charges, recurring, reports).
- **Schedules**: `payment_schedules` { organization, member, title, amount,
  `frequency: monthly | quarterly | annually`, start_date, end_date,
  next_payment_date, total_payments_generated, `last_payment_gnerated_at` (sic,
  the typo is in the live schema; leave it) }. **Only read/written by the UI.
  Nothing generates charges from a schedule.** That is the gap.
- **Transactions**: `payment_transactions` written by
  `core/server/api/stripe/webhook.post.ts` (dedupes `payment_intent.succeeded`
  on the PaymentIntent id). Offline: `core/server/api/org/payments/record.post.ts`.
- **Stripe Connect (Express)**: `core/server/api/stripe/connect/{account,account-link}.post.ts`;
  `paymentintent.post.ts` (`routeDuesToConnect` → `transfer_data.destination` +
  `application_fee_amount`, fee % from `STRIPE_CONNECT_FEE_PERCENT`, server-side).
  Org fields `stripe_connect_account_id`, `connect_onboarding_status`,
  `connect_charges_enabled`, `connect_payouts_enabled`. Code-complete, not
  activated: `docs/connect-activation-runbook.md`. Tests:
  `tests/server/{connect-endpoints,paymentintent,stripe-webhook}.test.ts`.
- **Late fees**: `hoa_organizations.{late_fee_enabled, late_fee_amount,
  payment_grace_period_days}`, edited in `app/components/Settings/PaymentSettingsForm.vue`.
  Never applied by anything.
- **Member balance fields**: `hoa_members.{payment_status: current | overdue |
  delinquent, outstanding_balance, total_payments, last_payment_*}`.
- **Reporting**: `core/shared/reporting/ledger.ts` (pure, tested); rendered by
  `app/components/Payment/FinancialsReport.vue`. Opening balance per org.
- **Owner payments page**: `app/pages/[slug]/payments/index.vue`, pays one
  charge at a time via `app/components/Payment/{StripeCard,Methods}.vue` and
  `core/app/composables/useStripePayment.ts` (fee math per method).
- **Units ↔ members**: `hoa_member_units` { member_id, unit_id, is_primary_unit,
  ownership_percentage, start_date, end_date }; `core/shared/members/residency.ts`.
- **Ledger / audit**: `org_audit_log` via `core/server/utils/audit-log.ts`; shapes
  in `core/shared/ledger/entries.ts`; visibility in `core/shared/ledger/visibility.ts`.
- **Worker pattern**: `scripts/notification-digest-worker.ts` (droplet cron,
  static token, relative imports of pure modules, `--dry-run`). Cron docs: `docs/*-cron.md`.
- **Notifications**: `core/server/api/org/notify-event.post.ts`; push
  `core/server/utils/push.ts`; prefs `core/shared/notifications/preferences.ts`.
- **Email**: `core/server/utils/transactional-email.ts` + branding.
- **Export map**: `core/shared/export/collections.ts`, guarded by
  `tests/shared/export-collections.test.ts`.
- **Schema script pattern**: `scripts/create-leases-collection.ts` (idempotent,
  skips existing, reads `DIRECTUS_URL` + `DIRECTUS_STATIC_TOKEN`).

## Spec (what each session builds; the sessions reference this, not the plan)

**Schema (1A)** — `scripts/create-billing-engine.ts`, additive:
- `payment_schedules`: `cadence` (`monthly | quarterly | semiannual | annual`),
  `amount_source` (`fixed | per_unit_rate | ownership_pct`), `audience` JSON
  (`{ all: true }` or `{ units: [ids] }`), `generate_days_ahead` (int, 14),
  `last_generated_period` (string `YYYY-MM`). `member` stays nullable.
- `hoa_organizations`: `late_fee_kind` (`flat | percent`), `late_fee_repeat`
  (`once | monthly`), `late_fee_cap` (decimal, nullable).
- `payment_methods` (new): organization, member, `stripe_customer_id` (on the
  connected account), `stripe_payment_method_id`, type, last4, brand,
  `is_autopay` bool, `autopay_day` int 1–28, status.
- `payment_requests`: `unit` FK, `period_start`, `period_end`, `source`
  (`schedule | manual | late_fee | plan`), `source_id`.
- Permissions: admin full; member read own `payment_methods` and own
  `payment_requests` (already scoped); PM none.

**Engine (1B)** — `core/shared/billing/engine.ts`, pure (no Directus, no clock):
- `chargesDueForPeriod(schedule, unitLinks, asOf)` → drafts keyed
  `(schedule, unit, period)`; `ownership_pct` splits across active co-owners and
  sums to the total; daily proration only on a link's first period.
- `lateFeesToApply(openCharges, policy, asOf)` → one fee per charge per period,
  capped, never duplicated for a period already carrying one.
- `autopayRunsFor(day, methods, openCharges)` → `{ method, charges, total }` per
  member, skipping members already charged today.
- Tests: month-boundary proration, semiannual cadence, split sums, re-run
  idempotency, cap + repeat rules, autopay on 29–31, an end-dated link excluded.

**Worker + autopay (1C)**:
- `scripts/billing-worker.ts` (`pnpm billing:worker`, `--dry-run`): active
  schedules → engine → insert drafts whose key is absent → late fees → autopay
  (PaymentIntent `off_session: true, confirm: true`, connected account,
  `routeDuesToConnect`) → reminders at due-7d, due, past-grace via
  transactional email + push. One `billing_run` ledger entry per run.
- `core/server/api/stripe/connect/setup-intent.post.ts`: SetupIntent on the
  org's connected account for the authenticated member; save to `payment_methods`.
- Webhook: `payment_intent.succeeded` with `metadata.charge_ids` splits
  `amount_paid` across those charges in order, oldest due first.
- `docs/billing-cron.md`.

**UI (1D)**:
- Recurring tab: cadence, amount source, audience; **Generate preview** calls
  `core/server/api/org/billing/preview.post.ts` (engine dry-run) and shows
  "N charges, $X, M prorated" before **Generate now**. Charges tab: `source`
  badge + unit column. Settings → Payments: the three late-fee fields.
- Owner ledger: `app/pages/[slug]/payments/index.vue` → balance due, next
  due, one **Pay** across all the owner's open charges (one PaymentIntent,
  `metadata.charge_ids`), running-balance table with receipts, year/unit
  filters, over `core/server/api/org/my-ledger.get.ts` (owner-scoped).
- Autopay card: setup-intent → save → pick day; toggling writes
  `autopay_enabled` / `autopay_disabled` ledger entries visible only to that owner.
- `core/server/api/org/my-ledger/statement.get.ts` → branded PDF. Choose the
  PDF approach once; plan §4 reuses it.

## Rules

- No money movement beyond owner-enabled autopay. No refunds or waivers in code.
- Owners see only their own balance; check `visibility.ts` before adding entry shapes.
- Mutating Directus scripts: plan, yes, run. Test keys only.
- Pure logic gets tests before the route that calls it.

## Done when

- `pnpm test` and `pnpm typecheck` pass with the new tests.
- `--dry-run` twice against the demo org shows zero new charges the second time.
- A two-unit owner pays both charges in one test-mode checkout and the ledger
  page shows the split and the running balance; the PDF downloads.
- Autopay runs once for a test member with a saved test card.
- `docs/ROADMAP.md` Phase 1–2 checklists updated; plan §3 marked shipped.

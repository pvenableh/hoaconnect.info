# Billing worker — scheduled on GitHub Actions

Dues generation, late fees, autopay and reminders run as a **scheduled GitHub
Actions workflow**:
[`.github/workflows/billing-worker.yml`](../.github/workflows/billing-worker.yml),
daily at **10:15 UTC** (06:15 New York in summer, 05:15 in winter). Like the
digest, the worker is a pure HTTP client — Directus over REST, Stripe, SendGrid
— so it needs no droplet and runs the commit on `main`.

Script: `scripts/billing-worker.ts` (`pnpm billing:worker`). Pure logic lives in
`core/shared/billing/engine.ts` (tested); the worker only reads rows, asks the
engine, and writes what it answers.

## What one run does, per active organization

| step | reads | writes |
|---|---|---|
| 1 generate | active `payment_schedules`, `hoa_member_units` (via the unit's org), every non-canceled `payment_requests` | new `payment_requests` (status `active`, `source: schedule`, `source_id`, `unit`, `period_start/end`); `schedule.last_generated_period` = newest period emitted |
| 2 late fees | the org's late-fee fields, every non-canceled charge including paid late fees | new `payment_requests` (`request_type: late_fee`, `source: late_fee`, `source_id` = the overdue charge); open charges past grace → status `overdue` |
| 3 autopay | `payment_methods` with `is_autopay`, open charges, today's `payment_transactions` | one Stripe PaymentIntent per member (see below); the webhook writes the rows |
| 4 reminders | open charges, the member's user + notification preferences | email + push; `reminder_sent`, `reminder_sent_at`, `metadata.reminders.<stage>` on each charge |
| 5 ledger | — | one `billing_run` entry in `org_audit_log` (board-only) when anything happened |

**Idempotency.** Every generated charge has an engine key
`schedule:unit:YYYY-MM[:member]` rebuilt from the org's existing charges, so a
re-run inserts nothing. Late fees are derived from the fees already on record.
Autopay skips a member with an attempt today (`payment_transactions` metadata,
double-checked against Stripe's own search). Each reminder stage is stamped on
the charge and sent once. A run can be repeated, delayed, or run twice in a
morning without a duplicate; a dropped run delays things by a day.

**Audience.** A schedule's `audience` is `{ "all": true }` or
`{ "units": [ids] }`; a legacy schedule with `member` set is narrowed to that
member's links. `per_unit_rate` schedules multiply by `unit_rate`, which the
worker sets to **1 for every unit** because `hoa_units` has no rate field yet.
When one is added, `runOrg()` is the one place to read it.

## Autopay — the step that moves money

Autopay is **off unless `--autopay` is passed.** The scheduled run passes it;
a manual run does not unless the box is ticked. `--autopay-member <member id>`
narrows it to one member for the first live test.

Each run is one PaymentIntent for **all** of the member's open charges, oldest
due first, with `metadata.charge_ids`; the webhook's `payment_intent.succeeded`
handler splits the amount across those charges in that order. The intent is a
**direct charge on the org's connected account** (`stripeAccount` header,
`off_session: true, confirm: true`, `application_fee_amount` at
`STRIPE_CONNECT_FEE_PERCENT`), because the saved customer and payment method
live on that account (`payment_methods.stripe_customer_id`) and a method can
only be reused by the account it was saved to. The on-session "Pay" flow in
`paymentintent.post.ts` is a destination charge on the platform; both land in
the association's bank, and both take the same platform fee.

Saving a method: `POST /api/stripe/connect/setup-intent` with
`{ organizationId }` returns a SetupIntent to confirm with Stripe.js (pass
`connectAccountId` as the `stripeAccount`); the same route with
`{ organizationId, setupIntentId, autopayDay }` reads the confirmed intent back
and upserts the `payment_methods` row. Demo orgs cannot save methods and are
never charged.

Failures (declines, `authentication_required`) are logged and counted; the
member's method is left as is and the charges stay open for the next run. The
worker uses an idempotency key of `autopay:<org>:<member>:<date>` so a retried
run cannot double-charge.

`BILLING_STRIPE_MODE` selects the key: `test` (default) or `live`. Leave it on
`test` until `docs/connect-activation-runbook.md` is complete.

## Reminders

Three stages per charge — `due_soon` (7 days before), `due` (on the due date),
`past_grace` (after `payment_grace_period_days`) — each sent once. A member gets
one email and one push per run covering every charge at its latest stage; a
charge that is generated already past due skips the earlier stages rather than
sending three messages. Email honours the app's master email switch (`_email` in
`notification_preferences`; not Directus's `email_notifications`, which stays false);
push honours the `payment` category. Demo orgs are suppressed unless
`DEMO_ALLOW_EMAIL`.

## Setup

Secrets at **Settings → Secrets and variables → Actions**:

| secret | used by |
|---|---|
| `DIRECTUS_STATIC_TOKEN` | all workers |
| `STRIPE_SECRET_KEY_TEST` / `STRIPE_SECRET_KEY_LIVE` | autopay |
| `SENDGRID_API_KEY` | reminders |
| `NUXT_PUBLIC_VAPID_PUBLIC_KEY` / `NUXT_VAPID_PRIVATE_KEY` | push (optional; no keys = no push) |

Everything else is a literal in the workflow.

## Running it by hand

**From GitHub** — Actions → *billing worker* → **Run workflow**. `dry_run`
defaults to **true**; `autopay` to **false**; `org` limits the run to one slug.

**Locally**

```bash
pnpm billing:worker -- --dry-run --org demo
```

```bash
pnpm billing:worker -- --org demo
```

```bash
pnpm billing:worker -- --autopay --autopay-member <member id> --org <slug>
```

`--as-of YYYY-MM-DD` pretends it is another day (useful for "what will the
first of next month generate"). Reads `.env` through `dotenv`.

## Checking a run

- Actions → *billing worker* → the run's log: one block per org with every
  charge, fee, autopay attempt and reminder, then a totals line.
- The org's Community Ledger (board view): a *Billing run* entry per org per
  day that did something.
- Finances → Charges: new rows carry `source` = `schedule` / `late_fee`.

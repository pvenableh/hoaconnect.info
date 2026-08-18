# Stripe setup

How billing is wired in HOA Connect, what to create in the Stripe Dashboard, and
the env vars you need. Covers both the existing **per-org** billing and the new
**agency / multi-property** billing (see
[`plan-agency-multi-property-billing.md`](./plan-agency-multi-property-billing.md)).

---

## 1. Mental model (read this first)

- **You create Products + Prices in Stripe by hand.** Subscriptions are created
  **programmatically** by the app — never in the Dashboard.
- **Trials are NOT configured in Stripe.** Trial length lives in your own data
  (`subscription_plans.trial_days` in Directus) and is passed to Stripe as
  `trial_period_days` when the subscription is created. Don't set a trial on the
  Price.
- **Test vs live is chosen by `NODE_ENV`**, not a Stripe mode flag. In production
  the app uses the LIVE keys; otherwise the TEST keys. Set **both** pairs.

---

## 2. Environment variables

| Env var | Scope | Used for |
|---|---|---|
| `STRIPE_SECRET_KEY_TEST` | server | API calls (non-prod) |
| `STRIPE_SECRET_KEY_LIVE` | server | API calls (prod) |
| `STRIPE_PUBLIC_KEY_TEST` | client | Stripe.js / Elements (non-prod) |
| `STRIPE_PUBLIC_KEY_LIVE` | client | Stripe.js / Elements (prod) |
| `STRIPE_WEBHOOK_SECRET` | server | verify webhook signatures |
| `STRIPE_CONNECT_FEE_PERCENT` | both | resident-dues payout fee % (Connect only; default `2`) — **not** SaaS billing |
| `STRIPE_AGENCY_PRICE_ID_MONTHLY` | client | agency flat per-seat Price (monthly) — P2+ |
| `STRIPE_AGENCY_PRICE_ID_YEARLY` | client | agency flat per-seat Price (yearly) — P2+ |

> ⚠️ There is a **single** `STRIPE_WEBHOOK_SECRET` (not split test/live). It must
> match whichever environment the deployed app is signing against.

---

## 3. Per-org billing (today)

**1 org = 1 Stripe customer = 1 subscription.** Flow:
`POST /api/stripe/subscription` creates the customer + subscription;
`POST /api/stripe/webhook` maps Stripe status onto `hoa_organizations.subscription_status`.

### Per plan, do this:

1. **Stripe Dashboard → Products** → create a Product for the plan (e.g. "Starter").
2. Add a **recurring Price** for **monthly** and another for **yearly**.
3. **Directus → `subscription_plans`** → create/edit the plan row:
   - `name`, `price_monthly`, `price_yearly`
   - `trial_days` (← the entire trial config; e.g. `14`)
   - `stripe_price_id_monthly` = the monthly Price ID (`price_…`)
   - `stripe_price_id_yearly` = the yearly Price ID
   - `is_active: true`, `status: published`

Checkout reads those Price IDs; without them the plan can't be subscribed to.

---

## 4. Agency / multi-property billing (P2+)

**1 billing account = 1 Stripe customer = 1 subscription**, with
`quantity = number of active properties` on a **flat per-seat Price**. Child orgs
resolve entitlement "up" to the account.

### One-time Stripe setup

1. **Stripe Dashboard → Products** → create one Product, e.g. "Agency – per property".
2. Add a **recurring per-unit Price** for **monthly** and **yearly** (flat amount
   per seat; Stripe multiplies by `quantity`). Licensed (not metered) usage.
3. Put the Price IDs in env:
   - `STRIPE_AGENCY_PRICE_ID_MONTHLY=price_…`
   - `STRIPE_AGENCY_PRICE_ID_YEARLY=price_…`

   (The agency dashboard's "Set up billing" button reads these. You may also set
   a `subscription_plan` on the `billing_accounts` row for display.)

### App endpoints (no manual Stripe work)

- `POST /api/stripe/billing-account/subscribe` — creates the one customer + one
  subscription, `quantity` = active property count, optional trial.
- `POST /api/stripe/billing-account/sync-seats` — reconciles `quantity` to the
  live property count (Stripe prorates). Called automatically on attach/detach.
- `POST /api/stripe/billing-account/payment-method-setup` — SetupIntent to add a card.
- `POST /api/stripe/billing-account/portal` — opens the Stripe Customer Portal
  (manage card, view/download invoices).
- Webhook **routes to the `billing_accounts` row first** (by subscription, then
  customer id) and updates that row only — child orgs are left untouched.

### Onboarding without a card

Set `billing_accounts.is_free_account = true` (comped) or set
`subscription_status` by hand to onboard an agency before wiring Stripe.

---

## 5. Webhook

- **Endpoint:** `https://<app-host>/api/stripe/webhook`
- Register it in **Stripe Dashboard → Developers → Webhooks**, copy the signing
  secret into `STRIPE_WEBHOOK_SECRET`.
- **Events consumed:** `customer.subscription.created|updated|deleted`,
  `invoice.paid`, `invoice.payment_failed`, `payment_intent.succeeded|payment_failed|canceled`,
  `charge.succeeded|refunded`, and (Connect) `account.updated`, `payout.paid|failed|canceled`.

> After the marketing split the app host is `app.hoaconnect.info`, so the webhook
> URL becomes `https://app.hoaconnect.info/api/stripe/webhook`. Update it at cutover.

---

## 6. Quick test (Stripe test mode)

1. Set TEST keys + a TEST `STRIPE_WEBHOOK_SECRET` (use `stripe listen` locally).
2. Create test Products/Prices; put IDs in Directus / env.
3. Subscribe an org (or an agency account) using test card `4242 4242 4242 4242`.
4. Confirm the webhook flips `subscription_status` to `trial`/`active`.
5. For agency: add/detach a property and verify the subscription `quantity`
   changes (Stripe Dashboard → the subscription) and `seats_purchased` updates.

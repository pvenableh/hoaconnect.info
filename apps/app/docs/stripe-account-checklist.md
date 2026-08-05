# Stripe account setup — to-do checklist

Everything you need to pull **from a Stripe account** to switch payments on in HOA
Connect, and exactly where each value goes. Env vars are read in
`core/nuxt.config.ts`. Put them in `apps/app/.env` for local dev and in **Vercel →
Project → Settings → Environment Variables** for prod.

> Work top-to-bottom. You can do everything in **Test mode** first, then repeat the
> keys/webhook/prices in **Live mode** when you're ready to take real money.

---

## 1. Account basics
- [ ] Create / log in to the Stripe account for HOA Connect.
- [ ] Complete **business profile** (legal entity, address, statement descriptor). Live charges are blocked until this is done.
- [ ] Decide the account that owns the platform — this same account creates the Connect **Express** sub-accounts for each HOA.

## 2. API keys → env vars
From **Developers → API keys** (toggle Test/Live in the dashboard top-right):
- [ ] **Test** secret key (`sk_test_…`) → `STRIPE_SECRET_KEY_TEST`
- [ ] **Test** publishable key (`pk_test_…`) → `STRIPE_PUBLIC_KEY_TEST`
- [ ] **Live** secret key (`sk_live_…`) → `STRIPE_SECRET_KEY_LIVE`
- [ ] **Live** publishable key (`pk_live_…`) → `STRIPE_PUBLIC_KEY_LIVE`

> The app auto-picks test vs live keys off `NODE_ENV` (live only when `NODE_ENV=production`).

## 3. Webhook → signing secret
From **Developers → Webhooks → Add endpoint**:
- [ ] Endpoint URL: `https://app.hoaconnect.info/api/stripe/webhook`
- [ ] Copy the **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET` (one secret; the app uses the same var for test & live)
- [ ] Subscribe to these events (all are handled in `webhook.post.ts`):
  - [ ] `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
  - [ ] `charge.succeeded`, `charge.refunded`
  - [ ] `invoice.paid`, `invoice.payment_failed`
  - [ ] `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
  - [ ] `account.updated`  *(Connect onboarding status sync)*
  - [ ] `payout.paid`, `payout.failed`, `payout.canceled`  *(Connect payouts)*

> For local testing use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the `whsec_…` it prints.

## 4. Products & Prices (subscription plans)
You don't hand-create these in the dashboard — a script creates them in Stripe and
writes the Price IDs back into Directus (`subscription_plans.stripe_price_id_*`).
- [ ] Confirm keys + `DIRECTUS_URL` / `DIRECTUS_STATIC_TOKEN` are set, then run:
  ```bash
  pnpm --filter ./apps/app stripe:subscription-prices
  ```
  (creates a monthly + annual + onboarding Price per active band → fills `stripe_price_id_monthly/yearly/onboarding`).
- [ ] **Agency (multi-property) billing** — create one recurring Price for the agency seat, then set:
  - [ ] `STRIPE_AGENCY_PRICE_ID_MONTHLY`
  - [ ] `STRIPE_AGENCY_PRICE_ID_YEARLY`

## 5. Stripe Connect (resident dues → the HOA's own bank)
From **Connect → Get started** (or **Settings → Connect**):
- [ ] Enable **Connect** and enable **Express** accounts.
- [ ] Set the Connect **branding** (name, icon, brand color) shown on onboarding.
- [ ] Enable capabilities: **card payments**, **transfers**, and **ACH / US bank** (the app requests card + ACH + transfers).
- [ ] Set the platform fee taken on dues → `STRIPE_CONNECT_FEE_PERCENT` (default `2`, meaning 2%). Server recomputes the authoritative fee; the public var is display-only.

## 6. Connect activation — operator steps (one-time, in this repo)
These are code/DB steps that pair with the Stripe setup above:
- [ ] `pnpm --filter ./apps/app add:connect-fields` (adds Connect fields to `hoa_organizations`)
- [ ] `pnpm --filter ./apps/app generate:types`
- [ ] Add the new Connect fields to `setup-directus-permissions.ts`, then re-run permissions setup
- [ ] ⚠️ **Security gate before live:** role-gate `core/server/api/stripe/connect/account.post.ts` — it currently trusts a client-supplied `organizationId`. Must verify the caller is an admin/board/PM of that org first. *(I can do this whenever you're ready.)*

## 7. Run the PRODUCTION instance in test mode (full dry-run before live)
Goal: exercise real Connect onboarding + payment/subscription flows on
`app.hoaconnect.info` with **test cards**, no real money, then flip to live.
- [ ] In **Vercel** set `STRIPE_MODE=test`. This overrides `NODE_ENV`, so the prod
      deploy uses the **test** key pair even though it's `NODE_ENV=production`.
- [ ] Make sure the **test** keys are set (`STRIPE_PUBLIC_KEY_TEST`, `STRIPE_SECRET_KEY_TEST`).
- [ ] Point `STRIPE_WEBHOOK_SECRET` at your **test** webhook's `whsec_…` — or set
      `STRIPE_WEBHOOK_SECRET_TEST` (and keep the live one in `STRIPE_WEBHOOK_SECRET_LIVE`)
      so both endpoints coexist and flipping `STRIPE_MODE` is the only change.
- [ ] Run the price script against **test** so bands have test Price IDs.
- [ ] Redeploy. Every billing screen shows an amber **"Stripe test mode"** badge — confirm it's visible.
- [ ] Dry-run: Connect Express **onboarding** (Stripe test onboarding auto-fills),
      a **dues payment** with `4242 4242 4242 4242`, a **subscription checkout**, and
      confirm **webhook** deliveries return 200.
- [ ] When satisfied, set `STRIPE_MODE=live` (or remove it) and redeploy → the badge
      disappears and real charges are live. Nothing else changes.

## 8. Before flipping to Live
- [ ] Re-do steps 2–4 in **Live mode** (live keys, live webhook + secret, re-run the price script against live).
- [ ] In **Connect settings**, complete the live platform profile + payout/risk settings.
- [ ] Smoke test: one dues payment (Connect destination charge + application fee lands), one subscription checkout, one webhook delivery (check Stripe → Webhooks → recent deliveries = 200).

---

### Env var quick-reference
| Env var | Where from | Notes |
|---|---|---|
| `STRIPE_MODE` | you choose | `test` \| `live`; unset → NODE_ENV. Lets prod run test mode |
| `STRIPE_SECRET_KEY_TEST` / `_LIVE` | Developers → API keys | server-only |
| `STRIPE_PUBLIC_KEY_TEST` / `_LIVE` | Developers → API keys | client |
| `STRIPE_WEBHOOK_SECRET` | Developers → Webhooks | `whsec_…` |
| `STRIPE_CONNECT_FEE_PERCENT` | you choose | default `2` |
| `STRIPE_AGENCY_PRICE_ID_MONTHLY` / `_YEARLY` | Products (agency Price) | agency billing |
| per-plan `stripe_price_id_*` | `pnpm stripe:subscription-prices` | stored in Directus, not env |

_Related: `docs/stripe-setup.md`, `docs/prompts/phaseB-stripe-connect.md`._

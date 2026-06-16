# Track B — Stripe Connect (Express) for resident dues

Status: **code complete, not yet activated.** Built in branch
`feat/roadmap-notifications-connect-phase5`. Routes dues into each association's
own connected account and takes a platform fee. SaaS subscription billing is
untouched.

## What landed

- **`scripts/add-connect-fields.ts`** (`pnpm add:connect-fields`) — adds to
  `hoa_organizations`: `stripe_connect_account_id`, `connect_onboarding_status`
  (`none|pending|restricted|active`), `connect_charges_enabled`,
  `connect_payouts_enabled`. Idempotent, additive.
- **`server/api/stripe/connect/account.post.ts`** — create (or reuse) an Express
  account for an org `{ organizationId, email? }`, persist the id + `pending`.
- **`server/api/stripe/connect/account-link.post.ts`** — onboarding/refresh
  Account Link `{ organizationId, returnPath?, refreshPath? }` → `{ url }`.
- **`server/api/stripe/paymentintent.post.ts`** — new opt-in `routeDuesToConnect`
  flag. When set AND the org has an active connected account, adds
  `transfer_data.destination` + `application_fee_amount` (destination charge).
  Fee % read server-side from `stripeConnectFeePercent` (never trusts the
  client). Falls back to a normal platform charge if not onboarded.
- **`server/api/stripe/webhook.post.ts`** — handles `account.updated` (syncs
  onboarding status + charges/payouts flags into the org) and
  `payout.{paid,failed,canceled}` (logged; no ledger yet — ROADMAP Phase 2).
- **UI**: `app/components/Settings/ConnectPayoutsCard.vue`, surfaced in
  `PaymentSettingsForm.vue` (Org Settings → Payments). Shows status + an
  onboard/continue/manage CTA that redirects to Stripe.
- **Config**: `stripeConnectFeePercent` (private + public) in `nuxt.config.ts`,
  default `2` via `STRIPE_CONNECT_FEE_PERCENT`.

Verified: both Connect routes load and reject invalid bodies with 400 before any
Stripe/Directus call; all UI compiles in the dev server.

## To activate (needs you)

1. **Confirm the platform fee %** (default 2%). Set `STRIPE_CONNECT_FEE_PERCENT`.
2. **Run the migration** (mutates Directus — confirm first):
   `pnpm add:connect-fields` → then `pnpm generate:types` → then add the four
   org fields to `setup-directus-permissions.ts` (admin read/update only).
3. **Decide destination charges vs `on_behalf_of`.** Built as destination
   charges (platform is merchant of record). Switch in `paymentintent.post.ts`
   if you want the connected account to be merchant of record.
4. **Wire `routeDuesToConnect: true`** into the resident dues payment flow
   (the page that calls `/api/stripe/paymentintent` for `payment_requests`).
5. **Webhook**: add `account.updated` + `payout.*` to the Stripe webhook
   endpoint's enabled events. Test locally with the Stripe CLI + test keys.
   Never touch live billing while developing.

Out of scope (noted, not built): the reporting/payout ledger — ROADMAP Phase 2,
depends on this.

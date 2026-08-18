# Stripe Connect activation runbook

> **Goal:** turn the code-complete Connect dues routing on for one pilot
> association, in **test mode first**, and prove the money lands in *their*
> account with *our* platform fee taken.
>
> Scope: VISION.md Pillar D / Phase 1 ("Harden & activate payments"). This is
> the operator checklist; the code it activates is already merged. Related:
> [`stripe-account-checklist.md`](./stripe-account-checklist.md) (Stripe
> Dashboard setup), [`stripe-setup.md`](./stripe-setup.md) (billing model +
> env vars), [`ROADMAP.md`](./ROADMAP.md) Phase 1.

---

## 0. What already exists (don't redo it)

| Piece | Where |
|---|---|
| Express account create + onboarding link | `core/server/api/stripe/connect/{account,account-link}.post.ts` |
| Admin-gated (server-verified `requireAdminAccess`) | same files — commit `ca6e4d2`, covered by `tests/server/connect-endpoints.test.ts` |
| Onboarding UI | Settings → Payments → **Payouts (Stripe Connect)** (`Settings/ConnectPayoutsCard.vue`) |
| Dues routing (destination charge + application fee) | `core/server/api/stripe/paymentintent.post.ts` (`routeDuesToConnect`) |
| Resident dues page that sets the flag | `apps/app/app/pages/[slug]/payments/index.vue` |
| `account.updated` → org flags; `payout.*` logged | `core/server/api/stripe/webhook.post.ts` |
| Money-path tests | `tests/server/{paymentintent,stripe-webhook,connect-endpoints}.test.ts` |

**The security gate is closed.** The client-supplied `organizationId` grants
nothing: both Connect endpoints call `requireAdminAccess(event, orgId)` before
any Stripe or Directus call.

---

## 1. Directus schema + types

```bash
pnpm --filter ./apps/app add:connect-fields
```

Adds (idempotent) to `hoa_organizations`: `stripe_connect_account_id`,
`connect_onboarding_status`, `connect_charges_enabled`, `connect_payouts_enabled`.

```bash
pnpm --filter ./apps/app generate:types
```

Regenerates `core/types/directus.ts` from the live schema.

While you're here, the Phase 1 opening-balance fields (so migrated communities'
reports don't start at $0):

```bash
pnpm --filter ./apps/app add:opening-balance
```

Adds `opening_balance` + `opening_balance_date`; set them per org in
**Settings → Payments → Opening Balance**. Re-run `generate:types` after.

---

## 2. Permissions

HOA Admin has `adminLevel: "full"` on `hoa_organizations`, which the permission
generator expands to `fields: ["*"]` — so the Connect and opening-balance
columns are covered with **no config change**. Confirm rather than assume:

```bash
pnpm --filter ./apps/app setup:permissions:audit
```

Only if that audit shows an explicit field list for `hoa_organizations` (it
shouldn't) do you need to add the new fields in
`scripts/setup-directus-permissions.ts` and re-run `pnpm setup:permissions`.

Note what stays server-side regardless: residents never write these fields —
the Connect flags are written only by the webhook (admin token), and the
destination account is read server-side in `paymentintent.post.ts`.

---

## 3. Stripe Dashboard

Platform setup (per mode — do test first, live later):

- **Connect → Get started** → enable **Express** accounts.
- Connect **branding** (name, icon, brand color) — residents' association sees
  this during onboarding.
- Capabilities: **card payments**, **transfers**, **ACH / US bank account**.

### Webhook events

Endpoint: `https://<your-host>/api/stripe/webhook` — the *same* endpoint that
already handles subscriptions. Add:

| Event | Why |
|---|---|
| `account.updated` | syncs `connect_onboarding_status` / `connect_charges_enabled` / `connect_payouts_enabled` |
| `payout.paid`, `payout.failed`, `payout.canceled` | payout lifecycle (logged today; ledger later) |

These fire on the **connected account**, so the endpoint must be listening to
*events on connected accounts*, not only *events on your account*.

> ⚠️ **One secret per mode.** `getStripeWebhookSecret()` resolves a single
> `whsec_…` (`STRIPE_WEBHOOK_SECRET_TEST` / `_LIVE`, falling back to
> `STRIPE_WEBHOOK_SECRET`). Keep platform + connected-account events on **one
> endpoint**. If your account forces a second endpoint for Connect events, it
> gets its own signing secret and the handler will 400 on it — that needs a
> small code change (accept a list of secrets) before you rely on it.

---

## 4. Environment

| Var | Value | Notes |
|---|---|---|
| `STRIPE_CONNECT_FEE_PERCENT` | e.g. `2` | Our cut of each dues payment, in percent. Server recomputes the authoritative fee; the public copy is display-only (the card's "a 2% platform fee applies" line). Unset → `2`. |
| `STRIPE_MODE` | `test` during the pilot | Overrides `NODE_ENV`, so the production deploy can run test mode. |
| `STRIPE_SECRET_KEY_TEST` / `_LIVE`, `STRIPE_PUBLIC_KEY_TEST` / `_LIVE` | from Stripe | both pairs set. |
| `STRIPE_WEBHOOK_SECRET_TEST` / `_LIVE` | from Stripe | so both endpoints coexist and flipping mode is the only change. |

Set these in Vercel (and `apps/app/.env` locally), then redeploy. Fee math is
`round(amount_cents × percent / 100)`; `0` means no application fee is attached
at all (`tests/server/paymentintent.test.ts` pins both).

---

## 5. Pilot smoke test (test mode, ~15 minutes)

Pick one real pilot org. Everything below is with Stripe **test** keys — no real
money moves. The amber **"Stripe test mode"** badge should be visible on every
billing screen; if it isn't, you're in live mode — stop.

1. **Create the account.** Sign in as an HOA Admin of the pilot org →
   **Settings → Payments → Payouts (Stripe Connect)** → *Connect payouts*.
   - ✅ `hoa_organizations.stripe_connect_account_id` is now `acct_…`.
   - ✅ A non-admin (or an admin of a *different* org) hitting
     `POST /api/stripe/connect/account` with this org's id gets **403**.
2. **Onboard.** Follow the Stripe Express onboarding (test mode auto-fills;
   use `000-000-0000` / test SSN prompts as Stripe suggests). Return to the app.
   - ✅ Stripe → Webhooks shows `account.updated` delivered **200**.
   - ✅ The card flips to **Active — charges + payouts enabled**, and the org row
     has `connect_onboarding_status: active`, `connect_charges_enabled: true`,
     `connect_payouts_enabled: true`.
3. **Pay dues as a resident.** Open `/{slug}/payments` as a member of the pilot
   org, pay an outstanding charge with `4242 4242 4242 4242` (any future expiry
   / CVC). Repeat once with the ACH test account if you sell ACH.
4. **Verify the destination charge** — Stripe → Payments → the PaymentIntent:
   - ✅ `transfer_data.destination` = the org's `acct_…` (**not** the platform).
   - ✅ `application_fee_amount` = `STRIPE_CONNECT_FEE_PERCENT`% of the amount,
     in cents (e.g. $250.00 at 2% → `500`).
   - ✅ metadata carries `organization_id`, `member_id`, `payment_request_id`,
     `connect_account_id`, `platform_fee_percent`.
   - ✅ Connect → the connected account's balance shows the net; the platform
     balance shows the fee.
5. **Verify the ledger row** — Directus → `payment_transactions`:
   - ✅ exactly **one** row for that PaymentIntent, `status: succeeded`, amount in
     **dollars**, scoped to the org/member/request.
   - ✅ the linked `payment_requests` row moved to `paid` (or `partially_paid`)
     with `amount_paid` credited once.
   - ✅ Replay the event (Stripe → the event → **Resend**): still **one** row,
     `amount_paid` unchanged. (Guarded in code + `tests/server/stripe-webhook.test.ts`.)
6. **Verify the report.** Finances → **Reports**: the payment appears in the
   month's income and the running balance starts from the org's opening balance.
7. **Verify the fallback is silent.** On an org that has *not* onboarded, a dues
   payment still succeeds as a plain platform charge (no `transfer_data`, no
   application fee) — residents must never see a Connect error.

### Rollback

Nothing here is destructive. To stop routing dues for an org, set
`connect_charges_enabled: false` on the org row — new dues payments fall back to
platform charges immediately (the check is per-PaymentIntent, read server-side).
Payouts already in flight settle on Stripe's side.

---

## 6. Going live

Only after the test-mode pilot passes end to end:

1. Redo §3 in **live** mode (live Connect settings, live webhook endpoint +
   `STRIPE_WEBHOOK_SECRET_LIVE`, connected-account events enabled).
2. Set `STRIPE_MODE=live` (or remove it) in Vercel and redeploy — the test-mode
   badge disappears.
3. Have the pilot association re-onboard in live mode: **live Connect accounts
   are separate from test ones**, so `stripe_connect_account_id` must be
   re-created. Clear the field (or re-run onboarding, which is idempotent only
   per mode) before handing the card to the board.
4. Smoke test §5 steps 3–6 once with a real card and a small real amount, then
   refund it from the Stripe Dashboard.
5. Watch Stripe → Webhooks for the first week; any non-200 on `account.updated`
   means org flags are drifting from Stripe.

---

## 7. Known gaps (deliberate, per VISION.md "What NOT to build")

- **No payout ledger** — `payout.*` events are logged, not stored. A payout
  reconciliation view is Phase 7 at the earliest.
- **No reconciliation engine, no fund segregation.** The monthly
  opening + activity + closing view is the line.
- **Refunds** flow back through `charge.refunded` → transaction `status:
  refunded` and a negative credit on the payment request; the application fee is
  **not** automatically refunded — do that in the Stripe Dashboard if you mean to.

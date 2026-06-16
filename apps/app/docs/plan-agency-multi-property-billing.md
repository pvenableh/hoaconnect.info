# Agency / multi-property billing — spec

**Status:** Plan only (not built). Author target: a property-management company (or any
owner) that runs several properties under one account and one invoice.

**Companion docs:** [`plan-anthropic-ai-assistant-tokens.md`](./plan-anthropic-ai-assistant-tokens.md)
(shared "wallet/account spans orgs" idea), and the Vendors + Property-Manager work in
PR #280 (the per-property operational role this billing layer sits above).

---

## 1. The ask

> "What if a property management company wants to purchase an account to use for multiple
> properties? Can a user purchase multiple accounts with the same email and login?"

Two distinct things, often conflated:

1. **Operational multi-property access** — one person logging in and working across many
   properties. **This already works** and needs nothing new (see §3).
2. **Consolidated billing** — one Stripe customer, one card, one invoice, one subscription
   covering N properties, with an agency-level view. **This is the net-new work** and is
   what this spec covers.

Design bias (per owner): keep it **simple and focused** — one subscription with a property
count, not a QuickBooks-grade billing engine. Resist per-property invoices, split payments,
and reseller margins in v1.

---

## 2. Current state (ground truth)

Today it is strictly **1 org = 1 subscription = 1 Stripe customer**:

- `hoa_organizations` carries its own billing: `stripe_customer_id`,
  `stripe_subscription_id`, `subscription_status` (`active|trial|canceled|expired`),
  `trial_ends_at`, `billing_cycle`, `subscription_plan`, `is_free_account`
  (`types/directus.ts:695-744`).
- Checkout: `POST /api/stripe/subscription` creates the customer + subscription;
  `POST /api/stripe/webhook` maps Stripe status → `subscription_status` on the org
  (`server/api/stripe/webhook.post.ts:286-394`).
- Plans: `subscription_plans` (`price_monthly/yearly`, `stripe_price_id_monthly/yearly`,
  `max_members`, `max_storage_gb`, `trial_days`, …).
- Gating: `app/middleware/subscription.ts` reads the **org's own**
  `subscription_status` / `is_free_account` / `trial_ends_at` and redirects to
  `/subscription-expired` when not entitled.
- Multi-membership: `hoa_members` is a junction (`user` × `organization` × `role`), and
  `useSelectedOrg` already supports a user belonging to many orgs with an org switcher.
- **No** parent-org / agency / billing-group concept exists anywhere (confirmed by search).
- Separate concern, do **not** conflate: **Stripe Connect** (`stripe_connect_account_id`,
  `connect_*`) is resident-dues payouts *to* the HOA, not SaaS billing.

---

## 3. What already works (no change needed)

A property manager signs in with **one email** and is an `hoa_members` row in each property
they manage (any role: HOA Admin or the new Property Manager). `useSelectedOrg` lists all
their memberships and the org switcher moves between them. So "one login, many properties"
is done. The gap is purely **who pays and how it's packaged.**

---

## 4. Recommended model — a `billing_accounts` entity

Introduce a platform-level **billing account** that owns one or more organizations and holds
the single Stripe customer + subscription. An org either:

- **belongs to a billing account** (agency-billed), or
- **bills itself** (today's behavior — unchanged, the default).

```
billing_account (1) ───< hoa_organizations (N)
      │                         │
      │ owns Stripe customer    │ org points back via billing_account (nullable FK)
      │ + ONE subscription      │
      │ quantity = # active     └─ subscription fields become advisory/empty when
      │   properties               billing_account is set (entitlement resolves up)
      └─< billing_account_members (who can manage billing / agency dashboard)
```

### Why one subscription with a quantity (not N subscriptions, not N invoices)

- **Simplest mental model + simplest Stripe object graph:** one customer, one subscription,
  `quantity = number of active properties`. Stripe handles proration automatically when the
  count changes.
- Per-property invoices/subscriptions multiply webhook complexity and reconciliation for
  little gain. Defer to a later "enterprise" need.
- **v1 pricing is flat per property** (one price per seat, no volume tiers). Stripe tiered
  pricing is a drop-in later change — same subscription shape, just swap the price — so
  starting flat costs nothing in rework.

### Two Stripe shapes (decided: A)

- **A. Licensed per-seat (chosen):** one subscription item, `quantity = active property
  count`, **flat per-seat price**. Adding a property `++quantity` (proration); removing
  `--quantity`.
- **B. Metered per-seat:** report usage = property count each period. More flexible for
  mid-cycle churn, but needs a usage-report job and is harder to reason about. Skip in v1.

---

## 5. Data model changes

### New collection `billing_accounts` (platform-level, like `subscription_plans`)

| field | type | notes |
|---|---|---|
| `id` | uuid | pk |
| `name` | string | "Acme Property Management" |
| `status` | enum `active\|past_due\|canceled\|suspended` | mirrors Stripe |
| `owner` | m2o `directus_users` | primary billing contact |
| `stripe_customer_id` | string | the single customer |
| `stripe_subscription_id` | string | the single subscription |
| `subscription_plan` | m2o `subscription_plans` | the agency plan/tier |
| `billing_cycle` | enum `monthly\|yearly` | |
| `subscription_status` | enum `active\|trial\|past_due\|canceled\|expired` | source of truth for child orgs |
| `trial_ends_at` | timestamp | trial across the account |
| `seats_purchased` | integer | = Stripe quantity (denormalized) |
| `included_properties` | integer | optional: N properties bundled before per-seat |
| `is_free_account` | boolean | comp'd agency |
| system fields | | created/updated |

### New junction `billing_account_members`

`billing_account` × `user` × `role` (`owner|billing_admin|viewer`) — who can see the agency
dashboard and manage payment method / properties. Distinct from `hoa_members` (per-property
operational access).

### Change on `hoa_organizations`

- Add `billing_account` (nullable m2o `billing_accounts`, `on_delete: SET NULL`).
- **Keep** the existing per-org `stripe_*` / `subscription_status` fields — they remain the
  store for self-billed orgs and are simply ignored (or mirrored read-only) when
  `billing_account` is set. No destructive migration; everything is additive (mirrors how
  `inquiry_routing` / `manager_permissions` were added in PR #280).

### Migration script (idempotent, same pattern as `scripts/create-property-management.ts`)

`scripts/create-billing-accounts.ts`: create `billing_accounts` + `billing_account_members`,
add `hoa_organizations.billing_account`, set permissions (App Admin full; billing-account
members read their own account; org admins read the parent account's status only). Then
`pnpm generate:types`.

---

## 6. Entitlement resolution (the one core rule)

Replace "read the org's own subscription" with **"resolve effective entitlement"**:

```
effectiveSubscription(org):
  if org.billing_account is set → use billing_account.{subscription_status,
       trial_ends_at, is_free_account}
  else → use org.{subscription_status, trial_ends_at, is_free_account}   // unchanged
```

- Implement once in a server util `server/utils/entitlement.ts` (`getEffectiveEntitlement(orgId)`)
  and a matching client helper, then have `app/middleware/subscription.ts` and
  `useSelectedOrg`'s `isFreeAccount`/status reads call it.
- Over-seat behavior (**decided: auto-increment**): adding a property bumps the Stripe
  subscription `quantity` and prorates up automatically — no speed bump when onboarding.
  Removing a property `--quantity` and prorates back down. (`seats_purchased` is just the
  denormalized mirror of the live Stripe quantity, not a hard cap.)

---

## 7. Stripe + webhook changes

- **Checkout:** new `POST /api/stripe/billing-account/subscribe` — creates one customer +
  one subscription with `quantity = initial property count` on the agency plan's flat
  per-seat price. Reuses the SetupIntent/PaymentIntent trial pattern already in
  `server/api/stripe/subscription.post.ts`. One trial per agency (`trial_ends_at` on the
  billing account; properties never carry their own trial once account-billed).
- **Add/remove property:** `POST /api/stripe/billing-account/sync-seats` updates the
  subscription item `quantity` to the current active-property count (Stripe prorates).
  Called automatically when a property is attached to / detached from the account
  (auto-increment, §6). Restricted to `owner`/`billing_admin`.
- **Webhook (`server/api/stripe/webhook.post.ts`):** when the event's customer/subscription
  matches a `billing_accounts` row, update **that** row's status/seats and **do not** touch
  child orgs' fields — child orgs resolve up (§6). Keep the existing per-org branch for
  self-billed orgs. Distinguish by looking up `billing_accounts.stripe_subscription_id`
  first, then fall back to `hoa_organizations.stripe_subscription_id`.
- Add the agency plan's `stripe_price_id_*` (flat per-seat) to `subscription_plans` or a
  dedicated agency plan row.

---

## 8. Access & UX

- **Agency dashboard** at `/billing/[accountId]` (or `/agency`): list of properties (status,
  member counts, dues health), seat usage (`active / seats_purchased`), one payment method,
  one invoice history, "Add property" → spins up an org already attached to the account.
- **Roles:** `billing_account_members` (`owner`/`billing_admin`/`viewer`) gate the dashboard
  + payment method; per-property work still flows through `hoa_members` roles. A billing
  admin is **not** automatically an HOA Admin of each property (they add themselves or staff
  as `hoa_members` per property — reuse the existing invite flow).
- **Org switcher** already covers cross-property navigation; add an "All properties" entry
  that deep-links to the agency dashboard when the user is a billing-account member.

---

## 9. Onboarding & migration flows

1. **New agency:** sign up → create `billing_accounts` + Stripe customer/subscription
   (quantity 1 or N) → create first property org with `billing_account` set → add more
   properties from the dashboard (each `++quantity`).
2. **Existing self-billed org joins an agency:** create/choose a billing account, set the
   org's `billing_account`, `++quantity`, and **cancel the org's own Stripe subscription**
   (prorate/refund per policy). Entitlement immediately resolves up.
3. **Property leaves an agency:** clear `billing_account`, `--quantity`; the org reverts to
   self-billed (must subscribe on its own or it expires per normal gating).
4. **Backward compatibility:** every existing org has `billing_account = null` → behaves
   exactly as today. Zero forced migration.

---

## 10. Decisions (resolved with owner)

1. **Pricing:** **flat per-property** in v1 (no volume tiers, no `included_properties`
   bundle). `included_properties` field is still added but left `0`/unused — cheap option
   for later. Tiers are a later price swap, no rework.
2. **Over-seat:** **auto-increment** the Stripe quantity on property add (proration); no
   hard cap / no block. See §6.
3. **Trial:** **one trial per agency** (`trial_ends_at` on `billing_accounts`); properties
   don't carry their own trial once account-billed.
4. **Who can add properties:** **`owner` / `billing_admin` only** (enforced in the
   add-property + `sync-seats` routes).
5. **Connect payouts:** agency-billed properties **keep their own Connect** (resident dues)
   — orthogonal, no change.
6. **Cancellation:** if the agency subscription lapses, **all child properties go `expired`
   together** via the §6 entitlement resolution (no per-property grace).

---

## 11. Phased rollout

- **P1 — data + resolution:** `billing_accounts` + `billing_account_members` +
  `hoa_organizations.billing_account`; `getEffectiveEntitlement`; middleware + `useSelectedOrg`
  switch to it. No new Stripe flow yet (accounts seeded as `is_free_account` or manually).
  *Ships the model; lets you onboard an agency by hand.*
- **P2 — Stripe:** subscribe + seat-sync endpoints, webhook routing, tiered agency plan.
- **P3 — agency dashboard:** properties list, seat usage, payment method, add-property,
  invoices.
- **P4 — migration tools:** move a self-billed org into/out of an account with proration.

Each phase is independently shippable and additive; P1 alone makes consolidated billing
possible (even if seats are managed manually) without touching any existing org.

---

## 12. Out of scope (name them so they're not assumed)

- Per-property invoices / split statements / PO-based billing.
- Reseller margins or the agency re-billing properties at a markup.
- Cross-property data sharing (each org stays isolated — non-negotiable for HOAs).
- Usage-metered billing (defer; licensed quantity is enough for v1).

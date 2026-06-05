# Prompt — Phase 7b: Financials (dues + expenses + Stripe Connect), per-org module toggles, Dashboard/Building tabs, Documents list view

> Hand this to a fresh Claude Code session in the `hoaconnect` repo. Self-contained.
> Strategic context: `docs/ROADMAP.md`; conventions mirror
> `docs/prompts/phase6-resident-records-governance.md` (idempotent `scripts/`
> migrations, confirm before running, then `pnpm generate:types`, then permissions
> in the same script). Product is a multi-tenant HOA SaaS (Nuxt 4 + Directus, code
> name **Property Flow**). `types/directus.ts` is the schema source of truth.

This phase has four independent tracks. Do them in order; each is shippable on
its own. **Confirm every backend script with the user before running it.**

> **Phase 7a already shipped (match its conventions for any new pages/UI).**
> - Standard page width is `max-w-6xl` via `<PageContainer>` (a flat
>   `app/components/ui/PageContainer.vue` primitive, auto-imported, no prefix); pass `wide` for
>   `max-w-7xl`. Every new authenticated page should wrap its content in
>   `<PageContainer>` (or `<PageContainer class="space-y-6">`) instead of a bespoke
>   `max-w-*` wrapper — the header breadcrumb row auto-aligns to it via
>   `usePageWidth()`.
> - Back links use `<BackLink :to="…" label="…" />`; breadcrumbs render
>   automatically from the route (`app/components/App/Breadcrumbs.vue`).
> - Data tables: `text-sm` body, headers `text-xs font-medium uppercase
>   tracking-wide t-text-muted`, row actions in a `flex items-center justify-end
>   gap-2` row (not stacked). Circular icon buttons use
>   `inline-flex items-center justify-center w-10 h-10 rounded-full t-bg-subtle`.

---

## Track A — Surface the financials that already exist, then add expenses

### What already exists (verified — do NOT rebuild)
Back-end for **resident dues/payments is largely built but not surfaced**:
- Collections (note: `payment_*` prefix, no `hoa_`):
  - `payment_requests` { status(draft|active|paid|partially_paid|overdue|canceled),
    organization, member, request_type(monthly_dues|assessment|late_fee|other),
    title, description, amount, due_date, amount_paid, amount_remaining, paid_at,
    email_sent*, reminder_sent*, notes, metadata, transactions (O2M) }.
  - `payment_schedules` { status, organization, member, title, amount,
    frequency(monthly|quarterly|annually), start_date, end_date,
    next_payment_date, total_payments_generated, … } — recurring dues.
  - `payment_transactions` { status(pending|succeeded|failed|canceled|refunded),
    organization, member, amount, currency, description, stripe_payment_intent_id,
    stripe_charge_id, stripe_customer_id, stripe_payment_method_id,
    stripe_payment_method, receipt_url, processing_fee, net_amount,
    payment_request (M2O) }.
- Org fields: `default_monthly_dues`, `late_fee_amount`, `late_fee_enabled`,
  `payment_grace_period_days`, `payment_instructions`, `stripe_customer_id`,
  `stripe_subscription_id`, `subscription_*`.
- Stripe: `server/api/stripe/paymentintent.post.ts`,
  `server/api/stripe/connect/account.post.ts` + `account-link.post.ts`
  (Connect onboarding). Components: `app/components/Payment/{Methods,StripeCard,SubscriptionForm}.vue`,
  `app/components/Settings/{ConnectPayoutsCard,PaymentSettingsForm,SubscriptionSettingsCard}.vue`.
  Composables: `useStripePayment`, `useCoupons`.

### What's missing (build this)
1. **Un-hide payment settings + Connect onboarding.** In
   `app/components/pages/SettingsOrganizationPage.vue` the **Payment Settings tab
   is commented out** ("Hidden for now", ~line 72). Restore it (wire
   `SettingsPaymentSettingsForm`) and surface `ConnectPayoutsCard` so an admin can
   enable Stripe Connect (deposits resident dues directly). Confirm the connect
   server routes work end-to-end (account → account-link redirect).
2. **The member `/payments` page does not exist** even though the member dock links
   to `/payments` (`useAppNav.ts` MEMBER_APPS). Build
   `app/pages/[slug]/payments/index.vue`: a member sees their own
   `payment_requests` (open balance, due dates) and pays via the existing
   `Payment*` components + `useStripePayment`; show paid history from
   `payment_transactions` (receipt_url links).
3. **Admin "record a payment / create a charge" UI.** Build
   `app/pages/[slug]/admin/payments/index.vue` (admin middleware): list/filter
   `payment_requests` by member/status; create one-off charges and recurring
   `payment_schedules`; mark manual/offline payments paid (create a
   `payment_transactions` row with status succeeded). Reuse existing collections —
   do not invent new ones for dues.

### New: expenses (money out)
4. `scripts/create-expenses-collection.ts` (`pnpm create:expenses`) — create
   **`payment_expenses`** (match the `payment_*` family):
   | field | type | notes |
   |---|---|---|
   | `status` | string | draft / approved / paid |
   | `title` | string (required) | |
   | `category` | string | maintenance / utilities / insurance / landscaping / admin / other |
   | `vendor` | string | payee |
   | `amount` | decimal (required) | |
   | `expense_date` | timestamp | |
   | `paid_date` | timestamp | |
   | `description` | text | |
   | `receipt` | file (M2O directus_files) | receipt/invoice |
   | `notes` | text | |
   | `organization` | M2O (required) | tenancy |
   | + system fields | | |
   Permissions (Phase 5/6 pattern, in the same script): admins manage all in org;
   members **no access** (board treasurer access is via the admin role / the
   `admin-or-board` server pattern from Phase 6 if board read is wanted — confirm
   with user). Then `pnpm generate:types`.
5. **`useExpenses()` composable** + admin UI on
   `app/pages/[slug]/admin/expenses/index.vue` (or a tab on the admin payments
   page): list/add/edit expenses, upload receipts (`useDirectusFiles`).

### Financial reporting (simple — not QuickBooks)
6. A lightweight **admin financials overview** (own page or the first tab of admin
   payments): income (sum of succeeded `payment_transactions` / paid
   `payment_requests`) vs expenses (sum of `payment_expenses`) for a selected
   period, a net figure, and a short recent-activity list. Keep it simple and
   visual — the user explicitly does NOT want heavy accounting. A small chart is
   fine (`app/components/ui/chart` exists).

### Dock
- Add an **admin "Finances" dock app** (icon `wallet` or `circle-dollar-sign`) in
  `useAppNav.ts` ADMIN_APPS → `/admin/payments`. Keep the member `payments` entry
  (now that the page exists). Gate both via the module toggle from Track B.

---

## Track B — Per-org module toggles ("manage what they manage")

Let each org enable/disable optional modules; disabled modules hide from the dock
and their pages refuse access. **Simple on/off toggles — not a granular Directus
permission editor.**

1. `scripts/add-org-modules-field.ts` (`pnpm add:org-modules`) — add a `modules`
   **JSON** field to `hoa_organizations` (interface `input-code`/json or a custom
   list). Shape: `{ pets: true, vehicles: true, leases: true, rules: true,
   polls: true, requests: true, meetings: true, feed: true, payments: true,
   expenses: true, … }`. Default = all enabled (treat missing keys as enabled so
   existing orgs are unaffected). Then `pnpm generate:types`. No permission change
   needed (it's org-config; the existing org read perms already expose org fields).
2. **`useModules()` composable** — reads the current org's `modules` (via
   `useSelectedOrg`/`useActiveHoa`), exposing `isEnabled(key)` with a default of
   `true` for unknown/missing keys.
3. **Gate the dock**: in `useAppNav.ts`, filter `ADMIN_APPS`/`MEMBER_APPS` by
   `isEnabled(app.key)` (map each app key to a module key). Always keep core apps
   (dashboard, settings) non-toggleable.
4. **Gate the pages**: add a `module` route middleware (or a guard in each
   optional page) that redirects to the dashboard/documents when the module is
   off — so a disabled module isn't reachable by direct URL.
5. **Settings UI**: a new "Modules" tab in `SettingsOrganizationPage.vue` — a list
   of switches (use `app/components/ui/switch`) writing back to
   `organization.modules`. Group as "Community" (feed, polls, requests, meetings),
   "Records" (pets, vehicles, leases, rules), "Money" (payments, expenses).

---

## Track C — Merge the Building feed into the Dashboard as tabs

1. Combine the **Dashboard** and **Building** (feed) views into one app with a
   segmented-pill tab switch (**Dashboard | Building**). The dashboard page is
   `app/pages/[slug]/dashboard.vue` (+ `app/components/pages/DashboardPage.vue` /
   `MemberDashboardPage.vue`); the feed is `app/pages/[slug]/feed/` driven by
   `useActivityFeed`. Render the existing feed component inside a "Building" tab
   rather than duplicating logic.
2. **Remove the separate "Building"/feed dock entry** from `ADMIN_APPS` and
   `MEMBER_APPS` in `useAppNav.ts` (the tab replaces it); keep `/feed` working as
   a redirect to the dashboard's Building tab (e.g. `?tab=building`) so existing
   links/notifications don't break.
3. Respect the Track B `feed` module toggle (hide the Building tab when disabled).

---

## Track D — Documents: add a list/table view alongside the board

`/admin/documents` (`app/components/pages/DocumentsPage.vue`) currently renders a
**category board (kanban) only** — categories as columns, drag-to-categorize.
That's good for organizing but weak for the common admin tasks: scanning across
categories, finding one file fast, and density. Add a list view alongside it.

1. **Board | List toggle** — a segmented-pill switch (`ui/tabs` or the existing
   segmented pattern) at the top of the admin Documents page. Persist the choice
   (localStorage or `?view=list`), **default to List** (faster day-to-day); keep
   Board for recategorizing.
2. **List view** — a flat table of all documents reusing the **Phase 7a table
   conventions** (`text-sm` body; `text-xs uppercase tracking-wide t-text-muted`
   headers; row actions in a `flex items-center justify-end gap-2` row). Columns:
   Name (link to `/documents/[id]`), Category, Date (published/created), Size,
   Actions (edit / change-category / delete). Sortable by Name and Date.
3. **Reuse the data already fetched** for the board (no new fetch) and the existing
   category/edit/delete handlers. The board stays for drag-to-categorize.
4. If documents becomes toggleable in Track B, respect the `documents` module gate;
   otherwise leave it as a core app.
5. *(Optional, only if quick)* mirror a simple list/grid choice on the member
   `/documents` page (`MemberDocumentsPage.vue`); otherwise leave the member view
   as-is.

---

## Conventions (apply to every track)
- **Backend changes** = idempotent TS script in `scripts/` (copy
  `scripts/create-polls-collections.ts`), needs `DIRECTUS_STATIC_TOKEN`,
  **explicit user confirmation before running**, then `pnpm generate:types`, then
  permissions in the same script. `types/directus.ts` is the source of truth —
  only query fields that exist.
- **Additive & non-destructive.** Missing `modules` keys default to enabled so no
  existing org loses functionality.
- **UI** — Tailwind v4 (`color-mix`, not raw HSL); glass via `.ios-card`/`.glass*`;
  `.spinner-ios`; pill buttons; segmented-pill tabs (see `ui/tabs`); TipTap for
  rich text; `t-*` theme utilities. UI primitives under `app/components/ui` are
  auto-imported without a prefix; other components are path-prefixed (e.g.
  `<PaymentMethods>`, `<SettingsConnectPayoutsCard>`).
- Money: store decimals; format with `Intl.NumberFormat(..., { style: 'currency',
  currency: 'USD' })`. Stripe amounts are in cents at the API boundary — follow
  the existing `useStripePayment`/`paymentintent` conventions.
- **Role model gotcha (from Phase 6):** there is no Directus "board member" role —
  board status is app-derived. For anything board-treasurer-specific, enforce via
  an elevated server route (`getTypedDirectus()` + `checkAdminAccess` + manual
  board-term lookup) like `server/api/hoa/units/records.get.ts`, not a row policy.

## Verification setup (gotchas — same as prior phases)
- Preview server runs HOA on **:3000** (Directus CORS only allows
  `http://localhost:3000`). Use the `preview_*` tools.
- **Login is manual** — ask the user to log in; org dashboard is `/605-lincoln/dashboard`.
- Stripe should run in **test mode** for verification (test keys / test cards);
  do not trigger live charges. Confirm which keys are configured before testing a
  payment.
- Recurring `[auth-refresh] 401 No refresh token available` console errors are
  preview session aging — NOT a bug.
- Verify compilation by fetching transformed modules
  (`/_nuxt/@fs/<abs-path>.vue`) and watch `preview_console_logs`/`preview_logs`.
- **Clean up any test rows** you create on the live Directus when done.

## Suggested order
Track B (module toggles — small, unblocks gating the new dock apps) → Track A
(financials: un-hide settings → /payments → admin payments → expenses script →
expense UI → reporting) → Track C (dashboard/Building tabs) → Track D (documents
list view — small, self-contained UI).

# HOA Connect — Go-to-Market Roadmap

> Living document. Last updated 2026-08-18.
> Product working name in code: **Property Flow**. Public domain: hoaconnect.info.
> **Product vision + strategic phase sequence: [VISION.md](VISION.md)** — "Your
> community owns everything. Everyone can see it." The vision's 7-phase roadmap
> supersedes the ordering below for NEW strategic work; the phase sections below
> remain authoritative for the detailed checklists they contain (the vision's
> Phase 1 *is* Phase 1 below — same Connect activation blockers).

## Shipped since this roadmap was first written (2026-06 → 2026-08)

A lot landed that the phases below predate. For an accurate picture of what
exists, treat this list as authoritative over the older phase text:

- **AI assistant + token economy** — chat, RAG (Voyage), draft/rewrite, wallet/
  credits, HITL actions, graduated autonomy. Needs `ANTHROPIC_API_KEY` (+ `VOYAGE_API_KEY` for RAG).
- **Communications** — email templating/scheduling/branding, MJML block builder,
  inbound webhook, CC/BCC, white-label sender; channels (threaded internal comms);
  universal comments + requests/tickets workflow; meetings; polls.
- **Projects**, **teams/roles**, **governance/leases/property-management**, **org file storage**.
- **Billing** — flat per-building band pricing + multi-property **agency billing** (Stripe Subscriptions).
- **Public landing builder** — drag-drop editor + live preview + AI wizard, classic/modern themes.
- **Public "try the app" demo** — two seeded orgs, nightly reset.
- **Simple financial reporting** (Phase 2, partial) — monthly running balance,
  income-by-type, expense-by-category, delinquency aging, CSV export. See the
  Reports tab on the Finances page (`/admin/payments`).
- **Health**: typecheck 0 errors, 300+ passing unit tests (was "no test coverage").

## North star

A multi-tenant SaaS for HOA / condo / property associations. One platform, many
associations, each on its own subdomain (`sunsetvilla.hoaconnect.com`). Boards
run their community (members, units, documents, announcements, dues); residents
pay and stay informed. We bill the association a subscription; the association
collects dues into **its own bank account** via Stripe Connect, and we take a
small per-transaction platform fee.

Design language: **Earnest-style** — iOS "liquid glass", river-flow motion,
widget cards, sans-serif modern — for all admin/management surfaces, with a
configurable public landing page (editorial *classic* or glassy *modern*).

## Strategic decisions (locked 2026-06-04)

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | **Single multi-tenant SaaS**; 1033 becomes tenant #1 | Fastest path to revenue; no split codebases |
| Custom/APEX domains | ~~Removed~~ → **BUILT** (2026-07): verify + serve org landing at the clean root (605lincolnroad.com live) | Sovereignty story needs the community on its own domain; host-first upgrade planned (VISION.md Pillar E) |
| Custom bespoke frontends | **Standalone Nuxt projects** consuming a public site API — NOT in-monorepo apps | See [plan-bespoke-removal.md](plan-bespoke-removal.md); `apps/_bespoke-starter` to be removed |
| Finances scope | **Simple reporting, NOT QuickBooks** | 1033's fund-segregation/reconciliation engine is the cautionary tale — do not port it |
| SaaS billing | Stripe Subscriptions (built) | Refactor to data-driven plan config (Earnest's `EARNEST_PLANS` pattern) |
| Dues collection | **Stripe Connect (Express)** — to be built | Funds land in the association's bank; platform application fee = our cut |

## The three repos

- **hoaconnect** (this repo) — Nuxt 4 + Directus. The product. Subdomain tenancy,
  Stripe subscriptions + webhooks, 3-theme system, admin CRUD all built.
- **~/Sites/earnest/earnest** — Nuxt 4 + Directus. UX reference. Source of the
  glass/river/iOS design system and the data-driven Stripe plan pattern. Patterns
  are **ported**, not merged.
- **~/Sites/1033/main** — Nuxt 3 + Directus. Single-property site. Beautiful
  serif/editorial landing (port as `classic` style). Becomes tenant #1. Its
  finance engine is over-engineered — **left behind**.

## Phased plan

Dependency order: Stripe Connect → reporting ledger is a chain. Admin UX and
landing themes are independent design tracks that can interleave.

### Phase 1 — Stripe Connect (revenue gate) — CODE-COMPLETE, NOT ACTIVATED
Built end-to-end on `core/server/api/stripe/`. See `docs/prompts/phaseB-stripe-connect.md`.
- [x] Express account creation + onboarding links per organization (`stripe/connect/account*.post.ts`)
- [x] Store `stripe_connect_account_id` + onboarding status on `hoa_organizations`
- [x] Onboarding status UI in org settings (`Settings/ConnectPayoutsCard.vue`)
- [x] Route resident dues PaymentIntents through the connected account
      (`transfer_data.destination` + `application_fee_amount`, `paymentintent.post.ts:95`)
- [x] Extend webhook for `account.updated` (syncs charges/payouts enabled)
- **Before going live:**
  - [x] **Security:** both Connect endpoints server-verify the caller is an admin of the
        org (`requireAdminAccess`) — the client-supplied `organizationId` grants nothing
        (`ca6e4d2`, `tests/server/connect-endpoints.test.ts`).
  - [x] First Stripe/payments tests — fee math + destination routing + card/ACH params
        (`tests/server/paymentintent.test.ts`) and webhook writes, idempotency, and
        `account.updated` sync (`tests/server/stripe-webhook.test.ts`). The webhook now
        dedupes `payment_intent.succeeded` on the PaymentIntent id (Stripe retries were
        double-crediting `payment_requests.amount_paid`).
  - [ ] Operator activation — follow **[connect-activation-runbook.md](connect-activation-runbook.md)**:
        `pnpm add:connect-fields` + `generate:types`, permissions audit, enable
        `account.updated`/`payout.*` on the webhook endpoint, set
        `STRIPE_CONNECT_FEE_PERCENT`, then the test-mode pilot smoke test.

### Phase 2 — Simple reporting ledger — IN PROGRESS
Data lives in `payment_requests` (money in), `payment_transactions` (Stripe/manual),
`payment_expenses` (money out). Manual entry already exists (Finances page + Expenses page).
- [x] **Manual entry of income AND expenses** (checks, Zelle, cash, offline) — Finances/Expenses pages
- [x] Reports: running balance, income-vs-expense by category, dues delinquency aging
      — pure module `core/shared/reporting/ledger.ts` (unit-tested) rendered by the
      **Reports tab** on the Finances page (`Payment/FinancialsReport.vue`), with CSV export.
- [x] Auto-write income rows from successful dues payments — webhook writes `payment_transactions`
- [ ] PDF export (CSV shipped; PDF still pending)
- [x] Opening-balance setting per org — `opening_balance` + `opening_balance_date`
      (`pnpm add:opening-balance`), threaded through `ledger.ts` (`summarize`/`monthlySeries`
      take the balance and drop entries dated before the as-of date) and edited in
      **Settings → Payments → Opening Balance**
- [ ] Explicitly NOT: fund segregation, reconciliation engine, transfer auto-linking

### Phase 3 — Earnest admin UX (design track) — IN PROGRESS
Port Earnest's design system into HOA Connect, additively.
- [x] iOS material CSS layer (glass, glass-surface, ios-card/group, river skeleton,
      spinner, accent-tinted scrollbar/selection, focus rings) adapted to HOA
      Connect's Tailwind v4 / wrapped-hsl tokens via `color-mix()`
      → `app/assets/css/earnest-ui.css` (imported in `main.css`)
- [x] `--app-accent-h/s/l` per-section accent system (+ `.accent-*` presets)
- [x] Reusable widget components → `app/components/Widget/{Glass,Stat,Skeleton}.vue`
- [x] Living style guide → `app/pages/ui-kit.vue` (view at `/ui-kit`)
- [x] Global primitive: shadcn `<Card>` (`[data-slot=card]`) auto-upgrades to iOS look
      inside any `.ui-kit` page → pages convert with just a wrapper + glass hero
- [x] Roll out across admin/management pages, sans-serif modern (all live-verified on 605-lincoln):
  - [x] Shared `DashboardStatsCard` upgraded to iOS card (same prop API → every caller benefits)
  - [x] Org dashboard (`DashboardPage.vue`) — reference implementation (glass hero, accent KPI cards, iOS panels, pill actions)
  - [x] Members (`MembersPage.vue`) — glass hero + auto-upgraded cards
  - [x] Units (`UnitsPage.vue`), Documents (`DocumentsPage.vue`), Settings (`SettingsOrganizationPage.vue`) — `.ui-kit` wrapper + accent
  - [x] Announcements (`AnnouncementsAdminPage.vue`), Email (`EmailPage.vue`) — glass hero + auto-upgraded cards
  - [x] Remaining: member dashboard, public board, payments, payment confirmation, subscription pages
  - [x] Polish pass: convert remaining bare panels to iOS cards, swap loaders to `spinner-ios`
  - [x] Avatar dropdown + header cleanup (`App/Nav.vue`): shadcn `dropdown-menu` added; My Profile / Theme + dark-mode (reuses `ThemeSelector`, premium-gated) / Logout
- **Meetings feature (new, beyond Phase 3 scope):** `hoa_meetings` + `hoa_meeting_attendees`
  (board-term hard-link + frozen `role_at_meeting` snapshot for historical accuracy) +
  `hoa_meetings_files` M2M. Created via `scripts/create-meetings-collections.ts`
  (`pnpm create:meetings`); also cleaned the `hoa_board_members.title` enum typos. Admin
  page `MeetingsAdminPage.vue` (CRUD + attendees), member `MeetingsPage.vue` (published view).
- **Still in progress:** floating bottom-dock nav (replaces top bar; per-app accent + palette
  persistence + per-app unread badges); unified categorized notification center.

### Phase 4 — Landing themes + 1033 migration (design track) — NOT STARTED
- [ ] Refactor theming toward Earnest's dual-axis model (`data-theme` × `data-style`)
- [ ] `classic` style = 1033's serif/editorial landing; `modern` = Earnest glass
- [ ] Per-tenant landing page theme setting
- [ ] Migrate 1033 in as tenant #1 (units, people, board, leases, dues)

### Phase 5 — Universal comments/reactions + Requests system (one-stop-shop) — NOT STARTED
Prompt: `docs/prompts/phase5-comments-reactions-requests.md`. The channels feature
already built a full messaging substrate (threaded, attachments, @mentions,
real-time, role-gated); this phase generalizes it into **three shared rails** —
comments, reactions, notifications — that every entity plugs into, then layers the
HOA requests/tickets workflow on top.
- [ ] **Universal comments** — custom polymorphic `hoa_comments` (target_collection +
      target_id, threaded, `is_internal` board-only notes), reusing the channel
      editor/@mention/upload internals. Drops a comment thread onto any entity.
- [ ] **Universal reactions** — custom polymorphic `hoa_reactions` (on comments OR
      entities), one (user, target, emoji), client-aggregated.
- [ ] **Role-based authorization** — code-first capability map (who may comment/react/
      see-internal per collection), hardened into `setup-directus-permissions.ts`.
- [ ] **Requests/Tickets** — single `hoa_requests` collection (Tier 1) with a `type`
      discriminator (maintenance / ARC / violation / complaint / task), shared
      lifecycle, conversation via the comment thread. **Tier 2** = config-driven
      per-type workflows in code (`requestWorkflows.ts`), no new tables.
- [ ] **Dock + notifications** — new Requests app; `comment` + `request` notification
      types wired into `useNotifications.ts` + dock badges.
- [ ] Explicitly NOT: Tier 3 ticketing (SLAs, assignment queues, vendor portal,
      email-in, kanban automations) — the QuickBooks trap.

## Known tech debt / cleanup
- Two disconnected token systems: shadcn HSL tokens (`tailwind.css`) vs `--theme-*`
  (`theme.css`). shadcn components don't currently respond to the theme switcher.
  Phase 3/4 should converge these.
- Legacy `tailwind.config.js` (v3-style) coexists with Tailwind v4 `@theme inline`
  in `tailwind.css`. The v4 config is authoritative.
- Test coverage skews to pure logic (`shared/*`) + access control. Zero tests on
  the runtime money path (Stripe/Connect), AI chat runtime + RAG, channels,
  requests runtime, projects, and the landing builder — highest-risk gap is payments.
- `app/pages/settings/subscription.vue` (per-org subscribe) predates the flat
  per-building **band** pricing (`subscribe-band.post.ts`, currently unwired) and
  should be reconciled with it. Its checkout now confirms via Stripe Elements and
  "Manage Billing" opens the Stripe portal (`stripe/portal.post.ts`), but the
  subscribe route doesn't yet persist `stripe_customer_id` to the org (webhook does).
</content>

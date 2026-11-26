# HOA Connect — Go-to-Market Roadmap

> Living document. Last updated 2026-11-26 (every phase item and tech-debt note
> re-checked against the code and git history that day).
> Product name: **HOA Connect** (renamed from "Property Flow" on 2026-08-27). Public domain: hoaconnect.info.
> **Product vision + strategic phase sequence: [VISION.md](VISION.md)** — "Your
> community owns everything. Everyone can see it." The vision's 7-phase roadmap
> supersedes the ordering below for NEW strategic work; the phase sections below
> remain authoritative for the detailed checklists they contain (the vision's
> Phase 1 *is* Phase 1 below — same Connect activation blockers).

## Where things stand (2026-11-26)

**The product is built; what stands between it and selling is mostly operator work.**
The live launch list is [gtm-checklist.md](gtm-checklist.md) (🔒 rows are launch
blockers, 👤 rows need Peter). Phases 2–5 below are shipped; Phase 1 is code-complete
and waits on Stripe dashboard steps.

**Still open, ranked by how directly it helps communities pay for HOA Connect:**

1. 🔒👤 **Activate Stripe Connect** — [connect-activation-runbook.md](connect-activation-runbook.md)
   §3–§6. Dues can't reach a community's bank (and the platform fee can't be taken) until
   it's done. Read 2026-11-12: 0 live connected accounts, no Connect webhook endpoint,
   0 of 7 communities onboarded.
2. 👤 **Extra Storage add-on in Vercel** — the $10/month and $100/year prices exist in
   both Stripe modes (2026-11-26); set the four `STRIPE_PRICE_ADDON_STORAGE_100_*` vars
   (go-live-checklist §1) and redeploy. The Settings toggle 503s until then.
3. 🔒👤 **Production env checks in Vercel** — `OUTBOUND_EMAIL_ONLY_TO` absent, VAPID private
   key and subject, the Anthropic and Voyage keys, both Stripe key pairs and `STRIPE_MODE`.
   AI features (credit spend) and push are dark or wrong without them.
4. 👤 **Finish verifying the subscription path** — the app's own Manage billing button, a
   refund round trip, and what payers see on a Connect onboarding screen.
5. 👤 **Trust and support basics** — a test mail to `support@`, one real email's SendGrid
   events landing, a status page, emailed replies to support (Inbound Parse DNS), and the
   privacy policy's email-preferences link.
6. 👤 **Demos and pilots** — look over the re-seeded `/demo` and `/demo-classic`, delete the
   transition fixture after its AI check, turn reminders on per pilot community.
7. **Code gaps** (no operator needed):
   - Tests for the landing builder's UI. (Its Save has no server route: it writes to
     Directus from the client, gated by `/api/hoa/find`'s `admin_view`, which is tested.)
   - Delegation covers documents, feedback, projects and responsibilities; inquiries,
     violations, directory, communications and meetings need routes first.
   - Directus-side enforcement of comment/reaction rules lives in `scripts/lib/*` and
     `setup-directus-permissions.ts`; `core/app/config/commentCapabilities.ts` only shapes
     the UI. Worth one written map of which rule lives where.
8. **Later, by decision:** marketing split to `app.hoaconnect.info`
   ([plan-marketing-split.md](plan-marketing-split.md)); caching the public `hoa/find`
   and more Directus instances ([prompts/perf-batch-next-routes.md](prompts/perf-batch-next-routes.md)).

## Shipped since 2026-08-18

Grouped from the commit log; each plan or spec has the detail.

- **Platform hardening** (VISION Phase 2, Aug) — host→org resolver and spoof guard, web
  push, three-signal versioning, marketing site moved into the app.
- **Data Trust export, Management Transition Wizard, Community Ledger, "Ask the HOA"**
  (VISION Phases 3–6, Aug) — [plan-phase6-owner-ai.md](plan-phase6-owner-ai.md).
- **One chrome, shared realtime WebSocket, chart kit, AI Board Room and notices, channel
  unread and mute** (Aug).
- **PayHOA-parity billing engine** — schedules, late fees, payment methods (Sep;
  [plan-payhoa-parity.md](plan-payhoa-parity.md)).
- **Earnest parity round 3** — glass shell, dock and page titles, email classes and send
  queue, reminders, PWA, channels v7, the audit gates, and launch Phase 9: band
  subscription on the settings page, refunds, Reports PDF (Oct–Nov;
  [plan-earnest-parity-round3-gtm.md](plan-earnest-parity-round3-gtm.md)).
- **Signup on band pricing** — discount codes, 14-day unpaid expiry, automatic re-banding
  (Nov; [prompts/signup-bands-build.md](prompts/signup-bands-build.md)).
- **Operator console** — read-only console, ops audit log, support inbox with emailed
  replies and attachments, system health (Nov; [plan-operator-console.md](plan-operator-console.md)).
- **Governing documents** — read routes, search, statute flags, counsel sign-off (Nov;
  [plan-governing-docs.md](plan-governing-docs.md)).
- **Role-first UX** — role context, one app registry, resource scaffold, money approvals
  and waivers, charge corrections, responsibilities pages and map, delegation, member
  restrictions, Tint and the glass sweep, dock and focus (Nov; [plan-role-first-ux.md](plan-role-first-ux.md)).
- **Unified experience** — role homes, motion and drag kits, notice acknowledgments
  (with swipe), forms to sign, requests work board (Nov; [plan-unified-experience.md](plan-unified-experience.md)).
- **1033 Lenox migrated and published** as a tenant (data Aug 22, published Nov 17).
- **Perf batching of Directus reads** — most page routes now make one Directus request
  (Nov 22–26; [prompts/perf-batch-next-routes.md](prompts/perf-batch-next-routes.md)).

## Shipped 2026-06 → 2026-08

The first wave after the phases below were written (kept as written then):

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
- **Health**: typecheck 0 errors, 300+ passing unit tests (was "no test coverage";
  4,867 across 297 files on 2026-11-26).
- **Responsibilities register** (role-first UX Phase 2b, [plan](plan-role-first-ux.md) §3.4) —
  who does each standing job, with dated history, board-term End / Change office / Correct,
  a published owner view and a PDF for the board. Spec: [spec-responsibilities.md](spec-responsibilities.md).
  Schema script, gate and routes shipped 2026-11-15; the pages (Session 7) 2026-11-16 and the
  map (Session 9) 2026-11-18. Due for the 1033 Lenox board, seated 2026-12-09.
- **Delegation to members** (role-first UX Session 8, [plan](plan-role-first-ux.md) §7) — an admin
  gives a member (a helper) or a committee (a team) some of a property manager's areas:
  documents, feedback, projects (without money) and the responsibilities register, each a dated
  grant that is ended, not erased, and recorded in the ledger. Spec: [spec-delegation.md](spec-delegation.md).
  Shipped 2026-11-17; inquiries, violations, directory, communications and meetings need routes first.
- **Restricted members** (role-first UX Session 10, [plan](plan-role-first-ux.md) §7) — an admin
  pauses a member's posting in one community, dated and recorded for the board, while dues, requests
  and reading carry on; the same change stops archived and inactive members writing through Directus.
  Spec: [spec-member-restrictions.md](spec-member-restrictions.md). Built 2026-11-17. The plan's
  Session 10 row still lists the operator steps (`pnpm add:admin-scope`, then
  `pnpm setup:permissions`); a later `setup:permissions:audit` read 0/0/0, so they appear
  applied, but no row says so outright.

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
  - [ ] 🔒👤 Operator activation (still open 2026-11-26; see the GTM checklist's row) — follow **[connect-activation-runbook.md](connect-activation-runbook.md)**:
        `pnpm add:connect-fields` + `generate:types`, permissions audit, enable
        `account.updated`/`payout.*` on the webhook endpoint, set
        `STRIPE_CONNECT_FEE_PERCENT`, then the test-mode pilot smoke test.

### Phase 2 — Simple reporting ledger — SHIPPED
Data lives in `payment_requests` (money in), `payment_transactions` (Stripe/manual),
`payment_expenses` (money out). Manual entry already exists (Finances page + Expenses page).
- [x] **Manual entry of income AND expenses** (checks, Zelle, cash, offline) — Finances/Expenses pages
- [x] Reports: running balance, income-vs-expense by category, dues delinquency aging
      — pure module `core/shared/reporting/ledger.ts` (unit-tested) rendered by the
      **Reports tab** on the Finances page (`Payment/FinancialsReport.vue`), with CSV export.
- [x] Auto-write income rows from successful dues payments — webhook writes `payment_transactions`
- [x] PDF export — "Export PDF" on the Reports tab (`useReportPdf`, `core/shared/reporting/report-pdf.ts`,
      `tests/shared/report-pdf.test.ts`; 2a6e2027, 2026-11-05)
- [x] Opening-balance setting per org — `opening_balance` + `opening_balance_date`
      (`pnpm add:opening-balance`), threaded through `ledger.ts` (`summarize`/`monthlySeries`
      take the balance and drop entries dated before the as-of date) and edited in
      **Settings → Payments → Opening Balance**
- Explicitly NOT: fund segregation, reconciliation engine, transfer auto-linking

### Phase 3 — Earnest admin UX (design track) — SHIPPED
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
- [x] Floating bottom dock (`App/Dock.vue`, `useDockApps.ts`; 6ea771c0, 2026-11-02) with per-app
      unread badges and a saved order (2fa274bb, 2026-11-21). Per-app accents and dock palettes
      were dropped by design for one per-person Tint (Appearance → Tint, 2026-11-18).
- [x] Categorized notification center — the bell reads `directus_notifications` with category
      tabs, unread counts and per-category switches (`Notification/Panel.vue`,
      `core/shared/notifications/bell.ts`; 8c45ecce, 2026-08-24).

### Phase 4 — Landing themes + 1033 migration (design track) — SHIPPED
- [x] Two-axis theming, done as classes rather than `data-style`: `html.theme-{classic,modern,luxury}-{light,dark}`
      (`useTheme.ts`, `theme.css`); the workspace uses `html.theme-app` (575765c5, 2026-08-21)
- [x] `classic` = 1033's serif/editorial landing, `modern` = glass, plus `luxury` (cc1ea0ce, 2026-06-04;
      193697e8; 654c9618, 2026-08-25)
- [x] Per-tenant landing theme (`settings.theme` → `forceThemeStyle` on `[slug]/index.vue`; cc1ea0ce)
- [x] 1033 Lenox migrated as a tenant (`scripts/migrate-1033.ts`; 7ca26a5c and ed8775ee, 2026-08-22;
      published e050f0d3, 2026-11-17). [prompts/phaseD-landing-themes-1033.md](prompts/phaseD-landing-themes-1033.md)
      still says "scaffolded, not run"; it predates the run.

### Phase 5 — Universal comments/reactions + Requests system (one-stop-shop) — SHIPPED (2026-06-04)
Prompt: `docs/prompts/phase5-comments-reactions-requests.md`. The channels feature
already built a full messaging substrate (threaded, attachments, @mentions,
real-time, role-gated); this phase generalizes it into **three shared rails** —
comments, reactions, notifications — that every entity plugs into, then layers the
HOA requests/tickets workflow on top.
- [x] **Universal comments** (a35d6367; `scripts/create-comments-collections.ts`, `useComments.ts`) — custom polymorphic `hoa_comments` (target_collection +
      target_id, threaded, `is_internal` board-only notes), reusing the channel
      editor/@mention/upload internals. Drops a comment thread onto any entity.
- [x] **Universal reactions** (a35d6367; `useReactions.ts`) — custom polymorphic `hoa_reactions` (on comments OR
      entities), one (user, target, emoji), client-aggregated.
- [~] **Role-based authorization** — `core/app/config/commentCapabilities.ts` decides what the UI
      offers; Directus enforcement lives in `create-comments-collections.ts`,
      `scripts/lib/admin-scope-perms.ts` (writes through posts_in) and
      `scripts/lib/shared-write-validations.ts` (members can't write `is_internal`), applied by
      `setup-directus-permissions.ts`. Enforced, but split across files rather than one map.
- [x] **Requests/Tickets** (dead5ee2; `scripts/create-requests-collections.ts`,
      `core/app/config/requestWorkflows.ts` with 6 types, a drag work board 2026-11-22) — single `hoa_requests` collection (Tier 1) with a `type`
      discriminator (maintenance / ARC / violation / complaint / task), shared
      lifecycle, conversation via the comment thread. **Tier 2** = config-driven
      per-type workflows in code (`requestWorkflows.ts`), no new tables.
- [x] **Dock + notifications** (dead5ee2; `bell.ts` maps comments and requests) — new Requests app; `comment` + `request` notification
      types wired into `useNotifications.ts` + dock badges.
- Explicitly NOT: Tier 3 ticketing (SLAs, assignment queues, vendor portal,
      email-in, kanban automations) — the QuickBooks trap.

## Known tech debt / cleanup

Re-checked 2026-11-26.

- ~~Two disconnected token systems~~ — mostly converged: the workspace (`html.theme-app`) and
  the classic and luxury landings map the shadcn variables to `--theme-*` (`theme-app.css`,
  `theme.css`); shadcn primitives are stock behind App* wrappers ([shadcn-census.md](shadcn-census.md)).
  The public `modern` landing still uses the static HSL values in `tailwind.css`, by design.
- ~~Legacy `tailwind.config.js`~~ — deleted (c985707c, 2026-08-21).
- Tests: the money path is now covered (`paymentintent`, `connect-endpoints`, `stripe-webhook`,
  `stripe-webhook-replay`, `stripe-mode`, `billing-band-route`, `signup-band`, `band-prices`,
  `reband`, `billing-engine`, …), as are channels, requests and projects, and now the AI
  chat route (`ai-chat-route`), ledger retrieval and indexing (`ledger-retrieval`) and the
  landing builder's AI wizard (`landing-ai-generate`), 2026-11-26. **Still untested:** the
  landing builder's UI. Its Save writes to Directus from the client (no server route); the
  `admin_view` gate it relies on is covered in `public-org-fields`.
- ~~`settings/subscription.vue` predates band pricing~~ — reconciled: the page reads
  `/api/org/billing/band` and subscribes through `/api/stripe/subscribe-band`, which saves
  `stripe_customer_id` before creating the subscription (2a6e2027, 2026-11-05). Only the app's
  own Manage billing button is unverified (GTM checklist §3).
- Stale docs: [prompts/phaseD-landing-themes-1033.md](prompts/phaseD-landing-themes-1033.md) ("scaffolded,
  not run") and [VISION.md](VISION.md)'s phase table, which records no status (by the commit log:
  Phase 1 code-complete, not activated; Phases 2–5 shipped Aug 2026; Phase 6 partly shipped;
  Phase 7 ongoing).

# HOA Connect — Go-to-Market Roadmap

> Living document. Last updated 2026-06-04.
> Product working name in code: **Property Flow**. Public domain: hoaconnect.info.

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
| Custom/APEX domains | **Removed** (already done) | Subdomain tenancy; custom domains = paid agency upsell later |
| Custom bespoke frontends | **Later upsell tier**, not built now | Decoupled API + custom Nuxt frontend is a premium add-on on top of the SaaS |
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

### Phase 1 — Stripe Connect (revenue gate) — NOT STARTED
Builds on existing `server/api/stripe/` infrastructure.
- [ ] Express account creation + onboarding links per organization
- [ ] Store `stripe_connect_account_id` + onboarding status on `hoa_organizations`
- [ ] Onboarding status UI in org settings (pending / restricted / active)
- [ ] Route resident dues PaymentIntents through the connected account
      (`transfer_data.destination` / `on_behalf_of`) with `application_fee_amount`
- [ ] Extend webhook for `account.updated`, `payout.*`, Connect payment events

### Phase 2 — Simple reporting ledger (depends on Phase 1) — NOT STARTED
The simplification: Connect payments auto-write ledger rows. **Plus manual entry.**
- [ ] Ledger collection: income + expense rows, category, method, date, memo, attachment
- [ ] Auto-create income rows from successful Connect dues payments
- [ ] **Manual entry of income AND expenses** (checks, Zelle, cash, offline) — required
- [ ] Reports: running balance, income-vs-expense by category, dues delinquency
- [ ] PDF export
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
- No test coverage.
</content>

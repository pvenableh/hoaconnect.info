# Prompt — Next session: orientation + execution order for the remaining roadmap

> Hand this to a fresh Claude Code session in the `hoaconnect` repo. This is the
> **master sequencing doc** — it says what's done, what's left, the order to do it
> in, and which detailed prompt to open for each track. The product is a
> multi-tenant HOA SaaS (Nuxt 4 + Directus, code name **Property Flow**), aiming to
> be a **one-stop-shop for HOAs**. Strategic context: `docs/ROADMAP.md`.

## Session status (branch `feat/roadmap-notifications-connect-phase5`)

All four tracks were advanced and committed on this branch (off `main`):

- **A — Notification center: DONE.** payment/document/membership categories +
  comment/request categories, dynamic filter chips, Sheet deep-links, dock
  badges, and the new `/{slug}/documents/{id}` detail page (fixes the broken
  deep-link). Frontend-only; queries existing collections. Live demo (publish a
  meeting, watch the badge) still needs a manual preview login.
- **B — Stripe Connect: CODE COMPLETE, not activated.** Connect routes, webhook
  events, dues routing, org-settings card, migration script. See
  `phaseB-stripe-connect.md` for the activation checklist (run migration, set
  fee %, wire `routeDuesToConnect`, Stripe test webhooks).
- **C — Phase 5 comments/reactions/requests: BUILT.** Polymorphic comment +
  reaction rails, requests/tickets system (Tier 1 + Tier 2 config), Requests
  dock app + pages, notification wiring. Collection scripts written but **NOT
  run** — `pnpm create:comments && pnpm create:requests`, then
  `pnpm generate:types`, before the UI has data.
- **D — Landing themes + 1033: landing DONE, migration scaffolded.** Per-tenant
  landing style applied; `migrate-1033.ts` needs the 1033 source creds + mapping
  confirmation. See `phaseD-landing-themes-1033.md`.

**Phase 5 backend is now LIVE** (collections + permissions created on the
Directus at `admin.hoaconnect.info`, `types/directus.ts` regenerated):
`hoa_comments`, `hoa_reactions`, `hoa_comment_reports`, `hoa_requests`,
`hoa_teams`, `hoa_team_members`, `hoa_polls`, `hoa_poll_votes`. So comments,
reactions, moderation/reports, requests, teams, and polls all have backing data
— verify in the preview with a manual login.

**Still NOT executed** (gated, run when ready): `add-connect-fields` +
`extend-landing-theme` (Tracks B/D — additive, harmless) and `migrate-1033`
(needs the 1033 source creds). Follow-up: extend the `hoa_requests` read filter
so team members can *list* all of their domain's requests via the API (today
they manage ones they can already open).

---

## Where we are (committed as of the last session)

A large design + feature pass is in `main` (commit `8bb0a0a`):
- **Earnest glass/iOS design system** — `earnest-ui.css`, `Widget/*`, `ui-kit`
  page, dashboard charts, page conversions.
- **Theme system is already dual-axis** — `useTheme.ts` applies
  `theme-{style}-{mode}` to `<html>`; styles `classic | modern | luxury` × modes
  `light | dark` are fully defined in `theme.css` (`--theme-*` vars + `.t-*`
  utilities). Persists to `localStorage` + `DirectusUser.{theme_light,appearance}`.
- **Floating dock nav** — `App/Dock.vue`, `useAppNav.ts`, `AppearanceSettings.vue`,
  header cleanup, hand-authored `dropdown-menu`.
- **Meetings feature** — collections + `MeetingsAdminPage`/`MeetingsPage` +
  `scripts/create-meetings-collections.ts`.
- **Channels (Slack-like) are production-ready** — `hoa_channels` +
  `hoa_channel_{messages,members,mentions}`, UI in `app/components/channels/*`,
  real-time. This is the messaging substrate Phase 5 generalizes.
- **Standard Stripe billing is built** — subscription + PaymentIntent +
  SetupIntent + webhook routes under `server/api/stripe/`. **Stripe Connect is
  entirely absent.**

### The prompt stack (detailed handoffs already written)
- `docs/prompts/phase3-polish-app-shell.md` — design-system rollout (mostly done).
- `docs/prompts/phase4-notifications-center.md` — finish the notification center.
- `docs/prompts/phase5-comments-reactions-requests.md` — universal comments +
  reactions + the requests/tickets system (fully specced, ready to build).

## Recommended execution order

The decision was **do all of it**; this is the order that minimizes wasted work
(finish in-flight → unblock dependents → land the revenue gate → go live). Each
track is independent enough to reorder if priorities shift — the one hard
dependency is **A before C** (Phase 5 plugs new types into the notification
center). Revenue-first readers can swap **B to first**.

```
A. Finish notification center   (small, in-flight, unblocks C)   → phase4 prompt
B. Stripe Connect               (revenue gate, highest value)    → §B below
C. Phase 5 comments + requests  (the one-stop-shop substrate)    → phase5 prompt
D. 1033 migration + landing     (go live with tenant #1)         → §D below
```

A and C have dedicated prompts — open those. B and D are scoped inline below
(promote each to its own `docs/prompts/*.md` when you start it).

---

## A. Finish the notification center — open `phase4-notifications-center.md`

In-flight and ~80% there. That prompt's tasks: category filter chips, the
`payment | document | membership` notification categories (confirm sources first),
fix the broken `/{slug}/documents/{id}` deep-link route, and demo the
meeting→notification flow end-to-end. Small, self-contained, and it unblocks C
(Phase 5 adds `comment`/`request` types into the same `useNotifications.ts`).

**Confirm with the user before building** — sources for the new categories, and
whether the center stays in the Bell dropdown or becomes a full glass sheet.

---

## B. Stripe Connect — the revenue gate (ROADMAP Phase 1) — scope

**Why first-for-value:** it's the only work that makes money. Today the
association can't collect dues into its own bank. Connect (Express) routes
resident dues into the association's account and takes a platform fee — our cut.

**Current state (verified):** standard Stripe is solid but Connect is *zero*.
- Routes: `server/api/stripe/{subscription,paymentintent,setup-intent,webhook}.post.ts`.
- Config in `nuxt.config.ts` runtimeConfig: `stripeSecretKeyTest/Live`,
  `stripeWebhookSecret`, `public.stripePublicKey`. API version pinned
  `2024-11-20.acacia` in each route. Webhook verifies `stripe-signature` via
  `stripe.webhooks.constructEvent`.
- Org billing fields on `hoa_organizations`: `stripe_customer_id`,
  `stripe_subscription_id`, `subscription_status`, `trial_ends_at`,
  `billing_cycle`. **No `stripe_connect_account_id`.** UI placeholder only:
  `ui-kit.vue` "Payouts (Stripe Connect) — Not connected".
- Dues today: `payment_requests` → `paymentintent.post.ts` creates a PaymentIntent
  (card / us_bank_account); `webhook.post.ts` writes `payment_transactions` on
  `payment_intent.succeeded` / `charge.*`.

**Scope (keep it Express + thin):**
1. Add Connect fields to `hoa_organizations` (via a `scripts/` migration +
   `pnpm generate:types`): `stripe_connect_account_id`,
   `connect_onboarding_status` (`none|pending|restricted|active`),
   `connect_charges_enabled`, `connect_payouts_enabled`.
2. `server/api/stripe/connect/account.post.ts` — create an Express account for an
   org; `connect/account-link.post.ts` — generate onboarding/refresh links.
3. Org-settings UI: "Connect payouts" card showing status + an onboard/continue
   CTA (replace the `ui-kit` placeholder; reuse glass card patterns).
4. Route **dues** PaymentIntents through the connected account: add
   `transfer_data.destination` (or `on_behalf_of`) + `application_fee_amount`
   (platform fee — confirm % with user) in `paymentintent.post.ts`, **only for
   dues**, leaving SaaS subscription billing untouched.
5. Extend `webhook.post.ts` for `account.updated` (sync onboarding status) and
   `payout.*` / Connect transfer events.

**Confirm with user first:** platform fee % (the application fee), whether dues
use destination charges vs `on_behalf_of`, and live-vs-test rollout.
**Out of scope:** the reporting ledger (ROADMAP Phase 2, depends on this) — note
it but don't build it here.

---

## C. Phase 5 — comments + reactions + requests — open `phase5-comments-reactions-requests.md`

The full spec is written: three shared rails (comments / reactions /
notifications) made polymorphic so every entity gets a conversation + reactions
gated by role, then the requests/tickets system (Tier 1 generic +
Tier 2 config-driven workflows: maintenance / ARC / violation / complaint / task)
as just another surface on those rails. **Do A first** — Phase 5 adds `comment`
and `request` types into the same `useNotifications.ts` you'll have just finished.

---

## D. 1033 migration + public landing themes (ROADMAP Phase 4) — scope

**Reality check (verified):** the theming refactor the roadmap describes is
**mostly already done** — `useTheme.ts` is dual-axis (style × mode) and
`theme.css` defines classic/modern/luxury × light/dark. So this track is really
two smaller things:

1. **Wire per-tenant theme to the public landing.** Org theme is stored on
   `BlockSetting.theme` (`hoa_organizations.settings` → `BlockSetting`) but it
   currently only allows `classic | modern` (no `luxury`) and the landing
   (`app/pages/[slug]/index.vue`) doesn't apply it. Extend the field to the full
   style set, apply the org's style to the landing render, and expose it in org
   settings. Converge the two token systems noted in ROADMAP tech debt (shadcn HSL
   vs `--theme-*`) only as far as the landing needs.
2. **Migrate 1033 in as tenant #1.** 1033 (the Nuxt 3 serif/editorial site at
   `~/Sites/1033/main`, live at 1033lenox.com) becomes the first real association:
   units, people, board, dues — mapped onto the existing `hoa_*` collections. Its
   editorial look = the `classic` style. **No migration scripts exist yet** —
   write a `scripts/migrate-1033.ts` following the idempotent `scripts/`
   conventions. Leave 1033's over-engineered finance engine behind (ROADMAP).

**Confirm with user first:** the field shape for per-tenant style, and the 1033
data source (export/DB access) before writing the migration.

---

## Cross-cutting conventions (apply to every track)

Full detail lives in `phase5-comments-reactions-requests.md` ("Conventions") — the
essentials:
- **Backend changes** = idempotent TS script in `scripts/` (copy
  `create-meetings-collections.ts`), needs `DIRECTUS_STATIC_TOKEN`, **explicit user
  confirmation before running**, then `pnpm generate:types`, then permissions in
  `setup-directus-permissions.ts`. `types/directus.ts` is the schema source of
  truth — only query fields that exist (a prior 500 came from querying nonexistent
  fields).
- **Additive & non-destructive** — don't touch unrelated fetch/data logic.
- **UI** — Tailwind v4 (`tailwind.css` `@theme inline` authoritative), `color-mix`
  not raw HSL; glass via `.ui-kit`/`.glass*`/`.ios-card`; `.spinner-ios`; pill
  buttons; segmented-pill tabs; TipTap (`ChannelEditor.vue`) for any rich text.
- **Rich text / files** — reuse the channels TipTap editor; file IDs → an
  `attachments` JSON field (don't add a second editor library).

## Verification setup (gotchas — same for every track)

- Preview server runs HOA on **:3000** (Directus CORS only allows
  `http://localhost:3000`). Use the `preview_*` tools, not Bash/Chrome MCP.
- **Login is manual** — ask the user to log in in the preview window; after login
  the org dashboard is `/605-lincoln/dashboard`.
- Recurring **`[auth-refresh] 401 No refresh token available`** console errors are
  just the preview session aging — NOT a bug; a re-login clears them.
- Verify compilation by fetching transformed modules (`/_nuxt/@fs/<abs-path>.vue`)
  and watch `preview_console_logs`/`preview_logs` for real errors vs. that noise.
- For Stripe work, use **test keys** and Stripe CLI / test webhooks; never touch
  live billing while developing.

## Start here

If unsure, start with **A** (finish the notification center — fast win, unblocks
Phase 5) and confirm with the user whether to slot **B (Stripe Connect)** in next
as the revenue priority.

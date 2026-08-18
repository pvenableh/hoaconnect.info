# HOA Connect (Property Flow)

A multi-tenant HOA / property-management SaaS built with **Nuxt 4**, **Directus**, and **shadcn-vue**. One app serves many associations — each with its own members, board, documents, payments, communications, public landing page, and (optionally) a custom domain.

The codebase is organized around a few big systems: a resident **portal**, an admin **workspace**, a **Communications** engine (branded email + internal channels), **payments** (resident dues via Stripe Connect + agency subscriptions), a lightweight **project-management** module, **roles & capabilities**, and an in-progress **AI assistant + credit economy**.

---

## Features

- **Multi-tenant** — every org is reached at `/{slug}` (e.g. `/605-lincoln`) and, optionally, its own **custom apex domain** (Caddy on-demand TLS → `server/utils/domains.ts`). Strict per-org tenant isolation throughout.
- **Auth** — login, registration, password reset, member invitations, and a hardened session layer (`nuxt-auth-utils` + Directus token refresh).
- **Roles & capabilities** — code-first capability matrix (`shared/permissions.ts`): admin, board officers, property manager, team lead, member. `RoleGate` / `useCapabilities` gate the UI; server routes enforce.
- **Resident portal** — module-gated dashboard hub (household, documents, payments, meetings, announcements, requests, rules, board, projects) with motion-aware entrances and a unified notification center.
- **Admin workspace** — theme-driven nav (collapsible sidebar for classic/luxury orgs, floating dock for modern), consolidated section hubs, customizable dashboard widgets.
- **Communications** — branded transactional + bulk email (SendGrid/MJML, templates, merge fields, scheduled & recurring sends) plus **Channels**, a Slack-style internal admin/board chat (slide-over panel, mentions, reactions, realtime).
- **Payments** — resident dues & assessments via **Stripe Connect**, simple expense/budget tracking, and **agency** (multi-property) subscription billing.
- **Project management** — projects with nested milestones (business-day scheduling, dependencies, approvals), polymorphic tasks, budgets, vendor assignment, and a Gantt/timeline view.
- **Public site** — per-org editorial landing page (built-in) or redirect to a bespoke external site, theme-swappable (classic / luxury / modern).
- **Documents, meetings, vendors, teams, polls, governance, file storage** — each a module that can be toggled per org.
- **AI assistant + token economy** *(in progress)* — a metered "Draft with AI" composer monetized with purchasable AI credits. See `docs/plan-anthropic-ai-assistant-tokens.md`.

---

## Tech Stack

- **Framework** — [Nuxt 4](https://nuxt.com/) (Vue 3, Nitro server)
- **Backend / CMS** — [Directus](https://directus.io/) (Postgres), accessed via the Directus SDK
- **UI** — [shadcn-vue](https://www.shadcn-vue.com/) + [Tailwind CSS v4](https://tailwindcss.com/); theme tokens drive per-org classic/luxury/modern styling
- **Auth** — [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils) sessions over Directus auth
- **Forms** — [vee-validate](https://vee-validate.logaretm.com/) + [zod](https://zod.dev/)
- **Payments** — [Stripe](https://stripe.com/) (Connect for dues, subscriptions for agencies)
- **Email** — [SendGrid](https://sendgrid.com/) + MJML render path
- **Motion** — `@vueuse/motion` presets (`shared/motion/`) + [GSAP](https://greensock.com/gsap/)
- **Charts / maps** — [unovis](https://unovis.dev/) (client-only), Mapbox, OpenWeather
- **Testing** — [Vitest](https://vitest.dev/) + happy-dom
- **AI** *(upcoming)* — [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) (Claude)

---

## Quick Start

### Prerequisites

- **Node.js 22** (CI pins 22; [`fnm`](https://github.com/Schniz/fnm) recommended)
- **pnpm 9** (the repo pins a version via `packageManager`)
- A **Directus** instance with the project's collections (provisioned by the `scripts/` migrations)

### Install & run

```bash
git clone https://github.com/pvenableh/hoaconnect.info.git
cd hoaconnect.info

pnpm install

# Configure environment (see below)
cp .env.example .env

pnpm dev          # http://localhost:3000
```

> The dev server talks to whatever `DIRECTUS_URL` points at — typically the **production** Directus. Don't create throwaway test data against prod.

---

## Environment

All variables live in **`.env`** (git-ignored). Start from `.env.example`, which documents every variable grouped by feature. The only blocks strictly required to boot are **Directus** (`DIRECTUS_URL`, `DIRECTUS_WEBSOCKET_URL`, `DIRECTUS_STATIC_TOKEN`) and **Session** (`NUXT_SESSION_PASSWORD`, ≥ 32 chars). Email, Stripe, maps, scheduled flows, and AI each have their own optional block.

Config is wired into `runtimeConfig` in `nuxt.config.ts` — most `NUXT_PUBLIC_*` role/branding ids have sensible baked-in defaults.

---

## Scripts

```bash
pnpm dev                 # dev server
pnpm build               # production build (nuxt build)
pnpm preview             # preview the production build
pnpm test                # run the Vitest unit suite
pnpm exec nuxt typecheck # type-check (vue-tsc) — there is no `pnpm typecheck` alias
pnpm generate:types      # regenerate types/directus.ts from the live Directus schema
```

### Schema migrations (Directus-as-code)

Directus collections/fields are provisioned by **idempotent** scripts under `scripts/` (≈ 40 of them), exposed as `create:*` / `add:*` / `setup:*` pnpm scripts (see `package.json`). They read `DIRECTUS_URL` + `DIRECTUS_STATIC_TOKEN`, skip anything that already exists, and are safe to re-run. The standard flow when adding schema:

```bash
pnpm create:<thing>     # e.g. create:projects, create:meetings, create:ai-wallets
pnpm generate:types     # refresh the typed Directus client
pnpm setup:permissions  # reconcile role permissions (diff-aware; supports --only / --collections)
```

---

## Multi-tenancy & domains

- **Slug routing** — each org renders under `/{slug}`; the workspace lives at `/{slug}/admin/*`, the resident portal at `/{slug}/*`.
- **Custom domains** — an org can bind an apex domain. `app/middleware/domain-detector.global.ts` resolves the host → org and enforces isolation (a foreign slug on a bound domain redirects home). TLS is issued on demand via Caddy — see `docs/custom-domains-setup.md`.
- **External site mode** — an org with a bespoke marketing site can redirect public visitors there while keeping the portal at `…/{slug}/dashboard`.

Platform marketing lives in a **separate** Nuxt project; this app is the product only.

---

## Project structure

```
/
├── app/                    # Nuxt app (pages, components, composables, layouts, middleware)
│   ├── components/         #   shadcn-vue ui/, plus feature components (channels/, feed/, …)
│   ├── composables/        #   useDirectus*, useModules, useCapabilities, useAppNav, …
│   ├── layouts/            #   auth (workspace), channels, auth-blank, default
│   └── middleware/         #   module/domain/org global guards
├── server/                 # app-local Nitro routes (most of the API lives in core/)
├── shared/types/           # ambient .d.ts (auth-session, runtime-config) — app-root so
│                           #   Nuxt includes them in the app AND server tsconfigs
├── scripts/                # idempotent Directus schema migrations + ops scripts
├── tests/                  # Vitest unit tests (mirrors core/shared/, composables/, server/)
├── docs/                   # setup guides + design/plan docs
├── core/                   # shared Nuxt LAYER — `extends: ['./core']`, aliased `#core`
│   ├── app/                #   shared composables, middleware, plugins
│   ├── server/             #   the API surface: api/, utils/ (Directus, Stripe, email, push…)
│   ├── shared/             #   framework-free, unit-tested logic (ai/, reporting/, domains/,
│   │                       #     notifications/, motion/, permissions.ts)
│   └── types/directus.ts   #   generated Directus schema types
└── nuxt.config.ts
```

> **Why `core/` still exists.** It was the shared layer back when this repo was a
> pnpm workspace with more than one app. The workspace is gone — there is one app
> at the repo root — but `core/` is kept as a Nuxt layer because ~400 imports
> reference it as `#core/…` and it still usefully marks "this is the shared
> engine" versus "this is app UI". Dissolving it is a separate call; see
> `docs/plan-bespoke-removal.md` §Phase 4.

---

## Server Directus clients

Three server-side client factories, picked by access level:

```typescript
const directus = getTypedDirectus()          // admin (static token), fully typed
const directus = await getUserDirectus(event) // acting user, auto token refresh
const directus = getPublicDirectus()          // unauthenticated / public reads
```

> **SDK convention:** the typed client rejects dotted field strings — use the nested object form, e.g. `fields: [{ team: ["id", "name"] }]`. Client-side `useDirectusItems` composables tolerate dotted strings.

---

## Testing & CI

- `pnpm test` runs the Vitest suite (pure logic in `shared/` is heavily covered).
- GitHub Actions (`.github/workflows/ci.yml`) runs **unit tests → typecheck → build** on every push/PR. Typecheck is blocking.

---

## Deployment

Deployed on **Vercel** (Nitro). Configure all required env vars in the Vercel dashboard. Custom apex domains are terminated by a **Caddy** reverse proxy using on-demand TLS gated by `/api/domains/ask` — full setup in `docs/custom-domains-setup.md`. Stripe setup (Connect + agency Prices + webhooks) is in `docs/stripe-setup.md`.

---

## Docs

Setup guides and design/plan docs live in [`docs/`](docs/) — custom domains, Stripe, the agency-billing plan, the AI assistant + token-economy plan, the roadmap, and more.

## License

MIT License — see `LICENSE`.

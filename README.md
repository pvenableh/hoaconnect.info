# HOA Connect — monorepo

A pnpm workspace containing the multi-tenant HOA Connect SaaS and a shared Nuxt
**layer** that holds all reusable plumbing. One backend, one deployment, many
associations — each on its own slug or verified custom/apex domain.

```
hoaconnect/
├── pnpm-workspace.yaml          # packages: apps/*, core
├── core/                        # shared Nuxt LAYER — never deployed on its own
│   ├── nuxt.config.ts           # base modules, CSS/theme, runtimeConfig, #core alias
│   ├── shared/                  # framework-free logic (permissions, ai, billing, …)
│   ├── server/                  # auth/org/hoa/stripe/ai/email/… API + utils + middleware
│   ├── app/                     # composables, plugins, middleware, theme CSS, config
│   └── types/directus.ts        # generated Directus schema (generate:types target)
└── apps/
    └── app/                     # the multi-tenant app → app.hoaconnect.info
```

`apps/app` does `extends: ['../../core']`. App-specific UI (pages, layouts,
components, lib) and any app-only API live in the app; all reusable plumbing
lives in `core`.

## How the layer is wired

- **`#core` alias** → the `core/` root (defined in `core/nuxt.config.ts`, mirrored
  in `apps/app/vitest.config.ts`). Layer code references shared files via
  `#core/...` (e.g. `#core/types/directus`, `#core/shared/permissions`,
  `#core/server/utils/...`) because `~~`/`@@` resolve to the *consuming* app's
  root, not the layer. `~`/`@` stay app-local (apps override core by name).
- **Auto-import / merge** — Nuxt merges the layer's `app/` (composables,
  plugins, middleware, components, assets) into the consuming app, with the app
  winning on name collisions. `core` ships **no pages**; the app owns routing.
- **Env var names are unchanged** from the pre-monorepo app, so existing Vercel
  env keeps working for `apps/app`.

## Common commands (run from the repo root)

```bash
pnpm install                       # install the whole workspace
pnpm dev                           # dev the main app (apps/app)  → :3000
pnpm build                         # build apps/app
pnpm test                          # apps/app unit tests (vitest)
pnpm typecheck                     # apps/app nuxt typecheck
pnpm generate:types                # regenerate core/types/directus.ts from Directus
```

`core` is a layer and is never built or deployed by itself.

## Tenancy: slugs + custom/apex domains

Every org lives at `app.hoaconnect.info/{slug}`. An org may additionally bind a
**verified custom domain** (apex or subdomain): the clean root of that domain
serves the org's public landing, and tenant isolation guarantees a domain only
ever serves its own org. See `apps/app/docs/custom-domains-setup.md`.

## Bespoke (Signature-tier) sites

Bespoke client sites are **standalone Nuxt projects in their own repos** — they
consume HOA Connect's public content API and deep-link into the portal
(`portal.<client>.com` bound as the org's custom domain). They are NOT apps in
this monorepo and never carry backend secrets. See
`apps/app/docs/plan-bespoke-removal.md` for the architecture and
`apps/app/docs/VISION.md` for the product vision.

## Deployment (Vercel)

One Vercel project: **Root Directory = `apps/app`**, domain `app.hoaconnect.info`
(plus each org's verified custom domain pointed at the same deployment). Vercel
auto-detects pnpm workspaces; with Root Directory set to the app, the
install/build run for that package and pull `core` from the workspace. Build
command `pnpm build`, output is Nuxt's default.

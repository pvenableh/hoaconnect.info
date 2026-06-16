# HOA Connect — monorepo

A pnpm workspace containing the multi-tenant HOA Connect SaaS and a shared Nuxt
**layer** that bespoke (Signature-tier) single-building sites extend. Every app
reuses the **same backend, data, auth, and server functions** and differs only
in **presentation**.

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
    ├── app/                     # the multi-tenant app → app.hoaconnect.info
    └── _bespoke-starter/        # template for a single-building Signature site
```

Each app does `extends: ['../../core']`. App-specific UI (pages, layouts,
components, lib) and any app-only API live in the app; all reusable plumbing
lives in `core`.

## How the layer is wired

- **`#core` alias** → the `core/` root (defined in `core/nuxt.config.ts`, mirrored
  in `apps/app/vitest.config.ts`). Layer code references shared files via
  `#core/...` (e.g. `#core/types/directus`, `#core/shared/permissions`,
  `#core/server/utils/...`) because `~~`/`@@` resolve to the *consuming* app's
  root, not the layer. `~`/`@` stay app-local (apps override core by name).
- **Auto-import / merge** — Nuxt merges each layer's `app/` (composables,
  plugins, middleware, components, assets) into the consuming app, with the app
  winning on name collisions. `core` ships **no pages**; apps own routing.
- **Env var names are unchanged** from the pre-monorepo app, so existing Vercel
  env keeps working for `apps/app`.

## Common commands (run from the repo root)

```bash
pnpm install                       # install the whole workspace
pnpm dev                           # dev the main app (apps/app)        → :3000
pnpm --filter ./apps/_bespoke-starter dev   # dev the starter           → :3001
pnpm build                         # build apps/app
pnpm test                          # apps/app unit tests (vitest)
pnpm typecheck                     # apps/app nuxt typecheck
pnpm generate:types                # regenerate core/types/directus.ts from Directus
```

`core` is a layer and is never built or deployed by itself.

## Single-org binding (bespoke apps)

A bespoke app serves exactly **one** building and has **no org-picker**. The org
is chosen by `NUXT_PUBLIC_ORG_SLUG` (falling back to resolve-by-domain via
`/api/hoa/by-domain`). `useBoundOrg()` resolves it for public pages and
`useSelectedOrg()` is locked to it for authenticated pages. In `apps/app` the
slug is empty, so the multi-tenant behavior is unchanged. See
[`apps/_bespoke-starter/README.md`](apps/_bespoke-starter/README.md) for the
full "spin up a new client" guide.

## Deployment (Vercel — one project per app)

`core` is never deployed. Each app is its own Vercel project:

| Setting             | `apps/app`                    | a bespoke client (`apps/<client>`) |
| ------------------- | ----------------------------- | ---------------------------------- |
| **Root Directory**  | `apps/app`                    | `apps/<client>`                    |
| Domain              | `app.hoaconnect.info`         | the building's domain              |
| `NUXT_PUBLIC_ORG_SLUG` | _(unset — multi-tenant)_    | the building's org slug            |
| `NUXT_SESSION_PASSWORD` | unique, ≥32 chars          | unique, ≥32 chars                  |
| `DIRECTUS_URL` / `DIRECTUS_STATIC_TOKEN` | the shared backend | **the same** shared backend       |

Vercel auto-detects pnpm workspaces; with Root Directory set to the app, the
install/build run for that package and pull `core` from the workspace. Build
command `pnpm build`, output is Nuxt's default.

> **Follow-up (not done here):** existing custom-domain sites currently served by
> `apps/app` via "External site"/Host resolution (e.g. `605lincolnroad.com`) can
> later migrate to their own Vercel projects copied from `_bespoke-starter`.

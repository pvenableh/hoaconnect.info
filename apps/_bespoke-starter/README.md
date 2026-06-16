# Bespoke starter — a single-building Signature site

A **thin** Nuxt app that inherits all shared HOA Connect plumbing from the
[`core`](../../core) layer (`extends: ['../../core']`) and contains only this
building's **design**. Backend, data model, auth, server `/api/*` routes,
composables and theme all come from `core` — you never re-implement them.

Use this when a client buys the Signature tier and wants a bespoke,
hand-designed site (like 1033 Lenox) that still runs on the same backend.

## What you get for free (from `core`)

- **Auth** — `useDirectusAuth()` + `/api/auth/*`, with this app's **own**
  same-origin session cookie (its own `NUXT_SESSION_PASSWORD`). Independent
  login per domain; no shared session / SSO.
- **Data & org context** — `useSelectedOrg()`, `useBoundOrg()`,
  `useActiveHoa()`, `useDirectusItems()`, and every other core composable.
- **Server API** — the full `/api/*` surface (org, hoa, stripe, ai, email,
  billing-account, domains, …), tenant-isolated server-side.
- **Theme** — the global theme CSS tokens.

## Single-org binding (no org-picker)

A bespoke app serves **exactly one** building. The org is chosen by
`NUXT_PUBLIC_ORG_SLUG`, falling back to resolve-by-domain
(`/api/hoa/by-domain`) when empty:

- `useBoundOrg().ensure()` resolves the one org for **public** pages (landing).
- `useSelectedOrg()` is locked to that slug for **authenticated** pages, so even
  a multi-membership user only ever sees this building. There is no picker.

## Example pages (replace with the real design)

| Path           | File                          | Purpose                                  |
| -------------- | ----------------------------- | ---------------------------------------- |
| `/`            | `app/pages/index.vue`         | Public landing (uses `useBoundOrg`)      |
| `/auth/login`  | `app/pages/auth/login.vue`    | Resident login (`useDirectusAuth`)       |
| `/dashboard`   | `app/pages/dashboard.vue`     | Authed resident view (`useSelectedOrg`)  |

> Login lives at `/auth/login` and the authed home at `/dashboard` to match
> core's `auth`/`guest` middleware redirects.

## Local development

```bash
# from the monorepo root
cp apps/_bespoke-starter/.env.example apps/_bespoke-starter/.env
# edit .env: set NUXT_PUBLIC_ORG_SLUG, a unique NUXT_SESSION_PASSWORD,
# and the SHARED DIRECTUS_URL / DIRECTUS_STATIC_TOKEN
pnpm --filter ./apps/_bespoke-starter dev
```

Sign in with a resident account that belongs to the bound org → `/dashboard`
renders that org's data, and no org-picker appears.

## Spin up a new client

1. **Copy the folder:** `cp -r apps/_bespoke-starter apps/<client>` and set a
   unique `name` in its `package.json`.
2. **Design:** build the client's pages/components/CSS in `apps/<client>/app`.
   Keep `extends: ['../../core']`.
3. **Env (`apps/<client>/.env` locally; Vercel env in prod):**
   - `NUXT_PUBLIC_ORG_SLUG` — the building's org slug (or leave empty + bind a
     verified custom domain).
   - `NUXT_SESSION_PASSWORD` — unique, ≥32 chars (its own cookie).
   - `DIRECTUS_URL` / `DIRECTUS_STATIC_TOKEN` — the **shared** backend.
4. **Deploy (Vercel):** new project, **Root Directory = `apps/<client>`**, add
   the env vars, attach the custom domain. `core` is never deployed on its own.

See the repo root `README.md` for the full monorepo + deployment overview.

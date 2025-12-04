<!-- GitHub Copilot / AI agent instructions for contributors and agents -->
# Project-focused AI assistant guide

This file gives concise, actionable guidance for AI-assisted code changes in this repository. Focus on discoverable patterns and concrete commands — not generic best-practices.

- **Project Type:** Nuxt 4 (Vue 3) application with a server directory for API endpoints and Directus as the headless CMS.
- **Primary Languages:** TypeScript, Vue SFCs.
- **Package Manager:** `pnpm` (see `packageManager` in `package.json`). Use `pnpm` for commands and scripts.

**Key Architecture**
- **Frontend app:** `app/` — routes in `app/pages/`, UI in `app/components/` (notably `app/components/ui/` for shadcn components).
- **Server/API:** `server/api/` — server endpoints and middleware. Look here for auth, Directus proxy, HOA, Stripe and Vercel domain logic.
- **Directus integration:** runtime config entries and helpers in `providers/directus` and `types/`. Server-only secrets live in `runtimeConfig` (`nuxt.config.ts`).
- **Type generation:** directus types are generated into `types/directus.ts` via the `generate:types` script which depends on env vars (`DIRECTUS_URL`, `DIRECTUS_STATIC_TOKEN`). See `package.json`.

**Important Files to Inspect Before Changes**
- `nuxt.config.ts` — runtimeConfig (server vs public), modules, image provider, VeeValidate setup.
- `package.json` — scripts (use `pnpm dev`, `pnpm build`, `pnpm generate:types`).
- `server/api/` — business logic for HOA, auth, stripe webhooks, and domain/Vercel integration.
- `app/composables/` — canonical composable patterns (e.g., `useDirectusAuth`, `useDirectusItems`, `useDirectusFiles`).
- `providers/directus` — custom image provider and Directus client factories.

**Developer Workflows (explicit commands)**
- **Install:** `pnpm install`
- **Dev server:** `pnpm dev`
- **Build:** `pnpm build`
- **Preview build:** `pnpm preview`
- **Generate Directus types:** Ensure `.env` has `DIRECTUS_URL` and `DIRECTUS_STATIC_TOKEN`, then run:
  - `pnpm generate:types`
  - or explicitly: `dotenv -e .env -- sh -c 'directus-sdk-typegen -u $DIRECTUS_URL -t $DIRECTUS_STATIC_TOKEN -o ./types/directus.ts'`

**Project-specific conventions**
- **shadcn components:** Component directory is `app/components/ui` and `shadcn` is configured in `nuxt.config.ts` with `prefix: ''` (no global prefix).
- **VeeValidate components:** Auto-imports are enabled and component names are remapped (e.g., `Form` → `VeeForm`). Search `veeValidate` config in `nuxt.config.ts` if unsure.
- **Images:** Uses a custom Directus image provider at `providers/directus`. Use `getAssetUrl` helpers rather than hardcoding Directus URLs.
- **Multi-tenant branding:** Branding (favicon, logo) is set dynamically by a composable — look for `useOrgBranding`/branding-related composables before changing head links.
- **Runtime config sensitivity:** Put secrets in server-only `runtimeConfig` keys (e.g., `directusServerToken`). Avoid committing secrets or copying server-only keys to client code.
- **TypeScript:** `nuxt.config.ts` sets `typescript.typeCheck=false` and `strict=false`; CI or local runs may still run type checks separately — do not assume aggressive type checking during local dev.

**Integration points & external dependencies**
- **Directus:** SDK used (`@directus/sdk`) and typegen package (`directus-sdk-typegen`). Watch runtimeConfig keys: `DIRECTUS_URL`, `DIRECTUS_WEBSOCKET_URL`, `DIRECTUS_STATIC_TOKEN`.
- **Stripe:** Server endpoints in `server/api/stripe/*`; webhook handler expects `STRIPE_WEBHOOK_SECRET` env var.
- **Vercel:** Domain management and optional deployment flows exist under `server/api/vercel` and scripts like `scripts/add-www-domain.ts`.
- **SendGrid:** Mailing templates configured via env vars; code paths use SendGrid SDK when keys are present.

**When making changes, check these concrete places**
- If changing authentication flows: review `app/components/Auth/*`, `composables/useDirectusAuth.ts`, and `server/api/auth/*`.
- If changing data models or queries: update `types/directus.ts` by running the typegen command and adjust `composables/*` that call Directus.
- If adding endpoints: put server handlers under `server/api/` and export type-safe Directus clients via `providers/directus` helpers.

**Testing / Safety checks for PRs**
- Run `pnpm dev` locally to sanity-check pages.
- If touching Directus types or collections, run `pnpm generate:types` and include resulting `types/directus.ts` changes in the PR when relevant.
- Avoid exposing `DIRECTUS_STATIC_TOKEN` in client bundles — verify `runtimeConfig` placement and usage.

If anything here is unclear or you want examples for a specific subsystem (auth, payments, domain management), tell me which part and I will expand or merge specific examples into this file.

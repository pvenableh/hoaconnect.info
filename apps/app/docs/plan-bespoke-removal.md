# Plan — retire `apps/_bespoke-starter`, commit to "one app + apex domains/slugs"

**Status:** proposed (2026-08-17). Nothing implemented yet.
**Vision context:** this plan is the platform half of [VISION.md](VISION.md)'s
Phase 2 ("Bulletproof platform"). Phase 2a below (slug-less routing) is being
upgraded to the host-first resolver pattern from `~/Sites/weddings/website`
(short-TTL host→org cache, origin spoof guard, per-host manifest — see VISION.md
Pillar E); Phases 2c–3 (public API hardening, site-kit) serve the vision's
transparency/public-surface work.
**Thesis:** the multi-tenant app already owns apex domains + slug routing. Bespoke
design should live in its **own Nuxt project**, importing a *thin* HOA Connect
structure over HTTP — never a second copy of the backend.

---

## 1. Audit — what the bespoke setup actually is

### 1.1 The starter itself

`apps/_bespoke-starter/` — 10 files (README, package.json, nuxt.config, tsconfig,
`.env.example`, `app.vue`, 3 example pages). Scaffolded in a single commit
(`f7c9141 feat(monorepo): scaffold apps/_bespoke-starter single-building app`)
and **never touched since**. No client has been copied from it, it has never been
deployed, and the follow-up it promised (migrate `605lincolnroad.com` to its own
Vercel project) was never done — 605 still runs on `apps/app` and works.

Cost of keeping it: it's a workspace package (`apps/*` glob), so it installs, has
its own lockfile entry, its own `node_modules`, and a `bespoke` dev entry in
`.claude/launch.json`.

### 1.2 Its hooks into `core` — the part that actually matters

| Location | What | Only consumer |
| --- | --- | --- |
| [core/nuxt.config.ts:223](core/nuxt.config.ts:223) | `runtimeConfig.public.lockedOrgSlug` | the starter |
| [core/app/composables/useBoundOrg.ts](core/app/composables/useBoundOrg.ts) | 46 lines, resolve-the-one-org | the starter's `index.vue` |
| [core/app/composables/useSelectedOrg.ts:174](core/app/composables/useSelectedOrg.ts:174) | "STEP 2.5" locked-slug branch, inside the org-selection hot path | dead in `apps/app` |
| [README.md](README.md) | ~half the root README documents the bespoke model | — |

`apps/app` never calls `useBoundOrg()` and always leaves `lockedOrgSlug` empty —
verified by grep. This is dead code that a reader of `useSelectedOrg` has to
reason about anyway.

### 1.3 The architectural liability

The starter's model is "a bespoke client is a second full Nuxt app that
`extends: ['../../core']`". Read `apps/_bespoke-starter/.env.example`: each client
deployment needs its own `DIRECTUS_STATIC_TOKEN`, its own `NUXT_SESSION_PASSWORD`,
and it publishes **the entire `/api/*` surface** — Stripe, Stripe Connect, AI
credits, SendGrid, org admin, webhooks — on the client's own domain.

That means, per client: another admin-capable trust surface, another env set,
another place every core security fix must be redeployed, and no shared session
with the main app. For a solo-maintained product this is the wrong shape. Ten
Signature clients would mean ten backends.

### 1.4 What already works and should be the product

- `resolveOrgByDomain()` ([core/server/utils/domains.ts](core/server/utils/domains.ts)) matches a verified `custom_domain` (apex or `www.`, exact-host).
- [core/app/middleware/domain-detector.global.ts](core/app/middleware/domain-detector.global.ts) flags main-host vs custom domain, enforces tenant isolation (a domain may only serve its own slug), and resolves org context for non-slug routes.
- [apps/app/app/pages/index.vue](apps/app/app/pages/index.vue) renders the org's public landing at a custom domain's clean root; the main host redirects to login/dashboard.
- `org.external_url` already lets an org hand its public face to an outside site.
- The site builder (`/{slug}/admin/settings/site`) covers most orgs without any bespoke code at all.

**Conclusion: remove the starter.** It isn't load-bearing; it's a fork in the road
we've already decided not to take.

---

## 2. Target architecture

One backend, one deployment, three presentation tiers:

| Tier | Public face (apex `/`) | Portal | Built by |
| --- | --- | --- | --- |
| **1 — Built-in** | main app landing, per-org content | same domain, slug routes | site builder |
| **2 — Themed** | built-in landing + heavy theming | same | site builder + theme |
| **3 — Signature** | **its own Nuxt project**, own repo, deployed to the apex | `portal.<client>.com` → main app | designer (us) |

### 2.1 How Tier 3 works without a second backend

- The bespoke project owns the apex (`client.com`) and is presentation-only. No Directus token, no session secret, no `/api/*`.
- The org's `custom_domain` is set to **`portal.client.com`** (CNAME → the app). `resolveOrgByDomain` matches an exact host, so this works **today with no code change** — the domain-verification flow is unchanged.
- The org's `external_url` is set to `https://client.com`, so anyone hitting the built-in landing via the slug route is sent to the bespoke site.
- The bespoke project reads content from a curated **public HTTP API** on the main app and deep-links to the portal for anything authenticated. Login happens on `portal.client.com`, where the session cookie already belongs.

### 2.2 The "HOA Connect structure we can import"

Two ways to read the ask. They lead to very different work, so this is **the one
decision to confirm before Phase 3** (Phases 1–2 are unaffected either way).

**Option A — `@hoaconnect/site-kit` (recommended).** A thin, published package:
public-subset types (generated from `core/types/directus`), a typed read client
(`createHoaClient({ baseUrl, slug })`), a handful of framework-free helpers plus
optional Nuxt composables, and `portalUrl()` link builders. Zero secrets, zero
server code, versioned independently. A bespoke project is then just "a Nuxt site
that fetches typed content" — nothing to keep in sync, nothing to redeploy when
core changes.

**Option B — publish `core` as a remote Nuxt layer** (git URL or private npm), so
a standalone project does `extends: ['github:…/core']`. Full parity, and closest
to what the starter did — but it carries every liability in §1.3 out of the
monorepo instead of removing it, and pins each client to a core version.

Recommendation: **A**. Reach for B only if a client genuinely needs authenticated,
server-rendered portal pages on the apex itself — and even then, prefer a Vercel
rewrite from `client.com/portal/*` to the main app over a second deployment.

---

## 3. Phased implementation

### Phase 1 — Remove the starter (mechanical, one commit, low risk)

1. `git rm -r apps/_bespoke-starter`
2. `git rm core/app/composables/useBoundOrg.ts`
3. [core/nuxt.config.ts:223-226](core/nuxt.config.ts:223) — drop `lockedOrgSlug` and its comment.
4. [core/app/composables/useSelectedOrg.ts:174-196](core/app/composables/useSelectedOrg.ts:174) — drop the whole "STEP 2.5" block. **The only real risk in this phase** — it sits in the org-selection path.
5. `.claude/launch.json` — drop the `bespoke` configuration (note: this file is already modified in the working tree; reconcile).
6. Rewrite the root [README.md](README.md) around "one multi-tenant app; bespoke design lives in its own project" — replace §"Single-org binding", §"Deployment" table's bespoke column, and the stale follow-up note at the bottom.
7. `pnpm install` (prunes the `apps/_bespoke-starter` lockfile entry), then `pnpm typecheck && pnpm test`.

**Verification (must do, not optional):** log in as a multi-org user → org picker
present, switching works; `/dashboard` still redirects to `/{slug}`; a verified
custom domain root still renders its landing.

**Rollback:** revert the single commit.

### Phase 2 — Make apex + slug the real product surface

This is the actual engineering, and it's what makes Tier 3 viable.

**2a. Slug-less portal routing on custom domains** (standing TODO). On a verified
custom domain, `/{slug}/admin/x` should be reachable as `/admin/x`. Implement as a
server middleware that resolves Host → org and internally rewrites the path to
`/{slug}/…`, plus a canonical redirect so the clean URL wins. Ship behind an
env/flag and verify against `605lincolnroad.com` before making it default — this
is the one change that can break a live tenant.

**2b. Multiple hosts per org.** `custom_domain` is a single field. Tier 3 wants
apex→bespoke *and* `portal.` →app, and some orgs will want apex + `www` + portal.
Add an `aliases` array inside the existing `domain_config` JSON (no migration) and
teach `resolveOrgByDomain` to match it.

**2c. Harden the public read surface.** [core/server/api/hoa/find.get.ts](core/server/api/hoa/find.get.ts)
returns the org row with `fields: ["*"]` to any unauthenticated caller — that
includes subscription/Stripe internals. Curate it to a public field list. This is
worth doing regardless of the bespoke work, and it's a **prerequisite** for
Phase 3.

**2d. Document the recipe** in [apps/app/docs/custom-domains-setup.md](apps/app/docs/custom-domains-setup.md):
DNS records and Vercel setup for "bespoke apex + portal subdomain", and for the
plain built-in case.

### Phase 3 — Build the importable structure (gated on the §2.2 decision)

1. `core/server/api/public/site/[slug]/…` — cacheable, CORS-enabled, curated read
   endpoints: org profile, landing config, board, amenities, announcements,
   gallery, public documents. Consolidates today's scattered `/api/hoa/*` and
   `/api/landing/*` public reads behind one versioned contract.
2. Publish `@hoaconnect/site-kit` (types + client + `portalUrl()` helpers).
3. Create a standalone `hoaconnect-site-template` repo (degit target) — the
   starter's *actual* replacement, outside the monorepo.
4. Prove it: rebuild `~/Sites/1033` as the first consumer, deployed to its apex
   with the portal on a subdomain.

### Phase 4 — Optional: flatten `core/` into `apps/app`

If Phase 3 lands as Option A, `core` has exactly one consumer forever, and the
layer split costs a `#core` alias, two package.jsons, and split tsconfigs for no
reuse. Flattening is a real option — but it's a large, low-payoff diff and `core`
still documents "what is shared". **Recommend deferring**; revisit after Phase 3.

---

## 4. Open decisions

1. **§2.2 — site-kit (A) vs published core layer (B).** Blocks Phase 3 only.
2. **Phase 2a** — internal rewrite vs. accepting `/{slug}/` in custom-domain URLs.
3. **Phase 4** — flatten `core` or keep the layer.

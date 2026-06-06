# Custom / APEX domains — how it works & operator setup

How a community serves its public site at its own web address (e.g.
`yourbuilding.com`), and what the platform operator wires up.

> **Hosting reality:** the app is deployed on **Vercel** (`app.hoaconnect.info`).
> Vercel terminates TLS and routes custom domains to the app, so the
> Caddy/on-demand-TLS path described in older versions of this doc does **not**
> apply. See [§ Operator setup (Vercel)](#operator-setup-vercel). The marketing
> site is a separate project at the apex `hoaconnect.info`
> (see `plan-marketing-split.md`).

## The two layers
- **Content** is domain-agnostic — it lives in Directus (`hoa_organizations` +
  `block_settings`) and renders via the shared `<OrgPublicLanding>` component
  (used by `app/pages/[slug]/index.vue` and `app/pages/index.vue`). Editing the
  site is the same regardless of domain.
- **Delivery** is what makes that content appear at a custom domain: DNS → TLS →
  routing. On Vercel, TLS + routing are handled by Vercel once the domain is
  added to the project; the app then maps the incoming `Host` → org.

## What's implemented in the app
- **Fields** (existing, no migration): `hoa_organizations.custom_domain`,
  `domain_verified`, `domain_type` (`apex`|`subdomain`), `domain_config` (JSON:
  holds the verification token + status).
- **Admin UI:** `Settings → Custom domain` (`/[slug]/admin/settings/domains`) —
  connect a domain, copy DNS records (apex-aware), and verify. The DNS target it
  shows is `NUXT_PUBLIC_MAIN_DOMAIN` (= `app.hoaconnect.info`).
- **Endpoints:**
  - `POST /api/domains/connect` — claim a domain, issue a TXT verification token (admin).
  - `POST /api/domains/verify` — DNS-TXT check → sets `domain_verified` (admin).
  - `POST /api/domains/disconnect` — remove a domain (admin).
  - `GET  /api/hoa/by-domain?host=` — resolve a verified host → org (used by the
    app to render the landing at a custom domain's root).
  - `GET  /api/domains/ask?domain=` — **legacy Caddy on-demand-TLS gate. UNUSED
    on Vercel** (Vercel issues certs). Harmless to leave; only relevant if the
    app is ever self-hosted behind Caddy.
- **Routing:** there is no longer a server `req.url` rewrite. `app/pages/index.vue`
  resolves the org from the request `Host` (via `/api/hoa/by-domain`) and renders
  `<OrgPublicLanding>` at the **clean root** (no `/{slug}` in the URL), on both
  SSR and client. `domain-detector.global` flags main-host vs custom-domain from
  the `Host` so the main-host login redirect doesn't fire on custom domains.
  Deep paths on a custom domain (e.g. `/auth/login`, `/{slug}/board`) already
  reach the app and render normally.

## Owner steps (per custom domain)
A custom domain needs **two** things: it must be added to the **Vercel project**
(so Vercel routes + certs it), and **verified in the app** (so the org resolves).

1. **Add the domain in Vercel** → Vercel project → Domains → add `yourbuilding.com`
   (and `www.yourbuilding.com` if wanted). Vercel shows the exact records to add.
2. **Point DNS** at the values **Vercel shows you** (they are per-project and
   change over time — always copy from the dashboard, don't hardcode):
   - **Apex** (`yourbuilding.com`): an **A** record `@ → <Vercel apex IP>`
     (e.g. `216.150.1.1`). If your provider supports **ALIAS/ANAME**, you may use
     that instead → the Vercel hostname. *(name.com has no ALIAS/ANAME → use the A
     record.)*
   - **Subdomain / www**: a **CNAME** → the per-project Vercel target Vercel shows
     (e.g. `<hash>.vercel-dns-017.com`).
3. **Add the app's TXT** verification record shown in the app UI
   (`_hoaconnect.<domain> = <token>`).
4. In Vercel, pick the canonical host (e.g. apex) and let the other (www) redirect
   to it — Vercel does the 301/308.
5. Once DNS resolves, **Vercel auto-issues TLS** (domain flips to "Valid
   Configuration"). Then click **Verify** in the app → `domain_verified = true`
   → the landing resolves at the domain.

## Operator setup (Vercel)
- **TLS:** automatic per domain once added to the project. Nothing to configure.
- **Routing:** Vercel routes any added domain to the app deployment; the app
  reads `Host` (via `x-forwarded-host`) to resolve the org.
- **Registering domains:** today this is manual in the Vercel dashboard. A
  future enhancement could call the **Vercel Domains API** from
  `/api/domains/connect` so adding a domain in-app also registers it on Vercel.

### Env
- `NUXT_PUBLIC_MAIN_DOMAIN = app.hoaconnect.info` — the app host. Drives
  main-host detection and the DNS target shown in the UI. **Set this** (the code
  falls back to `app.hoaconnect.info` if unset).
- `APP_URL = https://app.hoaconnect.info` — used for outbound links (emails,
  Stripe portal return, SEO). Use `https://`.

## Migration note (marketing split)
Existing custom domains that pointed at the old apex `hoaconnect.info` must be
re-pointed to **`app.hoaconnect.info`** (the app host) — i.e. add them to the
Vercel app project and use the Vercel DNS values. The apex `hoaconnect.info` now
serves the marketing site, not the app.

## Known follow-ups
- **Self-hosted fallback:** if the app ever moves off Vercel to self-hosted
  Caddy, re-enable the `on_demand_tls { ask … }` gate against `/api/domains/ask`
  (still implemented). On Vercel it's unused.
- Verification is DNS-TXT only; an HTTP `/.well-known` fallback could be added.
- Auto-registering domains on Vercel via its API (see Operator setup) would make
  the in-app "connect" flow fully self-serve.

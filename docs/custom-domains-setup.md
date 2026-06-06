# Custom / APEX domains — how it works & operator setup

How a community serves its public site at its own web address (e.g.
`yourbuilding.com`), and what the platform operator wires up once.

## The two layers
- **Content** is domain-agnostic — it lives in Directus (`hoa_organizations` +
  `block_settings`) and renders via `app/pages/[slug]/index.vue`. Editing the site is
  the same regardless of domain.
- **Delivery** is what makes that content appear at a custom domain: DNS → TLS → routing.

## What's implemented in the app
- **Fields** (existing, no migration): `hoa_organizations.custom_domain`,
  `domain_verified`, `domain_type` (`apex`|`subdomain`), `domain_config` (JSON: holds the
  verification token + status).
- **Admin UI:** `Settings → Custom domain` (`/[slug]/admin/settings/domains`) — connect a
  domain, copy DNS records (apex-aware), and verify.
- **Endpoints:**
  - `POST /api/domains/connect` — claim a domain, issue a TXT verification token (admin).
  - `POST /api/domains/verify` — DNS-TXT check → sets `domain_verified` (admin).
  - `POST /api/domains/disconnect` — remove a domain (admin).
  - `GET  /api/domains/ask?domain=` — **Caddy on-demand TLS gate**: 200 only for verified
    domains, else 404 (prevents cert abuse).
  - `GET  /api/hoa/by-domain?host=` — resolve a verified host → org.
- **Routing:** `server/middleware/custom-domain.ts` rewrites a verified custom domain's
  **root `/`** to the org's public page (`/{slug}`). Scoped to `/` only, so API/assets/app
  routes are untouched.

## Owner steps (shown in the UI)
1. **Point the domain** at the platform:
   - **Subdomain** (`portal.yourbuilding.com`): `CNAME → <MAIN_DOMAIN>`.
   - **Apex** (`yourbuilding.com`): `ALIAS/ANAME @ → <MAIN_DOMAIN>`, or `A @ → <platform IP>`,
     or `CNAME www → <MAIN_DOMAIN>` + a root→www 301.
2. **Add the TXT** verification record shown in the UI (`_hoaconnect.<domain>`).
3. Click **Verify** → DNS check flips `domain_verified=true`.

## Operator setup (once) — Caddy on-demand TLS
Because the stack is self-hosted Caddy, per-customer certs are nearly free. Gate issuance
with the `ask` endpoint so only verified domains get certs:

```caddy
{
    on_demand_tls {
        ask https://<MAIN_DOMAIN>/api/domains/ask
        interval 2m
        burst 5
    }
}

# Catch-all site that serves any host with on-demand certs, reverse-proxied to the Nuxt app.
https:// {
    tls {
        on_demand
    }
    reverse_proxy <nuxt-app-upstream>:3000
}
```

- Caddy calls `GET /api/domains/ask?domain=<host>` before issuing a cert; our endpoint returns
  200 only when `<host>` is a verified `custom_domain`.
- The Nuxt server middleware then maps the incoming `Host` to the org and serves its public page.

### Env
- `NUXT_PUBLIC_MAIN_DOMAIN` — the platform apex (e.g. `hoaconnect.info`). Already used for
  main-domain detection and the DNS targets shown in the UI.
- For apex **A**-record instructions, give owners the platform's stable public IP (operator
  knows it; not stored in the repo). ALIAS/ANAME → `MAIN_DOMAIN` avoids needing the IP.

## Known follow-ups
- The middleware routes only the **root** of a custom domain today (the public site). Full
  slug-less routing (the whole app under the custom domain without a slug in the URL) needs
  `buildOrgPath()` to become domain-aware — a deliberate next step.
- Verification is DNS-TXT only; an HTTP `/.well-known` fallback could be added.
- Heads-up: branches `claude/remove-apex-domain-logic` / `claude/cleanup-custom-domain-refs`
  suggest an earlier apex attempt was removed — worth a glance before extending.

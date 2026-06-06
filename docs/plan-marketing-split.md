# Marketing split — move the app to `app.hoaconnect.info`

**Status:** Plan only. Goal: host the platform marketing site as a separate project at the
apex `hoaconnect.info`, and serve the Nuxt app at `app.hoaconnect.info`. Per-org custom/APEX
domains (e.g. `605lincolnroad.com`) keep working unchanged.

**Why it's safe:** custom-domain resolution keys off the HTTP `Host` (`resolveOrgByDomain` +
`server/middleware/custom-domain.ts` + Caddy on-demand TLS), independent of where the
marketing site lives. `mainDomain` is just "the app's canonical host" — set it to the app
subdomain and everything follows.

---

## 0. The one concept that ties it together

`config.public.mainDomain` (env `NUXT_PUBLIC_MAIN_DOMAIN`) is used for **two** things:
1. "Is this request hitting the main app host?" (`isMainDomainHost`, custom-domain middleware).
2. The **CNAME/ALIAS target customers point their custom domain at** (shown in the Domains
   settings DNS instructions).

So after the split, **`NUXT_PUBLIC_MAIN_DOMAIN = app.hoaconnect.info`** — the app host, which
is also where customer domains should CNAME. The apex `hoaconnect.info` is no longer the app.

---

## 1. DNS

| Host | Record | Points to |
|---|---|---|
| `hoaconnect.info` (apex) | A / ALIAS | **marketing** project host (new) |
| `www.hoaconnect.info` | CNAME | marketing host (or 301 → apex) |
| `app.hoaconnect.info` | A / CNAME | the **Nuxt app** server (current app host / Caddy) |
| customer domains (e.g. `605lincolnroad.com`) | CNAME / ALIAS | **`app.hoaconnect.info`** (was `hoaconnect.info`) |

⚠️ **Migration gotcha — existing live custom domains.** `605lincolnroad.com` currently
points at `hoaconnect.info`. Once the apex serves marketing, that target breaks. **Re-point
every existing custom domain's CNAME/ALIAS to `app.hoaconnect.info`** as part of cutover
(coordinate with the one live customer first). The Caddy `on_demand_tls` ask snippet is
unchanged — it just resolves the new host.

---

## 2. Env

App project (`.env` / host env):
- `NUXT_PUBLIC_MAIN_DOMAIN=app.hoaconnect.info`
- `APP_URL=https://app.hoaconnect.info` (invite + notification emails build links from
  `config.public.appUrl` — they'll follow automatically; see `server/utils/inquiry-routing.ts`,
  `server/api/hoa/invite-member.post.ts`).
- Stripe/Directus/etc. unchanged.

Marketing project: its own env; it only needs links into `https://app.hoaconnect.info/auth/…`.

---

## 3. Code touch-points (in the app repo)

Small, well-contained. The custom-domain machinery itself needs **no change**.

1. **App-root redirect — `app/pages/index.vue`.**
   Today the `v-if="isMainDomain"` branch renders the marketing sell-sheet
   (`<PagesSellSheet …>`). After the split there is no marketing at the app root, so replace
   that branch with a redirect:
   - logged in → `/dashboard` (org-redirect will carry on to `/{slug}`),
   - logged out → `/auth/login`.
   Do it in the page's `setup` (or a tiny `middleware`) via `navigateTo`. **Keep the
   `v-else` branch** — that's the per-org landing for custom domains and is unrelated to
   platform marketing.

2. **Stop short-circuiting `/` for logged-in users — `app/middleware/org-redirect.global.ts`.**
   It currently has `if (to.path === '/') return;` ("allow logged-in users to view main
   domain"). With marketing gone, drop that skip (or change it to redirect `/` →
   `/{slug}` / `/dashboard`) so the app root never tries to show marketing.

3. **`mainDomain` usages — verify each still reads correctly once it = `app.hoaconnect.info`:**
   - `server/middleware/custom-domain.ts:20` + `server/utils/domains.ts` `isMainDomainHost`
     — now "is host `app.hoaconnect.info`?" ✓ (correct).
   - `server/api/manifest.webmanifest.get.ts:29-44` — main-domain allowlist → app host ✓.
   - `server/api/domains/connect.post.ts:28` — rejects connecting the app host as a custom
     domain ✓.
   - `app/components/pages/SettingsDomainsPage.vue` (DNS instructions, lines ~304-312) — the
     CNAME/ALIAS target shown to customers becomes `app.hoaconnect.info` automatically ✓
     (this is exactly what we want).
   - `app/components/OrganizationSetupForm.vue:141` (slug preview URL) and
     `app/components/App/Footer.vue:34-42` ("Set up your HOA" link) — these point at
     `mainDomain`; once it's the app host they still resolve, but review the copy/links so
     they go where intended (setup lives in the app).
   - `nuxt.config.ts:69` (`mainDomain`) and `:202-206` (site `url`/`logo` derived from
     `NUXT_PUBLIC_MAIN_DOMAIN`) — SEO/manifest for the **app** now points at the app host;
     the public marketing SEO lives in the marketing project instead.

4. **Reserved subdomains — `app/middleware/domain-detector.global.ts`** already guards
   `['www','app','api','admin']` as non-slugs, so `app.…` won't be treated as an org slug.
   No change; just confirm.

5. **Dead-ish after split (optional cleanup, not required to ship):** the marketing
   sell-sheet component (`PagesSellSheet`) and the public pricing/`activePlans` fetch on the
   app root become unused on the app. Leave or remove. The pricing page itself moves to the
   marketing project (it can read `subscription_plans` from Directus or be static).

---

## 4. Cookies / auth

App session cookies are host-scoped to `app.hoaconnect.info` — fine, marketing has no login.
Custom domains already carry their own cookies. **No cross-domain SSO to build.**

---

## 5. Cutover order

1. Stand up the marketing project; deploy to a staging host; verify content.
2. Point `app.hoaconnect.info` DNS at the current app server; confirm the app serves there
   (set `NUXT_PUBLIC_MAIN_DOMAIN` + `APP_URL` first so links/host checks are correct).
3. Re-point existing customer custom domains' CNAME/ALIAS → `app.hoaconnect.info`; verify
   each resolves + TLS issues (Caddy on-demand).
4. Flip apex `hoaconnect.info` → marketing host.
5. Add a 301 from `hoaconnect.info/dashboard`, `/auth/*`, `/{slug}*` → the same path on
   `app.hoaconnect.info` for a grace period (covers stale links/bookmarks).

---

## 6. Smoke test after cutover

- `app.hoaconnect.info/` → redirects to login (logged out) / dashboard (logged in).
- `app.hoaconnect.info/{slug}/…` org pages load; admin + member + manager nav intact.
- A custom domain (`605lincolnroad.com/`) still rewrites to its org landing; TLS valid.
- Invite + inquiry-notification emails contain `https://app.hoaconnect.info/…` links.
- Connecting a new custom domain from Settings → Domains shows
  `→ app.hoaconnect.info` as the CNAME target.
- `hoaconnect.info` serves the marketing site; its CTAs land on `app.hoaconnect.info/auth/*`.

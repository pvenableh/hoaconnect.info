# Brainstorm — Public org/building pages + APEX/custom domains

> Working notes to think through (a) what each organization's *public* presence should
> be, and (b) whether/how to offer custom-domain (incl. APEX) management. Grounded in
> the current codebase. Nothing here is built yet beyond what's noted as "exists."

---

## TL;DR recommendations

1. **Public pages: yes, lean into them — but make them configurable per org.** A polished,
   per-building public site is a real differentiator (especially for commercial/mixed-use
   buildings like *605 Lincoln — Premiere Office Space*) and a free SEO/marketing channel.
   For privacy-conscious HOAs, let it collapse to a minimal "portal login + basics" page.
2. **Domains: offer a free subdomain to everyone, sell custom domains as a paid/white-label
   tier.** Because you self-host behind **Caddy**, custom domains (including APEX) are *much*
   cheaper to support than people assume — Caddy's **on-demand TLS** is the unlock. This is
   worth doing, but as a fast-follow upsell, not a launch blocker.
3. **Sequence:** ship `slug.hoaconnect.info` subdomains first (trivial), then the custom-domain
   flow (`/domain-setup` UI + host→org resolution + on-demand TLS) as a premium feature.

---

## Part 1 — Public-facing pages per organization/building

### What already exists (don't rebuild)
- **`app/pages/[slug]/index.vue`** already renders a public landing page for non-members:
  hero (bg/foreground image, title/subtitle, CTAs), about/description, amenities grid,
  "Meet our board" link (gated by `organization.show_board`), and a contact section
  (phone/email + "Become a Resident"). Members get redirected to their dashboard.
- **Per-org branding** is real: `BlockSetting` holds `logo`, `icon`, `colors`,
  `heading_font`/`body_font`, `title`, `description`, `theme` (`classic`/`modern`/`luxury`),
  applied via `useOrgBranding()` + `useTheme()`.
- **Per-org SEO** exists: `useSeoMeta()` on the landing page + `ExtensionSeoMetadata`
  (`title`, `meta_description`, `og_image`, `sitemap`, `no_index`/`no_follow`) on settings,
  plus a dynamic `/api/manifest.webmanifest` that returns org-specific PWA branding.

So the foundation is there. The opportunity is **depth, configurability, and lead capture.**

### The framing question: who is the public page *for*?
Different org types want very different things. Make the public site a set of **toggleable
sections** (you already have `modules` + `show_board` as precedent):

| Org type | Public page goal | Emphasis |
|---|---|---|
| Commercial / mixed-use building | Market the building, attract tenants/leases | Hero, amenities, gallery, availability, inquiry form |
| Condo/HOA (outward-facing) | Community identity + resident self-service | Hero, board, news, documents, portal login |
| Privacy-first HOA | Just a front door | Logo + "Resident login" + minimal contact |

### Section ideas (a menu to toggle per org)
Existing: **Hero · About · Amenities · Board · Contact**. Candidate additions:

- **News / Announcements (public subset).** Ties directly into the new Communications system:
  let admins mark an email/announcement "public" → it appears in a public newsletter archive
  (`/[slug]/news`). Great for SEO and transparency; reuses content already being authored.
- **Documents (public subset).** Expose only docs flagged public (e.g. CC&Rs, bylaws, rules,
  meeting minutes) — useful for prospective buyers/tenants and reduces "can you send me…" email.
- **Events / Meetings (public).** Upcoming public meetings or community events with RSVP/ICS.
- **Gallery / Tour.** Photo gallery or a virtual tour block — high value for commercial buildings.
- **Availability / "Spaces".** For buildings marketing units/offices: a simple listing of
  available spaces (sq ft, floor, rate, photos) + inquiry. Could start as a CMS-lite list.
- **Location & map.** Address, embedded map, neighborhood blurb — strong for local SEO.
- **FAQ.** Reduces inbound questions; cheap to author; good for SEO long-tail.
- **Lead capture / inquiry form.** "Interested in a unit?" / "Request information" → creates a
  lead record + notifies admins (reuse the email pipeline). This is the page's *conversion*.
- **Resident login + "Become a resident/apply".** Clear primary CTA → `/auth/login` (now glassy)
  and an apply/invite-request path.

### Architecture notes
- **Section model.** Add a `public_sections` config (JSON on the org, mirroring `modules`) or a
  small `hoa_page_sections` collection (ordered, typed blocks) so admins compose their page.
  Start simple (booleans + ordering) and grow toward a block builder only if demand appears.
- **Templates/themes.** You already have `classic`/`modern`/`luxury`. Treat these as public-site
  "skins." Luxury as a premium/white-label tier pairs naturally with custom domains (below).
- **Editing UX.** A "Public site" tab in org settings: toggle sections, reorder, edit copy,
  upload hero/gallery images (the file/folder browser already exists), set SEO + social image.
- **Performance/SEO.** Public pages should be SSR/ISR-cached and `@nuxtjs/seo`-driven (already
  installed): per-org sitemap, OG images, JSON-LD (`Organization`/`Place`/`Apartment`), and
  `no_index` honored from `ExtensionSeoMetadata` for orgs that want to stay private.

### Why it's worth it
- **Acquisition flywheel:** every building's public page is an SEO surface that markets HOAConnect
  ("Powered by" footer on free tier; removable on paid).
- **Stickiness:** a building's public identity living on your platform raises switching cost.
- **Reuses existing content:** announcements, documents, board, amenities are already authored.

---

## Part 2 — APEX / custom domain management: is it worth it?

**Short answer: worth it as a paid/white-label tier — and unusually cheap for you because you're
on Caddy.** Custom domains are the #1 "feels like our own product" lever for buildings/HOAs that
care about identity, and a clean upsell. The reason most SaaS treat it as expensive is per-domain
TLS + routing; your self-hosted Caddy sidesteps the worst of it.

### The three address models (offer a ladder)
1. **Subdomain on your domain — `lincoln.hoaconnect.info`** *(free, ship first)*
   - One **wildcard cert** `*.hoaconnect.info` covers all of them. Zero per-org cert work.
   - Resolution: Host header → subdomain label → org slug. (Today's `domain-detector` is
     path-based + client-side; add **server-side host→org** resolution + `/api/hoa/by-domain`.)
2. **Custom subdomain — `portal.theirbuilding.com`** *(paid, easy)*
   - They add a **CNAME** `portal → cname.hoaconnect.info`. CNAMEs are allowed on subdomains.
   - Caddy **on-demand TLS** issues a cert the first time that host is hit.
3. **APEX / root — `theirbuilding.com`** *(paid, the tricky one)*
   - **The catch:** classic DNS forbids a CNAME at the apex. Options to give owners:
     - **A/AAAA record → your server's stable IP** (you self-host Caddy → you *have* a stable IP,
       so this is clean; just document the IP and keep it stable / use a small set of IPs).
     - **ALIAS/ANAME/flattened-CNAME** if their DNS provider supports it (Cloudflare, Route 53,
       DNSimple, etc.) → point apex at `cname.hoaconnect.info`.
     - **Apex→www redirect**: they point `www` via CNAME and 301 the apex (registrar/Cloudflare
       rule). Easiest for them if they won't touch A records.
   - Recommend in the UI, in priority order: **ALIAS if available → A record to our IP →
     www+redirect.**

### The unlock: Caddy on-demand TLS
Because the stack is Caddy (per the `admin.hoaconnect.info` reverse proxy), you can do per-customer
certs with almost no ops:
- Configure Caddy **`on_demand_tls`** with an **`ask`** endpoint, e.g. `GET /api/domains/verify?domain=`,
  that returns 200 **only if** that host matches a `hoa_organizations.custom_domain` with
  `domain_verified = true`. This gates Let's Encrypt issuance so you can't be abused into minting
  certs for arbitrary domains.
- Caddy then obtains + renews the cert automatically on first request. No per-domain config, no
  redeploys, no Vercel-style domain limits/fees.

### What needs to be built (concrete)
1. **DB**: the fields already exist (`custom_domain`, `domain_verified`, `domain_type`,
   `domain_config`). Use `domain_config` (JSON) for: verification token, chosen record type,
   `verified_at`, last-checked, target record shown to the user.
2. **`/domain-setup` page** (currently referenced from `OrganizationInfoForm.vue` but **missing**):
   - Enter domain → we store it `unverified` + generate a token.
   - Show copy-paste DNS instructions tailored to apex vs subdomain (the ladder above), with a
     `TXT` verification record (or an HTTP `/.well-known` token) and the CNAME/A target.
   - **"Verify" button** → server does a DNS lookup (TXT match) or fetches the HTTP token →
     flips `domain_verified = true`. Show live status + re-check.
3. **Server host→org resolution**: an `/api/hoa/by-domain` endpoint + server middleware/plugin
   that reads the `Host` header, resolves a verified `custom_domain` (or `*.hoaconnect.info`
   subdomain) → org, and rewrites to the org context. Mirror the existing `find`/`by-slug` logic.
4. **Caddy `ask` endpoint**: `/api/domains/verify` returning 200/404 for on-demand TLS gating.
5. **Edge cases**: reserved hosts (`www/app/api/admin` already guarded), www↔apex normalization,
   "domain already in use by another org," and an unverify/disconnect flow.

### Effort vs. value
- **Subdomains (model 1):** ~hours. Do it now; it makes every org instantly "real."
- **Custom domains (models 2–3):** ~a focused week incl. the `/domain-setup` UX, verification,
  host resolution, and Caddy `ask` wiring. The cert/renew piece is basically free via Caddy.
- **Ongoing cost:** mostly *support* (DNS hand-holding). Mitigate with great copy, provider-specific
  instructions (Cloudflare/GoDaddy/Namecheap/Route 53), a one-click Cloudflare guide, and clear
  verify status. Gate behind a paid tier so the support load correlates with revenue.

### Is APEX specifically worth it?
Yes — but make it the *opt-in advanced* path, not the default. Most buildings will be happy with
`theirbuilding.com → www + redirect` or an A record. Offer apex, document the three options,
default the instructions to the easiest one their DNS provider supports, and don't let apex
complexity hold up shipping subdomains + CNAME custom domains.

---

## Suggested sequencing
1. **Now (cheap, high signal):** free `slug.hoaconnect.info` subdomains + server host→org resolution.
2. **Public site v1:** "Public site" settings tab — toggle/reorder existing sections + add
   News (public announcements) and an Inquiry/lead form (reuses Communications). Per-org SEO/OG/JSON-LD.
3. **Custom domains (paid tier):** build `/domain-setup` + verification + Caddy on-demand TLS;
   support CNAME and apex (ALIAS → A → www-redirect ladder). Bundle with the Luxury skin + "remove
   Powered-by" as the white-label package.
4. **Later:** richer public block builder, availability/listings, gallery/tours, FAQ, public docs.

## Open questions for the owner
- Which orgs are *outward-facing* (market units) vs *private* (portal only)? Drives default sections.
- Is custom-domain a Pro/Luxury-only feature, or an à-la-carte add-on?
- Are we comfortable publishing the server IP for apex A records, or do we want a small proxy/static
  IP set we promise to keep stable?
- Do we want a "Powered by HOAConnect" footer on free public sites (acquisition) removable on paid?

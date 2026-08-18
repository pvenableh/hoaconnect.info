# HOA Connect — Vision

> "**Your community owns everything. Everyone can see it.**"
>
> Drafted 2026-08-18. Companion to [ROADMAP.md](ROADMAP.md) (execution) and
> [plan-bespoke-removal.md](plan-bespoke-removal.md) (platform consolidation).

## Vision statement

HOA Connect is the community-owned operating system for HOAs and condos. Every
record — every dollar, document, decision, and AI action — belongs to the
association forever, is visible to the owners who fund it, and travels with the
community no matter who manages it. Property managers plug into a community
rather than holding it hostage: they bring their playbooks, work in the open,
and can be swapped without the community losing a byte of history. An always-on,
fully auditable AI staff member does the grunt work — with every action logged,
human-approved by default, and visible to the people it serves. The incumbents
sell software to managers and lock in communities as the collateral. **We sell
sovereignty to communities and let managers compete on merit.**

## Positioning — why we win

The incumbent stack (AppFolio, Buildium, Vantaca, CINC) shares one structural
fact: **the PM is the customer and the community's data is the switching cost.**
Our wedge inverts that:

- **Sell to the board.** The association is the tenant of record, data owner,
  and admin — always. The PM is a permissioned guest with a start and end date
  (`hoa_vendors.active_since/active_until` already models this).
- **Sell to good PMs too.** "If you ever fire us, you keep everything" wins
  RFPs. Lock-in only protects bad PMs.
- **The swap is the product.** "Fire your PM without losing your history; hire a
  new one in an afternoon" is a sentence no incumbent can say.
- **AI they can't copy quickly.** Bolt-on chatbots have no append-only HITL
  action queue, trust dial, per-community RAG, or owner-visible AI audit to
  expose.

**Two audiences, one invariant — not brand dilution.** We absolutely target good
PMs managing multiple HOAs; the agency layer (`billing_accounts`, seats,
attach/detach, per-org grants) already exists for exactly that. What keeps the
brand focused is that PM adoption never changes the invariants: the board holds
admin, the data is org-owned and exportable, actions land on the audit ledger.
For communities that don't want to self-manage, we ship a **"Full-service" grant
preset** — the PM gets broad grants across inquiries/violations/directory/
documents/communications/projects/activity and runs everything day-to-day — but
sovereignty and transparency are structural, not settings, so full-service ≠
lock-in. The pitch to PMs writes itself: *"manage 30 communities from one
dashboard, and win the next 10 because you're the manager who offers
transparency."* One brand ("the community owns everything"), two buyers (boards
directly; PMs as the delivery channel), zero features built *for* PM
empire-building (see What NOT to Build).

## Pillar A — Data Trust & Sovereignty ("It's yours. Take it anytime.")

*Promise:* "Everything your community creates here belongs to your community —
permanently exportable, never held for ransom."

Exists: org-FK'd everything; grants enforced in `core/server/utils/manager-access.ts`;
attach/detach in `core/server/api/billing-account/{attach,detach}-org.post.ts`
(non-destructive, but detach → `expired` lockout; agency-created orgs have the
agency as HOA Admin — two gaps).

Build:
1. **Data Trust export** — one admin button → async worker → zip: full JSON of
   org-scoped collections + human CSVs (ledger, members, units, requests) +
   files archive + manifest. Board can trigger it even mid-dispute. Marketed,
   not just shipped.
2. **Management Transition Wizard** — replaces raw detach: force-promote a board
   member to HOA Admin, revoke all grants, end-date the vendor row, 60-day
   self-pay grace window instead of instant `expired`, immutable audit entry,
   optional export for the outgoing PM. Mirror-image onboarding on attach.
3. **PM portability** — a new `agency_assets` scope owned by the billing account
   (templates, vendor rolodex, playbooks, agency-private notes) travels with the
   PM; everything org-scoped stays. Draw the line explicitly in schema and
   marketing.
4. **Continuity guarantee in writing** — plain-English data policy page
   (exportability, 12-month read-only export access after cancellation, what a
   PM takes vs leaves).

## Pillar B — Radical Owner Transparency ("Know what's going on.")

*Promise:* "See where your dues go, what your board decided, what your manager
did, and what the AI did — without asking permission."

Exists: owner portal; `ai_actions` queue; `hoa_member_change_requests` (implicit
audit trail); `core/shared/reporting/ledger.ts`. Missing: any actor-facing audit
surface; owner-visible financials.

Build:
1. **The Community Ledger** — owner-visible feed backed by a new append-only
   `org_audit_log` (no update/delete perms, ever). Sources: payments/expenses,
   document publishes, poll/meeting outcomes, approved change requests, executed
   AI actions, grant changes, management transitions. Summarized by default,
   itemized on drill-down.
2. **Central visibility-policy module** — decided once, enforced everywhere.
   Owner-visible: aggregate finances, vendor spend, decisions, AI actions, grant
   changes. Board-only: legal, per-member delinquency, personnel. Never: one
   member's payment status to another member.
3. **Monthly "State of the Community" brief** — AI-written, board-approved via
   the existing HITL outbound gate, citing the ledger. Flagship demo of pillars
   B+C compounding; reuses the digest worker.
4. **Where-my-dues-went** — per-owner payment history + community expense
   breakdown from `ledger.ts` by-category. Presentation only, no new accounting.

## Pillar C — LLM Dominance ("An AI staff member you can audit.")

*Promise:* "Ask your community anything — 'can I paint my fence black?' — and
get an answer cited from your actual bylaws and ledger. When the AI acts, every
action is logged; the important ones wait for a human."

Exists (strongest asset, live): metered chat + Voyage RAG; 13 HITL actions with
executors + undo; trust dial 0–3; outbound never auto-approved; token economy +
wallets; contextual awareness; ai-spend oversight. Missing: owners can't query
it; AI actions aren't owner-visible; RAG covers docs, not structured data.

Build:
1. **"Ask the HOA" for owners** — read-only cited chat over bylaws RAG +
   owner-visible ledger slice + calendar, metered against the org wallet.
   Deflects the #1 workload (owner questions); the feature owners tell neighbors
   about; drives credit revenue.
2. **AI actions on the Community Ledger** — every executed `ai_actions` row
   becomes a ledger entry (what/who approved/undo status). "Auditable AI" as a
   claim no bolt-on chatbot can make.
3. **Structured-data grounding** — tool-call reads over `ledger.ts` outputs and
   `hoa_vendors` ("what did we spend on landscaping?"), not just doc RAG.
4. **Delinquency copilot (later)** — HITL reminder/escalation sequences riding
   on activated payments.

## Pillar D — Payment Management ("Dues into your account, not ours.")

*Promise:* "Dues go straight into your association's own account. The board sees
every dollar in real time; owners see where it went."

Exists: Connect dues routing CODE-COMPLETE, NOT ACTIVATED; manual money model
works; pure reporting shipped. Blockers:
**`core/server/api/stripe/connect/account.post.ts` trusts client-supplied
`organizationId`** (the file's own NOTE admits it); operator steps; zero
payments tests; no opening balances.

Build:
1. **Harden + activate** — server-derive the org from the authenticated admin's
   membership on all Connect endpoints, webhook idempotency tests, operator
   runbook, one pilot org.
2. **Opening balances** — small schema+UI so migrated communities' reports
   aren't asterisked.
3. **Owner autopay + receipts**; delinquency aging (already computed) surfaced
   with AI-drafted HITL reminders.
4. **Light reconciliation, not accounting** — monthly statement view (opening +
   transactions + closing) with CSV/PDF for the CPA. That's the line.

## Retained core: board communications & project management (already built, stays central)

The Earnest-derived collaboration layer is **not** up for debate in this vision
— it's shipped, live, and becomes more valuable under the transparency pillars:

- **Channels** — Slack-like board/committee comms with threads, replies, and
  reactions (`apps/app/app/components/channels/` — `ChannelThread`,
  `ChannelMessage`, `ReactionBar`; moderation, pins, invites in
  `core/server/api/hoa/channels/`). This is where board deliberation happens
  *in the record* instead of in text threads — decisions that conclude there
  feed the Community Ledger.
- **Projects with Gantt/timeline** — `ProjectGantt.vue`, `ProjectTimeline.vue`,
  `OrgTimeline.vue` over `core/server/api/org/{projects,project-events,tasks}`,
  with tokenized board milestone approvals. Vision upgrade: owner-visible
  project status ("the roof project: 60%, next milestone approved 3/12") as a
  Community Ledger source — owners watch the special assessment they funded
  actually progress.
- **HTML email builder** — the block-based builder
  (`apps/app/app/components/EmailBuilder/` — Canvas, blocks, variables, AI
  wizard) + templates, MJML mode, scheduled/recurring sends, per-org
  white-label sender domains, CC/BCC, and SendGrid activity tracking. Sending is
  already permission-gated (`communications` grant / admin) — exactly the
  "approved senders publish announcements/newsletters to the community or
  individuals" model. Vision upgrade: sent announcements are ledger entries with
  open/delivery stats visible to the board, and the AI-written State of the
  Community brief ships *through this builder* via the HITL outbound gate.

These three are the day-to-day product that the sovereignty/transparency pillars
make defensible: comms, projects, and email histories are org-owned, exportable
(Phase 3), and auditable (Phase 5) — the working record a community keeps
forever, whoever manages it.

## Pillar E — Bulletproof platform (port back from WeddingConnect)

The apex/slug, push, and versioning systems in `~/Sites/weddings/website` are
the proven, refined versions of HOA Connect's own patterns (its resolver comment
literally says *"HOA-Connect-style apex + slug"*). Port them back, hardened:

1. **Host-first apex/slug routing.** Weddings' model: tenancy is a pure function
   of the request Host — one resolver (`server/utils/wedding.ts`), one Directus
   query covering custom-domain → subdomain-slug → fallback with priority
   resolved in JS, clean slug-less URLs by construction. Port to HOA Connect as
   the custom-domain serving layer (fixes the standing "slug-less portal
   routing" TODO from the bespoke-removal plan): server middleware resolves
   Host → org and rewrites to `/{slug}/…` internally; keep HOA Connect's
   *existing* DNS-verification flow (weddings has none — HOA Connect is ahead
   there). Also port: the `origin.ts` **host-spoof guard** for emailed links
   (exact-match known hosts, deliberately NOT reusing the tenant resolver),
   per-host dynamic `manifest.webmanifest` + theme-color/OG, and
   `requireWeddingOwner`'s pattern of re-resolving the tenant from Host on every
   admin call (404-not-403). **Close weddings' one gap: add a short-TTL host→org
   cache with invalidation on domain change** — weddings does a live Directus
   call per request.
2. **Web Push (net-new for HOA Connect).** Full port of the weddings stack:
   hand-written `public/sw.js` (no fetch handler, `skipWaiting`+`clients.claim`,
   cache purge on activate), `usePush` (permission from a click, capability +
   iOS 16.4 PWA detection with an Add-to-Home-Screen walkthrough, "test
   notification" on enable), `push_subscriptions` collection
   (upsert-by-endpoint, `user_agent`, `last_used_at`, CASCADE on user delete),
   server `sendPushToUser` (lazy VAPID config that cleanly disables the whole
   system when keys are absent, `Promise.all` fan-out, **404/410 → delete the
   dead subscription**), the Cache-Storage badge-count trick, and
   DB-rows-as-durable-channel with push as best-effort on top of the existing
   bell/digest. **Tenant decision:** weddings subscribes per-account; HOA
   Connect notifications are org-scoped, so include org context in the payload
   and respect the existing per-category `notification_preferences` at send
   time. Wire into the existing notification send path + digest worker.
3. **Three-signal versioning upgrade.** HOA Connect has buildId + `/api/version`
   + `useAppVersion` + `AppUpdatePrompt` (one signal, prompt-only). Upgrade to
   weddings' model: (a) Nuxt build manifest with
   `checkOutdatedBuildInterval: 5min` + cache-busted `latest.json` fetch,
   (b) visibility-gated resume/poll checks (zero network when backgrounded),
   (c) `x-app-build` header on every `/api/*` response compared in a fetch
   wrapper. Plus the decision rule that makes it feel native: **hidden → silent
   reload; visible → prompt; dirty form → never reload** (`useUnsavedWork`
   count-based interlock), `reloadNuxtApp` with `ttl` loop guard,
   `emitRouteChunkError: 'automatic-immediate'`, and `routeRules` no-cache on
   `latest.json` / `sw.js` / `manifest.webmanifest`.

## Roadmap (solo-builder; every phase ships and sells alone)

| Phase | Scope | What ships | Sellable as | Depends on |
|---|---|---|---|---|
| **1. Harden & activate payments** | M | Connect security fix (first, regardless), tests, runbook, pilot org, opening balances | "Dues into your own Stripe account" | — |
| **2. Bulletproof platform** | M | Pillar E: host-first domain layer w/ cache + spoof guard, Web Push, three-signal versioning. Rides with the bespoke-removal Phase 1–2 work | "Feels like a native app on your own domain" | — (parallel-safe with 1) |
| **3. Data Trust export** | S/M | Export worker + zip + admin UI + written continuity policy + marketing page | "The take-your-data button" | — |
| **4. Management Transition Wizard** | M | Board-admin guarantee, guided detach w/ grace window + audit entry, attach mirror, `agency_assets`, **Full-service grant preset** | "Swap managers in an afternoon" / "full-service without lock-in" | 3 |
| **5. Community Ledger** | M/L | `org_audit_log` + visibility-policy module + feed writers + owner surface; push-notified via Phase 2 | The transparency flagship | 1, 2, 4 (richest sources; can ship earlier reading existing tables) |
| **6. Owner-facing AI** | M | "Ask the HOA", structured grounding, AI-on-ledger, State of the Community brief | "Every owner gets an AI concierge" | 5 |
| **7. Compounding** | M ongoing | Delinquency copilot, PM playbook maturity, statement PDFs, wizard polish | — | 1–6 |

## Risks & honest tensions

- **Transparency vs privacy/legality** — one delinquency-shaming incident kills
  the brand → central policy module with conservative defaults; individuals
  never exposed.
- **PM channel conflict** — the pitch weakens lock-in and PMs influence
  purchasing → lead with board-direct + self-managed communities; recruit
  "transparent PM" early adopters; accept lock-in-dependent PMs aren't the
  market.
- **AI liability** — wrong CC&R answers have legal weight → mandatory citations,
  read-only owner AI at launch, outbound never auto-approved (already policy).
- **Payments risk concentration** — real money + solo builder → Phase 1 is
  hardening-first, one pilot org, manual entry stays as fallback.
- **Solo scope discipline** — the sequencing is the mitigation; nothing depends
  on more than one predecessor.

## What NOT to build

- **Not QuickBooks** — no double-entry GL, bank feeds, tax, budgeting engine.
  `ledger.ts` stays pure; CPAs get clean CSVs.
- **No accounting integrations** — export well, integrate never (until a
  customer pays for one).
- **No autonomous AI money movement, ever** — financial + outbound actions stay
  human-approved at every trust tier. This constraint IS the brand.
- **No PM enterprise suite** (dispatch marketplaces, tech mobile apps, PM CRM) —
  the PM is a guest with good tools, not the customer.
- **No per-org schema customization** beyond the site builder — Signature is
  bespoke service, not bespoke code.
- **No native mobile apps** until the PWA demonstrably fails.
- **No mutable audit log, ever.**

# Plan — "Property Flow AI": a Claude assistant + Earnest-style token economy

> A beautiful, buildable plan to add an **Anthropic (Claude) assistant** to HOAConnect /
> Property Flow, monetized through **purchasable AI credits ("tokens")** — the Earnest model:
> a small balance meter in the chrome, one-tap top-ups, and AI woven into the surfaces users
> already touch. Grounded in the current stack (Nuxt 4 + Directus + Stripe + the new
> Communications engine).

---

## 1. The idea in one paragraph

Give every building a calm, capable assistant that does the boring writing and the tedious
looking-up — **draft an announcement, summarize 14 pages of minutes, answer "what do the bylaws
say about rentals?"** — and meter it with **AI Credits** the org buys in packs (with a monthly
allowance baked into each plan tier). Credits show as a friendly meter in the dock; running low
opens a one-tap top-up. Internally we meter *real* Anthropic token usage and convert to credits
with a healthy margin, so heavy users fund themselves. Ship it first inside the Communications
composer (where it's instantly useful and the spend is obvious), then expand to summarize, Q&A,
and a resident-facing helper.

**Why it fits HOAConnect:** the platform already holds the exact context an assistant needs —
bylaws/CC&Rs (`hoa_documents`, governance/rules), board, meetings/minutes, members, requests,
and now a rich **Communications** system. AI here isn't a gimmick; it's leverage on content the
admins are already authoring.

---

## 2. Where the assistant earns its keep (use cases)

Ranked by value-to-effort. Each maps to data we already have.

| Surface | What it does | Data it uses | Phase |
|---|---|---|---|
| **Communications composer** ✨ | "Draft an alert about the pool closing this weekend." Rewrite / shorten / change tone / translate. Fills subject + body (visual or MJML). | org name, board, merge fields | **1** |
| **Documents / Minutes** | One-click **Summarize** a long doc or meeting minutes into bullet highlights + action items. | `hoa_documents`, meetings | 2 |
| **Governance Q&A** | "Are short-term rentals allowed?" → grounded answer **with citations** to the bylaw section. | rules/governance docs (RAG) | 2 |
| **Official notices** | Draft violation notices / dues reminders with merge data, in the right tone. | member + balance fields | 2 |
| **Request triage** | Summarize a maintenance request thread, suggest a reply, propose a category/priority. | `hoa_requests` | 3 |
| **Resident helper** | Member/public chatbot: "When is trash pickup? How do I pay dues? Pool hours?" answered from the org's docs/FAQ. | public docs, FAQ | 3 |
| **Meeting prep** | Draft an agenda from recent activity; turn raw notes into clean minutes. | meetings, feed | 3 |

The **composer integration is the wedge**: it's where spend feels worth it, and it showcases the
token economy on day one without needing retrieval infrastructure.

---

## 3. The token economy (the "like Earnest" part)

### 3.1 Core model — credits, not raw tokens
Users should never reason about "input vs output tokens." They see **AI Credits**. Internally we
meter the real Anthropic usage (`usage.input_tokens`, `output_tokens`, plus cache read/write) and
convert to credits at a published rate **with margin**.

```
credits_charged = ceil( blended_token_cost($) × MARGIN_MULTIPLIER × CREDITS_PER_DOLLAR )
```

- Keep a single internal **$-per-credit** anchor (e.g. **1,000 credits = $1 to the user**).
- `MARGIN_MULTIPLIER` (start ~4–5×) covers Anthropic cost + overhead + margin. Caching and Haiku
  routing quietly improve real margin beyond that.
- Show **estimated credits before** any heavy action and **actual credits after** ("This draft
  used ~180 credits"). Transparency builds trust and curbs surprise.

### 3.2 Three ways credits enter the wallet
1. **Plan allowance** (subscription-funded): each `subscription_plans` tier includes a **monthly
   credit grant** that resets each period (e.g. Starter 50k · Pro 250k · Premium 1M). Covers
   typical usage so most orgs never think about it.
2. **Top-up packs** (one-time, Stripe): the upsell for heavy months. Volume bonus to nudge bigger
   packs.
   | Pack | Price | Credits | Effective |
   |---|---|---|---|
   | Small | $10 | 10,000 | — |
   | Medium | $25 | 27,500 | +10% |
   | Large | $100 | 120,000 | +20% |
3. **Trial / promo grants**: free starter credits on signup (acquisition), or via the existing
   **coupons** system.

### 3.3 Wallet rules
- **Wallet is per-org** (multi-tenant) — shared by admins/board. Optional later: per-user monthly
  sub-budgets so one person can't burn the building's balance.
- **Spend order:** included allowance first, then purchased credits (purchased never expire;
  allowance resets).
- **Auto-refill** (opt-in): when balance < threshold, charge the saved card for a chosen pack.
- **Insufficient balance:** the action returns a friendly "You're out of credits — top up?" with a
  one-tap buy, never a hard error.

---

## 4. Architecture

```
 Vue (glass UI)                Nitro (server)                   External
 ┌───────────────┐  SSE/JSON   ┌────────────────────────┐      ┌──────────────┐
 │ Assistant panel│──────────▶ │ /api/ai/* endpoints     │────▶ │ Anthropic API │
 │ ✨ Draft buttons│            │  • auth + org scoping   │      │ (Claude)      │
 │ Credit meter   │ ◀──────────│  • build prompt + cache │ ◀────│ usage{}       │
 └───────────────┘   stream    │  • meter → debit wallet │      └──────────────┘
                                │  • ledger write         │      ┌──────────────┐
                                │ /api/ai/credits/*       │────▶ │ Stripe (packs)│
                                └────────────────────────┘      └──────────────┘
                                          │
                                   Directus (Postgres)
                                   ai_wallets · ai_transactions · ai_embeddings(pgvector)
```

### 4.1 Anthropic integration (server-only)
- `ANTHROPIC_API_KEY` in env; **all** calls server-side via Nitro. Never expose the key client-side.
- **Streaming** (SSE) for chat/drafting so the UI feels alive.
- **Prompt caching** is the margin lever: cache the system prompt + stable org context (bylaws,
  org profile) with `cache_control: { type: "ephemeral" }`. 5-minute TTL → repeated Q&A in a
  session reads cached input at a fraction of the cost. Bill cache-read tokens at their lower rate
  in the meter so savings flow to margin.
- **Model tiering** routes by task → also sets credit cost:
  | Tier | Model | Use for |
  |---|---|---|
  | Fast | Claude Haiku | classification, short rewrites, FAQ answers, triage |
  | Standard | Claude Sonnet | most drafting + summarizing (default) |
  | Max | Claude Opus | gnarly reasoning / long governance synthesis (rare) |
  Expose as a simple "Fast / Best" toggle; default Standard.
- **Batch API** for non-interactive bulk jobs (e.g. summarize a whole document library overnight)
  at lower cost.
- **Citations**: use Anthropic's citations for governance Q&A so answers point back to the exact
  bylaw passage — trust + liability cover.

### 4.2 Metering & ledger (source of truth)
Every AI call goes through one server util: `chargeForCompletion(orgId, usage, model, feature)`.
- Reads `usage` from the API response, computes blended cost → credits.
- **Atomically** debits the wallet and appends an `ai_transactions` row.
- Balance is a **derived/cached** value; the **append-only ledger is truth** (auditable, reversible).
- Pre-flight check rejects (gracefully) if estimated cost would overdraw.

### 4.3 Stripe (token purchases)
- Packs = one-time Stripe Products/Prices (or dynamic amounts). Checkout via the existing Stripe
  setup (`stripe` + `@stripe/stripe-js` already in deps).
- **Webhook credits the wallet on `payment_intent.succeeded`** (idempotent, keyed by the Stripe id)
  — never credit client-side.
- Note: this is **org → platform** revenue (standard charges on the platform account), distinct
  from the existing **Stripe Connect** flow (resident → org dues). Different money, same library.

### 4.4 RAG for Q&A (Phase 2)
- Embed org documents (rules, governance, minutes) → store vectors. Natural fit: **pgvector** on the
  Directus Postgres (`ai_embeddings`: org, source ref, chunk text, vector). Re-embed on doc change.
- Retrieval: cosine top-k filtered **by org** (hard isolation), passages fed to Claude with citations.
- Keep it scoped: the system prompt forbids answering outside the retrieved org context.

### 4.5 Data model (new Directus collections)
- `ai_wallets` — `organization` (M2O), `balance_credits`, `included_credits`, `period_resets_at`,
  `auto_refill_enabled`, `auto_refill_threshold`, `auto_refill_pack`.
- `ai_transactions` — `organization`, `type` (`debit`|`purchase`|`grant`|`refund`), `feature`,
  `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `credits`, `user`, `stripe_id?`,
  `date_created`. (Append-only.)
- `ai_conversations` / `ai_messages` (Phase 2+) — chat history for the assistant panel.
- `ai_embeddings` (Phase 2) — pgvector store.
- Reuse `subscription_plans` for the monthly `included_credits` per tier.

### 4.6 Endpoints
- `POST /api/ai/draft` — compose/rewrite for the Communications composer (streaming).
- `POST /api/ai/summarize` — doc/minutes/thread summary.
- `POST /api/ai/ask` — governance Q&A (RAG + citations).
- `POST /api/ai/chat` — assistant panel (streaming, conversation memory).
- `GET  /api/ai/credits` — wallet balance + this-period usage.
- `POST /api/ai/credits/checkout` — start a pack purchase (Stripe).
- `POST /api/ai/credits/webhook` — Stripe → credit wallet (idempotent).
- All gated by session + org membership; all meter through the same charge util.

---

## 5. UX — Earnest-style, on the glass design language

- **Credit meter in the chrome:** a small pill in the header/dock — `✦ 24,300 credits` — that opens
  a popover with usage + **"Buy credits."** This is the Earnest cue: always visible, never nagging.
- **Inline ✨ actions** where work happens:
  - Communications composer: **"Draft with AI"** + a rewrite menu (Improve · Shorten · Lengthen ·
    Change tone · Translate). Generates straight into subject/body; honors visual vs MJML mode.
  - Documents/minutes: **"Summarize"**. Requests: **"Suggest reply."**
- **Assistant panel** (Phase 2): a glass side-sheet ("Assistant", sparkle icon — could ride the
  existing dock) for free-form chat + Q&A with citations.
- **Buy-credits modal:** glass card, three packs, auto-refill toggle, Stripe Elements; balance
  updates live on success. "What you can do with this" helper (e.g. "≈ 60 AI-drafted announcements
  or ≈ 250 document questions").
- **AI & Credits settings tab** (org settings): balance, plan allowance, this-month usage by feature
  and by user (unovis charts, `<ClientOnly>`), transaction history, auto-refill + pack management.
- **Cost transparency:** estimate before heavy actions; "used ~X credits" after; per-action history.

---

## 6. Economics — make it pay

- **Cost basis:** Anthropic prices per million tokens, with output > input, and **cache reads ~10%
  of input**. Haiku ≪ Sonnet ≪ Opus. So real cost per action swings widely by model + caching.
- **Pricing levers that protect margin:** (1) default to **Sonnet**, route simple work to **Haiku**;
  (2) **cache** org context aggressively; (3) **cap max output tokens** per feature; (4) trim RAG
  context to top-k; (5) **Batch API** for bulk.
- **Set credits with margin baked in** (≈4–5× blended cost), publish a single $-per-credit anchor,
  and size plan allowances so *typical* orgs are covered by subscription while *heavy* orgs buy
  packs — that overage is the profit center.
- **Worked example (illustrative, tune to live prices):** a ~1-page announcement draft (≈1.5k in /
  0.5k out on Sonnet) costs cents; charge ~150–250 credits (~$0.15–0.25). A cached governance Q&A is
  cheaper still. The included Pro grant (say 250k credits) ≈ hundreds of drafts/month — generous,
  yet heavy users predictably top up.

---

## 7. Guardrails & risks

- **Org data isolation is sacred:** every prompt/RAG query is hard-scoped to the caller's org. One
  building must never see another's docs. Test this explicitly.
- **PII & tone:** system prompts forbid inventing legal/financial facts; notices are drafts a human
  sends. Keep a "review before send" step (the composer already requires it).
- **Abuse / runaway spend:** per-request max tokens, per-org rate limits, daily soft caps, and the
  wallet itself is the ultimate limiter. Auto-refill has a monthly ceiling.
- **Reliability:** model-version pinning + graceful fallback (Sonnet→Haiku on overload); never lose a
  user's draft if a call fails.
- **Attribution & ToS:** "Powered by Claude" where appropriate; follow Anthropic usage policies.
- **Refunds/disputes:** ledger is append-only with `refund` entries; Stripe disputes reconcile to it.

---

## 8. Phasing (so it ships, earns, then grows)

**Phase 1 — Drafting + the token economy (the wedge).**
Ship "Draft with AI" + rewrite menu in the Communications composer; the **wallet + ledger**, **Stripe
packs + webhook**, the **credit meter** + buy-credits modal, plan allowances, prompt caching, model
tiering. No RAG. This proves the whole economy on one beloved feature.

**Phase 2 — Summarize + grounded Q&A.**
Document/minutes summarization; governance Q&A with **pgvector RAG + citations**; the **assistant side
panel** + AI & Credits dashboard; auto-refill.

**Phase 3 — Resident assistant + automations.**
Member/public FAQ bot from org docs; request triage + suggested replies; agenda/minutes drafting;
per-user budgets; Batch API bulk jobs.

---

## 9. Open questions for the owner

- **Who pays?** Org-only wallet (recommended), or can residents buy their own credits for a resident
  assistant?
- **Credit anchor + margin:** confirm the $-per-credit and starting `MARGIN_MULTIPLIER`.
- **Plan allowances:** how generous per tier (drives perceived value vs. margin)?
- **Naming:** "AI Credits" / "tokens" / a branded name (e.g. "Sparks")? "Property Flow AI" vs a
  persona name for the assistant?
- **RAG scope at launch:** all org docs, or start with just rules/CC&Rs + minutes?
- **Trial grant size** for new orgs (acquisition lever via the coupons system).

---

### First slice I'd build (≈ the Phase 1 cut)
1. `ai_wallets` + `ai_transactions` collections (+ `included_credits` on `subscription_plans`); migration script (idempotent, confirm-before-run) → `generate:types` → permissions.
2. `server/utils/anthropic.ts` (client + caching + model tiers) and `chargeForCompletion()` metering util.
3. `POST /api/ai/draft` (streaming) wired into the composer's **"Draft with AI"** + rewrite menu.
4. Credit meter pill + buy-credits modal + `/api/ai/credits` + Stripe pack checkout + webhook.
5. Verify end-to-end on `:3000` (draft an announcement, watch credits debit, buy a pack, watch balance rise) using a test org; clean up test rows.

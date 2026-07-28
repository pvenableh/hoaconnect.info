# Plan — Earnest-Parity Upgrade (AI focus model, channels, HTML email)

**Status:** Proposed · **Author:** Peter + Claude · **Date:** 2026-07-28

## Goal

Make HOA Connect *feel like Earnest* across three surfaces — the AI assistant, channels, and the HTML email system — while keeping HOA Connect's own AI stack. The AI should be **context-aware of what the user is looking at**, grounded in **brand / location / target / amenities knowledge**, **transparent about what it knows** for a given conversation, and able to hold **item-specific conversations** (a member, vendor, project, ticket, etc.) with visible history. It should progress from advisor → action-proposals → graduated autonomy.

## Strategic decisions (locked)

1. **Own AI, Earnest patterns.** HOA Connect keeps its own model routing, RAG (Voyage `ai_doc_chunks`), and credit wallet. We port Earnest's *patterns* — the focus/awareness model, entity dossiers, awareness chip, item-scoped threads, HITL action queue, trust dial — into the `core` layer. No runtime coupling to Earnest.
2. **Full graduated autonomy** is the destination: advisor → HITL proposals → trust-dial auto-approval of low-risk actions.
3. **All four subsystems in scope**, sequenced below.

## Why this is tractable

Earnest and HOA Connect share the same stack: **Nuxt 4 + Directus 11 + Anthropic Claude + SendGrid + Directus-Realtime WebSocket + MJML + TipTap.** Most of this work is porting patterns, not inventing. HOA Connect is already *ahead* of Earnest on RAG, metered credits, and email scheduling; the gaps are concentrated in the AI *awareness/focus* layer, HITL actions, channel niceties, and the email block-builder.

### Gap summary (Earnest has → HOA Connect needs)

| Area | Earnest pattern | HOA Connect today | Action |
|---|---|---|---|
| Screen focus | `useEntityPageContext.setEntity()` + route→scope mapper | lighter `useAiContext` | **extend** |
| Grounding | per-entity dossier builders (~22 types) | org-context snapshot only | **build dossiers** |
| Brand knowledge | `brand-context.ts` (direction/goals/audience/location) | org profile in `settings.landing` | **surface as knowledge** |
| Transparency | `AwarenessChip.vue` + server-side gating | source citation chips only | **build chip + gating** |
| Item threads | `context` JSON `{entityType,entityId}` on sessions | `ai_conversations` not entity-scoped | **add scoping** |
| Context cost | 3-tier cache (`ai_context_snapshots`) | per-request assembly (prompt-cached) | **add snapshot cache** |
| Actions | `ai_actions` HITL queue + trust dial + tools | read-only | **build** |
| AI UI | inline entity card + full-screen focus takeover | slide-over panel | **add altitudes** |
| Channels | reactions, entity-scoped, link previews, mod log | threads/mentions/unread/pin | **add the rest** |
| Email | block-builder + `newsletter_blocks` library | visual/MJML modes | **add builder** |

---

## Architecture principles to port

- **Provider-agnostic LLM adapter + factory** (Earnest `server/utils/llm/{types,factory,claude}.ts`). A single `LLMProvider` interface (`chat`, `chatStream`, `chatWithTools`) behind a cached factory — the seam that makes tool-use and model swaps clean. HOA Connect calls `@anthropic-ai/sdk` directly in `anthropic.ts` today; refactor behind this seam, keeping credit metering wrapped around it.
- **Layered system-prompt assembly** with a non-negotiable *voice/accuracy charter* floor + persona/tone layers concatenated per request (Earnest `context.ts` + `voice.ts`).
- **Focus as data**: a shared `setEntity()` registry + a route→scope/focus mapper (reuse the dock/nav mapping so "where am I" never drifts) producing a "right now you're looking at…" sentence + an entity dossier.
- **Three-tier context cache** (memory → Directus snapshot → live) with stale-while-revalidate to keep org grounding cheap.
- **User-gated context** enforced server-side (deselected sources are never fetched or sent).
- **Static-injection grounding + RAG**: keep HOA Connect's Voyage RAG for long docs/bylaws; add per-entity dossiers with `[Source: X]` citation discipline for structured records.
- **Conversation buckets keyed by entity-or-route** in a JSON `context` column.
- **HITL tool proposals**: outbound/destructive tools write a `pending` `ai_actions` row; a trust dial grants graduated auto-approval; the assistant is charter-bound to say it *proposed*, never *did*.
- **Server routes are the real security gate** (Directus 11 create-perms don't walk FKs): every relational write goes through a Nitro route that authorizes then inserts. HOA Connect already does this for channels/email — extend to AI actions.

---

## Phase 0 — Foundations (LLM adapter, voice charter, context cache)

*Enables every later phase; no user-visible change.*

1. **LLM adapter seam.** Create `core/server/utils/llm/{types,factory,claude}.ts` mirroring Earnest. `getLLMProvider()` returns a cached singleton reading model tier from `core/shared/ai/credits.ts` (`MODEL_TIERS`). Refactor `core/server/utils/anthropic.ts` to call the provider; keep `chargeForCompletion` metering wrapped around it. Add `chatWithTools()` now (unused until Phase 4) so the tool path exists.
2. **Voice charter + prompt layering.** Extract HOA Connect's `chatSystemPrompt`/`draftSystemPrompt` into a layered builder `core/server/utils/llm/context.ts` (identity + module awareness + guidelines + `[Source: X]` citation rule) with a `voice.ts` accuracy floor. Preserve current read-only framing (it changes in Phase 4).
3. **Context Broker cache.** New collection `ai_context_snapshots` (`organization`, `context_type`, `data` JSON, `token_estimate`, `expires_at`) + `core/server/utils/context-broker.ts`: L1 in-memory Map (5-min TTL) → L2 Directus snapshot (30-min TTL) → L3 live rebuild via existing `gatherOrgContext`, with background stale rebuild. Route `chat.post.ts` grounding through it.

**Deliverables:** adapter + factory + tests; snapshot collection script `apps/app/scripts/create-ai-context-snapshots.ts`; regenerated types; green typecheck/tests.

---

## Phase 1 — Screen-focus awareness + item-scoped conversations *(the core "Earnest feel")*

1. **Entity registry.** `core/app/composables/useEntityPageContext.ts` with module-level `setEntity(type, id, label, opts?)` / `clearEntity()`. Extend the existing `useAiContext` rather than fork it.
2. **Route→scope/focus mapper.** Reuse the dock/section-hub mapping (`AdminSectionHub` groups: Dashboard·People·Reporting·Money·Communications·Settings) to derive a coarse `scope` and a human `focus` sentence ("Right now you're looking at the vendor 'Acme Plumbing'").
3. **Entity dossier builder.** `core/server/utils/entity-context.ts` with per-type builders (~10–12): `member`, `vendor`, `project`, `request`/`ticket`, `architectural_request`, `violation`, `board_member`, `meeting`, `payment`, `document`, `channel`, `announcement`. Each does parallel Directus reads, org-scoped, and emits a `CURRENT FOCUS: …` block with inline `[Source: X]` tags under an ~800-token budget.
4. **Brand / location / amenities knowledge.** `core/server/utils/brand-context.ts` pulling org brand + **location + amenities + target/positioning** from `hoa_organizations.settings.landing` (the existing amenities/location/board JSON) so every conversation is grounded in the building's identity — matching Earnest's brand-context layer.
5. **Item-scoped conversations.** Add a `context` JSON column (`{entityType, entityId}` or `{scope, route}`) to `ai_conversations`. New lookup routes `GET /api/ai/conversations/by-entity` and `/by-route` (fetch recent scoped threads, match in memory — Directus can't deep-filter JSON). In `useAiChat`, keep a `Map<entityKey, thread>` so a member/vendor/project/ticket each hold their own thread + history, surviving panel resize.
6. **Wire detail pages.** Call `setEntity(...)` on load in member, vendor, project, request, violation, meeting, and channel detail pages; `clearEntity()` on unmount.

**Deliverables:** dossier builders + tests; `add-ai-conversation-context.ts` schema script; by-entity/by-route routes; `setEntity` wired into ≥6 detail pages; per-item history browsing in the panel.

---

## Phase 2 — Transparency: "What the AI can see"

1. **Awareness composable.** `useHoaAwareness` builds a `knowledge: AwareItem[]` list keyed `user | organization | entity`, each with icon/label/`included` flag and per-entity-type labels ("This vendor — jobs, invoices, contacts & category").
2. **Awareness chip UI.** Port `AwarenessChip.vue`: collapsible pill showing `{included}/{total}`, expands to per-source toggles, footer "Grounded only in your own HOA Connect data. Tap to exclude." Deselections reset when the context key changes.
3. **Server-side gate.** `ctxGate`/`allowCtx()` wrap every grounding source in `chat.post.ts` so a deselected source is never fetched or sent; only kept keys arrive as `includedContext`.
4. **Grounded, entity-aware starter prompts.** Extend the existing `GET /api/ai/suggestions` to emit entity/scope-specific chips (a real indexed bylaw, the focused vendor's last job, the member's open request).

**Deliverables:** chip component + composable; gated grounding in chat route; entity-aware suggestions.

---

## Phase 3 — Two-altitude AI UI

1. **Inline entity card.** `EntityAiCard.vue` atop member/vendor/project/ticket detail views — "AI is focused on **{name}**" + entity-scoped prompt pills that open the panel already anchored and auto-send.
2. **Full-screen focus takeover.** A calm one-thing-at-a-time takeover (port CoachingTakeover pattern) augmenting — not replacing — the existing slide-over `AiAssistantPanel.vue`. Single presence state in `useAiAssistant` with sizes `rest | full`.
3. **Launcher + presence.** Presence dot on the nav launcher that reflects conversational state and (after Phase 4) badges the pending-actions count.

**Deliverables:** entity card on ≥4 detail types; focus takeover mounted globally; presence launcher.

---

## Phase 4 — HITL actions + graduated autonomy *(largest new capability)*

1. **Action queue.** New collection `ai_actions` (`action_type`, `status: pending|approved|rejected|executed|failed`, `payload`, `preview`, `result`, `entity_type`, `entity_id`, `conversation`, `approved_by`, timestamps).
2. **Tool definitions.** `core/server/utils/llm/tools.ts` — HOA domain tools: `draft_and_send_email`, `create_request`/`update_request`, `add_task`, `post_announcement`, `notify_board`, `update_member_field`, `schedule_meeting`, `log_violation`, `assign_vendor`. Split into **safe/inline** (executed immediately) vs **proposal** tools (outbound/destructive → never inline).
3. **Handlers + proposals.** `tool-handlers.ts` (inline execution) and `tool-proposals.ts` (write a `pending` `ai_actions` row). Route the tool-aware turn through `chatWithTools()` from Phase 0. Every action re-checks the existing permission matrix (`shared/permissions.ts` / `useCapabilities`) and `requireOrgComposeAccess`-style gates — **the AI never exceeds the acting user's own rights.**
4. **Trust dial.** `autonomyTier` 0–3 per org/user + `shouldAutoApprove(actionType, tier)`; low-risk types (e.g. add internal task) can auto-approve, outbound/member-facing always require confirmation.
5. **Approval UX.** Pending queue in the focus takeover + endpoints `approve`/`edit`/`reject`/`undo` under `/api/ai/actions/[id]/*`. Launcher badges the pending count. Assistant text is charter-bound to say it *proposed* the action.
6. **Metering.** Reuse `chargeForCompletion`; tool round-trips (2 LLM turns) meter normally.

**Deliverables:** `ai_actions` collection + script; tools/handlers/proposals; trust dial + auto-approve; approval endpoints + UI; audit trail.

---

## Phase 5 — Channels feature-parity

1. **Reactions.** Polymorphic `hoa_reactions` (`item`, `table`, `user`, `reaction`) + `useReactions` + a `ReactionsBar` on `ChannelMessage.vue`.
2. **Entity-scoped channels.** Add optional `project` / `request` / `vendor` FKs + a `category` folder field to `hoa_channels`; audience shortcuts (team/board expansion) via a `resolve-members` route. Model private conversations as `is_private` channels with a seeded roster (no separate DM collection).
3. **Link previews.** `LinkPreview.vue` + `GET /api/link-preview` (server-fetch OpenGraph, org-agnostic, cached).
4. **Moderation log.** `hoa_channel_moderation_log` capturing hide/remove/report with message snapshots preserved after delete.
5. **AI hook.** `setEntity('channel', id, '#name')` on the channel view so the assistant anchors to the open channel (already partially present).

**Deliverables:** reactions + entity-scoping + link previews + mod log schema scripts and UI; realtime respected (Directus WS).

---

## Phase 6 — HTML email block-builder

1. **Block library + partials.** `hoa_newsletter_blocks` (reusable MJML blocks: header/hero/content/cta/image/stats/quote/list/divider/footer with `variables_schema`) + `hoa_email_partials` (header/footer/web-version-bar). Seed a starter set.
2. **Builder UI.** Drag-drop `BlockBuilder` / `BuilderCanvas` / `BlockLibrarySidebar` / `BlockVariableEditor` on top of the **existing** MJML compiler (`email-templates-mjml.ts`) — do **not** replace the current `visual`/`mjml` send pipeline; add "builder" as a third content mode.
3. **Assemble route.** `POST /api/email/assemble` substitutes each block's instance variables into `{{{key}}}` slots, wraps in an `<mjml>` skeleton, validates by compiling, stores `mjml_source` + `html_compiled` on the email/template row.
4. **AI email wizard.** Extend `DraftWithAi.vue` from single subject/body to a full-campaign wizard: brief in → structured JSON (`subject`, `previewText`, `sections[]` mapped to real block categories + variables) dropped straight onto the canvas. Reuse the LLM adapter + credit metering.
5. **Keep** existing branding (`email-branding.ts`), CC/BCC, scheduling/recurring, white-label sender, and the SendGrid activity webhook untouched.

**Deliverables:** block/partial collections + seed script; builder UI; assemble route; AI wizard; existing pipeline intact.

---

## Sequencing & parallelization

```
Phase 0 (foundations) ─┬─> Phase 1 (focus + item threads) ─> Phase 2 (awareness chip) ─> Phase 3 (two-altitude UI) ─> Phase 4 (HITL + autonomy)
                       │
                       └─> Phase 5 (channels)  ── independent, can run in parallel after 0
                       └─> Phase 6 (email builder) ── independent, can run in parallel after 0
```

- **Critical path:** 0 → 1 → 2 → 3 → 4 (each AI phase builds on the last).
- **Parallelizable:** Phases 5 and 6 depend only on Phase 0's adapter and can be built alongside the AI track.
- **Ship boundaries:** Phase 1+2 is a shippable "context-aware, transparent advisor." Phase 3 makes it feel native. Phase 4 is the graduated-autonomy leap and should ship behind a per-org flag.

## Cross-cutting requirements

- **Tenant isolation:** every new collection carries `organization`; every route filters `organization _eq orgId` and treats cross-tenant ids as not-found. Channels/realtime keep Directus per-user policy filters.
- **Credit economy:** all LLM calls (chat, tools, wizard) meter through `chargeForCompletion` / `chargeForEmbedding`; refuse at zero balance.
- **Permissions:** AI actions never exceed the acting user's rights (`shared/permissions.ts` matrix, board-access hats, manager grants).
- **Theming:** all new UI honors classic/luxury/modern via `t-*` tokens; module-gate new surfaces via `useModules`.
- **Quality gate per phase:** typecheck 0, tests green, build green; schema scripts run against prod Directus + `generate:types`.

## Risks & watch-items

- **RAG scaling:** retrieval is brute-force cosine in JS (`MAX_SCAN=1000`). Fine now; flag pgvector before large orgs. Dossiers (Phase 1) reduce reliance on RAG for structured records.
- **HITL safety (Phase 4):** the highest-risk surface. Outbound/member-facing actions must *always* confirm regardless of trust tier; every action audited in `ai_actions`; the assistant must never claim it acted.
- **Context cost:** dossiers + broker + RAG can bloat prompts. Enforce the token budgets (org ~500/scope, entity ~800) and the awareness gate.
- **Scope:** this is a multi-week program. Treat Phase 1+2 as the first release; re-evaluate 3–6 after it lands.

## Immediate next step

Begin **Phase 0** — stand up the LLM adapter seam + context-snapshot cache — which unblocks all tracks. Then Phase 1 for the visible "AI knows what I'm looking at" win.

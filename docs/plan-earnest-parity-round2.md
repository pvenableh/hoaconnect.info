# Earnest Parity — Round 2: Automation, Boardroom, Stacks Home, Notifications, Channels, Glass, Versioning

> **This file is the source of truth for the program.** Every session starts by
> reading it and ends by updating the `## Status` checklist below. Chat memory is
> not authoritative; this file is.

## Status

Legend: `[ ]` not started · `[~]` in progress / partially shipped · `[x]` shipped and green.

| Session | Phase | State | Branch | Notes |
|---|---|---|---|---|
| 1 | Phase 0 — Pre-flight | [x] | `main` | Push was a no-op — local `main` already equalled `origin/main`. Types regenerated. |
| 1 | Phase 1 — Versioning, releases, "What's new", audit tooling | [x] | `feat/parity2-p1-versioning` | Ratchet at **26**, not 0 — Phase 8 flips it. |
| 2 | Phase 2a — WS manager + adapter shims | [ ] | `feat/parity2-p2a-ws-manager` | |
| 3 | Phase 2b/2c — Notification unification + bell cutover | [ ] | `feat/parity2-p2-notifications` | |
| 4 | Phase 3 — Channels round 2 | [ ] | `feat/parity2-p3-channels` | |
| 5 | Phase 4 — Notices engine + attention scoring | [ ] | `feat/parity2-p4-notices` | |
| 6 | Phase 5 — Director layer + trust surfaces + action lifecycle | [ ] | `feat/parity2-p5-director` | |
| 7 | Phase 6 server — Boardroom collections, plan endpoint, utils | [ ] | `feat/parity2-p6-boardroom-server` | |
| 8 | Phase 6 UI — Boardroom page + components + nav | [ ] | `feat/parity2-p6-boardroom-ui` | |
| 9 | Phase 7 core — stacks home | [ ] | `feat/parity2-p7-stacks` | |
| 10 | Phase 7 polish — rails, ambient, wizard | [ ] | `feat/parity2-p7-polish` | |
| 11 | Phase 8 — Glass sweep + gate flip to 0 | [ ] | `feat/parity2-p8-glass` | |

### Session log

_Each session appends here: what shipped, deviations from the plan, and operator TODOs
(prod scripts to run, env vars to set)._

**Session 1 — Phase 0** (2026-08-24)

- Push of the 18 content-first commits: **already done**. `git log origin/main..main`
  was empty on a fresh fetch — the working note that said "not pushed" was stale.
  Phase branches already share the intended remote base.
- `pnpm generate:types` against prod: `core/types/directus.ts` picked up
  `ai_ledger_chunks` (the Community-Ledger RAG collection) plus two field-comment
  refreshes on `hoa_emails.visibility` and `hoa_units.occupancy`. No removals.
- This plan committed to the repo as the source of truth.

**Session 1 — Phase 1** (2026-08-24) — 6 commits, fast-forwarded from
`feat/parity2-p1-versioning` into `main` and pushed to `origin/main`

Shipped:

- `resolveAppVersion()` in `core/nuxt.config.ts` — MAJOR.MINOR from package.json,
  patch from `git rev-list --count HEAD`, unshallow-then-re-check, sha7 fallback.
  Verified: build log prints `[version] app version resolved to 2.0.1032`, and the
  value is baked into `.output`. `buildId` untouched.
- `scripts/bump-version.mjs` + `pnpm release:minor|major`, `.github/workflows/release.yml`
  (tag `v[0-9]*` → GitHub Release with generated notes), `docs/releasing.md`.
- "What's new": `core/shared/app/release-notes.ts`, `app/components/App/WhatsNew.vue`,
  `useAppVersion()` extended with `releaseNote` / `whatsNewOpen` / `maybeShowWhatsNew` /
  `openWhatsNew` / `closeWhatsNew`. Mounted in the `auth` and `channels` layouts beside
  `<AppUpdatePrompt>`; About card on `app/pages/account.vue`.
- `scripts/audit-hairline-surfaces.ts` (ratchet **26**) + `findApplyGlass` (gate, no
  baseline), husky 9 + `.husky/pre-commit` → `pnpm audit:hairline-surfaces`. The repo had
  no hooks at all before this.
- `tests/shared/release-notes.test.ts` (8 tests).

Deviations from the plan, all deliberate:

1. **Phase 0's push was a no-op** — already on origin (see above).
2. **`core/shared/app/release-notes.ts`, not `core/shared/release-notes.ts`** — every
   other shared module lives in a subfolder, and `core/shared/app/` already holds
   `update-policy.ts`, the other half of the versioning story.
3. **The sheet is an `AppBottomSheet`, not a bespoke `ios-card`** — that component is
   the app's established sheet (drag-dismiss on mobile, centred dialog above `md`), so
   reusing it beats a second surface with its own motion.
4. **No "What's new" link on `<AppUpdatePrompt>`** — the note worth reading is for the
   version you are *about* to get, and the running bundle only carries notes for the
   version it already is. The wiring is the post-refresh auto-open instead, documented
   in the component.
5. **The hairline regex is rewritten, not ported.** Earnest matches `border
   border-border`, which appears in ONE file here; this app writes `border t-border`
   (361 hits / 102 files). Also fixed two bugs found in the port: `\bborder\b` matches
   the tail of `t-border`, making the bare-utility test vacuous, and `findApplyGlass`
   computed its line offset against already-blanked text so every reported line was one
   short.
6. **`ai_ledger_chunks` classified in the export map** — Phase 0's `generate:types` made
   `tests/shared/export-collections.test.ts` red, exactly as that gate is designed to.
   Fixed on this branch (commit `704b728`) rather than left for later.

Quality gate: typecheck **0 errors** · vitest **910/910 in 59 files** · `pnpm build`
green · hairline audit green at baseline. Browser-verified on the demo org: About shows
`2.0.1031`, the sheet auto-opened once, wrote `hoa:whats-new-seen-line = "2.0"`, did not
re-fire on reload, and reopened from About → What's new. No scroll-lock or DOM residue
after dismissal.

Landed on `main` as a fast-forward (linear history, no merge commit) and pushed.

### Operator TODOs (carried forward until done)

- [x] ~~Push Session 1~~ — done; `main` carries Phases 0 and 1.
- [ ] **`pnpm install` on every machine/clone** once this lands — the new `prepare`
      script is what installs the husky hooks; without a fresh install the pre-commit
      audit silently does not run.
- [ ] Nothing to run on prod for this phase. No schema changes, no new env vars.
      (`NUXT_PUBLIC_APP_VERSION` exists as an override but should stay unset.)

## Context

The July parity round (phases 0–6: LLM adapter, entity focus, awareness chip, HITL actions + trust dial, channel moderation, email builder, first glass-rim port) is fully on `origin/main`. Since then Earnest has moved **233 commits** and grown concepts HOA Connect never ported: the **stacks home** (group by kind of attention, not data source), a **deterministic notices engine** with pre-validated proposed actions, the **Director's Office / Boardroom** (grounded LLM briefings whose plan steps become pending HITL actions), a **glass audit gate at 0**, hardened **unread/search channels**, a unified realtime **WS manager**, and a shallow-clone-safe **version resolver**.

Meanwhile this session's baseline audit of HOA Connect found five structural gaps: no proactive AI at all (100% pull), glass classes ported but unadopted (`.glass-refract`/`.glass-body` 0 call sites, 361 flat `t-border`s in 102 files), dead channel read-state (`last_read_at` never touched), **notifications split into two disconnected halves** (server writes `directus_notifications` rows nothing reads; the bell is a 10-collection client scan with localStorage read state that ignores the prefs), and a hardcoded `v2.0.0` with no release-notes surface.

**Peter's decisions (locked this session):** stacks become the admin landing · **full Boardroom** (notices + ambient layer + briefings/planner/minutes) · **full notification server-unification** · auto version + GitHub releases + an in-app "What's new".

No runtime coupling to Earnest — pattern-porting into the `core` layer only. Every Earnest source path below is under `~/Sites/earnest/earnest`.

> **Do NOT build this in one session.** Each phase below is one (sometimes two) focused sessions — see **Session breakdown & kickoff prompts** at the end. Phase 0 commits this plan into the repo as `docs/plan-earnest-parity-round2.md` with a status checklist, so every new session grounds itself from the repo copy, not from chat memory.

## Phase 0 — Pre-flight (½ day; do in Session 1 together with Phase 1)

- Push local main (18 commits ahead — the content-first work) so phase branches share a remote base.
- `pnpm generate:types` against prod so `core/types/directus.ts` is current.
- Copy this plan into the repo as `docs/plan-earnest-parity-round2.md`, adding a `## Status` checklist (one checkbox per phase/session). Every session ends by checking off what shipped and noting deviations there.

## Phase 1 — Versioning, releases, "What's new", audit tooling (report mode)

- `core/nuxt.config.ts` (~line 236): replace hardcoded `appVersion` with `resolveAppVersion()` ported from Earnest `nuxt.config.ts:10-83` — MAJOR.MINOR from package.json + `git rev-list --count HEAD` patch; tag-free; `--unshallow` attempt + re-check; fallback `MAJOR.MINOR.<sha7>`. **`buildId` stays the freshness signal untouched; version is only the label.**
- Port `scripts/bump-version.mjs`, `.github/workflows/release.yml` (tag → GitHub Release, auto notes), `docs/releasing.md`.
- **"What's new" (new — neither app has it):** `core/shared/release-notes.ts` — in-repo typed array `{version: "2.1", date, highlights[]}` keyed by MAJOR.MINOR (no Directus collection; single author, ships with the build). `app/components/App/WhatsNew.vue` — small `ios-card` sheet, localStorage seen-marker per MAJOR.MINOR, shown once on first load after a version change; linked from `app/pages/account.vue` and from `App/UpdatePrompt.vue`'s post-refresh path. Extend the existing `core/app/composables/useAppVersion.ts`.
- **Audit gate family** (HOA has **no `.husky/`** — install husky + `prepare` script): port Earnest `scripts/audit-hairline-surfaces.ts` (3 positive signals; 7 documented exemptions incl. the FLOATING hard-disqualifier — `shadow-*` utilities beat the `@layer components` rim; `allow-hairline-surface` escape hatch; comment blanking that preserves line numbers; skip census) **plus `findApplyGlass`** (`@apply glass-*` passes dev, fails the PROD build — parse across newlines after blanking CSS comments). Start as a **ratchet at the current census count**, not 0 — the gate flips in Phase 8.
- Tests: `tests/shared/release-notes.test.ts` (current MAJOR.MINOR must have an entry — releases can't ship silently). Verify: real derived version on the account page; WhatsNew shows once after clearing the marker; Vercel build log shows commit-count (or sha7) resolution.

*Ships independently.*

## Phase 2 — Realtime foundation + notification unification (bell cutover)

**2a — WS manager first** (bell and channels both need it):
- New `core/app/composables/useWebSocketManager.ts` ← Earnest `app/composables/useWebSocketManager.ts`: N→1 multiplexed singleton, UID routing, exponential backoff, **30s idle teardown**, `online`/`visibilitychange` revive that resets the attempt counter, stale-socket guards.
- Refactor the three overlapping composables (`useDirectusRealtime.ts`, `useDirectusWebSocket.ts`, `useRealtimeSubscription.ts`) into thin adapters over the manager — keep public signatures so call sites don't churn; delete two of them one release later.

**2b — Server fan-out completeness** (refine, don't replace, `core/server/utils/notify.ts`):
- Port Earnest `notify-event.ts` channel semantics into `notifyUsers()`: bell default-on via `<category>_bell`, email opt-out, push mirrors email but is NOT gated on the email master; **prefs-read failure retries without the field and defaults opt-in** instead of zeroing the fan-out.
- **Invariant test first**: `scopeRecipientsToOrg` must sit ABOVE the prefs try/catch (the b47c80b invariant) — a prefs failure must never widen recipients.
- Audit the 10 collections the client aggregator scans; add `notifyUsers()` call sites at any mutation point missing one, using Earnest `notificationRecipients.ts` patterns (`previousItem` diff-triggers, `staffOnly` return-leg suppression). Reactions: upserted, never pushed.
- Read = `status: "archived"` (durable, cross-device).

**2c — Client cutover:**
- Rewrite `core/app/composables/useDirectusNotifications.ts` (339 LOC, currently **zero importers**) into the bell store ← Earnest `useNotifications.js`: module singleton, 5s throttle, in-flight coalescing, realtime via 2a, archived pagination.
- New ← Earnest same-named: `useUnreadByCategory.ts` (dock badges off the same list, zero extra queries), `useMarkItemRead.ts` (drop-in on detail pages — archives that item's rows, cascades to every badge), `useAppBadge.ts` (OS badge; window + SW postMessage double-write).
- Point `app/components/Notification/{Bell,Sheet,Toast}.vue` at the new store; Sheet gains inline per-category pref toggles + archived tab ← Earnest `NotificationsMenu.vue`.
- Retire `core/app/composables/useNotifications.ts` (the 1061-LOC aggregator) behind a `NUXT_PUBLIC_BELL_V2` flag defaulting on, deleted one release later.

**Cutover: backfill-as-read, hard cutover.** One idempotent `scripts/backfill-notifications.ts` translating the aggregator's queries into `directus_notifications` rows for the last 30 days, **all written archived** (history visible, zero unread storm — localStorage read state is per-device and unmergeable). Droplet digest worker untouched (same prefs).

- Tests: ordering invariant; three-channel gating independence; prefs-failure default-open; backfill idempotency (dedupe on deterministic item id). Verify in browser: realtime bell increment cross-user; read on device 1 → read on device 2; `_bell` toggle off → no row; **exactly one WS connection** with bell + channels open.

*2a ships alone; 2b+2c ship together.*

## Phase 3 — Channels round 2 (unread, search + jump, folders)

- `core/server/api/hoa/channels/unread.get.ts` ← Earnest `server/api/channels/unread.get.ts` — **adapt**: HOA's `hoa_channel_members` rows are already both grant and cursor (role member/admin/guest + dead `last_read_at`), so skip Earnest's `role:null` semantic; keep the **two-bucket algorithm** (messages after `last_read_at`; org-wide channels never opened counted only after the caller's org-join date so backlogs don't light up) + muted-excluded-from-total. Org-scoped.
- `[channel]/read.post.ts` cursor advance; `core/app/composables/useChannelUnread.ts` ← Earnest (useState singleton + in-flight guard), refreshed via the 2a manager.
- Unread divider in `app/components/channels/ChannelThread.vue` — anchored to the pre-read cursor captured **before** markRead.
- Message search: server route ← Earnest `messages/search.get.ts`, wired into the existing orphaned `core/app/composables/useChannelSearch.ts` + jump-to-message in the thread.
- Roster folders in `app/components/channels/ChannelsList.vue`: new `category` field + `effectiveEntity` (project/request/vendor — HOA's analog of Earnest's `effectiveClient`).
- Enter/leave reconciler in the thread ← Earnest pattern: `enteringIds`/`leavingIds`/`_snapshots`/`_settled` gate (backlogs snap, only new messages animate); `moderatedIds` local eviction (filtered WS subscriptions don't reliably drop items) — pairs with existing moderation.
- Unread totals feed dock badges + `useAppBadge`.
- Data: `scripts/add-channel-category-field.ts` (idempotent; roster renders ungrouped until run).
- Tests: two-bucket math, join-date fence, muted exclusion, org scope (model on `tests/server/notify-org-scope.test.ts`); cursor auth. Verify: badge lights cross-user, divider lands and stays put, search jumps mid-history, new member sees zero backlog unread.

*Depends on 2a only.*

## Phase 4 — Notices engine (deterministic, zero-LLM) + attention scoring

The grounding layer Phases 5–7 consume. **No LLM calls anywhere in this phase.**

- `core/server/utils/ai-notices.ts` ← Earnest `server/utils/ai-notices.ts` (1101 LOC) — pure per-entity generators → `AINotice {priority, type, icon, title, description, actionLabel, actionRoute, entityType, entityId, proposedAction?}`. `proposedAction` restricted to reversible **internal** executors from HOA's `ACTION_CATALOG` — never `send_email`/`post_announcement`/`notify_board`. HOA generators: requests aged >30d, overdue member balances, stale projects, unanswered channels/inquiries, expiring vendor insurance/contracts, meetings without minutes, low AI credits, unpaid invoices. Include `collectDirectorAgenda()` (subject bucketing) — Phase 6 depends on it.
- Attention curve in `core/shared/ai/attention.ts` ← Earnest `useAIProductivityEngine`: base 40; overdue ramp ≤14d → hot ≤45d → decay ≤120d → stale floor 0.22; log10 money cap 22; buckets 82/64/46. (This is what keeps an 18-month-old $165 balance from topping the feed forever.)
- `core/server/api/ai/notices/index.get.ts` (org-scoped, admin/board-gated) + `core/app/composables/useAINotices.ts` (localStorage dismissal).
- Cron `core/server/api/ai/notices/check.post.ts` — cron-secret-guarded, invoked from the **droplet** crontab (per `docs/notification-digest-cron.md`; fix the documented checkout-path hazard in the same runbook). Urgent/high → `notifyUsers()` (org-scoped for free via Phase 2). Dedup via `ai_notice_history` hash: one fire per notice-type-per-entity per calendar month.
- New category `ai_insight` in `core/shared/notifications/preferences.ts` (missing-key = on, so existing users default in; Sheet prefs + digest pick it up from the shared list).
- Data: `scripts/create-ai-notice-history.ts`; cron degrades (warn, skip dedup) until provisioned; then `generate:types`.
- Tests: per-generator threshold fixtures; scoring golden tests; calendar-month dedup; endpoint org scope. Verify: seed a 31-day-old request, see the notice; run check twice, one notification.

*Parallel with Phases 2–3.*

## Phase 5 — Ambient Director layer + trust surfaces + action lifecycle

Proposals escape the assistant panel. **Reuses every existing action endpoint** (`actions/{index,pending-count,[id]/approve|reject|edit|undo}`) — nothing duplicated.

- `core/app/composables/useDirectorLayer.ts` ← Earnest — composes `useAiAwareness` + `useAINotices` (P4) + `useAiActions` (existing); owns the singular/plural entity-type boundary; scope→subject map for HOA hubs (requests/money/people/projects/vendors/meetings).
- `app/components/Director/Layer.vue` ← Earnest `Director/Layer.vue` — **one component**, `variant: inline|ambient`; heading-only mode = rounded-full pill ("Have the Board Room plan Requests") with an **outline** draft button (never out-shouts the page's one filled button); wrapped `<ClientOnly>` (SSR hydration cascade); localStorage dismissal for scope banners only. Mount on the admin hub pages and on detail pages — this also fixes `AiEntityCard`'s 2-of-8 reach.
- `app/components/Director/TrustBar.vue` ← Earnest — compact tier indicator in the admin top chrome; popover reuses the existing `ai/TrustDial.vue` + a recently-handled list with one-click Undo.
- Approval-queue chip — pending proposals collapse to "● 4 approvals waiting · Review ⌄", expanding the existing proposals list inline; fed by existing `pending-count`.
- New endpoints ← Earnest: `actions/expire-stale.post.ts` (pending >14d → `rejected`, reason `auto-expired`, UI renders "Expired" — **no new enum**; droplet cron), `actions/bulk.post.ts` (per-row results; **must route through the same approve path so the outbound cap holds**), `actions/trust.get.ts`.
- **Autonomy stays per-ORG** (HOA governance: actions are acts of the association; two admins can't run different tiers against one community; audit is org-level). The trust endpoint computes clean-approval streaks **per acting user** (`approved_by`), and the 3/10/25 nudge (only when approved ≥ 2×rejected) becomes a *suggestion to raise the org dial* via existing `autonomy.post.ts` — never auto-raised. Outbound hard cap untouched and tier-independent.
- Tests: expire-stale idempotency; **bulk-approve of `send_email` cannot skip approval semantics**; trust math; org scope on all three. Verify: chip on hub pages, expand/approve/undo round-trip, pill drafts nothing without a click.

*Depends on P4.*

## Phase 6 — The Board Room (briefings, planner, minutes)

- `core/server/api/ai/director/plan.post.ts` ← Earnest — ground in `collectDirectorAgenda()` + mode intel **before** the model; `completeWithTools` (existing `core/server/utils/llm/provider.ts`) with exactly 4 tools; **zero tool calls → forced second pass `toolChoice:'any'`** keeping first-pass prose as the briefing; anti-hallucination rule (no figure on record → say so, never invent); `TL;DR:` pipe-separated slide bullets. **Metered through the wallet like chat.** Steps created via the existing `proposeAction` path so `shouldAutoApprove` + the outbound cap apply unchanged; `plan_id = ai_actions.session_id`.
- `core/server/utils/director-{briefings,sessions,minutes}.ts` ← Earnest — `cache_key` derived by ONE shared function used by writer and reader; `BRIEFING_TTL` 6h (stale briefings hide fixed planners); sessions sync multiplayer via a `revision` bump on the session row (`ai_actions` is admin-only, so approvals can't push directly); minutes = durable decision record + share, linked from the meetings hub (a natural HOA fit).
- Page `app/pages/[slug]/admin/boardroom/index.vue` + `app/components/Boardroom/*` (briefing, numbered steps rendering the existing proposal row components, TL;DR strip); nav entry in `useAppNav.ts`.
- Data: one `scripts/create-boardroom-collections.ts` → `hoa_director_briefings`, `hoa_director_sessions`, `hoa_director_minutes` (org FK, admin-only perms); "not provisioned" empty state until run; then `generate:types`.
- Tests: cache_key writer/reader identity; TTL expiry; **outbound plan step lands pending even at tier 3**; wallet charged per plan; org scope everywhere. Verify: briefing generates, credits decrement, step approved from the plan shows in recently-handled, second admin sees the revision update.

*Depends on P4 + P5.*

## Phase 7 — Stacks admin home (the flagship visible change — ship last of the feature phases)

- `core/app/composables/useStackItems.ts` ← Earnest — `StackItem {key, kind, title, sub, route?}`; pure per-source adapters; **group by kind of attention**: **Decide** = pending `ai_actions` + notice `proposedAction`s · **Do** = actionable notices + overdue operational items (+ unread channels from P3) · **Know** = insights + Boardroom briefing headlines. Domain demotes to a colored dot. A fact can appear exactly once.
- `app/components/Home/Stack.vue` ← Earnest — iOS pile (collapsed = top row + 2 CSS ghost layers + count); GSAP fan: **height tween alongside the row stagger** (siblings slide, not jump), `expo.out`, `clearProps`, a `closing` flag keeps rows mounted for the fold, `defineExpose({collapse})`, **win state when cleared**. Dynamic GSAP import + reduced-motion-guard-first per the motion policy.
- `StackItemRow.vue` (dot · title · evidence · **one** primary verb + quiet escape; reuses existing inline proposal components; `send_email` proposals get an expandable preview — never approve outbound blind), `StackClearWizard.vue` (one card at a time), `GlanceRail.vue` (numbers without cards — extract the fetch logic from the existing `Admin/*Glance.vue` bands into shared composables, don't duplicate queries), `ChartRail.vue` (5 hand-rolled SVG glances; reuse `App/Chart/*` primitives where they fit; resting opacity 0.45 → full **only inside `@media (hover:hover)`**; each self-hides when empty; sticky max-height guard).
- `Home/AmbientBackground.vue` + `core/app/composables/useHomeAmbient.ts` ← Earnest — waves = 5 bands of **whole-number harmonics** summed (the seamless-loop invariant), `ease:'none'`, 3-stop gradients, viewport overhang for blur falloff; orbs = baked gradient softness, no runtime blur; transform-only, visibilitychange pause, reduced-motion static, deterministic drift, localStorage pref; **tune light and dark alphas separately** against `html.theme-app`.
- Rework `app/pages/[slug]/admin/index.vue` (currently a 22-line wrapper): stacks + glance rail + ambient above the fold; the existing `useDashboardWidgets` grid demotes below (registry + `WidgetGallery` untouched).
- Tests: adapter mapping per source; empty piles → win state; ambient reduced-motion static render. Verify: 60fps transform-only fan, approve-from-stack round-trip, dark/light alphas, mobile hover-state leaks, widgets still work below.

*Depends on P4 + P5 (P3 for the unread adapter — can land later).*

## Phase 8 — Glass round 2: sweep + gate flip to 0

- Sweep worst-first (census-guided): `ai/{ActionCard,AiAssistantPanel,AskTheHoa}.vue` (4/3/3 flat borders), `channels/{ChannelThread,ChannelEditor}.vue`, `dashboard/WidgetCard.vue` `.dash-widget` → `.ios-card`, `.glass-field` onto workspace inputs (2 call sites today vs Earnest's 208), `.glass-refract` on hero surfaces (Boardroom header + stacks are the natural first adopters — build P6/P7 with them from the start).
- Consolidate `core/app/assets/css/glass.css` into `earnest-ui.css`; keep `tests/shared/theme-app-tokens.test.ts` green through it.
- Verify the **custom-property declaration-site trap**: no `--glass-focus-*-h`-style token whose `:root` declaration bakes the accent fallback; consuming rules must reference `var(--app-accent-h, 220)` directly (Earnest documents this at `themes.css:176-185`).
- Flip `audit-hairline-surfaces` BASELINE → **0** and make `findApplyGlass` block; the Phase 1 pre-commit now prevents regressions permanently.
- 361 borders/102 files is too big to sweep wholesale — scope to the named components; the gate stops new debt.

*Sweep trickles from Phase 2 onward; only the gate flip must come last.*

## Sequencing

```
P0 → P1 ────────────────────────────────  (parallel with everything)
     P2a → P2b/2c → P3                    Track B (realtime/comms)
     P4 ──→ P5 ──→ P6 ──→ P7              Track C (AI; P4 parallel with P2/P3)
     P8 sweep trickles; gate flip last    Track A
```

Ship boundaries: P1 alone · P2 alone · P3 alone · P4+P5 = "proactive advisor" · P6 = Board Room · P7 = the new home · P8 closes the debt.

## Risks

1. **Bell cutover perception** — archived backfill + `BELL_V2` flag for one release.
2. **WS consolidation regressions** — adapter shims, one release of coexistence before deleting.
3. **Droplet cron path hazard** (documented) — two new crons multiply exposure; fix the checkout in P4's runbook.
4. **Outbound-cap bypass via bulk/plan paths** — the cap lives in one `shouldAutoApprove` path, never reimplemented; explicitly tested in P5 and P6.
5. **Boardroom cost/hallucination** — wallet metering mandatory; agenda grounding + the no-invented-figures rule + 6h TTL.
6. **Cross-org leakage** — every new endpoint ships with an org-scope test (b47c80b/d6c3e0a make this non-negotiable).
7. **Ambient perf on low-end devices** — transform-only, baked gradients, visibility pause, localStorage kill switch.

## Quality gate per phase

Typecheck 0 · vitest green · build green · schema scripts run on prod + `generate:types` · org-scope test for every new endpoint · in-browser verification per phase as listed.

## Session breakdown & kickoff prompts

**One phase ≈ one session** (two where noted). Rules for every session:

1. Start from the repo plan (`docs/plan-earnest-parity-round2.md`), not chat memory.
2. Work on a branch (`feat/parity2-p<N>-<slug>`); commit in reviewable chunks; **ask before pushing**.
3. End by: quality gate green → update the plan's `## Status` checklist (what shipped, deviations, operator TODOs like "run `pnpm create:X` on prod") → tell Peter the exact kickoff prompt for the next session.
4. If a session runs long, stop at a green commit and record the stopping point in `## Status` — never leave the branch red.

| Session | Scope | Notes |
|---|---|---|
| 1 | Phase 0 + Phase 1 | Pre-flight, versioning, What's new, audit tooling in ratchet mode |
| 2 | Phase 2a | WS manager + adapter shims — small on purpose; realtime regressions need attention |
| 3 | Phase 2b + 2c | Notification unification + bell cutover + backfill script |
| 4 | Phase 3 | Channels unread/search/folders/reconciler |
| 5 | Phase 4 | Notices engine + attention scoring + cron |
| 6 | Phase 5 | Director layer, TrustBar, chip, expire-stale/bulk/trust |
| 7 | Phase 6 server | Boardroom collections, plan endpoint, briefings/sessions/minutes utils + tests |
| 8 | Phase 6 UI | Boardroom page + components + nav; live verify with credits |
| 9 | Phase 7 core | useStackItems + Stack/StackItemRow/StackClearWizard + landing rework |
| 10 | Phase 7 polish | GlanceRail, ChartRail, AmbientBackground, wizard, mobile/dark tuning |
| 11 | Phase 8 | Glass sweep of named components, glass.css consolidation, gate flip to 0 |

Sessions 4 (P3) and 5–6 (P4–P5) can run as parallel tracks after Session 2. Sessions 7–10 are strictly sequential.

### Kickoff prompt — Session 1 (ready to paste)

```
We're starting the Earnest Parity Round 2 program. The full plan is at
~/.claude/plans/woolly-exploring-kahan.md — read it first.

This session = Phase 0 + Phase 1 ONLY. Do not start any later phase.

Phase 0: push local main to origin (18 content-first commits), run pnpm
generate:types against prod, and commit the plan into the repo as
docs/plan-earnest-parity-round2.md with a "## Status" checklist added
(one checkbox per phase/session).

Phase 1, on branch feat/parity2-p1-versioning: port Earnest's
resolveAppVersion into core/nuxt.config.ts (Earnest repo:
~/Sites/earnest/earnest, nuxt.config.ts lines ~10-83), port
scripts/bump-version.mjs + the release workflow + docs/releasing.md,
build the new "What's new" surface (core/shared/release-notes.ts +
app/components/App/WhatsNew.vue wired to UpdatePrompt and account.vue),
and port scripts/audit-hairline-surfaces.ts + findApplyGlass from
Earnest as a RATCHET at the current census count (not 0), with husky
pre-commit (HOA has no .husky yet).

Quality gate: typecheck 0, vitest green, build green, plus the new
release-notes test. When done: update the Status checklist in the repo
plan, and give me the kickoff prompt for Session 2 (Phase 2a). Ask
before pushing anything.
```

### Kickoff prompt — template for Sessions 2+

```
Continue the Earnest Parity Round 2 program. Read
docs/plan-earnest-parity-round2.md (plan + Status checklist) first —
it is the source of truth, including any deviations recorded by
earlier sessions.

This session = Phase <N> (<name>) ONLY, on branch
feat/parity2-p<N>-<slug>. Earnest reference repo: ~/Sites/earnest/earnest.
Port patterns per the plan; reuse the existing HOA functions the plan
names instead of duplicating them.

Quality gate: typecheck 0, vitest green, build green, org-scope tests
for every new endpoint, plus the phase's browser verification. When
done: update the Status checklist (shipped items, deviations, operator
TODOs), and give me the kickoff prompt for the next session. Ask
before pushing.
```

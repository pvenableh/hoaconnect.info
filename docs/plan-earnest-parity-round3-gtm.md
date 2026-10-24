# Earnest Parity — Round 3: Go-to-market (shell completion, email, reminders, PWA/push, channels)

> **This file is the source of truth for the programme.** Every session starts by
> reading it and ends by updating the `## Status` checklist. Chat memory is not
> authoritative; this file is. Earnest reference checkout: `~/Sites/earnest/earnest`
> (this plan was written against Earnest `aa44b6b`, 2026-10-14, and HOA Connect
> `1c96ab4`, 2026-09-11).

**Status:** In progress · **Author:** Peter + Claude · **Date:** 2026-10-24 · **Decisions:** all six open decisions locked on their defaults 2026-10-24 (see §Decisions)

## Status

Legend: `[ ]` not started · `[~]` in progress / partially shipped · `[x]` shipped and green.

| Session | Phase | State | Notes |
|---|---|---|---|
| 1 | Phase 0 — Pre-flight and launch blockers | [x] | Code side shipped on the PR branch. The any-session hole was in FOUR cron routes, not one. `test.post.ts` is a real feature — gated, not retired. Ops items are operator TODOs below. |
| 1–2 | Phase 1 — Glass shell completion (overlays, motion, dialogs, dates, ⌘K) | [ ] | The visible win; every later phase lands on these primitives. |
| 3 | Phase 2 — Dock, navigation and page-title system | [ ] | Orphaned surfaces reachable; dock prefs per user; mobile launcher. |
| 4–5 | Phase 3 — Email: compliance and delivery (unsubscribe, queue, sender) | [ ] | CAN-SPAM blocker + the synchronous send loop. Two sessions. |
| 6 | Phase 4 — Email: health, scheduling, branding parity | [ ] | Auto-pause, recurrence, MJML partial composition. |
| 7–8 | Phase 5 — Reminder engine + resident notification events | [ ] | Dues / meetings / requests / violations / polls. Two sessions. |
| 9 | Phase 6 — PWA and push completion | [ ] | Always-on SW, install card, delivery verified on devices. |
| 10 | Phase 7 — Channels gap-close | [ ] | Edit, DMs, notify-on-message, immersive in the shell. |
| 11 | Phase 8 — Audit gates and CI | [ ] | Port Earnest's 14 audits in report mode → ratchet → gate. |
| 12 | Phase 9 — Launch polish and the GTM checklist | [ ] | Nav orphans, settings, tests on the money/send paths, docs. |

### Session log

_Each session appends here: what shipped, deviations from the plan, and operator TODOs
(prod scripts to run, env vars to set)._

**Session 1 — Phase 0** (2026-10-24) — on branch `docs/plan-earnest-parity-round3-gtm`
(PR #306), not `main`: this session ran in a cloud checkout, and `main` auto-deploys.

Shipped:

- `requireCronOrAppAdmin()` in `core/server/utils/cron-auth.ts`: the cron secret (either
  spelling) or a signed-in **App Administrator**; 401 with no session, 403 with a session
  that is not an app admin. Adopted by `email/process-scheduled.post.ts`,
  `ai/notices/check.ts`, `demo/reset.post.ts` and `internal/recompute-member-counts.post.ts`.
  `tests/server/cron-auth.test.ts` (8 tests) pins the matrix.
- `email/test.post.ts` now runs `requireAdminOrManagerGrant(event, organizationId,
  "communications")` — the same gate as `send.post.ts`. Previously any signed-in user
  could mail five addresses under any org's branding.
- Retired `email/test-simple-send.post.ts`, `email/test-simple.get.ts` (it had **no auth
  at all**) and `email/debug-html.post.ts`. Nothing in the app called them.
- `sendgrid.ts`: one `PLATFORM_FROM_EMAIL` / `platformFromEmail(config)`; the five
  `noreply@605lincolnroad.com` fallbacks are gone (one call site already fell back to
  `noreply@hoaconnect.info`; now all six agree).
- Deleted `core/app/composables/useGSAP.js` (118 lines, zero callers; `useGsap.ts` is the
  one way in, as its own docblock says).
- `.github/workflows/ci.yml` runs `pnpm audit:hairline-surfaces` after the unit tests.

Deviations from the plan, all deliberate:

1. **`email/test.post.ts` is kept.** The plan called it a debug endpoint; it is the compose
   page's "Send test email" (`EmailComposePage.vue:843` → `useEmailSystem.sendTestEmail`).
   The survey's mistake was reading its name. Its real defect was the missing org gate,
   which is fixed instead.
2. **Four routes, not one.** The "any session unlocks a cross-org job" shape the plan
   found in `process-scheduled` was also in the AI notices cron, the demo reset and the
   member-count recompute. Same fix, same commit. `ai/actions/expire-stale.ts` was already
   correct (a session may only sweep an org it is authorized for).
3. **`resolve.get.ts` and `view/[id].get.ts` are public by design** (web view of a sent
   email by its link) and `sender/*` already require admin; the audit left them alone.
4. **`pnpm generate:types` was not run** — this environment has no prod Directus
   credentials. Nothing in Phase 0 changes schema, so the generated types are unaffected;
   run it at the start of Phase 1 as usual.

Operator TODOs (Peter — none are code):

- [ ] Generate VAPID keys and set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
      on Vercel, then redeploy (go-live §5). Verify `/api/user/push/config` serves the key.
- [ ] Top up the Anthropic account and confirm which key Vercel holds (go-live §3e);
      confirm `VOYAGE_API_KEY` is set (§3e).
- [ ] Delete the `/transition-test` fixture before any public community listing (§3d).
- [ ] Confirm `CRON_SECRET` is set on Vercel and that the Directus Flow "Email Scheduler
      (Phase 9)" sends it as `x-cron-secret` — the flow is unchanged, but the route no
      longer accepts a plain session as a substitute.
- [ ] If anyone triggered `process-scheduled`, `notices/check`, `demo/reset` or
      `recompute-member-counts` by hand from an HOA-admin session, that now 403s; use an
      App Administrator session or the secret.

### Decisions (locked 2026-10-24, all on the plan's defaults)

1. **DMs** — build as private channels (Phase 7.3).
2. **Email classes** — `essential` vs `community`, per-member opt-out on `community` only.
3. **Scheduler** — the Directus Flow email scheduler moves to a Vercel cron (Phase 3.9);
   the GitHub Actions workers stay.
4. **`@vite-pwa/nuxt`** — remove (Phase 6.2).
5. **Phones** — App Library grid from the Nav (Phase 2.6); the dock from `md` up.
6. **Message edit window** — 15 minutes for members, unlimited for managers (Phase 7.1).

---

## Context — what the surveys found (2026-10-24)

Four read-only surveys were run against both checkouts before this plan was written.
The conclusions that shape the sequencing:

1. **The admin/portal split the brief asks for already exists.** `useWorkspaceAppearance()`
   pins every workspace page (`/{slug}/admin/*`, the resident portal, `/manage/*`) to
   `theme-app` — the liquid-glass theme, light/dark only. Classic / luxury / modern now
   dress **only** the public landing (`Org/PublicLanding.vue` → `Org/Landing/*`), chosen
   in `LandingBuilder/SiteSettingsPanel.vue`, with the content editor and AI wizard. So
   this round is a **completion and consistency sweep**, not a port. The public site is
   out of scope for every phase below except where it is named.
2. **The dock exists** (`App/Dock.vue`: glass pill, magnification, per-app accent, badges,
   top/bottom + labels prefs) and so do the iOS primitives (`App/SlideOverStack`,
   `App/SlideOverShell`, `App/BottomSheet`, `useAppSlideOverStack`, `useHaptic`,
   `useFlipFromRow`, `useSlidingThumb`). Earnest's rail is now **locked to the bottom** and
   has no pinning; nothing there needs re-porting. What is unfinished is everything
   *around* the dock: the shadcn overlays (Sheet, Dialog, Popover, Dropdown, Tooltip) are
   not glass; the bell sheet, toast and `App/ChannelsPanel` are not glass; the panel
   registry has two entries (`request`, `task`); `BottomSheet` has three callers; 34
   native `confirm()` / `alert()` calls; 18 raw `type="date"` inputs; the stone/gray
   sweep is open; there is no ⌘K palette (`CommandDialog` is unused); the spring curve is
   hand-copied into ~15 components; the `channels` layout drops the dock entirely.
3. **Channels are at or past Earnest's.** HOA Connect has unread, search + jump, folders,
   mentions, reactions, link previews, moderation log, mute, pin, archive — Earnest lacks
   mute UI and notifies nobody on an ordinary message. The gaps are message editing, DMs,
   notify-on-message, and the layout. This is the smallest track.
4. **Email is the largest gap and a launch blocker.** HOA Connect already has the MJML
   block builder, AI wizard, branding, white-label domain auth, scheduled + recurring
   sends and a signed SendGrid event webhook. But: `send.post.ts:552` sends **one
   recipient at a time, synchronously, inside the HTTP request** (no queue, no claim, no
   progress); there is **no unsubscribe link, no `List-Unsubscribe` header and no
   suppression** (bounces and spam reports are only counted); scheduled and transactional
   sends ignore the org's white-label sender; `process-scheduled.post.ts` accepts **any**
   logged-in session; debug/test endpoints (`test.post.ts`, `test-simple*`, `debug-html`)
   and `noreply@605lincolnroad.com` fallbacks still ship. Earnest's L3–L17 work
   (2026-10) is the reference: one-click unsubscribe, a claimed/chunked recipient queue
   with a continue cron, "Getting ready N of M", auto-pause on bounce/spam rates,
   suppression from webhook events.
5. **There are no resident reminders.** The digest has "Upcoming meetings" and "Dues &
   payments due" sections, and `ai-notices.ts` escalates board-facing notices, but
   nothing sends a resident "dues due in 7 days", "meeting tomorrow", "cure-by
   approaching" or "your request changed status". `payment_schedules` never generate
   charges and late fees are configured but never applied — that is **billing P1** in
   `plan-payhoa-parity.md` (1A schema shipped 2026-09-11). The reminder engine here runs
   off `payment_requests.due_date`, so it works for manual charges today and for
   generated ones when P1 lands.
6. **Push is wired but dark.** `web-push`, `push_subscriptions`, `usePush`, the OS badge
   and the iOS walkthrough exist; VAPID keys are not set in prod and delivery is
   "unverified end to end" (go-live §5). The service worker registers only when a user
   turns push on. `@vite-pwa/nuxt` is a devDependency nobody configured — Earnest removed
   it from config too; both apps converged on a hand-written `sw.js` with no fetch handler.
7. **Scheduling runs on three systems**: Vercel cron (2 AI jobs), GitHub Actions (digest,
   export, policy audit), Directus Flows (email scheduler `*/5`, member counts, demo
   reset). Peter chose Actions for the long-running workers deliberately (round 2,
   "Droplet reality") — that stands. New short ticks in this plan are Vercel crons with
   `CRON_SECRET`, like the AI jobs.
8. **Quality tooling**: 90 test files / ~1,512 cases, typecheck 0, one audit (hairline,
   gate 0, husky only — **not in CI**), no ESLint. Earnest runs 14 UI audits in
   pre-commit (gates and ratchets). Zero tests on the send path, channels UI, landing
   builder, and the Stripe money path.

### What is deliberately NOT ported from Earnest

- Paper and Clean looks, the Appearance panel's look/font axes — the workspace has one
  look; the public site has its own theme system.
- `FloatingDock` (the draggable utility dock), the Earnest Column / foot bar, EP score,
  Arcade, CardDesk, the Companion app.
- First-send ramp-up (`daily_ramp`, 2,000 / 5,000 / 10,000 steps) and the own-domain-
  over-5,000 rule — HOA audiences are tens to low hundreds. The **auto-pause** verdict is
  ported, with thresholds scaled (Phase 4).
- Mailing-list import/export jobs at 42K scale, client-scoped senders, `held_emails`.
  HOA audiences are member-derived (`residencyFor()`); `hoa_mailing_lists` stays unused.
- `renderOrgEmail()` — Earnest marks it legacy. The MJML partial composition
  (`_layout` / `_header` / `_footer`) is the pattern to port (Phase 4).

---

## Phase 0 — Pre-flight and launch blockers (½ session)

No design work. Close the things that make a launch unsafe or embarrassing.

1. **Security:** `process-scheduled.post.ts:30` — require `CRON_SECRET` *or* an admin
   session (`requireAdminAccess`), not any session. Audit the other `email/*` routes for
   the same shape (`resolve`, `dashboard-activity`).
2. **Retire** `email/test.post.ts` (484 lines), `test-simple*`, `debug-html`; replace the
   `noreply@605lincolnroad.com` fallbacks in `sendgrid.ts` with the platform sender from
   runtime config. Delete `useGSAP.js` (duplicate of `useGsap.ts`).
3. **Ops (operator TODOs):** generate VAPID keys and set the three vars on Vercel
   (go-live §5); top up the Anthropic account (§3e) and confirm `VOYAGE_API_KEY`; delete
   the `/transition-test` fixture before any public community listing (§3d).
4. **CI:** add `pnpm audit:hairline-surfaces` to `.github/workflows/ci.yml` — it is
   husky-only today and a commit from a machine without hooks walks past it.
5. `pnpm generate:types` against prod; commit the diff.

**Deliverables:** four commits; env set; go-live checklist §3e/§5 ticked.

---

## Phase 1 — Glass shell completion (1–2 sessions) — *the visible win*

Goal: every overlay, control and transition in the workspace is on the glass system, so
that Phases 3–7 build UI on finished primitives rather than adding to the sweep.

1. **Glass the shadcn overlays.** Copy Earnest's *modified* `components/ui/*` classes
   rather than re-deriving: `Dialog`/`Select`/`Tooltip`/`Popover`/`DropdownMenu` content
   → `glass-surface glass-surface--strong` (Popover and Dropdown also `chrome-float`);
   `DialogOverlay` and `SheetContent` → `dialog-overlay-glass`; `Card` → `glass-edge
   glass-refract`; `Input`/`Textarea`/`SelectTrigger` → `glass-field`. HOA already has
   these classes in `earnest-ui.css` (`glass-surface`, `--strong`, `dialog-overlay-glass`,
   `glass-field`); port `.chrome-float` (re-declares `--card`/`--popover`/`--muted`/`--border`
   on the element) and `.glass-refract` (masked 1px gradient rim, `@supports
   mask-composite`). Then glass `Notification/{Sheet,Toast}.vue`, `App/ChannelsPanel.vue`,
   `AiAssistantPanel.vue` and the `Nav.vue` mobile `Sheet`.
2. **One motion module.** `core/shared/motion/index.ts` exporting the curves and durations
   already in `variables.css:52-58` (`--spring`, `--spring-out`, `--motion-fast/base/
   page/panel`) plus Earnest's `--spring-bounce` and `--ease-out-expo`; a CSS-vars twin.
   Replace the ~15 hand-written `cubic-bezier(...)` literals (Dock, SlideOver*, BottomSheet,
   SubNav, SegmentedControl, UpdatePrompt, Home/Stack, Bell, AiAssistantPanel, Landing*,
   TrustBar) with the tokens. Adopt Earnest's overlay motion policy: mount in the closed
   pose, flip the inline transform after one frame, no Vue `<Transition>` for overlays.
3. **`useConfirm()` + glass `ConfirmDialog`.** Promise-based (`await confirm({title,
   body, destructive})`), built on the now-glass `AlertDialog`. Replace all **34** native
   `confirm()`/`alert()` calls (ChannelMessage, MembersPage, UnitsPage, DocumentsPage,
   MeetingsAdminPage, TeamManager, Gantt, …). Add a `no-native-dialogs` audit (Phase 8)
   so they cannot come back.
4. **Date and time pickers.** Add shadcn-vue `calendar` + `date-picker` (reka `DateField` /
   `Calendar`, `@internationalized/date`) wearing `glass-field`; a `DateInput` /
   `DateTimeInput` wrapper with the same `v-model` shape as the raw inputs. Replace the
   **18** raw `type="date"` / `datetime-local` inputs. Also add `combobox`, `toggle-group`
   and `pagination` — the three primitives Phases 3–7 need and the kit lacks.
5. **Stone/gray sweep** (open in `plan-content-first-ux.md`): the 15 files hard-coding
   `gray-*` / `stone-*` → `t-*` / theme tokens. This is what Earnest's `color-literals`
   ratchet measures; take the baseline here.
6. **Spotlight (⌘K).** `App/Spotlight.vue` on the unused `CommandDialog`, opened from the
   Nav search button, ⌘K/Ctrl-K, and the mobile menu. Sources: the `useAppNav` +
   `useSectionNav` registries (destinations), a new `GET /api/search` (members, units,
   vendors, documents, meetings, requests, projects, channels — org-scoped, capability-
   filtered), and the create verbs (item 2.4). Arrow/Enter/Esc; grouped results.
7. **`BottomSheet` as the mobile create/edit surface.** `ResponsiveModal`-style switch:
   centred `Dialog` ≥ md, `BottomSheet` below. Convert the create flows that are open
   `Dialog`s today (CreateChannelModal, invite member, add unit, new request, new
   meeting, upload document). Keep `alwaysSheet` for the wizard.
8. **Teaching empty states.** Extend `App/EmptyState.vue` with Earnest's `EEmptyState`
   props (`steps[]`, `#actions`, `footnote`, `size`). Convert the first-run states on
   Members, Units, Documents, Meetings, Requests, Projects, Channels, Email.
9. **Button tiers + case.** Adopt `docs/button-type-case-system.md` (actions Title Case,
   meta-labels UPPERCASE, prose sentence case) and the T1–T4 tiers (`ui/button` cva
   variants → `glass-btn-primary` / `glass-btn-destructive` / `glass-btn-soft` /
   `--tinted`; a `UiActionButton` T3/T4). "One filled button per view."
   `docs/glass-nesting-plan.md`'s rule — *two edges, not three*: the panel or the one
   settings card is the container; groups inside are flat `.form-section`s; only things
   you pick or compare are boxes. Add `.form-section` / `.helper-text` to `earnest-ui.css`.

**Verify in the browser, both modes**, on the demo org: every Dialog/Sheet/Popover/
Dropdown/Tooltip is glass with the accent focus ring; reduced-transparency falls back to
opaque; `prefers-reduced-motion` kills the springs; ⌘K opens, finds a member, navigates.

**Deliverables:** glass overlays; `core/shared/motion`; `useConfirm` + 0 native dialogs;
date pickers + 0 raw date inputs; 0 `gray-*`/`stone-*` in workspace files; Spotlight;
BottomSheet on ≥6 create flows; teaching empty states; button tiers in `ui/button`.
`/ui-kit` updated to show each.

---

## Phase 2 — Dock, navigation and page-title system (1 session)

1. **Channels inside the shell.** Retire `layouts/channels.vue`; `admin/channels/*` use
   `auth` with an *immersive* flag (Earnest `apps-shell--channels`): the page is
   `h-dvh`, the footer hides, the dock stays. The in-hub channels list
   (`communications/channels/index.vue`) and the full-screen pages share one component.
2. **Nothing orphaned.** Polls (`[slug]/polls` has no admin page and no nav entry), Leads
   (linked only from Requests) and Vendors (route exists, not in `useSectionNav`)
   become reachable: Polls → *Comms* children (Email · Channels · Polls); Vendors →
   *People*; Leads → *Requests*. Member dock gains Polls. Add an admin Rules/Governance
   entry under *Records* (today only the member `/rules` page exists; admin edits via
   `useGovernance` there).
3. **Dock prefs per user.** `app-nav-palette/-position/-labels/-glass` move from
   localStorage to `directus_users.app_prefs` (JSON, one script) with localStorage as the
   SSR-safe cache — Earnest resolves local override → user → org. Remove the stale "only
   relevant for modern orgs" comment at `Nav.vue:572`.
4. **Create verbs.** `core/shared/create-verbs.ts` + `useCreateVerbs()`: the registry of
   "+ New …" actions with capability + module gates (invite member, add unit, new
   request, new meeting, upload document, new email, new channel, new project, new poll,
   log expense, record payment). Feeds a `+ New` pill in the Nav (Earnest
   `AppCreateMenu`) and Spotlight.
5. **Page-title system (Earnest `AppHeader` → `AppHeaderOutlet`).** `usePageTitle()`
   registers `{title, blurb, kicker, backTo, actions}`; the outlet lives in `auth.vue`
   above `<main>` and survives navigation; the large title collapses into the Nav centre
   on scroll (`useTitleCollapse`), and the Nav's bottom hairline appears only once it
   has ("earned rule"). Migrate `App/PageHeader.vue` callers (same props, so it is a
   rename plus a teleport).
6. **Mobile launcher.** Below `md` the dock currently renders a 5-rem pill with every
   slot; Earnest hides the rail < 1024px and opens a 4-column "App Library" grid from the
   bar. Port the grid as `App/AppLibrary.vue` (`apps-chip-in` stagger) opened from the
   Nav's grid button; keep the dock from `md` up.
7. **Directional transitions.** `useDirectionalPageTransition` keyed on dock order
   (forward/back slide, else fade-up) — HOA's `page-transition.global.ts` already picks
   forward/back; align its curves with the motion module and add the floor-strip variant
   for SubNav pill changes.

**Deliverables:** one layout; no orphan surfaces; `app_prefs` script + types; create
verbs; page-title outlet; App Library; `/ui-kit` section for the nav system.

---

## Phase 3 — Email: compliance and delivery (2 sessions) — *launch blocker*

### 3a. Unsubscribe, preferences and suppression

HOA mail is mostly **relationship/transactional** (dues notices, meeting notices,
governance) where CAN-SPAM's commercial-content rules do not require an opt-out — but
newsletters, community announcements and anything the board writes freely are not
exempt, and SendGrid's shared IPs punish spam reports regardless. Design:

1. **Two email classes** on `hoa_emails` and the transactional senders:
   `essential` (dues, assessments, meeting notices, violations, governance, membership —
   cannot be unsubscribed; footer says why) and `community` (newsletters, announcements,
   general) — opt-out. The compose page picks a class from the template type; the
   assembler refuses to mark a newsletter essential.
2. **Per-member switch**: `hoa_members.email_community_opt_out` (boolean + `_at`,
   `_source: link|one_click|spam|admin`) and `hoa_members.email_bounced` (+ `_at`,
   `_reason`). `residencyFor()`-based audience resolution (`sendEmailJob.resolveRecipients`,
   `send.post.ts`, the digest worker) excludes bounced for all classes and opted-out for
   `community`.
3. **Tokens and routes** (port `unsubscribe.ts`, `contact-unsubscribes.ts` shape):
   `hoa_members.unsubscribe_token` (24 random bytes base64url, minted lazily);
   `GET /unsubscribe?token=…&e=<email id>` page (glass, lists what they will still
   receive, one tap to confirm, a "manage preferences" link into the portal);
   `POST /api/email/unsubscribe/one-click` (no auth, 200 empty, idempotent, 503 on a
   failed read so SendGrid retries). Headers on every `community` send:
   `List-Unsubscribe: <https one-click url>` and `List-Unsubscribe-Post:
   List-Unsubscribe=One-Click`. Gmail/Yahoo bulk-sender rules require exactly this.
4. **Footer**: `email-branding.ts` footer gains Unsubscribe · Preferences · the org's
   mailing address (`settings.landing` address, else refuse a `community` send with a
   400 that names the missing address — Earnest `SENDER_ADDRESS_MISSING`). Essential
   mail footer: "You receive this because you are a member of {org}; it cannot be
   unsubscribed." Both via the web-view page too.
5. **Suppression from the webhook** (`email/activity.post.ts`): port Earnest's
   `eventAction()`: hard bounce (`bounce` with `type: 'bounce'` and classification
   Invalid Address / Mailbox Unavailable / none, or `dropped` "Bounced Address") →
   `email_bounced` on the member; `spamreport` / `unsubscribe` / `group_unsubscribe` →
   `email_community_opt_out` with `_source`. Reputation/content bounces do nothing.
   Return 503 on store failure so SendGrid redelivers. Members page shows a bounced /
   opted-out chip with the reason and a "Clear" action (admin, logged).
6. **Resident preferences** on the portal profile: the existing 10-category matrix plus
   the community opt-out, restyled on glass (Phase 1 primitives). The digest and
   `transactional-email.ts` already honour the matrix.

### 3b. The send pipeline (port `newsletter-batch.ts` / `newsletter-prepare.ts`)

7. **`hoa_email_recipients` becomes the queue.** Add `status: queued|sending|sent|
   failed|skipped|unknown`, `position`, `claim`, `claimed_at`, `sent_at`, `error`,
   `member_fields` (merge snapshot). `hoa_emails` gains `total_recipients` (null while
   preparing), `total_sent`, `total_failed`, `send_errors` (json), `status` values
   `sending | paused | sent | failed` alongside the existing ones.
8. **`send.post.ts` writes the plan and returns.** Resolve the audience, snapshot
   recipient rows in 500s with `position` (most recently active first), set
   `total_recipients` last, kick one tick, return `{ id, total }`. Nothing is sent
   inside the request. ≤ 50 recipients may run one inline tick (40 s budget) so small
   sends still feel instant.
9. **`POST /api/email/cron/continue-sends`** (Vercel `* * * * *`, `CRON_SECRET`):
   `runBatch()` — expire stale claims (3 min), daily-cap check, claim `queued →
   sending` conditionally with a token (`CHUNK = 100`, `CONCURRENCY = 10`), compile
   MJML once per send and merge per recipient, deliver with 429/5xx retry ×3,
   `settle()`; rows still `sending` after delivery began become `unknown` and are
   **never resent** (at-most-once). Retry Directus 503s twice. Mark `sent` when the
   queue drains (`failed` only if nobody got it). Replace the Directus Flow "Email
   Scheduler" tick with a Vercel cron calling the hardened `process-scheduled`, so the
   scheduler and the sender share one secret and one runbook.
10. **Progress UI.** `GET /api/email/[id]/progress` polled every 5 s by the compose
    page's send dialog and the detail page: "Getting ready · 120 of 300" → "Sending ·
    212 of 300" → "Sent · 298 delivered, 2 failed" with a per-row failure list. The
    comms dock badge shows an in-flight send.
11. **Sender unification.** One `resolveSender(org, stream)` in `sendgrid.ts` used by
    `send.post.ts`, `sendEmailJob.ts`, `transactional-email.ts` and the digest worker:
    `settings.from_name` always; `from_email` only when `email_domain_verified`;
    `reply_to` from settings; platform fallback otherwise. Today scheduled and
    transactional sends silently drop the white-label sender.
12. **Tests** (the ROADMAP's untested path): audience exclusion matrix (class ×
    opt-out × bounced × residency), token mint/verify, one-click idempotency, webhook
    `eventAction()` table, claim/settle state machine, at-most-once on a simulated kill
    mid-chunk, stale-claim expiry, progress arithmetic.

**Verify on prod-shaped data without sending**: `OUTBOUND_EMAIL_ONLY_TO` allow-list
(port from Earnest `email-send.ts`) so a dev run can only reach named inboxes; the demo
guardrail already inside the invitation senders extends to the queue.

**Deliverables:** schema scripts (`add-email-class-and-optout.ts`,
`extend-email-recipients-queue.ts`), types; unsubscribe page + one-click route +
headers + footer; suppression; queue + cron + progress; sender unification; ≥ 40 new
tests; `docs/email-sending.md` runbook (what the cron does, how to resume, what
`unknown` means).

---

## Phase 4 — Email: health, scheduling, branding parity (1 session)

1. **Auto-pause + Resume** (port `send-health.ts`, scaled): after each tick on an
   unfinished send, compute hard-bounce and spam rates from `hoa_email_activity`; with
   `minOutcomes: 50` (Earnest 1,000), `hardBounceRate: 0.08`, `spamRate: 0.005`, set
   `status: paused` conditionally (only the tick whose write moved the row notifies),
   `send_errors.health = {state, reason, counts, sentence}`. Notify org admins + the
   sender (bell + email, CTA "Review and resume"). `POST /api/email/[id]/resume`
   stores the counts as a baseline so only new events count.
2. **Recurrence**: `computeNextRun` grows `daily`, `biweekly`, `quarterly`, `annual` and
   "nth weekday of month" (board-meeting reminders are "second Tuesday"); the compose UI
   gets a human sentence preview ("Every second Tuesday at 9:00, next on …").
3. **MJML partial composition.** Port Earnest's `_layout.mjml` + `_header.mjml` +
   `_footer.mjml` with `<!-- @HEADER/@CONTENT/@FOOTER -->` slots and a `raw-mjml` rollup
   plugin (Nitro `serverAssets` came back empty on Vercel for Earnest — same risk here),
   replacing the string concatenation in `email-templates-mjml.ts` (1,475 lines) one
   template type at a time. `brandVars()` with `brandOnColor` derived from
   `shared/color-contrast.ts` (legible label colour on the org's brand colour) and the
   logo scaled to 50 px height / 240 px max width from Directus file metadata. The
   existing per-org header text / footer image / typography stay as vars.
4. **Preview parity**: `GET /api/email/preview-mjml?org&template&format` covering every
   transactional template and the notification categories; the Settings → Email
   Branding card's iframe points at it and updates as you edit.
5. **Per-org copy overrides** (`organizations.email_copy` pattern) for the three
   transactional sends boards most want to reword: invitation, dues notice, meeting
   notice. Optional; ship if cheap.

**Deliverables:** pause/resume + tests; recurrence + tests; partial composition for
≥ 4 template types; preview route; branding card wired.

---

## Phase 5 — Reminder engine + resident notification events (2 sessions)

The sellable sentence is *"Dues on autopilot, into your own account"* (billing P1) and
*"Everyone can see it"* (VISION). Reminders are the half of that which does not wait on
Stripe.

### 5a. Engine

1. **Schema**: `hoa_reminder_log` (`organization`, `rule`, `reminder_key` UNIQUE,
   `member`, `entity_collection`, `entity_id`, `channel: bell|push|email`, `sent_at`,
   `result`) — Earnest's `invoice_reminders.reminder_key` idempotency pattern: the key
   is `<rule>:<entity>:<offset>:<member>`, so a re-run never double-sends. Per-org
   `settings.reminders` JSON: which rules are on, offsets, send hour, and the approved
   template per rule.
2. **Rules** in `core/shared/reminders/rules.ts` (pure, tested; each yields
   `{key, audience, template, vars, urgency}` for an `asOf`):
   - **Dues**: `payment_requests.due_date` − 7d, on the day, +1d past grace (grace from
     the org's late-fee settings, 1A schema). Audience = the unit's current residents
     by `residencyFor()`; owners always, tenants only if the org says so.
   - **Meetings**: `hoa_meetings` published, T−7d (agenda), T−24h, T−1h (push only).
     Attendee scope from the meeting's audience (board / all).
   - **Requests**: resident-facing status change (already a `notify-event` for some
     types — unify), "no activity in 7 days" nudge to the assignee (board-facing, bell).
   - **Violations** (`request.type = violation`): `cure_by` − 3d and on the day to the
     resident; `notice_count` escalation stays HITL (the AI-notices path).
   - **Polls**: opens, closes in 24h, closed-with-result.
   - **Documents**: vendor COI / insurance expiry to admins (board-facing, bell).
3. **Tick**: `POST /api/reminders/run` (Vercel cron hourly, `CRON_SECRET`), per org:
   evaluate rules for `asOf = now` in the org's timezone (**add `hoa_organizations.
   timezone`** — the digest uses one global `DIGEST_TZ` today; fix the digest to read
   it too), skip keys present in the log, fan out through `notifyUsers()` (bell + push +
   email twin, honouring the per-user category matrix and the new opt-out — dues and
   violation reminders are `essential`), write the log row **before** sending (claim),
   update `result` after. 40 s budget, continues next tick.
4. **Templates**: MJML `reminder-dues`, `reminder-meeting`, `reminder-violation`,
   `reminder-poll` on the Phase 4 partials; AI-drafted defaults the board approves once
   in Settings → Reminders (the existing outbound rule: the template is approved, each
   send is not a new approval). "Essential" footer.

### 5b. Settings and visibility

5. **Settings → Reminders** (admin): per-rule toggle, offsets, send hour, template
   preview, "send me a test". A dry-run button lists what *would* go out in the next
   24 h ("14 dues reminders, 1 meeting reminder") — the generation-preview pattern from
   billing P1.
6. **Resident surfaces**: the portal home's "Up next" stack shows the same items the
   reminders are about (dues due, meeting, poll closing, request update) so the push
   lands on a page that already knows; the `/payments` ledger shows "Reminder sent
   {date}" on each open charge.
7. **Notification events the residents' side is missing** (bell rows exist only for
   mention, meeting, announcement, comment today): payment received (receipt), payment
   overdue, request status changed, poll opened/closed, document published to members,
   board decision posted. Wire through `core/shared/notifications/events.ts` with the
   existing categories (`payment`, `request`, `document`, `announcement`).

**Deliverables:** `hoa_reminder_log` + `timezone` scripts; rules module + tests for
every rule × offset × idempotency; cron route; 4 templates; Settings → Reminders with
dry run; 6 new notification events; digest on org timezone.

---

## Phase 6 — PWA and push completion (1 session)

1. **Service worker always on.** Register `sw.js` from a `pwa.client.ts` plugin app-wide
   (`updateViaCache: 'none'`, `update()` on visibility), not only after push opt-in;
   keep no fetch handler / no precache (both apps' deliberate choice — the update
   prompt and `checkOutdatedBuildInterval` handle staleness). Port
   `pwa-standalone.client.ts` (`html[data-standalone]`, same-origin `<a>` taps through
   `location.assign` so iOS stays in-app).
2. **Remove `@vite-pwa/nuxt`** from devDependencies — it is configured nowhere in either
   app. (Decision for Peter; default is remove.)
3. **Install story.** `useInstallPrompt()`: capture `beforeinstallprompt` (Android/
   desktop) and `canInstallPwa` (iOS Safari, not standalone). A glass `InstallCard` on
   the portal home and the admin home — dismissible per build — with the iOS
   Share → Add to Home Screen steps (today buried on `account.vue`). The invitation
   acceptance page ends on the same card. Manifest: `shortcuts` (Pay dues, Requests,
   Documents, Channels), `id`, `start_url: /?source=pwa`, maskable icons per org
   (the per-host manifest route already exists).
4. **Push semantics.** Notification payload carries `tag` (renotify), `badgeCount`,
   `url`; `notificationclick` focuses an open client and posts `push-navigate`, else
   `openWindow` (HOA's `sw.js` already does most of this — diff against Earnest's and
   close the gaps). Notification **actions** for the reminder types: dues → "Pay",
   meeting → "Add to calendar", request → "Open". Push for channels: new message in a
   channel you belong to, respecting `notifications_enabled` (Phase 7 wires the event).
5. **Verify on devices.** iOS 17+ Safari standalone, Android Chrome, desktop Chrome:
   subscribe → `POST /api/user/push/test` → received → click routes → badge clears.
   Record the matrix in `docs/push-verification.md`. This closes go-live §5.
6. **App badge** = unread bell + unread channels (already `useAppBadge`); the SW keeps it
   in Cache Storage across restarts.

**Deliverables:** always-on SW + standalone plugin; install card + manifest shortcuts;
notification actions; device matrix documented; dependency removed.

---

## Phase 7 — Channels gap-close (1 session)

1. **Message editing**: own messages, 15-minute window for members, unlimited for
   managers; `is_edited` + `edited_at` (the badge already renders); realtime update
   through the existing subscription; moderation log entry on manager edits.
2. **Notify on message** (leapfrog — Earnest notifies nobody): a new message in a channel
   creates a *collapsed* bell row per member ("3 new in #board" — upsert into the unread
   row, Earnest's reactions pattern) and a push, unless `notifications_enabled` is off
   for that member or they have the channel open (presence below). Mentions keep their
   own row. Email twin only via the digest.
3. **DMs as private channels** (the round-1 decision): `is_private` + `is_dm` with a
   seeded two-person roster, surfaced in the roster under "Direct", created from a
   member's profile and the Spotlight "Message …" verb. No new collection.
4. **Presence (cheap)**: a 60 s heartbeat per open channel over the existing WS manager
   → "who's here" avatars in the thread header and the suppression in item 2. No typing
   indicators (Earnest has none either; skip unless asked).
5. **Embed `ChannelThread`** in the `request` and `project` slide-over panels (the
   entity links on `hoa_channels` exist) with a "Start a channel" verb when none is
   linked.
6. **Shell**: done in Phase 2 (immersive mode, dock stays). Here: `ChannelsPanel` and the
   composer on glass, `confirm()` → `useConfirm`, the `CreateChannelModal` on
   `BottomSheet` below md.

**Deliverables:** edit + tests; notify-on-message with mute/presence suppression; DMs;
presence; embedded threads; glass sweep of channel surfaces.

---

## Phase 8 — Audit gates and CI (1 session)

Port Earnest's audits in **report mode**, re-censused against this app's spelling (the
round-2 lesson: the hairline regex matched nothing until rewritten for `t-border`), take
baselines, then ratchet. Gates at 0 from day one where the count is already 0.

| Audit | Kind | What it enforces here |
|---|---|---|
| `hairline-surfaces` | gate 0 (exists) | Hand-rolled card boxes. Add to CI (Phase 0). |
| `native-dialogs` | gate 0 (after Phase 1) | `confirm(` / `alert(` / `prompt(` in app code. |
| `raw-date-inputs` | gate 0 (after Phase 1) | `type="date"` / `datetime-local`. |
| `color-literals` | ratchet | `gray-*`, `stone-*`, `bg-blue-500`-style palette classes. |
| `css-colors` | ratchet | `#hex` / `rgb()` / raw `hsl()` in CSS instead of tokens; `allow-css-color:` marker. |
| `dead-theme-classes` | gate 0 | Undefined `t-*`, `glass-*`, `ios-*`, `type-*` classes. |
| `unresolved-components` | gate 0 | Template tags resolving to no component (reads `.nuxt/components.d.ts`). |
| `contrast-pairs` | gate 4.5:1 | Every `--x` / `--x-foreground` pair in `theme-app.css` light and dark; extends `glass-accent-tokens.test.ts`. |
| `heading-labels` | gate 0 | No `<hN>` dressed as a micro label. |
| `raw-buttons` | ratchet | `<button>` outside the tiers; `allow-raw-button:` marker. |
| `type-scale` | ratchet | Raw pixel font sizes outside `.type-*`. |
| `overlay-boxes` / `settings-boxes` | ratchet | Card-in-overlay; more than one card per settings tab (`scripts/lib/nested-boxes.ts`). |
| `empty-states` | ratchet | Bare "No X yet" outside `App/EmptyState`. |
| `vue-global` | gate | `:global(X) .child` fully inside `:global()`. |
| `detached-promises` | ratchet | Un-awaited promises in server routes (the Vercel-kills-the-function class of bug). |

Plus: an ESLint flat config (port `eslint.config.js` + `lint-staged.config.js` from
Earnest, Vue + TS + prettier), `pnpm lint` in CI, and the whole audit set in
`.husky/pre-commit` and in `ci.yml`. Document the markers in `docs/ux-standards.md`
(the one-page digest of Earnest's `visual-hierarchy-plan`, `button-type-case-system`
and `glass-nesting-plan`, adapted to HOA's class names).

**Deliverables:** 14 scripts; baselines recorded in this file; CI red on any gate; the
standards doc.

---

## Phase 9 — Launch polish and the GTM checklist (1 session)

1. **One place to choose the public theme**: `SiteSettingsPanel` keeps it;
   `BrandingSettingsForm.vue:127` loses its duplicate; the vestigial style picker on
   `account.vue:461` goes. (Public-site content control is untouched.)
2. **`settings/subscription.vue` reconciled** with band pricing (`subscribe-band.post.ts`
   is unwired; the subscribe route does not persist `stripe_customer_id`). Legacy
   `layouts/default.vue` pages (`payments/index`, `setup`, `payment/confirmation`,
   `subscription-expired`) move to `auth` / `auth-blank`; delete the layout.
3. **Reports PDF export** (ROADMAP Phase 2 open item) via the existing html2canvas-free
   path: server-render the Reports tab's HTML and print to PDF with Playwright in a
   GitHub Actions job, or lazy-import jsPDF client-side as Earnest does. Pick the latter
   unless the page is heavy.
4. **Tests on the money path** (ROADMAP's highest-risk gap): PaymentIntent fee math and
   destination routing exist; add webhook replay fixtures for `payment_intent.succeeded`,
   `charge.refunded`, `account.updated`, and the ledger write; add runtime tests for the
   send queue (Phase 3) and the reminder tick (Phase 5) against a fake Directus.
5. **Release notes + What's new** for the round; `docs/releasing.md` bump.
6. **GTM checklist** (new `docs/gtm-checklist.md`, replaces go-live's finished sections):
   marketing split to `app.hoaconnect.info` (`plan-marketing-split.md`, separate work);
   fixture deleted; demo orgs re-seeded on the new shell; Anthropic/Voyage funded;
   VAPID set; SendGrid webhook enforcing signatures; `OUTBOUND_EMAIL_ONLY_TO` unset in
   prod; Stripe Connect activated (`connect-activation-runbook.md`); privacy policy
   links the email-preferences section; support inbox; status page.

---

## Sequencing

```
P0 ─> P1 (shell) ─> P2 (nav) ─┬─> P3 (email compliance + queue) ─> P4 (email health)
                              ├─> P5 (reminders)  ── needs P3's class/opt-out + P4's partials for templates
                              ├─> P6 (PWA/push)   ── independent after P1; P5's actions need its payload shape
                              └─> P7 (channels)   ── independent after P2
P8 (audits) after P1 (so the baselines are post-sweep) · P9 last
```

- **Critical path:** P0 → P1 → P3 → P5 → P9. Email compliance and reminders are what
  the product is *sold on*; the shell is what it is *judged on* in a demo.
- **Interleave** a visible session (P2, P6, P7) between infrastructure sessions (P3,
  P4, P5) so every push shows something a board member can see.
- **Billing P1** (`plan-payhoa-parity.md`) runs in parallel on its own track; P5's dues
  rules read `payment_requests.due_date` either way.
- **Ship boundaries:** P0+P1+P2 is a releasable "new shell" drop. P3 alone is
  releasable and should go out as soon as it is green — it removes a compliance risk
  that exists today.

Roughly **12 sessions**. Earnest-style single-phase sessions on `main`, Vercel
auto-deploys on push, so each session ends with a green gate and a deploy decision.

---

## Cross-cutting requirements

- **Public site untouched.** No phase edits `Org/Landing/*`, `LandingBuilder/*`,
  `theme.css`'s six public blocks or `landing.css`, except Phase 9 item 1 (where the
  theme is *chosen*, not how it renders). `forceThemeStyle` stays public-only.
- **Tenant isolation:** every new collection carries `organization`; every route filters
  `organization _eq orgId`; cross-tenant ids are not-found. Unsubscribe and reminder
  routes are org-scoped by the token/log row, never by a client-supplied org id.
- **Capabilities:** new verbs, panels and search results pass through
  `shared/permissions.ts` / `useCapabilities`; server routes enforce.
- **Notifications honour prefs:** everything fans out through `notifyUsers()`; the
  essential/community split is the only path that bypasses a user switch, and only for
  email, and only for the named essential types.
- **Theming:** workspace UI uses `theme-app` tokens and the glass classes; module-gate
  new surfaces via `useModules`. Nothing in the workspace reads `settings.theme`.
- **Quality gate per commit:** typecheck 0 · vitest green · build green · every audit
  at or under baseline · org-scope tests for every new endpoint · browser verification
  in both modes on the demo org with real sessions, rows deleted afterwards,
  `demo-classic` diffed as the control. Build and typecheck run serially.

## Risks

1. **Vercel function limits on the send tick.** 40 s budget, 100-row chunks, 10 wide —
   Earnest measured this at 42K on prod; HOA sends are < 1K, so the risk is the opposite:
   a 300-person send taking three ticks feels slow. The ≤ 50 inline tick and the
   progress UI are the mitigation. If it still feels slow, raise `CHUNK` before adding
   infrastructure.
2. **Suppression false positives.** A soft bounce marked hard locks a resident out of
   dues notices. Only Earnest's exact classification set marks `email_bounced`; the
   members page shows the reason and a one-tap clear; essential mail still goes to
   bounced addresses' *unit* co-residents.
3. **Reminder spam.** Six rules × offsets × channels can bury a resident. Per-org send
   hour, per-user category matrix, bell-only for board-facing nudges, push only for
   T−1h, and the dry-run preview before enabling a rule.
4. **The round-2 lesson stands:** *the code says one thing and the running app does
   another, and only the running app is evidence.* Every overlay sweep, every audit regex
   and every webhook action is verified in the browser or against the live API before it
   is called done.
5. **Scope creep from Earnest.** The surveys found ~30K lines of shell, email and list
   code. The "not ported" list above is a boundary, not a backlog.

## Open decisions — RESOLVED 2026-10-24 (all defaults; see §Decisions in the Session log)

1. **DMs** — build as private channels (Phase 7.3) or defer? Default: build; it is a
   day and the "message the treasurer" ask will come from the first paying board.
2. **Essential vs community email classes** — the split above, or a single opt-out that
   applies to everything except dues and governance notices? Default: the two classes;
   it is explainable in a footer.
3. **Scheduler consolidation** — move the Directus Flow email scheduler to a Vercel cron
   (Phase 3.9) so send + schedule share `CRON_SECRET`? Default: yes. The GitHub Actions
   workers stay.
4. **`@vite-pwa/nuxt`** — remove (default) or configure for precache/offline? Earnest
   removed it from config; offline mode is not a selling point for an HOA portal.
5. **Dock on phones** — App Library grid (Earnest, Phase 2.6) or keep the small pill?
   Default: grid; the pill's 7 slots at phone width are already cramped.
6. **Message edit window** — 15 min for members or unlimited? Default: 15 min.

## Kickoff prompt — template for every session

```
Continue the Earnest Parity Round 3 programme. Read
docs/plan-earnest-parity-round3-gtm.md (plan + Status checklist) first —
it is the source of truth, including any deviations recorded by earlier
sessions. Skim the "Context" section once; do not re-survey Earnest.

Work on `main` in ~/Sites/hoaconnect — no phase branch, no worktree.
`git pull --ff-only` first. Tool shells have no node/pnpm: run
`eval "$(/usr/local/bin/fnm env)"` in every one. Vercel AUTO-DEPLOYS on
push, so a push IS a production deploy — never push without asking.

This session = Phase <N> (<name>) ONLY. Earnest reference repo:
~/Sites/earnest/earnest — port patterns per the plan (the plan names the
Earnest files); reuse the existing HOA functions the plan names instead of
duplicating them. The public site (Org/Landing/*, LandingBuilder/*, the
public theme blocks) is out of scope.

Quality gate, per commit: typecheck 0, vitest green, build green (serially,
never both at once), every audit at or under baseline (husky blocks),
org-scope tests for every new endpoint, plus the phase's browser
verification in BOTH light and dark on the demo org with a real session
(`/api/demo/login`). Delete every row you create; `demo-classic` is a
CONTROL — diff both orgs before and after. Drive the browser headlessly;
I supervise from another device.

When done: update the Status table and append to the Session log (shipped,
deviations, operator TODOs), give me the kickoff prompt for the next
session, and ask before pushing.
```

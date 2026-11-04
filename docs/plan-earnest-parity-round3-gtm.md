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
| 2–3 | Phase 1 — Glass shell completion: **1a** primitives (Opus), **1b** sweeps (Sonnet) | [x] | **1a [x]** (session 2): every primitive shipped + on `/ui-kit`; also fixed prod having no glass blur outside Safari. **1b [x]** (session 3): sweeps A–E, one local commit each on `main` (not pushed). Not done: Directus click-through on the demo org (needs a signed-in session) — see Session 3. |
| 4 | Phase 2 — Dock, navigation and page-title system | [x] | All seven items in `6ea771c` (pushed with `36bb528`); gates green, browser 72/72 ×3 on the demo org. Operator: `pnpm add:user-app-prefs` ran 2026-11-03; dock prefs are now per user. Follow-ups (Session 4b, local `main`, not pushed): `a1b8387` fixes the SSR auth gap (deviation 8); `5a2df08` fixes a blank-`<main>` race on navigating mid-load. |
| 5–7 | Phase 3 — Email: **3a** compliance (Opus), **3b-design** the queue's state machine (Fable, spec only), **3b-build** (Opus) | [x] | **3a [x]** (session 5, `8513eeb`, local `main`, not pushed): classes, unsubscribe page + RFC 8058 one-click, footer + address refusal, suppression from the webhook, Members chips, household Email section; gates green, browser 92/92 ×3. Operator: `pnpm add:email-compliance` ran 2026-11-03 (three policies read-narrowed); suppression and `List-Unsubscribe` are live. **3b-design [x]** (session 6, docs only): `docs/spec-email-send-queue.md` — per-email lease by unique insert (Directus filter-updates are not atomic), at-most-once chooses dropped over doubled with the webhook as the evidence that closes the gap, counts derived from rows, 64 named tests; five open questions for Peter (Vercel plan first). **3b-build [x]** (session 7, local `main`, not pushed): the queue as specified — lease, claim/settle, at-most-once, derived counts, the tick (`* * * * *`, `maxDuration: 60` via a per-route Vercel function), progress route + dialog + detail chips + dock badge, `resolveSender` + bounced guard on the direct senders; all 66 spec tests (kill matrix at 15 steps); runs synchronous until `pnpm add:email-send-queue`. Gates green (typecheck 0, vitest 115/1911, Vercel-preset build, browser 38/38 mocked); operator: run the script, then `--real`. |
| 8 | Phase 4 — Email: health, scheduling, branding parity | [x] | Session 8, local `main`, not pushed: auto-pause + Resume (under the send's lease, one notification, baseline), recurrence (daily … annual, nth / last weekday, on the sender's time zone, composer sentence), MJML partials (`_layout` / `_header` / `org-email` / `_footer`, byte-identical to the string builder on 19 fixtures), `brandVars` + WCAG `brandOnColor`, logo 50 px from file metadata, `GET /api/email/preview-mjml` + the Branding card's iframe. Q4 (resend unknown) and copy overrides not built. Operator: re-run `pnpm add:email-send-queue` (Phase 4 fields) — until then no auto-pause and repeats stay on UTC. |
| 9–10 | Phase 5 — Reminders: **5a** engine (Opus), **5b** templates, settings, events (Sonnet) | [x] | **5a [x]** (session 9, local `main`, not pushed): `hoa_reminder_log` (`reminder_key` UNIQUE — the insert is the claim, before the send), `hoa_organizations.timezone` (default New York), `settings.reminders` (every rule off until a board turns it on); pure rules for dues / meetings / requests / violations / polls / vendor coverage on the org's clock; the hourly tick `/api/reminders/run` (40 s budget, `?dry=1`); 4 MJML reminder partials (+ preview); digest on the org's zone; the billing worker hands dues to the engine for members with an account. Operator: `pnpm create:reminder-log`. **5b [x]** (session 10, local `main`, not pushed): Settings → Organization → Reminders (per-rule toggle = the board's approval, stamped server-side; stages, lead days, tenants, own wording, send hour, time zone; template preview, "send me a test", a 24-hour dry run), the resident home's **Up next** and "Reminder sent" on `/payments`, and the events — request status, poll opened / closed (same log keys as the tick, so one path sends), payment received, board decision shared; payment overdue and document published were already covered. Operator: turn the rules on per community. |
| 11 | Phase 6 — PWA and push completion | [x] | Session 11, local `main`, not pushed: the worker registers app-wide (`pwa.client.ts`) with the standalone plugin; `AppInstallCard` on the resident and admin homes (per-build dismissal, iOS steps); manifest `id` / `start_url` / four shortcuts; push `tag` / `badgeCount` / `url` / **actions** (Pay · Add to calendar · Open) from `sendReminder`; `.ics` route; subscription self-heal; `@vite-pwa/nuxt` removed. Gates green, browser 52/52. **Device delivery is Peter's** — `docs/push-verification.md`. Channels' push waits for Phase 7. |
| 12 | Phase 7 — Channels gap-close | [x] | Session 12, local `main`, not pushed: edit (server-enforced 15 min / managers unlimited / moderation log), notify-on-message (collapsed bell row + per-channel push; author, muted, channel-open, mentioned excluded), DMs as private `dm-…` channels under "Direct", presence heartbeat + "who's here", embedded thread on the request detail and a project Discussion tab. Gates green, browser 32/32. **Operator: run `pnpm add:channel-phase7` BEFORE deploy** (written, not run); push delivery is Peter's. |
| 13 | Phase 8 — Audit gates and CI | [ ] | Port Earnest's 14 audits in report mode → ratchet → gate. |
| 14 | Phase 9 — Launch polish and the GTM checklist | [ ] | Nav orphans, settings, tests on the money/send paths, docs. |

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

**Session 2 — Phase 1a: glass shell primitives** (2026-10-24) — on branch
`feat/parity3-p1a-shell-primitives`, off `main` at `ba03bc9`.

Shipped (one primitive per item; every one is on `/ui-kit`):

- **Item 1, glass overlays.** `ui/{dialog,alert-dialog,sheet}` content → `glass-surface
  glass-surface--strong`, their scrims → `dialog-overlay-glass`; `ui/{popover,dropdown-menu}`
  → strong glass + `chrome-float`; `ui/select` content and `ui/tooltip` → strong glass (tooltip
  arrow dropped, as Earnest does); `SelectTrigger` → `glass-field` pill; `Card` → `glass-edge
  glass-refract`. Sheet corners flatten on the edge they are attached to. `CommandDialog`'s
  Command is now transparent on the glass and has no corner X. `Notification/Sheet.vue` lost the
  `t-bg` that painted over the glass; `App/ChannelsPanel.vue` and `ai/AiAssistantPanel.vue`
  scrims → `dialog-overlay-glass`, Channels' panel → strong glass; vue-sonner toasts wear the
  strong glass + rim (workspace-scoped rule in `earnest-ui.css`). The Nav mobile `Sheet` is
  glass through `SheetContent`.
  New in `earnest-ui.css`: `.chrome-float` (re-declares `--card/--popover/--accent/--muted/
  --secondary/--muted-foreground/--border` on the element, as `color-mix()` of the theme
  tokens because HOA stores full colours, not triplets) and `.glass-surface--strong.chrome-float`
  (opaque step); `dialog-overlay-glass` reduced-transparency fallback (it had none); the
  `.animate-in/.animate-out` reduced-motion collapse for every Reka portal; workspace press
  feedback (`scale: 0.97` on `:active`, `@layer components`, `data-no-press` opt-out, off under
  reduced motion).
- **Item 2, one motion module.** `core/shared/motion/index.ts` (`EASING`, `DURATION`,
  `transition()` which returns `none` under reduced motion, `afterFirstFrame()` for the overlay
  policy — mount closed, flip after one frame, rAF raced by a timeout). CSS twin in
  `variables.css` gains `--spring-bounce`, `--ease-out-expo`, `--ease-exit`, and a
  `prefers-reduced-motion` block that flattens every curve to `linear` and every `--motion-*`
  to 1ms. `tests/shared/motion-tokens.test.ts` fails on any drift between the two. All the
  plan's hand-written literals (Dock, SlideOverShell/Stack, BottomSheet, SubNav,
  SegmentedControl, UpdatePrompt, Home/Stack, StackClearWizard, Bell, AiAssistantPanel,
  TrustBar, earnest-ui.css, theme-app.css) now read the tokens. Left alone on purpose:
  `Payment/Methods.vue` and `--theme-transition-slower` (`cubic-bezier(0.4,0,0.2,1)`, the
  Material standard curve — not one of ours), and Landing*/the public theme (out of scope).
- **Item 3, `useConfirm()` + glass ConfirmDialog.** `core/app/composables/useConfirm.ts`
  (`confirm()` → `Promise<boolean>`, `alert()` → `Promise<void>`, string shorthand, queued so a
  second call never orphans the first, server-safe) and its single host
  `App/ConfirmDialog.vue`, mounted in `app.vue` beside the Toaster. Built on the glass
  AlertDialog; the action is a real `Button` so `destructive: true` renders the destructive
  tier; focus lands on Cancel. `tests/composables/useConfirm.test.ts` (4).
- **Item 4, pickers + three primitives.** `ui/calendar` (Earnest's, minus the NativeSelect
  month/year layouts — HOA has no native-select part); `ui/date-input/{DateInput,DateTimeInput}`
  — reka `DateField` segments in a `glass-field` pill plus a glass Popover calendar, v-model
  is exactly the raw input's string (`"YYYY-MM-DD"` / `"YYYY-MM-DDTHH:mm"`, `""` when cleared;
  `value.ts`, `tests/shared/date-input-value.test.ts` (5)); picking a day keeps the typed time.
  `ui/combobox` (anchor wears the field rim, list is floating chrome), `ui/toggle-group` (ON
  item wears the active-thumb material), `ui/pagination` (current page = active thumb, not a
  filled button). `@internationalized/date@^3.12.0` added as a direct dependency (it was
  already in the tree through reka-ui; same version).
- **Item 6, Spotlight.** `GET /api/search` (`core/server/api/search.get.ts`) over a pure
  registry `core/shared/search` (members, units, vendors, documents, meetings, requests,
  projects, channels; staff-only, then per-group capability from the matrix; every filter
  carries `organization = orgId` — the route uses the admin token, so that filter is the
  scope; `tests/shared/search.test.ts` (7) pins both). `App/Spotlight.vue` on the kit's
  `CommandDialog`: destinations from `useAppNav().appsFor` + `useSectionNav().sectionLinksFor`
  (instant, module-filtered), records debounced from the route (stale responses dropped),
  ↑/↓/Enter/Esc, grouped. Opened by ⌘K / Ctrl-K, a new Nav search pill, and a mobile-menu
  entry (`useSpotlight()`); mounted in `layouts/auth.vue` and `layouts/channels.vue`. Member
  hits deep-link to `/admin/members?member=<id>`, which `MembersPage` now honours (opens the
  member, then strips the param).
- **Item 7 (primitive only).** `App/BottomSheet.vue` already was the ResponsiveModal switch
  (dialog ≥ md, sheet below, `alwaysSheet`). Added what it lacked against Earnest's
  ResponsiveModal: `size` (`sm|md|lg` → 28/32/42rem in dialog form) and a focus trap
  (reka `FocusScope`, focus returned on close — `aria-modal` promised both); its spring-back
  now comes from `motion.transition()`.
- **Item 8 (props only).** `App/EmptyState.vue` gains `steps[]`, `#actions`, `footnote`,
  `size` (`compact` kept as an alias; the default slot still renders as the action row, so
  the 34 existing call sites are untouched).
- **Item 9.** `ui/button` already carried Earnest's T1/T2 materials verbatim, so the tiers
  needed only the missing rungs: `ui/ActionButton.vue` (T3 pill, T4 `size="xs"` micro glyph,
  `pressed` toggle with the tri-state `aria-pressed` fix). `.form-section` / `.helper-text`
  in `earnest-ui.css`. `docs/button-type-case-system.md` written for HOA (the plan cited it,
  but it only existed in Earnest) — tiers, case by role, and the two-edges rule.

Found and fixed on the way — **production has had no glass blur outside Safari.** Tailwind v4
minifies every stylesheet with lightningcss, which treats `-webkit-backdrop-filter` written
AFTER `backdrop-filter` as overriding it and drops the standard property (reproduced in
isolation; the built entry CSS had 24 prefixed declarations and 4 unprefixed, all 4 from
Tailwind utilities). Chromium and Firefox ignore the prefixed form, so every hand-written glass
surface — dock, bars, sheets, cards, the new overlays — rendered with no blur in prod; dev does
not minify, and the one machine that eyeballed it runs Safari with Reduce Transparency on.
Fix: prefixed first, then standard (lightningcss then emits both) in `earnest-ui.css`,
`SlideOverShell.vue`, `SlideOverStack.vue` — 22 pairs. `tests/shared/backdrop-filter-order.test.ts`
fails on the bad order anywhere in the workspace.

Deviations, all deliberate:

1. **`Input` / `Textarea` were NOT given `glass-field`.** They already render as glass in the
   workspace through `html.theme-app .field-underline` (theme-app.css), and adding the class
   would lose to the unlayered `.field-underline` anyway. Public pages keep the editorial
   underline, which is the reason that override is scoped.
2. **`.glass-surface`'s `position` and `border-radius` moved into `@layer components`.** They
   were unlayered, so they beat every Tailwind utility: a `fixed` Dialog would have rendered
   `position: relative`. This also fixes two live bugs it was already causing — the Storage
   drop pill (`StorageManagerPage.vue:777`, `fixed … rounded-full`) and the channel-thread
   popover (`ChannelThread.vue:628`, `absolute right-0 top-11`) were both laid out in the flow.
3. **Spotlight record search is staff-only** (admin, board, property manager). Every hit links
   into `/admin`, which a member cannot open, and a member-facing list of neighbours' names is
   a privacy question for Phase 2, not a default. Members get destination search. Channels are
   admin-only (private-channel membership is checked in the channel routes, not here). A board
   president does not get the Requests group: the matrix gives `violations:manage` to the PM and
   board members, not officers — fix the matrix, not the search, if that is wrong.
4. **No create verbs in Spotlight yet** — they are Phase 2 item 2.4; the component has a slot
   for a third group.
5. **`useConfirm`'s host is in `app.vue`**, not the auth layout, so public and auth pages that
   still call `confirm()` today can be swept too.
6. **Browser verification ran against `/ui-kit`**, not the demo org: this container has no
   Directus credentials (only the CI dummy env). `/ui-kit` renders every primitive without a
   session; Spotlight there takes local `destinations` / `searchFn` props, so "finds a member,
   navigates" is the real component over sample data. **The `/api/search` route itself has not
   run against a live Directus** — first thing to check on the preview deploy.
7. **`pnpm generate:types` not run** — no prod credentials here; nothing in 1a changes schema.

Gates (this branch): typecheck 0 · vitest 95 files / 1616 tests · build green · `audit:hairline-surfaces` 0
(baseline 0) · browser script 69/69 — `scripts/browser/verify-p1a-shell.cjs` (light + dark, reduced transparency, reduced motion).

Operator TODOs (Peter):

- [ ] **Public site has the same backdrop-filter bug** (out of this phase's scope, left as is):
      `Org/Landing/LandingNav.vue`, `Org/Landing/LandingDrawer.vue`, `assets/css/landing.css` (3),
      `assets/css/theme.css:951` (`.t-scrim`). Same one-line reorder; the tripwire test skips
      those paths — remove the skip when they are fixed.

- [ ] On the preview deploy, sign in as an HOA admin, press ⌘K, type a member's surname:
      confirm the Members group appears and Enter opens that member's form. Then as a board
      member (no Channels group) and as a resident (destinations only, no records).
- [ ] Eyeball the glass Card (`ui/card` → `glass-edge glass-refract`) on a classic/luxury org's
      workspace — the rim replaces a 1px border everywhere `<Card>` is used.

#### Phase 1b — sweep recipes (hand each to ONE Sonnet 5.5 subagent with its file list)

Re-run `scripts/browser/verify-p1a-shell.cjs` after the sweeps.

Rules for every sweep: edit only the listed files; no other refactors; keep comments; run
`pnpm vitest run` + typecheck after; return `git diff --stat` and a one-line note per file of
anything that did not fit the recipe. The main session reviews the diff, not the files.

**Sweep A — native `confirm()` / `alert()` → `useConfirm()` (32 calls, 18 files).**
Files: `Documents/CategoryManager.vue:151`, `teams/TeamManager.vue:117`,
`ui/tiptap/TiptapEditor.vue:159,183`, `projects/ProjectGantt.vue:247`,
`projects/ProjectTimeline.vue:66`, `channels/ChannelMessage.vue:124,149`,
`comments/CommentItem.vue:105`, `pages/SettingsPropertyManagementPage.vue:251`,
`pages/MembersPage.vue:449,646,683,699,806`, `pages/LandingBuilderPage.vue:287,302`,
`pages/UsersPage.vue:293`, `pages/MeetingsAdminPage.vue:398`, `pages/DocumentsPage.vue:211,350`,
`pages/UnitsPage.vue:149`, `pages/[slug]/admin/projects/[id].vue:114`,
`pages/[slug]/admin/units/[id].vue:106`, `pages/[slug]/profile/index.vue:124`,
`pages/[slug]/rules/index.vue:153`, `pages/billing/[accountId].vue:92,107,138,157,174,193`
(all under `app/components/` or `app/`). NOT a call site: `storage/FilePickerDialog.vue`
(`confirm` is a local function there).
Recipe:
1. In `<script setup>`, before any top-level `await`, add `const { confirm } = useConfirm();`
   (auto-imported; no import line). If the file already has a local named `confirm`, alias:
   `const { confirm: askConfirm } = useConfirm();`.
2. `if (!confirm(X)) return;` → `if (!(await confirm({ title: …, body: …, destructive: … }))) return;`
   and make the enclosing function `async`. Split the native message: the question becomes
   `title` (sentence case, drop "Are you sure you want to"), the consequence sentence becomes
   `body`. `destructive: true` for delete/remove/archive/reject/detach/cancel-invitation.
   Give `confirmLabel` the verb in Title Case ("Delete", "Archive", "Reject", "Remove").
3. `if (confirm(X)) { … }` → `if (await confirm({ … })) { … }`, same rules.
4. An `alert()` that reports an ERROR (`alert(e?.data?.message || "Failed …")`) → `toast.error(…)`
   from `vue-sonner` (import it if the file does not), NOT `useConfirm().alert`. An `alert()`
   that tells the user something they must acknowledge → `await alert({ title })` from
   `useConfirm()`.
5. `LandingBuilderPage.vue:302` is a route-leave guard returning `false`: keep it synchronous
   only if the guard API cannot await; `onBeforeRouteLeave` accepts an async function, so
   `return await confirm({ title: "Leave without saving?", body: "Your changes will be lost.", confirmLabel: "Leave", destructive: true })`.
6. Then add a Phase-8 note, not an audit: `grep -rnE "(^|[^.\w])(window\.)?(confirm|alert)\(" app core/app`
   must list only `useConfirm` / `FilePickerDialog` lines.

**Sweep B — raw date inputs → `DateInput` / `DateTimeInput` (26 inputs, 18 files — more than
the plan's 18).** Files: `Documents/DocumentBatchEdit.vue:264`, `projects/ProjectGantt.vue:462,535`,
`projects/ProjectTimeline.vue:143`, `projects/ProjectForm.vue:125,129`, `units/PetForm.vue:114`,
`units/LeaseForm.vue:85,89`, `units/VehicleForm.vue:114`, `Settings/PaymentSettingsForm.vue:99`,
`panels/TaskPanel.vue:98`, `requests/RequestForm.vue:139`, `polls/PollForm.vue:97`,
`pages/SettingsPropertyManagementPage.vue:675,679`, `pages/MembersPage.vue:1593,1601`,
`pages/EmailComposePage.vue:1517` (datetime-local), `pages/MeetingsAdminPage.vue:576`,
`pages/[slug]/admin/expenses/index.vue:230,234`, `pages/[slug]/admin/payments/index.vue:422,423`,
`pages/[slug]/rules/index.vue:301`.
Recipe:
1. `<Input v-model="X" type="date" … />` or `<input v-model="X" type="date" class="…" />` →
   `<DateInput v-model="X" … />`. `type="datetime-local"` → `<DateTimeInput v-model="X" … />`.
   No import (auto-registered from `ui/date-input/index.ts`).
2. Keep `id`, `name`, `required`, `disabled`, `min`, `max` (strings, "YYYY-MM-DD"), `v-if`/`v-else`.
   DROP field-look classes (`t-input`, `glass-field`, `rounded-*`, `px-*`, `py-*`, `text-sm`,
   `border*`, `bg-*`) — DateInput is the glass pill; KEEP layout classes (`w-full`, `mt-*`,
   `flex-1`, `col-span-*`, `max-w-*`).
3. `:value="X" @input="X = $event.target.value"` or `@change` → `v-model="X"`; a handler that
   does more → `:model-value="X" @update:model-value="(v) => handler(v)"` (v is the same string
   `$event.target.value` was).
4. `MeetingsAdminPage.vue:576` pairs a date input with a separate `type="time"` input
   (`meeting_date_date` + a time field): convert the date one only; do NOT merge them into a
   DateTimeInput in this sweep — note it for Phase 9.
5. Do not touch Org/Landing*, LandingBuilder/* (public site).

**Sweep C — stone/gray → tokens (15 files).** `EmailBuilder/BlockItem.vue`, `Marketing/Landing.vue`,
`Payment/{Methods,SubscriptionForm,StripeCard}.vue`, `PermissionsDiagnostic.vue`, `OrgSelector.vue`,
`App/Footer.vue`, `pages/{[slug]/index,your-data,property-managers,experimental,account,setup/complete}.vue`,
`pages/billing/[accountId].vue`. Map: `text-gray|stone-900/800/700` → `t-text`;
`-600/500` → `t-text-secondary`; `-400/300` → `t-text-muted`; `bg-gray|stone-50/100` →
`t-bg-subtle`; `bg-…-200` → `t-bg-elevated`; `border-…-100/200/300` → `t-border`;
`dark:*-gray|stone-*` → delete (the tokens are already mode-aware). Before the sweep, record the
count: `grep -rcE "\b(text|bg|border|ring|divide|placeholder|from|to|via)-(gray|stone)-[0-9]+" <files>`
— that is the Phase 8 `color-literals` baseline; after, it must be 0 for these files.
`Marketing/Landing.vue` and `[slug]/index.vue` are public-facing: convert, but screenshot them
before and after (they are the only two where a token can read differently from the literal).

**Sweep D — create flows → `AppBottomSheet` (6).** `channels/CreateChannelModal.vue:97`,
`pages/MembersPage.vue:1419` (add/edit member — "invite" is a tab, not a dialog, so this is the
member form), `pages/UnitsPage.vue:263`, `pages/MeetingsAdminPage.vue:538`,
`pages/DocumentsPage.vue:848` (batch upload), and new request — `pages/[slug]/admin/requests/index.vue:92`
and `pages/[slug]/requests/index.vue:55` render `RequestsRequestForm` INLINE in an `ios-card`
under `v-if="showNew"`; move that into a sheet.
Recipe:
1. `<Dialog v-model:open="S"><DialogContent class="…max-w-…"><DialogHeader><DialogTitle>T</DialogTitle><DialogDescription>D</DialogDescription></DialogHeader> BODY <DialogFooter> BTNS </DialogFooter></DialogContent></Dialog>`
   → `<AppBottomSheet v-model:open="S" title="T" description="D" size="…"> BODY <template #footer> BTNS </template></AppBottomSheet>`.
   size: `max-w-md`/`sm:max-w-md` → `sm`; none/`max-w-lg` → `md`; `max-w-2xl`+ → `lg`.
2. A `<form @submit.prevent>` that wraps body AND footer: keep the form around the body, give it
   an `id`, and make the footer's submit button `type="submit" :form="id"`.
3. Drop now-unused Dialog imports. Footer order: secondary (`variant="ghost"` or `outline`)
   first, the one primary last.
4. `persistent` only if the dialog previously blocked outside-click/Esc
   (`@interact-outside.prevent` / `@escape-key-down.prevent`).
5. Requests: `<AppBottomSheet v-model:open="showNew" title="New request">` around the existing
   `RequestsRequestForm`; `@cancel="showNew = false"` unchanged; delete the `ios-card` wrapper.

**Sweep E — teaching empty states (8).** Members `pages/MembersPage.vue:1142`, Units
`pages/UnitsPage.vue:250`, Documents `pages/DocumentsPage.vue:800`, Meetings
`pages/MeetingsAdminPage.vue:524`, Requests `requests/RequestList.vue:58` (bare `<p>`), Projects
`pages/[slug]/admin/projects/index.vue:124` (bare `<p>`), Channels `channels/ChannelsList.vue:418`
(bare `<p>`), Email `pages/EmailPage.vue:370` (only the `activeTab === 'all'` first-run case).
Recipe: the FIRST-RUN state only (nothing exists yet — never the filtered/search-empty state) →
`<AppEmptyState icon title description :steps footnote><template #actions>CTA</template></AppEmptyState>`.
Title = what would be here, sentence case ("Add your community's units"); 2–4 steps, imperative,
one action each; the CTA calls the page's EXISTING create handler (do not invent flows) with a
Title Case label; at most one filled `Button` — a second CTA is `variant="outline"`.
Inside a card or table body use `size="sm"`. Bare `<p>` states: replace the `<p>` (and its
sibling button, if any) with the component.

#### Phase 1b — kickoff prompt (Sonnet 5.5, effort high)

```
Continue the Earnest Parity Round 3 programme for HOA Connect. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log (Session 2 especially: its five sweep recipes are this
session's whole job), §Token budget, and the Phase 1 section. Do not read the
rest, do not re-survey Earnest, and never open docs/plan-earnest-parity-round2.md.

This session = Phase 1b (the sweeps) ONLY, on Sonnet 5.5 at effort high. The
primitives already exist (useConfirm, DateInput/DateTimeInput, AppBottomSheet
size, AppEmptyState steps/#actions, the token map); do not change them. Run
sweeps A–E exactly as written, each handed to ONE Sonnet 5.5 subagent with its
file list and recipe; the main session reviews `git diff --stat` and spot-checks
three files per sweep — it does not read every file. One commit per sweep.

Cloud session: branch feat/parity3-p1b-sweeps off main (after the 1a PR has
merged; if it has not, branch off feat/parity3-p1a-shell-primitives and say so
in the PR), push it, open a DRAFT PR, never push to main — it auto-deploys.
`pnpm install --frozen-lockfile` first.

Gates, per commit, serially and in the background, reading only the tail:
typecheck 0 (NODE_OPTIONS=--max-old-space-size=6144 and the CI dummy env:
DIRECTUS_URL=http://localhost:8055 DIRECTUS_STATIC_TOKEN=ci-dummy-token
NUXT_SESSION_PASSWORD=ci-dummy-session-password-at-least-32-chars), vitest green,
build green, `pnpm audit:hairline-surfaces` at 0. After the last sweep, build,
start `.output/server/index.mjs` on :3123 with the same env, and run
`NODE_PATH=$(npm root -g) node scripts/browser/verify-p1a-shell.cjs http://localhost:3123`
(must stay 69/69). If the container has Directus credentials, also click
through one converted create flow and one confirm on the demo org in light and
dark; if not, say so in the Session log.

Deliverable checks: the native-dialog grep in sweep A lists only useConfirm /
FilePickerDialog; `grep -rnE 'type="(date|datetime-local)"' app core/app`
lists only ui/date-input docblocks and the public site; the sweep C files have
0 gray-/stone- literals (record the before-count as the color-literals
baseline); six create flows open in AppBottomSheet; eight first-run empty
states teach.

When done: mark Phase 1 [x] in the Status row, append Session 3 to the Session
log (shipped, deviations, operator TODOs), write the Phase 2 kickoff prompt
(Opus 5.5, effort xhigh), and stop.
```

**Session 3 — Phase 1b: the sweeps** (2026-11-02) — local session, worked directly on `main`
(Peter's instruction; the kickoff's cloud-branch / draft-PR steps did not apply). Five local
commits on top of `7cd3e97`, **not pushed** — `main` auto-deploys, so push is Peter's call.
Each sweep was one Sonnet 5.5 subagent with the recipe above; the main session reviewed
`git diff --stat` and spot-checked three files per sweep.

Shipped:

- **A — `298dc89`**: 32 native `confirm()`/`alert()` calls in 19 files → `useConfirm()`. Error
  alerts (TiptapEditor ×2, four in `billing/[accountId].vue`) became `toast.error`; the
  acknowledge-only "invitation could not be sent" alert is `await alert({…})`. The native-dialog
  grep now lists only `FilePickerDialog`'s local `confirm`, the `/ui-kit` docblock and
  `useConfirm.ts` comments.
- **B — `648995b`**: 27 date inputs in 19 files → `DateInput` (26 listed + the dynamic
  `field.type === 'date'` branch in `requests/RequestDetail.vue`, found by the subagent's wider
  grep). `grep 'type="(date|datetime-local)"'` lists only `ui/date-input` docblocks.
- **C — `45c0924`**: 15 files, **80 gray/stone literals → 0**. **`color-literals` baseline for
  Phase 8 = 80 before / 0 after** for these 15 files (per-file counts were recorded before the
  sweep: Methods 14, experimental 10, Landing 9, Footer 7, SubscriptionForm 6, StripeCard 6,
  your-data 5, property-managers 5, account 5, BlockItem 3, `[slug]/index` 3, PermissionsDiagnostic 2,
  OrgSelector 2, `billing/[accountId]` 2, setup/complete 1).
- **D — `89ba31a`**: six create flows in `AppBottomSheet` (seven call sites; Requests is two
  pages): CreateChannelModal (`sm`), member add/edit (`md`), UnitsPage (`sm`), MeetingsAdminPage
  (`lg`; one dialog serves create AND edit), DocumentsPage batch upload (`lg`), admin + member
  new request (the inline `ios-card` is gone). Other dialogs on those pages (Board Position, new
  folder, …) are untouched. None of the old dialogs blocked outside-click, so none is `persistent`.
- **E — `ef7f13e`**: teaching first-run empty states on Members, Units, Documents, Meetings,
  Requests, Projects, Channels, Email.

Deviations and judgment calls:

1. **Sweep C leaves hex in disguise.** The token map has no fixed-dark surface, so the
   always-dark `bg/from/via/to-gray-900|800` (CTA + hero gradients in `Marketing/Landing`,
   `your-data`, `property-managers`, `experimental`) became bracket hex `#111827` / `#1f2937` —
   pixel-identical, but a future `color-literals` audit will not see them. **Phase 8: add a
   dark-surface token (or `bg-ink`) and re-census.** Other token substitutions outside the map:
   `border-gray-400` → `t-border-secondary`, `border-gray-800` → `t-border`, `bg-gray-400` status
   dots and the spinner borders → `var(--theme-text-muted|primary)` (there are no `ring/divide/
   placeholder/from/to/via` token utilities), and `Payment/Methods.vue`'s three `@apply` blocks
   became plain CSS on the theme variables (`@apply` cannot take `.t-*`).
2. **Public landing nav changes colour.** The scrolled nav pair `bg-white/90 dark:bg-gray-900/90`
   became `bg-[var(--theme-bg-overlay)]` (alpha 0.95) in `Marketing/Landing`, `your-data`,
   `property-managers`, `experimental`: cream instead of pure white in light, the theme's dark
   brown instead of slate in dark. `[slug]/index.vue`'s loading/error text moved to the theme text
   tokens. **I did not take the before/after screenshots the recipe asks for** — see TODOs.
3. **Sweep A rewrites**: `billing/[accountId]` detach confirm lost its `•` bullet lines (the
   dialog body is plain text); `projects/[id]` `deleteWarning` computed returns `{title, body}`;
   `units/[id]` uses the existing `label` as title with `confirmLabel: "End"`; MembersPage cancel-
   invitation uses `cancelLabel: "Keep"`; ChannelMessage "Hide" is non-destructive.
4. **Sweep B**: `DocumentBatchEdit` and `TaskPanel` had handlers that only used the event as a
   change signal; they are now `@update:model-value`. `MeetingsAdminPage`'s separate `type="time"`
   input stays — merging into one `DateTimeInput` is **Phase 9**.
5. **Sweep E changes beyond the recipe** (each needed to keep first-run and filtered-empty apart):
   `RequestList` gained a `filtered` prop and an `#empty-actions` slot, and the main session wired
   its three parents (`admin/requests`, `requests`, `manage/inquiries`; the inquiries CTA keeps
   its `canCreateViolation` gate). Members and Projects now render a `variant="search"` state when
   filters empty a non-empty list. **Documents**: the old `documentTree.length === 0` was
   effectively never true (the tree always has a root), so first-run is now
   `!documents?.length && category === 'all' && status === 'published'` — an org holding only
   draft/archived documents sees first-run under the default filters. **Channels**: non-admins see
   the steps without a CTA (the steps read as admin actions). Members offers two CTAs (filled
   "Add Member", outline "Invite Member").
6. **Browser verification** ran against the built server on :3123 (CI dummy env), not the demo
   org. **The Directus click-through of a converted create flow and a confirm in light/dark was
   NOT done**: it needs a signed-in session on the demo org, and I do not enter passwords. This
   machine's `.env` does have Directus credentials.
7. Gates ran as `scripts` in the scratchpad (typecheck → vitest → audit → build, serially) per
   commit; the husky pre-commit hook also ran the hairline audit.

Gates (every commit A–E, last run on E's tree): typecheck 0 · vitest 96 files / 1650 tests ·
build green · `audit:hairline-surfaces` 0 (baseline 0).

Browser script `verify-p1a-shell.cjs` on the final build: **69/69** — but not on the first
run, and not unmodified: (a) this Mac has the system **Reduce Transparency** setting on, so
`prefers-reduced-transparency` matches by default in headless Chromium and 18 "is strong glass"
assertions fail (overlays correctly fall back to opaque); I ran a scratchpad copy that
emulates `no-preference` in `runMode` and got 68/69, (b) the one failure, `[light] Spotlight
closes on navigate`, passed on the immediate rerun (69/69) and on dark both times — a timing
flake, not a regression. The Playwright package is not installed in this repo; I installed
`playwright@1.63.0` in the scratchpad (matches the cached Chromium 1243) and used
`NODE_PATH`.

Operator TODOs (Peter):

- [ ] **Push is yours**: five local commits on `main` (`298dc89`..`ef7f13e`); review, then push
      or open a PR — `main` auto-deploys.
- [ ] On the preview deploy as an admin, in light and dark: open one converted create flow
      (e.g. Units → Add Unit, and Requests → New Request), one confirm (e.g. delete a message in
      Channels), a date field, and the empty states on a fresh org. Confirm focus lands on Cancel
      and the sheet is a dialog ≥ md.
- [ ] Eyeball the public pages whose colours moved: `Marketing/Landing` (scrolled nav bar, icon-
      circle borders) and `[slug]/index` (loading/error text) in light and dark.
- [ ] A Documents org with only draft/archived documents shows the first-run state (deviation 5);
      decide whether that is acceptable.
- [ ] Make `verify-p1a-shell.cjs` set `prefers-reduced-transparency: no-preference` in
      `runMode` itself so it passes on a machine with Reduce Transparency on, and wait for the
      route change in the Spotlight assertion (Phase 8 audit work or earlier).

#### Phase 2 — kickoff prompt (Opus 5.5, effort xhigh)

```
Continue the Earnest Parity Round 3 programme for HOA Connect. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log (Session 2 for the primitives and motion module,
Session 3 for what Phase 1b changed), §Token budget, and the Phase 2 section.
Do not read the rest, do not re-survey Earnest beyond the files Phase 2
names (AppHeader/AppHeaderOutlet, useTitleCollapse, AppCreateMenu, the apps
shell, the App Library grid), and never open docs/plan-earnest-parity-round2.md.

This session = Phase 2 (Dock, navigation and page-title system) ONLY, on
Opus 5.5 at effort xhigh. Earnest reference checkout: ~/Sites/earnest/earnest.
Reuse what exists: `core/shared/motion` (never hand-write a cubic-bezier),
`useConfirm`, `AppBottomSheet` (size), `DateInput`, `AppEmptyState`, the
`/api/search` registry and `App/Spotlight.vue` (the create verbs from item 2.4
feed Spotlight's reserved third group), `useAppNav` / `useSectionNav`. The
public site (Org/Landing/*, LandingBuilder/*, the public theme) is out of scope.

Local session: work on main, ask before pushing (five Phase 1b commits are
already on local main, unpushed — mention that, do not push them silently).
Tool shells may have no node/pnpm: run `eval "$(/usr/local/bin/fnm env)"`.

Token rules: Haiku 5.5 subagents for census/grep, Sonnet 5.5 for N-file
sweeps with an exact recipe (e.g. migrating PageHeader callers to
usePageTitle); review diffs, not files. Gates run in the background; read
only the tail. Typecheck with NODE_OPTIONS=--max-old-space-size=6144 and the
CI dummy env (DIRECTUS_URL=http://localhost:8055 DIRECTUS_STATIC_TOKEN=ci-dummy-token
NUXT_SESSION_PASSWORD=ci-dummy-session-password-at-least-32-chars).

Quality gate, per commit: typecheck 0, vitest green, build green (serially),
`pnpm audit:hairline-surfaces` at 0, org-scope tests for every new endpoint
or prefs write. Browser verification is one headless Playwright script
(extend scripts/browser/ with a verify-p2-nav script; Playwright is not in
the repo — install playwright@1.63.0 in the scratchpad and use NODE_PATH,
and emulate prefers-reduced-transparency: no-preference since Reduce
Transparency may be on at the OS level). Verify in BOTH light and dark; with
a real session on the demo org if credentials/session are available
(`/api/demo/login`), and say so in the Session log if not. Delete every row
you create; `demo-classic` is a CONTROL — diff both orgs before and after.
`pnpm generate:types` after the `directus_users.app_prefs` change if prod
credentials are available.

When done: update the Status row, append Session 4 to the Session log
(shipped, deviations, operator TODOs), write the Phase 3a kickoff prompt
(Opus 5.5, effort xhigh), and stop. One phase per session.
```

**Session 4 — Phase 2: dock, navigation and page-title system** (2026-11-02) — local session on
`main` (not pushed; `main` auto-deploys, so push is Peter's call). Phase 1b's five commits were
already on `origin/main` when this session started.

Shipped (one code commit, `6ea771c` — Nav.vue and useAppNav.ts carry hunks from four of the
seven items, so per-item commits would each have needed a hand-split file and its own build):

- **2.1 Channels inside the shell.** `layouts/channels.vue` is gone. `admin/channels/index` and
  `[channel]` use `auth` with `definePageMeta({ immersive: true })` (typed in
  `app/types/page-meta.d.ts`): the shell pins to `h-dvh`, the footer hides, the dock and SubNav
  stay, and `<main>` pads its foot for the floating dock at md+ (5.5rem, 6.5rem with labels).
  One component, `channels/ChannelsWorkspace.vue` (list + thread or org-wide search + the create
  modal), serves both full-height pages and the Communications hub, which embeds it at
  `min(70vh, 40rem)`; picking a channel in the hub opens the full-height page.
- **2.2 Nothing orphaned.** Comms children are Email · Channels · **Polls** (`/polls` — the
  member route already carries the create form and results for whoever the polls routes call a
  manager, like Board and Rules); Requests children gain **Leads** (`/admin/leads`, ungated);
  the member dock gains **Polls**. Vendors (`/admin/vendors`, People) and Rules (`/rules`,
  Records) were already in `useSectionNav` — the plan was written against `1c96ab4`.
- **2.3 Dock prefs per user.** `core/shared/nav/app-prefs.ts` (shape, `sanitizeAppPrefs`,
  `mergeAppPrefs`); `GET`/`PATCH /api/user/app-prefs` — the session's user only, body reduced to
  the four dock keys before the admin-token write, GET degrades to `available: false` and PATCH
  503s while the field is missing; `scripts/add-user-app-prefs-field.ts`
  (`pnpm add:user-app-prefs`). `useAppNav` paints from the localStorage cache, pulls the account
  copy once per signed-in user per load (a choice made while the pull is in flight wins), and
  pushes every change debounced. `tests/server/app-prefs.test.ts` (12). Stale "only relevant for
  modern orgs" comment in Nav.vue replaced. No org level: HOA has no org dock default to resolve.
- **2.4 Create verbs.** `core/shared/create-verbs.ts` — eleven verbs, one gate
  (`visibleVerbs`: admin of the org being viewed, not previewing as member, module on) and
  Spotlight's matcher (`matchVerbs`); `useCreateVerbs()`; `useCreateIntent(verb, open)` — a page
  opens its OWN form for `?new=<verb>` and then drops the param. `App/CreateMenu.vue` is the
  Nav's "+ New" pill; Spotlight's reserved third group is "Create". Wired into Units, Meetings,
  Documents, Requests, Projects, Payments, Expenses, Polls, Channels; Members uses its existing
  `?tab=invite`, New Email links to Compose. `tests/shared/create-verbs.test.ts` (11).
- **2.5 Page-title system.** `usePageTitle()` / `useTitleCollapse()`; `App/HeaderOutlet.vue`
  mounted once in `auth.vue` above `<main>`. `App/PageHeader.vue` keeps its props and now
  registers instead of rendering, teleporting `#actions` / `#meta` — so **none of the 21 callers
  changed** (no sweep was needed). The title swaps in place (exit curve out, spring in);
  scrolled under the chrome it hands a compact copy to the Nav's centre (tap → top) and the Nav
  earns its hairline (`app-nav--earned`; permanent rule kept outside the workspace).
- **2.6 App Library.** Below md the dock is `display: none`; the Nav's grid button opens
  `App/AppLibrary.vue` — the dock's apps, accents, badges and active app (new
  `useDockApps()`, which Dock.vue now uses too) in a four-column panel hung from the bar, chips on
  `apps-chip-in` with a 28ms stagger; mount-closed/after-first-frame per the overlay policy; Esc,
  outside tap and navigation close it.
- **2.7 Directional transitions.** `core/shared/nav/page-transition.ts` (`pickPageTransition`,
  pure): across dock apps → `page-forward`/`page-back` in DOCK order; across a section's SubNav
  pills → new `floor-forward`/`floor-back` (24px + fade on `--motion-base`); drill-downs keep the
  history-stack push/pop; same path → fade. Page slides moved from `--spring-out` to `--spring`
  (the module's positional curve). `tests/shared/page-transition.test.ts` (8). The page swap's
  `onLeave`/`onEnter` are now `settleTransition()` (motion module, ported from Earnest's
  `settle()`): end on the element's own `transitionend` or after its longest transition, at
  once with none (reduced motion) or when the node is a comment — see deviation 7.
- `/ui-kit` gains a Navigation section (App Library specimen, the eleven verbs, the inline
  page header, the motion rules).

Deviations and judgment calls:

1. **`app_prefs` is not provisioned.** Running `pnpm add:user-app-prefs` against Directus was
   blocked by this environment's permission classifier as a production change, so the field
   does not exist yet and `pnpm generate:types` was not run; `app_prefs` was hand-added to
   `DirectusUser` in `core/types/directus.ts` exactly as the generator writes a JSON field.
   Until the script runs, the dock prefs behave as before (per device) — by design, not by
   accident: GET says `available: false`, PATCH 503s, the client keeps its cache.
2. **"Record payment" is "New Charge".** No record-payment flow exists; the payments page's
   create is a charge (payment request). The verb matches "record payment", "dues",
   "assessment".
3. **Create verbs gate on admin + module, not the capability matrix.** Every host page sits
   behind the `admin` middleware, so a matrix grant (a treasurer's `money:write`) would only
   offer a door that redirects. New Poll is admin-only in the menu even though a PM on the
   `feedback` grant can create on `/polls` itself.
4. **Inline-until-mounted on a cold load.** The outlet cannot server-render the title (SSR
   renders the layout before the page), so AppPageHeader renders inline on the server and
   through hydration, then hands off at mount at the same position (the outlet reproduces
   PageContainer's 1.5rem top). Pages whose header is not the first thing in its container
   (EmailPage, after the Communications tabs) see the title move above the tabs — once, on a
   cold load; client navigations never draw it inline.
5. **The mobile Nav sheet still lists the admin apps** — redundant with the App Library now;
   left for Phase 9's nav-orphan pass rather than widen this diff.
6. **Browser verification ran with a real session on the demo org** — `scripts/browser/
   verify-p2-nav.cjs`, against a local build using the project's `.env` (the Directus behind
   it), signed in through `POST /api/demo/login` (no password typed): **72/72, three
   consecutive runs**, light and dark, desktop and 390px, reduced motion, plus 14 `/ui-kit`
   checks that need no session. It creates nothing (create flows are opened and dismissed);
   `demo` and `demo-classic` row counts (members, units, meetings, documents, requests,
   projects, channels, polls, expenses, payment requests) are identical before and after. Two
   harness facts worth knowing: the script suppresses the once-per-release "What's new" sheet
   (it covers the first page in a fresh browser), and it moves with the router after boot —
   see the next point.
7. **Found while verifying, fixed here:** a page whose root renders as a comment (`<!---->`)
   made the new settle hook throw inside Vue's transition, so the out-in swap never finished
   and `<main>` stayed empty through every later navigation. `settleTransition` now ends at
   once for a non-element; `tests/shared/motion-tokens.test.ts` pins it (6 new tests in all).
8. **Found while verifying, NOT fixed (pre-existing, out of scope):** during SSR,
   `useSelectedOrg` reads memberships with plain `$fetch("/api/directus/items")`, which does not
   carry the request's cookies, so the items route runs as the public role and Directus
   answers FORBIDDEN. The server therefore renders a signed-in admin as a visitor: a hard load
   of any `/{slug}/admin/*` URL 302s to the org root, and "Try the demo" (POST, then
   `window.location.assign("/demo")`) lands on the public landing. Client-side navigation is
   unaffected (the browser sends the cookie), which is why the app mostly works. Seen locally
   against the `.env` Directus; **check prod** (hard-refresh an admin page while signed in).
   The fix is `useRequestFetch()` (or forwarded headers) for SSR reads in `useDirectusItems`.
   The verify script works around it: after the demo sign-in it refreshes the app's data
   client-side once, then navigates with the router.

Gates (final tree, `6ea771c`): typecheck 0 · vitest 99 files / 1687 tests · build green ·
`audit:hairline-surfaces` 0 (baseline 0) · `verify-p2-nav.cjs` 72/72 ×3.

Operator TODOs (Peter):

- [x] **Push is yours**: one code commit + one docs commit on local `main`. *(Pushed 2026-11-02.)*
- [x] **Provision `app_prefs`**: `pnpm add:user-app-prefs`, then `pnpm generate:types`. *(Ran
      2026-11-03; the only diff was the field's description note, committed with this update.)*
      Still to do: signed in on two browsers, change the dock palette in one and reload the other.
- [ ] On the preview deploy, eyeball a cold load of Members and Email: the title should not
      jump at hydration (Email's moves above its tabs, once — deviation 4).
- [x] **SSR membership read (deviation 8)**: hard-refresh `/{slug}/admin/members` signed in on
      prod; if it bounces to the org root, that is this bug — worth its own session before
      launch (it also breaks the demo button's landing). *(Fixed in `a1b8387` — Session 4b.)*
- [ ] Phone check on a real device: the App Library grid from the Nav's grid button, and
      Channels with the dock (md+) not covering the composer.

**Session 4b — Phase 2 follow-ups: SSR membership read, blank `<main>` on a mid-load
navigation** (2026-11-03) — local, on `main`, not pushed. Two commits, both found by
verifying Phase 2:

- **`a1b8387` — SSR auth** (a side session; Peter merged its branch into `main`). Closes
  deviation 8. `useDirectusItems` captures `useRequestFetch()` at setup, so server-side reads
  carry the page request's cookie even after the caller's first `await`. A session cookie
  re-sealed by a token refresh during the render is forwarded to the page response (Directus
  refresh tokens are single-use). `useSelectedOrg`'s server read of `/api/org/selected` uses
  the same fetch. Signed-in hard loads of `/{slug}/admin/*` now return 200 (they 302'd to the
  org root), and "Try the live demo" lands on the dashboard. `tests/composables/
  useDirectusItems.test.ts` (6). `verify-p2-nav.cjs` drops its boot workaround and
  hard-loads `/demo/admin/members`.
- **`5a2df08` — blank `<main>` after navigating mid-load.** Navigating while the page on
  screen is still awaiting its setup makes Nuxt re-key NuxtPage's `<Suspense>`
  (`suspenseKey++`). app.vue's `<Transition mode="out-in">` then leaves the old Suspense and
  holds an empty placeholder until a hand-off that Vue never makes for a Suspense child.
  `<main>` stayed `<!--[--><!----><!--]-->` for every later page until a full reload.
  - **Not Channels-specific.** Channels was simply the next page in the side session's
    repro; any page could be hit.
  - **Older than Phase 2.** The out-in transition dates from `9bf3b98`. Phase 2 made it
    easier to reach: Channels joined the shared layout, and the dock invites quick app
    switches.
  - **Easy to hit here.** Against the `.env` Directus a page takes 0.05–1.9s to resolve, so
    a second click inside that window hits it. A race script (push, then push again 30–141ms
    later) blanked 6 of 8 before the fix and 0 of 8 after.
  - **The fix.** `PAGE_CUT` and `shouldCutPageTransition` live in
    `core/shared/nav/page-transition.ts`. app.vue keeps `page-transition-pending` from
    `page:start` / `page:finish`. The middleware names a navigation away from a still-loading
    page `page-cut`, which app.vue plays with `mode: "default"` (explicitly — an absent mode is
    filled with out-in from `app.pageTransition`) and both phases ended at once. The name is
    read when a phase runs, because the page on screen leaves through the hooks it entered
    with.
  - **What the user sees on a cut.** The old page goes at once, and the next appears when
    ready, without the slide. That happens only when someone moves before the page has
    loaded.
  - **Channels' opt-out now works.** The same cut honours `definePageMeta({ pageTransition:
    false })` between two such routes (channel → channel), which app.vue's explicit
    `:transition` had been overriding (NuxtPage merges a `false` meta away).
  - **Tests.** `tests/shared/page-transition-cut.test.ts` reproduces the stranding on Vue's
    own `<Transition>` + `<Suspense>` and pins the cut's recovery.
    `tests/shared/page-transition.test.ts` +8: the decision table, and the middleware,
    including the history stack surviving a cut.
- **Harness.** `verify-p2-nav.cjs` gains the mid-load race: four pairs, in both modes, never
  blank and the cut engages. Its create-intent checks now wait for the form instead of a
  fixed 1.2s. Meetings resolves in about 1.3–1.9s here, so the old pause failed 2 of 3 runs;
  the form always opened.

Not fixed, noted: a hard load of `/demo/admin/members` logs hydration mismatches. The stat
cards and chart empty states render on the server where the client first draws skeletons.
It only became visible because the server now renders the page instead of redirecting.

Gates (final tree): typecheck 0 · vitest 101 files / 1703 tests · build green · `audit:hairline-surfaces` 0 ·
`verify-p2-nav.cjs` **76/76 ×3** (demo session, light + dark) · `demo` / `demo-classic`
snapshots identical before and after.

Operator TODOs (Peter):

- [ ] **Push is yours**: `a1b8387`, `5a2df08` and this docs commit on local `main`.
- [ ] After the deploy, on prod: hard-refresh an admin page while signed in (expect the page,
      not the org landing), and click two dock apps in quick succession (expect the second
      page, never an empty workspace).
- [ ] Members' cold-load hydration mismatches: Phase 9 polish, or a short session of its own.

#### Phase 3a — kickoff prompt (Opus 5.5, effort xhigh)

```
Continue the Earnest Parity Round 3 programme for HOA Connect. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log (Session 1's cron-auth notes, Session 4 and Session
4b are the ones that bear on this phase), §Token budget, and the Phase 3 intro plus
§3a. Do not read §3b onwards, do not re-survey Earnest beyond the files 3a
names (`unsubscribe.ts`, `contact-unsubscribes.ts`, the SendGrid webhook's
`eventAction()`, the `SENDER_ADDRESS_MISSING` refusal), and never open
docs/plan-earnest-parity-round2.md.

This session = Phase 3a (Email: unsubscribe, preferences and suppression)
ONLY, on Opus 5.5 at effort xhigh. Earnest reference checkout:
~/Sites/earnest/earnest. Reuse what exists: `residencyFor()` and the audience
resolution in `sendEmailJob.resolveRecipients` / `send.post.ts` / the digest
worker, `email-branding.ts`, `email/activity.post.ts`, the 10-category
notification matrix (`core/shared/notifications/preferences.ts`,
`/api/user/notification-preferences`), the Phase 1 primitives (`useConfirm`,
`AppBottomSheet`, `AppEmptyState`, glass) and Phase 2's `usePageTitle` /
`AppPageHeader` for any new page. A composable that reads during SSR goes
through `useDirectusItems` (it forwards the request's session since
`a1b8387`) — never a bare `$fetch` read in setup. The public site (Org/Landing/*,
LandingBuilder/*, the public theme) is out of scope — the `/unsubscribe` page
is a standalone glass page, not a landing block.

Local session: work on main, ask before pushing (Session 4b's commits,
`a1b8387` onward, may still be unpushed: check `git log origin/main..main`
and say so; never push them silently). Tool shells may have no node/pnpm:
run `eval "$(/usr/local/bin/fnm env)"`.

Schema: the new `hoa_members` fields (email_community_opt_out + _at +
_source, email_bounced + _at + _reason, unsubscribe_token) and the
`hoa_emails` class field go in ONE idempotent script under scripts/ with a
pnpm alias. This environment's permission classifier blocks running such a
script against the production Directus: write it, make every read path
degrade while the fields are missing (Phase 2's app_prefs routes are the
pattern), hand-add the generated types, and leave running it + `pnpm
generate:types` as an operator TODO unless Peter runs it in the session.
Phase 2 left one such TODO already (`pnpm add:user-app-prefs`).

Token rules: Haiku 5.5 subagents for census/grep (e.g. every call site that
sends mail and which class it is), Sonnet 5.5 for N-file sweeps with an exact
recipe; review diffs, not files. Gates run in the background; read only the
tail. Typecheck with NODE_OPTIONS=--max-old-space-size=6144 and the CI dummy
env (DIRECTUS_URL=http://localhost:8055 DIRECTUS_STATIC_TOKEN=ci-dummy-token
NUXT_SESSION_PASSWORD=ci-dummy-session-password-at-least-32-chars).

Quality gate, per commit: typecheck 0, vitest green, build green (serially),
`pnpm audit:hairline-surfaces` at 0, and tests that pin the legal surface:
the one-click route (no auth, idempotent, 200 empty, 503 on a failed read),
token minting and lookup (a token resolves to exactly one member of one org),
the class rules (a newsletter can never be `essential`; opted-out members
drop from `community` only; bounced drop from both), the webhook's
`eventAction()` table, and the missing-address 400. Org-scope tests for every
new endpoint. Browser verification is one headless Playwright script
(scripts/browser/verify-p3a-email.cjs; Playwright is not in the repo —
install playwright@1.63.0 in the scratchpad and use NODE_PATH, and emulate
prefers-reduced-transparency: no-preference) covering the /unsubscribe page
and the resident preferences in BOTH light and dark — with a real session
on the demo org via `/api/demo/login` if the session run is permitted (the
build must use the project's .env), and say so in the Session log if not.
Model it on scripts/browser/verify-p2-nav.cjs (newPage, signIn, `push`,
`visibleDialog`): signed-in hard loads work now (no boot workaround), and
wait on the element you expect, never a fixed beat — pages here take up to
~2s to resolve against Directus. Known and not yours: Members logs
hydration mismatches on a cold load, and a navigation made before the
current page has loaded cuts instead of sliding (Session 4b).
NO real mail: the demo orgs' guardrails block sends; verify headers and
footers from the assembler's output in tests, never by sending. Delete every
row you create; `demo-classic` is a CONTROL — diff both orgs before and
after.

When done: update the Status row, append Session 5 to the Session log
(shipped, deviations, operator TODOs), write the Phase 3b-design kickoff
prompt (Fable 5.1, effort high — a written spec and the named test list, no
code), and stop. One phase per session.
```

**Session 5 — Phase 3a: email classes, unsubscribe, suppression** (2026-11-03) — local, on
`main`, not pushed. At the start `origin/main..main` held Session 4b's four commits
(`a1b8387`, `5a2df08`, `08f08ac`, `3ed7944`); they are still unpushed. One code commit,
`8513eeb`.

Shipped:

- **Two classes.** `core/shared/email/email-class.ts`: `essential` (dues, meetings, violations,
  governance, membership — can't be unsubscribed) and `community` (news — opt-out-able).
  Alert, reminder and notice default to essential. Newsletter, announcement and basic
  default to community. **A newsletter is never essential**: a request for it is refused
  (400 `newsletter_not_essential`) at save, schedule, test and send, never downgraded.
  `hoa_emails.email_class` is stored once the field exists. The composer gains a Delivery
  control, and picking a type resets it to that type's default.
- **Audience.** `partitionAudience`: bounced addresses drop from both classes, opted-out
  members from community only. It applies in `send.post.ts` (explicit ids too — a recipient
  picker is not consent), in `sendEmailJob.resolveRecipients` and in the digest worker
  (which counts as community). The send returns `stats.suppressed`, and the composer's
  toast names it. When everyone selected is held back, the send fails with 400
  `all_recipients_suppressed`.
- **Tokens and routes.** `hoa_members.unsubscribe_token` holds 24 random bytes as base64url
  and is minted lazily at send, in one batch write. The send uses the copy read back from
  the store (`ensureUnsubscribeTokens`); a failed mint never fails the send.
  `findMemberByToken` resolves to exactly one member of one org, or to nobody (two rows →
  nobody).
  - `/unsubscribe`: a standalone glass page (`auth-blank` + `AuthShell`). Opening it
    changes nothing. One tap confirms. It lists what still arrives, offers "Changed your
    mind? Resubscribe", and links to the household page.
  - `GET`/`POST /api/email/unsubscribe` back the page.
  - `POST /api/email/unsubscribe/one-click` (RFC 8058): no auth, 200 with an empty body,
    idempotent, the same 200 for an unknown token, 503 on a failed read or write. `GET` on
    the same URL 302s to the page.
  - `sendOrganizationEmail` takes `headers`. Every community send that has a token carries
    `List-Unsubscribe: <https one-click>` and `List-Unsubscribe-Post`.
- **Footer.** `core/shared/email/unsubscribe.ts` is the assembler.
  - `checkSendCompliance` runs once per send: the class, and for community mail the org's
    postal address. Without the address the send is refused (400 `sender_address_missing`,
    naming Settings → Organization), as Earnest's `SENDER_ADDRESS_MISSING` does.
  - `recipientCompliance` runs once per recipient and returns the headers and the footer.
    Community footer: Unsubscribe · Preferences · address. Essential: "You receive this
    because you are a member of {org}; it cannot be unsubscribed." · Preferences.
  - The footer is in every body: MJML, plain text, raw mode (`appendComplianceFooterHtml`,
    before `</body>`), the dynamic-template branch (appended to `content`, plus
    `unsubscribe_url` / `preferences_url` / `compliance_footer` template keys) and the web
    view (no personal link).
  - Transactional notifications (`transactional-email.ts`) carry the essential footer with
    "notifications" wording.
- **Suppression from the webhook.** `core/shared/email/suppression-events.ts` holds
  `eventAction()`, ported row for row. A hard bounce (`type: bounce`, classification
  Invalid Address / Mailbox Unavailable / none) or a `dropped` "Bounced Address" sets
  `email_bounced` + `_at` + `_reason`. `spamreport` (source `spam`) and
  `unsubscribe`/`group_unsubscribe` (source `link`) set the opt-out. Reputation, content
  and `blocked` bounces do nothing.
  - Matching is case-insensitive, exact, and inside the event's org only. Org-less events
    are never applied.
  - The pass runs **before** any activity row or downstream forward. A failed store answers
    503, so SendGrid's redelivery can't duplicate a row or a forward. Every write is a
    no-op the second time.
- **Members page.** Bounced / Unsubscribed chips beside the name carry the reason. "Clear"
  sits behind `useConfirm`, is admin only, and writes a ledger entry
  (`member_email_status_cleared`, board-only, Access) that keeps the cleared reason. The
  data comes from `GET`/`POST /api/hoa/member-email-status`, a separate read, so the
  roster's own read never names a field that may not exist.
- **Resident preferences.** `Profile/EmailPreferences.vue` is a glass section on
  `/{slug}/profile#email`, where the footer's "Preferences" link lands. It holds the
  community switch (`/api/user/email-subscription`, the session's own membership only), the
  bounced banner, an "Always sent" list, and the master switch plus the 10-category matrix,
  in-app and email. `useNotificationPreferences` gains the email half; the digest stays on
  `/account`.
- **Schema.** `scripts/add-email-compliance-fields.ts` (`pnpm add:email-compliance`) is one
  idempotent script for the seven `hoa_members` fields (the token is unique) and
  `hoa_emails.email_class`. The types are hand-added with the generator's notes.
  `emailComplianceSchema()` probes the fields, caching a yes for the life of the process
  and a no for a minute, and every path degrades until the script has run:
  - sends go out unsuppressed, without a token or header, linking the generic page;
  - the preference reads return `available: false` and the writes 503;
  - the webhook stores the batch and logs that suppression was skipped;
  - the page reports a dead link.
- **Tests (6 files, 111 tests).** Class rules; the `eventAction` table; the assembler's
  output in MJML, text, raw and web view; one-click (no session, 200 empty, idempotent,
  unknown token, malformed token never reaches Directus, 503 read, 503 write); token
  minting and lookup; the schema probe; org scope for every new route (the session's own
  row; an admin of another org gets 403; Clear by id across orgs gets 404); save's new
  gate; send's missing-address 400 before any member read; the class rules end to end
  through `send.post.ts`; webhook ordering and 503.

Deviations and judgment calls:

1. **The postal address is the org's own** `street_address`/`city`/`state`/`zip` (Settings →
   Organization), not `settings.landing`. `landing` holds no address, and `send.post.ts`
   already built the footer address from these fields. "Complete" means a street plus a
   city or a ZIP. Today only `transition-test` lacks one; its community sends now refuse.
2. **`save.post.ts` and `preview.post.ts` now require the `communications` grant.** Save
   previously required *any* session for *any* org. A saved email with status `scheduled`
   is mailed to the whole org by the cron, so saving one is sending one. Found while
   adding the class to save. **Not fixed, same shape:** `email/[id].delete.ts` (delete any
   org's draft) and `email/[id].get.ts` (read any email by id) still require only a session.
3. **The schema script narrows read permissions.** The HOA Member, HOA Admin and Property
   Manager policies read `hoa_members` with `*`. A new token column would therefore reach
   every resident through the items proxy, and with it the power to unsubscribe a
   neighbour. The script rewrites each non-admin-access read permission on `hoa_members`
   to "every current field except the seven". It fails closed: a field added later must be
   added to those policies explicitly. Create and update permissions are untouched, so an
   HOA Admin can still write the flags through Directus directly.
4. **Opt-out sources.** The member's own switch, on the page or the household page, is
   recorded as `link`; the enum has no `self`. SendGrid's `unsubscribe` and
   `group_unsubscribe` are `link`, a spam report is `spam`. The first opt-out's source and
   time are kept; a later event never rewrites why someone left.
5. **Not suppressed yet (left to 3b's sender unification):**
   - Project notifications (`transactional-email.ts`) get the footer, but a bounced user
     still receives them.
   - `scripts/billing-worker.ts` dues reminders don't check `email_bounced`.
   Neither was one of the three audience paths 3a names.
6. **The dynamic-template branch** (when `SENDGRID_EMAIL_TEMPLATE_ID` is set) can't change
   the SendGrid-hosted template. The footer is therefore appended to `{{content}}`, and the
   three new template keys let the template place it itself.
7. **Clear writes to the ledger, not `hoa_activity`.** Clearing an opt-out is a consent
   decision taken for someone else, the one email action a board may later have to show
   was asked for. Board-only, because it names one member's standing.
8. **A compliance refusal fails a scheduled email instead of retrying it.**
   `EmailComplianceRefusal` is thrown by `sendEmailJob`, and `process-scheduled` marks the
   email `failed` rather than rescheduling it every tick. Saving with `status: scheduled`
   checks the address up front, while the admin is on the page.
9. **Before provisioning, the page's GET answers `valid: false`, not 503.** No token can
   exist yet, so "this link no longer works" is the truth. The one-click route keeps its
   503: before provisioning it 503s, which is harmless.
10. **Browser verification ran with a real session on the demo org.** The run used
    `scripts/browser/verify-p3a-email.cjs` against a local build with the project's `.env`,
    signed in through `POST /api/demo/login`, and scored **92/92 on three consecutive
    runs** in light and dark: `/unsubscribe`, the household Email section, the Members
    chips and the composer's Delivery control. **It sent no mail and wrote nothing:**
    - every UI write was intercepted with `page.route`, and the check reads the request
      body;
    - the states that can't exist before provisioning (a provisioned or bounced member, a
      valid token) were answered by the route, and those checks are labelled "(mocked)";
    - everything else is real: the token reads, one-click (503 while unprovisioned), the
      302, the degraded switch.
    Snapshots of `demo` and `demo-classic` (members, emails, recipients, activity, ledger
    and the members' users' notification prefs, all hashed) are **identical** before and
    after. Two harness facts:
    - a hard load of `/unsubscribe` reads during SSR, out of `page.route`'s reach, so the
      mocked states are reached by a router push;
    - a page arriving by the router fades in, so the screenshot waits for full opacity.
      The first dark capture caught it mid-fade at opacity 0, and its text was in fact
      `rgb(233,239,245)`.
11. **Census side findings, not touched (out of scope):**
    - `sendEmail()` and `sendWelcomeEmail()` have no demo guard. `public-inquiry`,
      `inquiry-routing`, `request-join` and `approve-join-request` can therefore send real
      mail from a demo org.
    - `public-inquiry.post.ts` is unauthenticated and has no rate-limit.
    - Invite, welcome and accept sends carry no categories or `custom_args`.
    - `sendBulkEmail()` and `notify.ts`'s email twin have no callers.

Gates (final tree, `8513eeb`): typecheck 0 · vitest 107 files / 1814 tests (from 101 / 1703)
· build green · `audit:hairline-surfaces` 0 · `verify-p3a-email.cjs` **92/92 ×3** (demo
session, light + dark) · `demo` / `demo-classic` snapshots identical before and after.

Operator TODOs (Peter):

- [ ] **Push is yours**: Session 4b's four commits, `8513eeb` and this docs commit, all on
      local `main`.
- [x] **Provision**: `pnpm add:email-compliance`, then `pnpm generate:types`. *(Ran 2026-11-03:
      all eight fields created, HOA Admin / HOA Member / Property Manager read narrowed to 28
      fields; types regenerated with no diff on these fields.)*
- [ ] **After provisioning, one real community test** from a non-demo org to your own
      address (demo orgs block mail):
      - Gmail shows "Unsubscribe" beside the sender;
      - the footer links work;
      - Gmail's button lands a one-click;
      - the member shows "Unsubscribed" on the Members page.
      Clear it there, then check the ledger entry.
- [ ] **SendGrid Event Webhook**: confirm it sends Bounced, Dropped, Spam Reports,
      Unsubscribes and Group Unsubscribes, and that `SENDGRID_WEBHOOK_PUBLIC_KEY` is set (the
      route warns while it isn't).
- [ ] If `SENDGRID_EMAIL_TEMPLATE_ID` is set on Vercel, look at where the footer lands
      inside the template; optionally place `{{{compliance_footer}}}` in the template
      itself.
- [ ] `email/[id].delete.ts` and `email/[id].get.ts` still need the org gate (deviation 2):
      a short session, or Phase 9.
- [ ] Still open from Phase 2: `pnpm add:user-app-prefs`.

#### Phase 3b-design — kickoff prompt (Fable 5.1, effort high)

```
Continue the Earnest Parity Round 3 programme for HOA Connect. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log entries for Session 1 (cron auth) and Session 5
(Phase 3a: what the send path now does once per send and once per
recipient), §Token budget, and §3b. Do not read §4 onwards, and never open
docs/plan-earnest-parity-round2.md.

This session = Phase 3b-DESIGN ONLY, on Fable 5.1 at effort high: a written
spec and the named test list for the email send queue's state machine. NO
CODE: no source, test, script or schema edits. The spec goes in
docs/spec-email-send-queue.md, linked from §3b.

Read only the lines you need (sed -n), never whole files:
  Earnest (~/Sites/earnest/earnest): server/utils/newsletter-batch.ts and
    newsletter-prepare.ts, the §3b port. Do not re-survey anything else.
  HOA Connect:
    core/server/api/email/send.post.ts: the synchronous per-recipient loop
      the queue replaces (deliverTo, CC/BCC copies, CID images, the three
      body branches);
    core/server/utils/sendEmailJob.ts + api/email/process-scheduled.post.ts:
      the scheduled path, EmailComplianceRefusal, recurrence;
    core/shared/email/email-class.ts, core/shared/email/unsubscribe.ts and
      core/server/utils/email-compliance.ts: 3a's checkSendCompliance (once
      per send), recipientCompliance (once per recipient),
      partitionAudience, ensureUnsubscribeTokens and emailComplianceSchema.
      The queue must keep calling them at the same two points;
    core/server/utils/cron-auth.ts (requireCronOrAppAdmin).
  Use a Haiku 5.5 subagent for any census (every caller of
  sendOrganizationEmail; every writer of hoa_email_recipients).

The spec must decide each of these and write down why:
1. Recipients as the queue: hoa_email_recipients states (queued, claimed,
   sent, failed, suppressed), what is written at each step, and the unique
   key that makes enqueueing idempotent.
2. Claim and settle: how a worker claims a batch (conditional update vs a
   claim token), how it settles, and what "at most once" means when Vercel
   kills the function after SendGrid accepted a message but before its row
   was written. Choose a side of that window: a dues notice sent twice, or
   one dropped. Say what makes the choice safe.
3. Stale-claim expiry: the timeout, who reclaims, and the evidence that
   stops a reclaimed row being sent twice (x-message-id, custom_args, the
   activity webhook).
4. Progress arithmetic: hoa_emails counts derived from rows rather than
   incremented; the done condition; partial failure; the progress route.
5. Where 3a's rules run. Suppression and token minting at enqueue
   (partitionAudience, ensureUnsubscribeTokens). Then re-checked at send:
   a member who unsubscribes or bounces mid-send must not get the rest.
6. The continue-sends cron: auth, batch size and time budget under
   Vercel's limit. Sender unification: which of send.post, sendEmailJob,
   test.post, transactional-email, the digest worker and
   scripts/billing-worker.ts become queue clients and which stay direct,
   and why. Session 5 left bounced-suppression out of the transactional
   and billing paths for this decision.
7. CC/BCC copies, attachments and CID images in a queued world.

Then the named test list: about 50 tests, grouped by concern, one line
each ("name: the property it pins"). Include a kill-at-every-step test
for the at-most-once property, and the 3a rules re-pinned at both points.

Local session: work on main, ask before pushing. Check `git log
origin/main..main` and say what is unpushed (Session 4b and 5 may still
be). When done: update the Status row (3b-design), append Session 6 to the
Session log (decisions, open questions), write the Phase 3b-build kickoff
prompt (Opus 5.5, effort xhigh; it names the spec, the test list and the
files), and stop. One phase per session.
```

**Session 6 — Phase 3b-design: the send queue's state machine** (2026-11-03) — local, on
`main`, Fable 5.1 at effort high. **No code.** `origin/main..main` was empty at the start
(`fe7b701`); both schema scripts had run. One deliverable: `docs/spec-email-send-queue.md`
(791 lines: seven decisions with their reasons, five open questions, 64 named tests in ten
groups plus the 3a rules re-pinned at both points).

What was read: Earnest's `newsletter-batch.ts` (the types, `runBatch`, the Directus store,
the snapshot) and `newsletter-prepare.ts` (the plan-row insert and resume rules); HOA's
`send.post.ts` (`deliverTo`, the loop, CC/BCC, attachments, CID), `sendEmailJob.ts`,
`process-scheduled.post.ts`, the 3a modules, `cron-auth.ts`, `sendOrganizationEmail`'s
custom-args stamping, and `activity.post.ts`'s recipient lookup. A Haiku census listed every
caller of `sendOrganizationEmail` and the other senders, every writer of
`hoa_email_recipients`, the generated types for both collections, and the Vercel cron config.

Decisions (the spec has the reasons; the short form):

1. **The lease.** Earnest's claim is `updateItems` with a `status = queued` filter, read
   back by token. In Directus that is read-then-write (`updateByQuery` selects keys, then
   updates by key), not an atomic conditional `UPDATE`, so two overlapping runs can both
   deliver the same rows. Overlap is routine here (inline tick + cron). The only atomic
   primitive Directus exposes is a unique index on insert, so the mutex is a row:
   `hoa_email_send_leases` with `email` unique. One writer per send; Earnest's claim and
   settle writes are then safe as written. Prepare and send share the mutex, so two
   schedulers cannot double-enqueue (409 `send_in_progress`).
2. **At most once = `deliver()` is called at most once per row, ever.** A row of a dead run
   stays `claimed` and becomes `unknown` at the next run's start; the queue never resends
   it. We choose dropped over doubled: a dues notice twice reads as a billing error and
   cannot be recalled; a dropped one is visible ("2 unknown", the addresses listed) and
   recoverable. What makes it safe: the webhook promotes any `claimed`/`unknown` row to
   `sent` on any event for that message (`custom_args` gain `recipient_id` and `run_key`),
   so in practice `unknown` lasts seconds; `unknown` is loud; nothing resends it
   automatically.
3. **Stale = 3 min** against an explicit `maxDuration: 60` on the tick route (a test pins
   the 3× relation); `TICK_BUDGET 45 s`, `CHUNK_RESERVE 15 s`, SendGrid timeout 8 s. The
   lease, not the rows, is what gets reclaimed. Network errors settle `unknown`, not
   `failed` (the message may have gone); 5xx is retried on SendGrid's contract, as Earnest.
4. **Counts derived.** One aggregate grouped by status per run; `total_*` on `hoa_emails`
   rewritten after every settle; done ⇔ `total_recipients` set ∧ no `queued`/`claimed`;
   `sent` with ≥ 1 acceptance, `failed` with none; the legacy `recipient_count` /
   `delivered_count` / `failed_count` written at completion so `formatStats` keeps working.
   Progress route `GET /api/email/[id]/progress`, polled every 5 s; the UI says "accepted",
   never "delivered" (that is the webhook's column, `delivery_status`).
5. **3a at the same two points.** Enqueue: `checkSendCompliance` (refuse before any write),
   `partitionAudience` (suppressed members become `suppressed` rows with a reason, excluded
   from `total_recipients`), `ensureUnsubscribeTokens` (one batch; the token is not copied
   into the row). Render: `checkSendCompliance` once per run on a fresh org read (a missing
   address parks the send with `send_last_error`, it does not fail it); after the claim and
   before the first deliver, one live member read per chunk → `suppressionReason` again
   (`*_mid_send`) and `recipientCompliance` with the stored token. A failed recheck read
   releases the chunk.
6. **One tick route, `GET /api/email/cron/continue-sends`** (`.ts`, Vercel Cron is GET only;
   `requireCronOrAppAdmin`), doing enqueue-due then run-batches, so scheduler and sender
   share one secret; `process-scheduled` stays as the Flow's entry and enqueues only. Queue
   clients: `send.post` (enqueue + awaited inline tick for ≤ 50) and `sendEmailJob` (enqueue
   only). Direct: `test.post`, `transactional-email`, the digest worker, `billing-worker`,
   with `resolveSender()` everywhere and the bounced guard added to transactional and
   billing (Session 5's open item). The rule: queued when one body fans out to an org
   audience with a `hoa_emails` row; direct when one event causes one message.
7. **CC/BCC decided once at enqueue** and written on the rows (`copies` on member rows of a
   small send; `kind: copy` rows last on a large one); attachments and CID extraction once
   per run, and a failed attachment load stops the run before any claim rather than
   sending some chunks without the file.

Deviations from the plan's §3b wording, all in the spec: `claimed` for Earnest's `sending`,
`suppressed` for `skipped`; `delivery_status` takes the webhook's `delivered`/`bounced` off
the queue's `status` column (nothing in the app read them); `run_key` separates the
occurrences of a recurring email so dedupe, progress and history are per occurrence; no
`paused` status in 3b (Phase 4); no daily cap; a half-written snapshot is closed, not
resumed (audiences are one or two batches).

Open questions (spec §9, Peter): (1) **Vercel plan** — per-minute crons and `maxDuration:
60` need Pro; if Hobby, the chained-kick fallback; the build needs this before
`vercel.json`. **Answered 2026-11-03: Vercel Pro.** Build the per-minute cron and
`maxDuration: 60` as specified; no chained kick. (2) When to switch off the Directus Flow scheduler. (3) `run_key` vs one
`hoa_emails` row per occurrence — Phase 4's call. (4) "Resend to these N unknown" as a
Phase 4 action — OK to leave out of 3b-build? (5) `member_fields` holds balances; the
script narrows non-admin reads like 3a's did — confirm.

Gates: not run (no source, test, script or schema changed). Nothing pushed; one docs commit
on local `main`.

Operator TODOs (Peter): answer the five open questions, (1) first. The ones from Session 5
stand.

#### Phase 3b-build — kickoff prompt (Opus 5.5, effort xhigh)

```
Continue the Earnest Parity Round 3 programme for HOA Connect. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log entries for Session 5 (Phase 3a) and Session 6
(Phase 3b-design: decisions and open questions), §Token budget, and §3b. Do
not read §4 onwards, and never open docs/plan-earnest-parity-round2.md.

Then read docs/spec-email-send-queue.md IN FULL. It is the design; this
session implements it as written and does not re-decide it. Where the spec
and §3b differ, the spec wins. Peter's answers to the spec's five open
questions are in this prompt's reply or the Session 6 entry; if question 1
(Vercel plan) is unanswered, build for Pro (per-minute cron, maxDuration 60)
and leave the chained-kick fallback as a TODO in the route's header.

This session = Phase 3b-BUILD, on Opus 5.5 at effort xhigh. Deliverables:

1. scripts/add-email-send-queue.ts (`pnpm add:email-send-queue`), idempotent
   like add-email-compliance-fields.ts: the hoa_email_recipients fields
   (spec §2.2), the hoa_emails fields, the hoa_email_send_leases collection
   with `email` unique, `dedupe_key` unique, and the non-admin read narrowing
   on hoa_email_recipients. Hand-add the types with the generator's notes.
   `emailQueueSchema()` probes it; before it runs, send.post and sendEmailJob
   keep today's synchronous path.
2. core/server/utils/email-send-queue.ts — the port of newsletter-batch.ts
   to the spec: RecipientStore interface + directusRecipientStore, the lease
   (acquire / break-stale / release), runBatch with expire, read, render,
   claim, recheck, deliver, settle, derive-counts; constants CHUNK 100,
   CONCURRENCY 10, TICK_BUDGET_MS 45_000, CHUNK_RESERVE_MS 15_000,
   STALE_MS 180_000, PREPARE_STALE_MS 600_000, INLINE_MAX 50,
   INLINE_BUDGET_MS 20_000, SENDGRID_TIMEOUT_MS 8_000.
3. core/server/utils/email-send-enqueue.ts — the snapshot: audience read,
   checkSendCompliance, partitionAudience → suppressed rows, token minting,
   CC/BCC resolution and the copies/copy-rows rule, 500-row batches in
   position order, total_recipients last, all under a prepare lease.
   send.post.ts and sendEmailJob.ts become clients of it (spec §7.4).
4. core/server/utils/email-send-render.ts — deliverTo lifted out of
   send.post.ts: the three body branches, attachments and CID once per run,
   recipientCompliance per recipient with the live token. Shared by both
   bulk paths. resolveSender(org, stream) in sendgrid.ts, adopted by every
   sender in the spec's §7.4 table; the bounced guard in transactional-email
   and scripts/billing-worker.ts; OUTBOUND_EMAIL_ONLY_TO in
   sendOrganizationEmail.
5. core/server/api/email/cron/continue-sends.ts (GET; requireCronOrAppAdmin;
   enqueue-due then run-batches, then close stale preparing, then complete
   done sends); process-scheduled.post.ts enqueues only. vercel.json: the
   cron `* * * * *` and maxDuration 60 on the route.
6. core/server/api/email/[id]/progress.get.ts (org-gated); the compose
   dialog and the detail page poll it every 5 s with the three labels from
   spec §5.4; the comms dock badge; the detail page's per-row chips
   (suppressed reason, unknown, delivery_status). [id].delete.ts and
   save.post.ts refuse a `sending` email with 409 and gain the org gate.
7. activity.post.ts: recipient_id lookup first; promote claimed/unknown →
   sent on any event; delivery_status instead of status.
8. The tests in spec §10, every one by its name, in the files it names.
   Group I (the kill matrix) is table-driven over the listed steps with an
   in-memory store and a fake SendGrid that logs acceptances.
9. docs/email-sending.md: what the tick does, what `unknown` means, how a
   parked send (send_last_error) resumes, how to run the script.

Use a Haiku 5.5 subagent for any census (readers of recipient status,
callers to update). Read only the lines you need (sed -n), never whole
files; do not re-survey Earnest — the spec carries what was needed.

Gates in the background, tail only: `pnpm test | tail -6`; typecheck with
NODE_OPTIONS=--max-old-space-size=6144 into a log, grep `error TS`; build
into a log, grep exit. One headless Playwright script
(scripts/browser/verify-p3b-queue.cjs) against a local build with the demo
org: enqueue a 60-person send with page.route intercepting nothing on the
server side (the demo guard means no mail leaves), watch the dialog go
Getting ready → Sending → Sent, assert the counts match the aggregate, and
snapshot demo/demo-classic before and after as Session 5 did.

Local session: work on main, ask before pushing. Check `git log
origin/main..main` first and say what is unpushed. When done: update the
Status row (3b-build), append Session 7 to the Session log (what shipped,
deviations from the spec with reasons, operator TODOs: run the script, set
the cron, confirm maxDuration, retire the Flow), write the Phase 4 kickoff
prompt (Opus 5.5, effort high), and stop. One phase per session.
```

**Session 7 — Phase 3b-build: the send queue** (2026-11-03) — local, on `main`, Opus 5.5 at
effort xhigh. Peter confirmed `main` was fully pushed at the start (the unpushed check was
skipped). Spec open question 1 was answered: **Vercel Pro**. One code commit.

Shipped (built to `docs/spec-email-send-queue.md`; runbook `docs/email-sending.md`):

- **Schema**: `scripts/add-email-send-queue.ts` (`pnpm add:email-send-queue`), idempotent.
  - The queue fields on `hoa_email_recipients` (`dedupe_key` unique), plus the status values.
  - The totals and send timeline on `hoa_emails`.
  - `hoa_email_send_leases` (`email` unique).
  - Non-admin reads of `hoa_email_recipients` narrowed to exclude `claim` and `member_fields`.
  - Types hand-added. `emailQueueSchema()` probes all three collections. Until the
    script runs, `send.post` and `sendEmailJob` keep the synchronous send.
- **`core/server/utils/email-send-queue.ts`**:
  - the `RecipientStore` interface and `directusRecipientStore`;
  - the lease (acquire, break-stale, release by id + token);
  - `runBatch`: expire → load → read → render → claim → recheck → deliver → settle → derive;
  - completion (recurring sends roll forward), `closeStalePreparing`, `runSendTick`;
  - the progress derivation and the webhook's `queueRowPatch` + `refreshTotals`.
  - The constants are in `email-send-constants.ts`.
- **`email-send-enqueue.ts`**: `planRows` (positions, dedupe keys, the merge snapshot,
  copies vs copy rows), `writeSnapshot` (500-row batches, total last, all under a prepare
  lease), the scheduled audience, `enqueueScheduled` and `enqueueDue`.
- **`email-send-render.ts`**: `deliverTo` lifted out of `send.post`.
  - `renderDraft` handles the three body branches, before the claim.
  - `finalizeDraft` applies `recipientCompliance` with the live token, after the recheck.
  - Attachments and CID images load once per run; a failed attachment parks the run.
  - `email-send-tick.ts` wires it to Directus and SendGrid.
- **`resolveSender(org, stream)`** in `sendgrid.ts`, adopted by:
  - the queue's render and the synchronous path;
  - `test.post`;
  - `transactional-email` (which now also skips bounced members and logs);
  - `billing-worker` (`essentialEmailAllowed`, bounced → no email; the bell and push still fire).

  `sendOrganizationEmail` gains the `OUTBOUND_EMAIL_ONLY_TO` allow-list. The SendGrid
  client times out at 8 s.
- **Routes**:
  - `GET /api/email/cron/continue-sends`: `requireCronOrAppAdmin`; enqueue-due → runs →
    close stale preparing → complete done.
  - `process-scheduled`: enqueues only (synchronous until provisioned).
  - `GET /api/email/[id]/progress`: org-gated.
  - `send.post`: enqueue, then an inline tick for ≤ 50; 409 on a send in flight.
  - `[id].delete` and `save.post`: 409 `send_in_progress`; `[id].delete` gains the org gate.
  - `[id].get`: the latest occurrence's rows, the queue's fields, no 100-row cap.
- **`vercel.json`**: the `* * * * *` cron. `core/modules/vercel-function-rules.ts` gives
  the route its own function with `maxDuration: 60` (deviation 1).
- **Webhook**: lookup by `recipient_id` first; `claimed`/`unknown` → `sent` on any event,
  and the email's totals re-derived; `delivery_status` instead of `status`.
- **UI** (shared wording in `core/shared/email/send-progress.ts`):
  - the composer's send dialog (`Communications/SendProgress.vue`, `useSendProgress`,
    polled every 5 s);
  - on the detail page, the same progress card and per-row chips (held back · reason,
    unknown, accepted / delivered / bounced);
  - the Communications dock badge counts sends in flight (`useSendingEmails`).
- **Tests**: every spec §10 test by name, 1–66, in the files it names. The kill matrix is
  table-driven over 15 steps; a kill is a hang, because a frozen function runs no `finally`.
  Plus render checks: the footer sentinel survives all three branches, and `$` patterns
  are inserted literally.

Deviations from the spec, with reasons:

1. **`maxDuration` is not set in `vercel.json`.** Nitro 2.13 builds every route into one
   function. A `functions` entry in `vercel.json` doesn't match a Nitro route (Vercel looks
   for source files under `api/`), and `nitro.vercel.functions.maxDuration` is global: it
   would cap every route at 60 s, where the project is on Fluid compute with a 300 s
   default. So a small Nuxt module copies the fallback function to
   `functions/api/email/cron/continue-sends.func` with its own `.vc-config.json`. (Newer
   Nitro has `vercel.functionRules` for this.) Test 16 pins `STALE_MS ≥ 3 × 60 s` against
   the module's constant. The safety does not rest on the hard stop alone: claims stop at
   45 s, and a run never delivers another run's claimed rows.
2. **`run_key` is tagged**: `m:<enqueue time>` / `s:<scheduled_at>`. Completion then knows
   a scheduled occurrence (and rolls a recurring one forward) without another field.
3. **Render is split in two.** `renderDraft` runs before the claim, with a footer sentinel;
   `finalizeDraft` runs after the recheck. This honours both "render before claiming" and
   "compliance from the live token after the claim" with one MJML compile per recipient.
4. **The progress route runs the aggregate on every poll** (spec §5.1 said one row). It
   needs `queued`/`claimed`/rows for "Getting ready · N" and an exact "attempted of total"
   (no-address rows are `failed` but outside the total). Its flag is `provisioned`: an
   earlier `queued: true` overwrote the count, and test 53 caught it.
5. **The webhook re-derives the email's totals** after it promotes rows (test 61: "the
   totals follow"). A finished send whose only acceptances were `unknown` becomes `sent`.
6. **Fixed in passing**:
   - A member deleted between enqueue and claim settles `failed` ("Member removed before
     this was sent"); the spec had no reason for it.
   - A scheduled email with an empty audience is refused (marked failed); before, it was
     "sent" to nobody.
7. **`writeSnapshot` re-checks the email's status under the lease.** The lease alone leaves
   a window: a second scheduler that acquires after the first has finished would write a
   colliding occurrence. A failed enqueue that is not a kill undoes itself (rows deleted,
   status restored) instead of waiting 10 minutes for the stale close.
8. **Scheduled sends now carry CC/BCC, attachments and CID images** through the shared
   render; before 3b they ignored all three. Transactional mail now expands the org's
   `settings`, so its branding defaults and white-label sender reach it for the first time.
9. **Found while building: Directus's 100-row default.**
   - `send.post` read explicit recipients with no `limit`, so a 150-person send mailed
     100. Fixed (`limit: -1`).
   - Every by-query update or delete the queue makes carries `limit: -1`. Directus resolves
     a filter-update to keys with the default read limit, which would have capped
     `deleteRows`.
   - `[id].get` listed at most 100 recipients. Fixed.
10. **Test-harness changes**:
    - `email-compliance.ts` looks its SDK builders up at call time, so partial SDK mocks
      can still import its importers.
    - Two existing tests' `sendgrid` mocks spread the real module (for `resolveSender`).
    - `hoa_email_send_leases` is excluded in the export map and bucketed on `/your-data`.
11. **The browser check ran in mocked mode, not the spec's real send.** The queue's schema
    is an operator step, and without it there is no queue to drive. Before provisioning,
    `scripts/browser/verify-p3b-queue.cjs` answers save/send/progress itself. It covers:
    - the three labels in order;
    - the final numbers;
    - polling that stops when the send is done;
    - the failure list;
    - the dock badge;
    - the detail page's card and chips.

    `--real` is the full run after `pnpm add:email-send-queue`. It runs a 60-person
    essential send on `demo`, kicks the tick, compares the dialog with a Directus
    aggregate, then deletes its email and rows and diffs both orgs.
12. **Spec open questions**: Q4 ("Resend to these N unknown") is left out, as the spec
    proposed. Q5 is built as specified (`claim` and `member_fields` read-narrowed). Q2 and
    Q3 stay Peter's.

Gates (final tree):
- typecheck 0;
- vitest 115 files / 1911 tests (from 107 / 1814): eight new files, plus G in
  `sendgrid-webhook.test.ts`;
- the build with `NITRO_PRESET=vercel` is green. The output has
  `functions/api/email/cron/continue-sends.func` with `maxDuration: 60`, the fallback
  function has no `maxDuration` (unchanged), and `config.json` checks the filesystem
  before `/__fallback`. The local output was deleted afterwards;
- `audit:hairline-surfaces` 0;
- `verify-p3b-queue.cjs` **38/38**, light and dark, mocked mode, on a demo session;
- `demo` / `demo-classic` snapshots identical before and after.

Operator TODOs (Peter):

- [ ] **Push is yours**: this session's two commits on local `main`.
- [ ] **Provision**: `pnpm add:email-send-queue`, then `pnpm generate:types` (expect no diff
      on these fields). Until then everything sends synchronously as before.
- [ ] **After deploy, confirm the hard stop**: Vercel → the deployment → Functions should
      list `api/email/cron/continue-sends` with max duration 60 s, and the cron should
      appear under Settings → Cron Jobs.
- [ ] **Run the real browser check** against a local build with `.env`:
      `node --env-file=.env scripts/browser/verify-p3b-queue.cjs <url> --real`. It needs
      `CRON_SECRET`, and ≥ 60 members on `demo`.
- [ ] **One real send from a non-demo org** to a few of your own addresses, over 50
      recipients if you can, to see the dialog run on the cron.
- [ ] **Retire the Directus Flow "Email Scheduler"** once one scheduled email has gone out
      through the cron (spec Q2). Both can run until then.
- [ ] Spec open question 3 (`run_key` vs one row per occurrence) is Phase 4's call;
      question 4 stays open for Phase 4.
- [ ] Still open from Session 5: `email/[id].get.ts` has no org gate (only `[id].delete`
      gained one here).

#### Phase 4 — kickoff prompt (Opus 5.5, effort high)

```
Continue the Earnest Parity Round 3 programme for HOA Connect. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log entries for Session 6 (3b-design) and Session 7
(3b-build: shipped, deviations, operator TODOs), §Token budget, and §4. Do not
read §5 onwards, and never open docs/plan-earnest-parity-round2.md. Read
docs/email-sending.md in full, and from docs/spec-email-send-queue.md only
§2.1–2.2, §5 and §9. The queue is built and tested; Phase 4 adds to it and
does not re-decide it.

This session = Phase 4 (email health, scheduling, branding parity) ONLY, on
Opus 5.5 at effort high. Earnest reference: ~/Sites/earnest/earnest — read
only server/utils/send-health.ts and the three MJML partials §4.3 names, only
the lines you need.

First: check `git log origin/main..main` and say what is unpushed, and whether
`pnpm add:email-send-queue` has run (the queue fields on
hoa_email_recipients). Pause/resume needs the queue live; if it hasn't run,
stop and ask.

Deliverables (§4, fitted to the queue as built):
1. Auto-pause + Resume. `paused` joins hoa_emails.status (extend
   scripts/add-email-send-queue.ts idempotently; hand-add the type). After each
   run on an unfinished send, runSendTick computes hard-bounce and spam rates
   for the send's run_key from hoa_email_activity (minOutcomes 50,
   hardBounceRate 0.08, spamRate 0.005) — outside runBatch's at-most-once
   loop. Pausing is a conditional write; only the tick whose write moved the
   row notifies org admins + the sender (bell + sendBrandedTransactionalEmail,
   CTA "Review and resume"). A paused send is skipped and its rows stay
   queued. POST /api/email/[id]/resume (org-gated, 409 unless paused) stores
   the counts as a baseline. The progress route, dialog and detail page say
   "Paused · <reason>".
2. "Resend to these N unknown" (spec Q4) only if Peter has said yes.
3. Recurrence: computeNextRun (email-send-queue.ts) grows daily, biweekly,
   quarterly, annual and nth-weekday-of-month; the composer's sentence
   preview. Completion already rolls forward through it.
4. MJML partial composition for ≥ 4 template types (§4.3), brandVars with
   brandOnColor from shared/color-contrast.ts, logo sizing. renderDraft's
   footer sentinel must survive every partial —
   tests/server/email-sender-unification.test.ts pins it; extend it per type.
5. GET /api/email/preview-mjml and the Branding card's iframe.
6. Per-org copy overrides only if cheap.

Tests: pause/resume (the conditional write, the baseline, skip-while-paused,
one notification), the recurrence table, partials byte-stable against today's
output where the design didn't change, the preview route's org gate.

Use a Haiku 5.5 subagent for any census. Read only the lines you need. Gates
in the background, tail only: `pnpm test | tail -6`; typecheck with
NODE_OPTIONS=--max-old-space-size=6144 into a log, grep `error TS`; build into
a log, grep exit; `pnpm audit:hairline-surfaces`. One headless Playwright
script (scripts/browser/verify-p4-email.cjs; playwright@1.63.0 in the
scratchpad via NODE_PATH): the paused label + Resume, the recurrence
sentence, the branding preview, light + dark on the demo org with
/api/demo/login; snapshot demo/demo-classic before and after; delete every
row you create.

Local session: work on main, ask before pushing. When done: update the Status
row, append Session 8 to the Session log (shipped, deviations, operator
TODOs), write the Phase 5a kickoff prompt (Opus 5.5, effort xhigh), and stop.
One phase per session.
```

**Session 8 — Phase 4: email health, scheduling, branding parity** (2026-11-03) — local, on
`main`, Opus 5.5 at effort high. Peter confirmed `main` was fully pushed and that
`pnpm add:email-send-queue` + `pnpm generate:types` had run (`4dd20bf`); the unpushed check
was skipped. One code commit.

Before the phase, at Peter's request: `verify-p3b-queue.cjs --real` against a local build —
**8/12**. The real send worked end to end (enqueued, 6 rows settled `sent` under the demo
guard, none left queued/claimed, cleanup restored both snapshots). The 4 failures are one
precondition: `demo` has **6 members**, the script needs ≥ 60, and a ≤ 50 send finishes
inline, so the composer (correctly) never opens the progress dialog.

Shipped (runbook: `docs/email-sending.md` §6, §7, §10):

- **Auto-pause + Resume** — `core/shared/email/send-health.ts` (the lines: 50 outcomes, 8%
  hard bounces of delivered + hard-bounced, 0.5% spam of delivered; the sentence; the
  `{ health }` record in `send_errors`, keyed to the `run_key`) and
  `core/server/utils/email-send-health.ts`:
  - `checkSendHealth` runs in `runSendTick` after a run that left its send unfinished,
    outside `runBatch`, **under the send's lease**; the pause is a filter-update on
    `(id, status = sending)` and only a call whose write moved the row notifies (bell +
    branded email via `notifyUsers` to `adminUserIds` + the sender, CTA "Review and resume");
  - `resumeSend` + `POST /api/email/[id]/resume` (org-gated; 409 `not_paused` / `send_busy`)
    store the counts as the baseline;
  - events are counted per occurrence through `email_recipient.{email, run_key}`; a hard
    bounce is a `bounce` whose `bounce_type` isn't `blocked`, or a `dropped` "Bounced Address";
  - `deriveProgress` gains phase `paused` + `paused: { reason, sentence }`; the dialog and the
    detail card say "Paused · too many bounces" with the sentence and **Resume sending**;
    `paused` badges in the lists; save/delete 409 a paused email as they do a sending one.
- **Recurrence** — `core/shared/email/recurrence.ts`: `computeNextRun(base, rule, timeZone)`
  for daily, weekly, biweekly, monthly, `monthly_nth_weekday`, `monthly_last_weekday`,
  quarterly, annual, on the wall clock of the zone (`@internationalized/date`); the Repeat
  picker's choices name the chosen date's weekday ("Monthly on the second Tuesday"); the
  sentence under it ("Every second Tuesday of the month at 9:00 AM — first on Tue, Nov 10, then
  Tue, Dec 8."). `email-send-queue.ts` re-exports `computeNextRun`; completion reads the
  email's zone through an optional `store.recurrenceTimeZone`. `save.post` validates the rule.
- **MJML partials** — `core/server/emails/_layout.mjml` (head, browser banner, wrapper with
  `@HEADER` / `@CONTENT` / `@FOOTER`), `_header.mjml`, `org-email.mjml`, `_footer.mjml`;
  `core/server/utils/email-partials.ts` fills them (`{{var}}`, nested `{{#if}}…{{else}}`,
  `{{!-- --}}` notes; one pass, so an author's `{{first_name}}` survives; a missing var
  throws). `buildEmailHtml` = compile(`buildEmailMjml`). `core/build/raw-mjml.ts` inlines
  `.mjml` imports as strings for Nitro (`core/modules/raw-mjml.ts`, which also declares the
  module type) and vitest — no `serverAssets`.
- **`brandVars()`** (header band, plate, logo, `accentColor`, `brandOnColor`) with
  `core/shared/color-contrast.ts` (WCAG luminance/contrast, `onColor`). **Logo sizing:**
  50 px tall, ≤ 240 px wide, never enlarged, explicit width/height, bitmap at 2× — when the
  file's dimensions are known; the email paths now read `settings.logo` as
  `{ id, width, height }`.
- **Preview** — `GET /api/email/preview-mjml?org&template&format` (`format` html | text |
  mjml; `template` = the six types or `notification&category=<key>` for every notification
  category; unsaved `primary` / `secondary` / `accent` / `palette=none` / `headerText`);
  `communications` gate; `Content-Security-Policy: sandbox` on the HTML. The Branding card's
  iframe is `src`-driven by it (debounced, with a Notification option + category).
  `transactionalContent()` is lifted out of `sendBrandedTransactionalEmail` so the preview
  is the email.
- **Schema** — `scripts/add-email-send-queue.ts` gains its Phase 4 part (idempotent):
  `paused` on `hoa_emails.status`, the six repeat rules on `recurrence_rule`,
  `hoa_emails.recurrence_timezone`, `hoa_email_activity.bounce_type`. Types hand-added.
  `emailPhase4Schema()` gates the tick's health check, the webhook's `bounce_type` write
  and `save.post`'s zone write.
- **Tests** — `email-send-health.test.ts` (18: the lines table; the conditional write under
  the lease; a held lease; three ticks → one pause, one notification; skip-while-paused;
  the baseline; the Directus store's filters, with and without `bounce_type`),
  `email-recurrence.test.ts` (27: the table, last / fifth weekday, a year without drift,
  DST, the sender's Tuesday vs UTC's, the 31st, the choices and sentences, completion in
  the zone), `email-partials.test.ts` (32: 19 byte-stability fixtures in
  `tests/server/__fixtures__/email-html/` written by the string builder before the
  refactor, logo boxes, `brandOnColor`, the filler), `email-preview-mjml.test.ts` (7: the
  org gate, formats, the unsaved palette, notification, CSP), and the footer sentinel per
  type in `email-sender-unification.test.ts` (+6).

Deviations, with reasons:

1. **`shared/color-contrast.ts` didn't exist** (the plan assumed Earnest's). Written as
   `core/shared/color-contrast.ts`; the template's YIQ `isDarkColor` now asks it. One
   exception: alert's red pill keeps its white label on any palette (it is semantic, not
   brand; WCAG calls white vs ink on `#ef4444` a near-tie, 3.8 vs 4.0).
2. **"≥ 4 template types"**: HOA has one org-email builder dressed six ways (basic, alert,
   newsletter, announcement, reminder, notice), plus the branded notification (a notice).
   All seven compose through the partials, so the refactor was one builder, not one type
   at a time. The invitation / welcome / accepted emails are SendGrid dynamic templates
   (`email-templates-invite.mjml` is their source) — not composed or previewable here.
3. **Two fields the plan didn't name.** `hoa_email_activity.bounce_type`: the webhook
   never stored SendGrid's bounce type, so a blocked bounce couldn't be told from a hard
   one. `hoa_emails.recurrence_timezone`: "the second Tuesday at 9:00" needs the sender's
   zone (a 9 pm New York Tuesday is a UTC Wednesday; Sept 2027 shows they diverge). The
   org timezone 5a adds can become its default.
4. **The pause is serialized by the lease**, not only by the filter-update: in Directus a
   filter-update is read-then-write (spec §3.1), so two ticks could both "move" the row.
5. **Monthly on the 29th–31st now constrains** (Jan 31 → Feb 28) instead of overflowing
   (Jan 31 → Mar 3, `Date.setMonth`). Each run is computed from the previous, so it then
   stays on the 28th; no anchor field was added.
6. **The parked-send note is now "Waiting: …"** (was "Paused: …"), so "paused" means one
   thing.
7. **`branding-preview.post.ts` removed**: it had no org gate (any signed-in user could
   render any org's branding); its only caller now uses the gated GET route.
8. **Spec Q3 decided: keep `run_key`** (one `hoa_emails` row per recurring email, rows per
   occurrence). Completion already rolls forward through it, history is per occurrence on
   the rows, and nothing needs migrating.
9. **Not built**: "Resend to these N unknown" (Q4 — no yes from Peter); per-org copy
   overrides (not cheap: a schema field plus the three transactional senders' copy).
10. **Found while verifying**: Directus answers 403 for a filter on a field that doesn't
    exist yet, so Resume failed before the script reruns; the health store now counts
    every bounce until `bounce_type` exists (`directusHealthStore(…, { bounceTypes })`).

Gates (final tree):
- typecheck 0;
- vitest **119 files / 2001 tests** (from 115 / 1911);
- `pnpm build` (node-server) green; the partials are inlined in `chunks/nitro/nitro.mjs`.
  A Vercel-preset build was not run (the plugin is preset-independent rollup);
- `audit:hairline-surfaces` 0;
- `verify-p4-email.cjs` **36/36**, light and dark, real (a paused email on `demo` → Resume
  → the tick → Sent; the repeat sentence; the Branding preview incl. a notification;
  the sandbox CSP), twice; `demo` / `demo-classic` snapshots identical after cleanup.

Operator TODOs (Peter):

- [ ] **Push is yours**: this session's two commits (code + docs) on local `main`.
- [ ] **Re-run** `pnpm add:email-send-queue` (it now adds Phase 4's fields), then
      `pnpm generate:types` (expect no diff: `paused`, the repeat rules,
      `recurrence_timezone`, `bounce_type` are hand-added). Until then: no auto-pause, the
      composer's zone isn't stored, repeats roll forward on UTC.
- [ ] **Look at one real email with a logo**: logos are now 50 px tall (≤ 240 px wide) where
      Directus knows the file's size — the one deliberate visual change. To tune it:
      `LOGO_MAX_HEIGHT` / `LOGO_MAX_WIDTH` in `email-templates-mjml.ts`.
- [ ] **`verify-p3b-queue.cjs --real` needs ≥ 60 members on `demo`** (it has 6). Seed more, or
      run it with `ORG_SLUG` set to an org that has them (it mails nobody only on a demo org).
- [ ] Spec Q4 ("Resend to these N unknown") stays open.
- [ ] Still open from Session 7: confirm the tick's 60 s function + the cron after deploy;
      one real send > 50 from a non-demo org; retire the Directus Flow "Email Scheduler";
      `email/[id].get.ts` has no org gate.

#### Phase 5a — kickoff prompt (Opus 5.5, effort xhigh)

```
Continue the Earnest Parity Round 3 programme for HOA Connect. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log entry for Session 8 (Phase 4: shipped, deviations,
operator TODOs), §Token budget, and §5a. Do not read §5b onwards, the Session
log before Session 8, or docs/spec-email-send-queue.md, and never open
docs/plan-earnest-parity-round2.md. From docs/email-sending.md read only §7
(recurrence and time zones) and §10 (the partials): 5a's templates are content
partials composed the same way.

This session = Phase 5a (the reminder engine) ONLY, on Opus 5.5 at effort
xhigh. Earnest reference: ~/Sites/earnest/earnest — grep `reminder_key` and
read only those lines (the idempotency key); do not re-survey Earnest.

First: check `git log origin/main..main` and say what is unpushed, and whether
`pnpm add:email-send-queue` has been re-run since Session 8 (the Phase 4
fields `hoa_email_activity.bounce_type`, `hoa_emails.recurrence_timezone`).
5a doesn't depend on them: say which, and carry on.

Deliverables (§5a, fitted to what exists):
1. Schema: scripts/create-reminder-log.ts (`pnpm create:reminder-log`),
   idempotent like add-email-send-queue.ts: `hoa_reminder_log` with
   `reminder_key` UNIQUE — the unique insert IS the claim (a Directus
   filter-update is read-then-write, so it can't be); `hoa_organizations.
   timezone` (IANA; decide the default and say why); the
   `settings.reminders` JSON shape. Hand-add the types.
2. core/shared/reminders/rules.ts — pure; each rule yields {key, audience,
   template, vars, urgency} for an `asOf` in the org's zone, with
   @internationalized/date as core/shared/email/recurrence.ts does: dues
   (−7d, day-of, +1d past grace), meetings (T−7d, T−24h, T−1h push only),
   requests (resident-facing status change; 7-day no-activity nudge to the
   assignee), violations (cure_by −3d, day-of), polls (opens, closes in 24h,
   closed), documents (COI / insurance expiry to admins).
3. The tick: POST /api/reminders/run (hourly Vercel cron, `CRON_SECRET`,
   requireCronOrAppAdmin, its own entry in vercel.json): per org, evaluate,
   skip keys already logged, insert the log row BEFORE sending, fan out through
   notifyUsers() (dues and violation reminders are `essential`), write
   `result` after; 40 s budget, continues next tick; `?dry=1` lists what would
   go out and writes nothing. The digest reads the org timezone instead of the
   global DIGEST_TZ.
4. Templates reminder-dues / -meeting / -violation / -poll as content partials
   beside core/server/emails/org-email.mjml, composed by composeEmail(); add
   them to GET /api/email/preview-mjml as templates; the essential footer.

Tests: every rule × offset × idempotency (a re-run inserts and sends nothing;
two overlapping runs send once — the losing insert gets RECORD_NOT_UNIQUE);
zone edges (DST, late evening, an org west of UTC); the cron gate; the dry
run writes nothing; each template through the partials keeps the class
footer.

Use a Haiku 5.5 subagent for any census (where payment_requests, hoa_meetings,
polls, violations and documents keep their dates and audiences; the existing
notify-event callers). Read only the lines you need. Gates in the background,
tail only: `pnpm test | tail -6`; typecheck with
NODE_OPTIONS=--max-old-space-size=6144 into a log, grep `error TS`; build into
a log, grep exit; `pnpm audit:hairline-surfaces`. 5a has no UI (5b does):
prove it with tests and one `?dry=1` run of the tick against the demo org on a
local build, not screenshots.

Local session: work on main, ask before pushing. When done: update the Status
row, append Session 9 to the Session log (shipped, deviations, operator
TODOs), write the Phase 5b kickoff prompt (Sonnet 5.5, effort high), and stop.
One phase per session.
```

**Session 9 — Phase 5a: the reminder engine** (2026-11-03) — local, on `main`, Opus 5.5 at
effort xhigh. Peter confirmed `main` was pushed (`e582d70`) and that `pnpm add:email-send-queue`
+ `pnpm generate:types` had run (the Phase 4 fields exist); those checks were skipped. Two Haiku
5.5 census agents (data sources and audiences; notify callers, cron, digest). Earnest read only
for `reminder_key` (`billing-schedule-run.ts`: the claim is inserted before the send). One code
commit, one docs commit.

Shipped (runbook: `docs/reminders.md`):

- **Schema** — `scripts/create-reminder-log.ts` (`pnpm create:reminder-log`), idempotent like
  `add-email-send-queue.ts`, and it checks `is_unique` after creating the column:
  `hoa_reminder_log` (`organization` cascade, `rule`, `stage`, `reminder_key` string(255)
  UNIQUE, `recipient` → directus_users, `entity_collection` / `entity_id`, `channels`,
  `result` claimed | sent | failed, `detail`, `sent_at`, `date_created` = the claim);
  `hoa_organizations.timezone` (IANA, **default `America/New_York`**: the digest's
  `DIGEST_TZ` and the billing worker's `BILLING_TZ` already put every org on New York, so no
  org's times move; Postgres fills existing rows); `block_settings.reminders` (json — what
  `organization.settings.reminders` reads). Types hand-added. `reminderSchema()` gates the tick.
- **Rules** — `core/shared/reminders/`: `settings.ts` (the shape; `resolveReminderSettings`
  never throws; every rule **off** until `enabled: true`; `send_hour` 6–20, default 9; per rule
  `stages`, `days`, `tenants`, `approved_at/by`, `copy`), `rules.ts` (pure; `{key, audience,
  template, vars, urgency}` + channels, category, essential, group, TTL; on the org's wall clock
  with `@internationalized/date`; each stage a window, nothing before the send hour or from
  21:00 except the meeting-in-an-hour push), `messages.ts` (`composeReminder`: one notification
  per group — one member's dues at one stage, one meeting's invitees — with its subject, bell
  line, heading, intro, link; the board's `copy` replaces subject/intro with `{{var}}` tokens).
  Rules: dues (before 7 d / due / the day after grace, 30 d), meetings (week / day / hour, push
  only), requests (status change → submitter; 7 quiet days → assignee, bell), violations (cure
  date −3 d / on the day), polls (opened / closing in 24 h, non-voters / closed with the result),
  coverage (vendor `active_until` −30 d / ended, admins, bell). Key:
  `<rule>:<entity>:<stage>@<anchor>:<user>`.
- **The tick** — `core/server/utils/reminders.ts` + `GET|POST /api/reminders/run`
  (`requireCronOrAppAdmin`; vercel.json `5 * * * *`): per org with a rule on, load only what
  those rules read, evaluate, skip logged keys, **insert the group's log rows** (batch; on
  `RECORD_NOT_UNIQUE`, one by one — the free keys are claimed, the taken ones lost), send
  through `notifyUsers`, write `result`; dues stamp `payment_requests.metadata.reminders` /
  `reminder_sent_at` in the billing worker's words. 40 s budget before each org and group;
  one org's error doesn't stop the rest. `?dry=1` (+ `org`, `asOf`) lists `wouldSend`,
  `wouldSendGroups` (subjects), `off` (what rules that are off would send) and `unreachable`,
  and writes nothing — also before the script has run.
- **Notify layer** — `notifyUsers` gains `bell: false` (push without a row, still on the
  bell's switch), `push: false | { urgency, ttlSeconds }` (→ web-push `urgency` / `TTL`), and
  `essential` (email past the category opt-out, never past the master switch or a bounce);
  `sendBrandedTransactionalEmail` gains `essential`, `contentPartial` and returns the count;
  the class footer gains reason `reminders` ("essential and cannot be unsubscribed").
- **Templates** — `core/server/emails/reminder-{dues,meeting,violation,poll}.mjml`, content
  partials beside `org-email.mjml`; `buildEmailMjml`'s `contentPartial` drops one into the
  content slot (with `headingFont`, the brand accent as the button, `onColor` label), composed
  by `composeEmail`; `core/server/utils/reminder-email.ts` escapes every var and builds the
  rows. `GET /api/email/preview-mjml?template=reminder-*` renders `sampleReminders()` — made by
  the real rules from a fixed snapshot — with the footer the send would carry.
- **Digest on the org's zone** — `scripts/notification-digest-worker.ts` reads every org's
  `timezone` (fallback `DIGEST_TZ`, also before the field exists) and checks each member's
  digest hour per community (`core/shared/org-timezone.ts`).
- **Billing worker** — with an org's dues rule on, it reminds only members **without an app
  account** (the engine can't reach them) and leaves the rest to the engine.
- Request workflow (`useRequests.applyTransition`) writes `metadata.status_changed_at`; the
  export map takes `hoa_reminder_log` (both tiers, like the email recipients).
- **Tests** — `tests/shared/reminder-rules.test.ts` (64: every rule × stage at its window
  edges, keys, the clock, DST both ways, a New York late evening that is UTC tomorrow, an org in
  Los Angeles, settings, grouping, copy), `tests/server/reminder-tick.test.ts` (19: claim before
  send, a re-run inserts and sends nothing, two overlapping runs send once with the loser's
  `RECORD_NOT_UNIQUE`, a key taken mid-group, failed and killed runs never resend, the budget,
  stamps, the dry run writes nothing; the route's cron gate, `provisioned`, `asOf`),
  `tests/server/reminder-email.test.ts` (9: each template through the partials with its class
  footer last, the button, escaping, who an essential email reaches),
  `tests/server/notify-reminder-options.test.ts` (4), and 4 reminder cases in
  `email-preview-mjml.test.ts`.

Deviations, with reasons:

1. **No COI or insurance-expiry field exists** (the census grepped every collection). The
   "documents" rule is `coverage`, on `hoa_vendors.active_until` — the field the AI notices
   already read as a vendor's contract/insurance end. A real certificate expiry is a field plus
   an upload; not 5a.
2. **`settings` is an M2O to `block_settings`**, not JSON, so `settings.reminders` is a json
   field there.
3. **Every rule is off by default**, and `enabled` is the board's approval (5b writes it with
   `approved_at`): reminders reach inboxes in the board's name, and a deploy that switched on
   "7 quiet days" nudges for every old request would flood boards.
4. **Log columns**: `stage`, not `offset` (a reserved word and a REST query parameter);
   `recipient`, not `member` (it is a Directus user; `member` means `hoa_members` here);
   `channels` (what was asked) on one row per person, not one row per channel — `notifyUsers`
   decides each channel from that person's preferences.
5. **`run.ts`, not a POST-only route** (Vercel Cron sends GET). No per-route Vercel function:
   40 s fits the default; the unique key, not a hard stop, is the guard against overlap.
6. **Stages are windows with catch-up**, not Earnest's day equality: a late or over-budget tick
   still sends on the next. Overdue dues stop after 30 days (after that it is collections).
7. **The billing worker already sent dues reminders** (`due_soon` / `due` / `past_grace` in
   `metadata.reminders`, daily, `BILLING_TZ`). The engine skips a stage the worker stamped and
   stamps the same words. Found on the demo dry run: `demo`'s five charges are billed to
   members with **no app account**, whom `notifyUsers` can't reach — so the worker keeps those
   members when the rule is on, and the dry run reports them as `unreachable`.
8. **Essential = the billing worker's rule**: the master email switch and a bounce stop it; the
   category opt-out doesn't.
9. **Event-shaped stages**: a request's status reminder needs `metadata.status_changed_at`,
   which only the workflow transition writes (from now on). A poll's "closed" hangs off
   `closes_at`; a poll closed by hand early records no close time, and "opened" uses
   `date_created` — both left to 5b's close/open events. A status change also posts a system
   comment that rings the comment bell; 5b's request-status event should claim the same key so
   one path sends.
10. **The dry run runs before the script** (unprovisioned: New York, rules off, an empty log),
    so a board can see what would go out before anything can.

Gates (final tree):
- typecheck 0;
- vitest **123 files / 2,101 tests** (from 119 / 2001 at Session 8);
- `pnpm build` (node-server) green, the four partials inlined in `chunks/nitro/nitro.mjs`;
- `audit:hairline-surfaces` 0;
- the tick on a local build (`:3417`): no secret → 401; `?dry=1&org=demo` with the secret →
  `provisioned: false`, nothing due (Tue 3:27 pm New York). `demo` has no meetings, polls, requests or vendors; its five
  charges were due Sep 1 (grace 7), outside every window today. Stepping `asOf` back into the
  overdue window: `unreachable: { "dues.overdue": 5 }` from Sep 9 (not Sep 8) through Oct 8 (not Oct 9) — the window to the day; a live run without `dry` answers `{ provisioned: false }` and does nothing. Nothing written (unprovisioned: no log to write).

Operator TODOs (Peter):

- [ ] **Push is yours**: this session's two commits (code + docs) on local `main`.
- [ ] **Run** `pnpm create:reminder-log` (it prints `reminder_key is UNIQUE`), then
      `pnpm generate:types` (expect no diff). Until then the tick answers `provisioned: false`
      and the digest stays on `DIGEST_TZ`.
- [ ] **Set each community's time zone** (`hoa_organizations.timezone`; all New York by
      default) — any org outside Eastern gets its digest at the right hour once set.
- [ ] To try it on `demo`: give one meeting a date a day out, set
      `block_settings.reminders` to `{"rules":{"meeting":{"enabled":true}}}`, and run
      `?dry=1&org=demo`, then without `dry` (the email is held by the demo guard).
- [ ] After deploy: confirm the new cron (`/api/reminders/run`, :05 hourly) in Vercel.
- [ ] Still open from Sessions 7–8 (unchanged).

#### Phase 5b — kickoff prompt (Sonnet 5.5, effort high)

```
Continue the Earnest Parity Round 3 programme for HOA Connect. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log entry for Session 9 (Phase 5a: shipped, deviations,
operator TODOs), §Token budget, and §5b. Do not read §6 onwards, the Session
log before Session 9, or docs/spec-email-send-queue.md, and never open
docs/plan-earnest-parity-round2.md. Read docs/reminders.md whole (it is
short). Do not re-survey Earnest.

This session = Phase 5b (settings, visibility, events) ONLY, on Sonnet 5.5 at
effort high. 5a's engine is done and tested — build on it, don't redesign it:
core/shared/reminders/settings.ts (the settings shape and defaults; every rule
off until `enabled`), core/server/utils/reminders.ts (`runReminderTick` with
`dry`, `org`, `asOf`; its `ReminderTickResult` has `wouldSend`,
`wouldSendGroups`, `off`, `unreachable`), core/server/utils/reminder-email.ts
(`sampleReminders`), GET /api/email/preview-mjml (`template=reminder-*`).

First ask Peter whether `pnpm create:reminder-log` has run (Session 9's
operator TODO). If not, everything below still works against an unprovisioned
dry run, but saving settings needs `block_settings.reminders`.

Deliverables (§5b, fitted to what exists):
1. Settings → Reminders (admin, org-gated with requireAdminOrManagerGrant like
   preview-mjml): per-rule toggle — turning one on is the board's approval, so
   write `enabled`, `approved_at`, `approved_by` together; stages; `days`;
   dues `tenants`; the send hour; the org's time zone
   (`hoa_organizations.timezone`, a select of the US zones the 5a script
   lists); a template preview (the preview-mjml iframe, as the Branding card
   does); "send me a test" (one reminder to the signed-in admin, through
   `sendReminder`, never logged); and a dry-run panel: a new org-gated route
   that calls `runReminderTick({ dry: true, org, asOf })` for each hour of the
   next 24 h, dedupes by key and answers "14 dues reminders, 1 meeting
   reminder" plus `off` and `unreachable` ("5 have no app account — the
   billing worker emails them"). Use the shell primitives from Phase 1a/2 (no
   raw date inputs, no confirm()); add the reminder templates to the Branding
   card's preview select.
2. Resident surfaces: the portal home's "Up next" (useHomeGlances) shows dues
   due, the next meeting, a poll closing, a request update; the `/payments`
   ledger shows "Reminder sent {date}" from `payment_requests.reminder_sent_at`
   / `metadata.reminders`.
3. The six notification events through core/shared/notifications/events.ts
   with the existing categories: payment received, payment overdue, request
   status changed, poll opened / closed, document published to members, board
   decision posted. Where an event is also a reminder stage (request status,
   poll opened, poll closed), the event INSERTS the same `hoa_reminder_log` key
   the rule would (`reminderKey` in rules.ts) before it notifies, so the tick
   then skips it — one path sends (Session 9, deviation 9). Poll close: anchor
   on the close moment.

Use a Haiku 5.5 subagent for any census (the Settings page layout and where a
card goes; useHomeGlances; the /payments ledger component; the routes that
publish documents, record payments, close and open polls). Read only the lines
you need. Gates in the background, tail only: `pnpm test | tail -6`;
typecheck with NODE_OPTIONS=--max-old-space-size=6144 into a log, grep
`error TS`; build into a log, grep exit; `pnpm audit:hairline-surfaces`.
Browser verification is one headless Playwright script
(scripts/browser/verify-p5b-reminders.cjs, demo org, light and dark, the dry
run panel and a saved toggle round-trip), screenshots read only on failure.

Local session: work on main, ask before pushing. When done: update the Status
row, append Session 10 to the Session log (shipped, deviations, operator
TODOs), write the Phase 6 kickoff prompt (Sonnet 5.5, effort high), and stop.
One phase per session.
```

**Session 10 — Phase 5b: settings, visibility, events** (2026-11-03) — local, on `main`, Sonnet 5.5 at
effort high. Peter confirmed `main` was pushed (Session 9's commits included) and that `pnpm create:reminder-log`
+ `pnpm generate:types` had run (`hoa_reminder_log`, `hoa_organizations.timezone` and
`block_settings.reminders` exist); those checks were skipped. Three Haiku 5.5 census agents (the Settings page and
Branding card; the resident home and `/payments`; the event call sites). One code commit, one docs commit.

Shipped (runbook: `docs/reminders.md` §3 and §5):

- **Settings → Organization → Reminders** — `app/components/Settings/RemindersSettingsForm.vue`, a tab on
  `SettingsOrganizationPage` and a hub entry. Per rule: the toggle, the stages (a stage off is stored as
  `stages: { <stage>: false }`), the lead days (dues, violations, vendor coverage, request quiet days), tenants
  (dues) and the board's own subject and first sentence with the `{{tokens}}` each rule offers
  (`RULE_GUIDE`); the send hour (6 am–8 pm) and the community's time zone (the eight zones the 5a script lists,
  `US_TIME_ZONES`). **Saved by `PUT /api/org/reminders/settings`, not a browser PATCH**: turning a rule on writes
  `enabled`, `approved_at` and `approved_by` together, from the signed-in admin; a rule that stays on keeps its
  approval; new wording on a rule that is on, or off-then-on, re-approves; a rule that is off carries none
  (`prepareReminderSettings`, `core/shared/reminders/admin.ts`). 409 with the command before the script has run.
  Gate on all three routes: `requireReminderAdmin` = `requireAdminOrManagerGrant(…, "communications")`, the gate
  `preview-mjml` uses.
- **See it, try it** — the template preview (a sandboxed iframe on `preview-mjml?template=reminder-*`; the
  Branding card's select now offers the four too); **"send me a test"** (`POST /api/org/reminders/test`: one sample,
  made by the real rules, to the signed-in admin only, through `sendReminder`, marked `[Test]`, never logged);
  **the next 24 hours** (`POST /api/org/reminders/dry-run`: the tick's dry run at each of the next 24 hours, the
  snapshot read once, folded by `summarizeDryRuns` into "14 dues reminders, 1 meeting reminder" + what rules that
  are off would add + who can't be reached: "5 have no app account — the billing worker emails them"). It reads
  the **saved** settings; the card says so.
- **Resident surfaces** — **Up next** on the resident home (`HomeUpNext` on `MemberDashboardPage`'s Overview, so
  also the admin's "view as member"): dues due inside two weeks or overdue, the next meeting, a poll still waiting
  on this member's vote, a request of theirs that changed in the last week; `buildUpNext`
  (`core/shared/home/up-next.ts`, pure, in the reminders' words and the community's clock) +
  `useUpNextGlance` (in `useHomeGlances.ts`; four reads, each allowed to fail alone). Hidden when empty.
  `/payments` shows "Reminder sent {date}" from `payment_requests.reminder_sent_at` on each open charge.
- **Events** — `announceReminderEvent` (`core/server/utils/reminders.ts`) runs the engine's own rule for one request
  or poll, under the engine's own log key, minus the quiet hours: request status
  (`POST /api/org/requests/status-event`, called by `applyTransition`), poll opened (create open; a draft opened),
  poll closed (`POST /api/org/polls/close`). With the rule and stage on it sends what the tick would (the approved
  email too); with them off it is a bell and a push. The key is claimed either way. **Payment received** — a bell
  and a push to the member from the Stripe webhook (autopay included) and from an admin recording a payment
  (`payment-notify.ts`). **Board decision shared** — sharing Board Room minutes notifies the seated board and the
  admins, once.
- **Tests** — `reminder-admin.test.ts` (26: approval stamping, clamping, junk, the guide, the dry-run fold),
  `up-next.test.ts` (16), `reminder-events.test.ts` (18: an event then the tick sends once, the tick then the event
  sends once, quiet hours, two events at once, rule off, an old draft, clock skew, a failed send, no log yet),
  `reminder-admin-routes.test.ts` (17: the gate, who approved, the 24-hour fold, the test send, the status event's
  trust), `poll-events-routes.test.ts` (11), `payment-notify.test.ts` (7), plus the webhook (receipt once, none on a
  redelivery) and the minutes share (the board is told once).

Deviations, with reasons:

1. **There was no "Up next" stack to extend** (the census: `useHomeGlances` feeds the admin rail only; the resident
   home had no upcoming list). Built one, small, on the resident home.
2. **Three of the six events were already something.** *Payment overdue* is the dues rule's `overdue` stage: the
   status flips in the GitHub Actions billing worker, which can't call `notifyUsers`, and the engine reaches every
   member with an account when the rule is on. *Document published* already notifies every member
   (`documents/publish.post.ts`). *Board decision posted*: no collection named decision or resolution exists; the
   nearest is the Board Room's minutes (`hoa_director_minutes`), whose "share with the board" now notifies the
   board. A resident-facing "decision" (a closed poll with its result) is the poll-closed event.
3. **Request status needed a route.** Transitions are written from the browser (`useRequests.applyTransition`);
   the route is member-gated like `requests/notify` and trusts only the id: it announces the request as it
   stands, under the engine's key, so a call for a change that didn't happen finds nothing due. The system comment
   no longer rings the comment bell for the submitter on a resident-facing status change (`createComment`
   gained `announce: false`), so they aren't told twice; other request types keep the comment bell.
4. **Poll close records its moment.** The engine anchors "closed" on `closes_at`, so closing by hand sets
   `closes_at` to now when there is none, it is still ahead, or it is more than 40 h past (the engine's window is
   48 h). A close time inside the last 40 h is left as it is. No screen shows `closes_at` on a closed poll.
5. **Events send when the rule is off** (bell and push — the weight of "new document available"); the email waits
   for the board's approval. The key is claimed either way, so turning a rule on later doesn't announce it twice.
6. **A draft opened later is news; a closed poll reopened is a correction.** The engine anchors "opened" on
   `date_created`, so an old draft would be outside its window: the event treats it as opened now.
7. **Status-change clock skew.** `status_changed_at` is the browser's clock: the event evaluates at the later of
   now and that time.
8. **Engine hooks, no behaviour change for the tick**: `evaluateReminders(…, { allHours })`,
   `loadSnapshot({ only })`, `instant` exported; the four coercion helpers in `settings.ts` exported.
9. **The dry run's `off` and `unreachable` carry counts, not keys**, so across 24 hours they take the largest count
   any hour saw per stage, then add the stages up; notifications are counted once per group.
10. **Not built**: a ledger entry when a board approves a rule (who approved what is on the settings, not in the
    Community Ledger); a test of `payments/record.post.ts` itself (the one-line hook shares `payment-notify.ts` with
    the webhook and is covered there).
11. **The Settings page re-renders once while it loads** (it reads the organization twice); a click in the first
    second or two lands on the instance that is replaced. The card compares saved values, not object identity, so
    the re-read can't wipe an edit; the browser script waits two seconds for the page to settle.

Gates (final tree):
- typecheck 0;
- vitest **129 files / 2,200 tests** (from 123 / 2,101 at Session 9);
- `pnpm build` (node-server) green;
- `audit:hairline-surfaces` 0;
- browser, `scripts/browser/verify-p5b-reminders.cjs` on a local build (`:3417`), demo org, light and dark, a real
  session: **52/52** — six rule cards, a saved toggle round-trip (Directus holds `enabled`, `approved_at`,
  `approved_by` = the signed-in admin, the 5 days and the overdue stage off; a reload shows them; off clears the
  approval), the dry run answers, the preview is sandboxed and follows the select, the Branding select offers the
  four reminder templates, Up next shows a meeting, a poll and a charge made for the run, "Reminder sent" on
  `/payments`; no page errors; `demo` identical before and after. "Send me a test" is not pressed there (it would
  put a bell row in the demo inbox); the route is tested. Screenshots are in the scratch dir and were not read.

Operator TODOs (Peter):

- [ ] **Push is yours**: this session's two commits (code + docs) on local `main`.
- [ ] **Turn the rules on, per community**, in Settings → Organization → Reminders (every rule is off; turning one on
      is the board's approval of its wording). Try it first with "send me a test" and "check the next 24 hours".
- [ ] **Set each community's time zone** there (all New York by default).
- [ ] Payment receipts and "board decision shared" notifications are live on deploy (no setting): confirm the first
      real payment gives the member one bell row.
- [ ] Still open from Sessions 7–9 (unchanged).

**Session 11 — Phase 6: PWA and push completion** (2026-11-04) — local, on `main`, Sonnet 5.5 at effort high.
One Haiku 5.5 census (every `navigator.serviceWorker` caller, every `notifyUsers` push caller). One code commit,
one docs commit. Earnest was read only at `public/sw.js`, `pwa.client.ts` and `pwa-standalone.client.ts`.

Shipped (the device checklist is `docs/push-verification.md`):

- **Service worker app-wide** — `core/app/plugins/pwa.client.ts`: registers `/sw.js` on every route with
  `updateViaCache: 'none'`, `update()` on visibility, no fetch handler and no precache (unchanged). It also owns
  the `push-navigate` listener (a notification tapped while the app is open routes in-app through `navigateTo`;
  a cross-origin target uses `location.assign`) and captures `beforeinstallprompt` / `appinstalled`.
  `pwa-standalone.client.ts`: `html[data-standalone]` + the same-origin link trap.
- **Install** — `useInstallPrompt()` (`core/app/composables`, over the pure `core/shared/pwa/install.ts`: modes
  `installed | prompt | ios | none`, iOS-Safari detection that excludes CriOS/FxiOS/in-app browsers, dismissal
  keyed to `runtimeConfig.public.buildId`) and `AppInstallCard` (a glass `WidgetGlass` card) on the resident
  home's Overview (above Up next) and the admin dashboard (above the tab bar). Android/desktop: an **Install app**
  button fires the captured prompt. iOS Safari: the three Share → Add to Home Screen steps. The account page's
  own iOS block is untouched (it is the push card's context).
- **Manifest** — `core/shared/pwa/manifest.ts` (`buildManifest`) behind the existing per-host route: `id: "/"`,
  `start_url: "/?source=pwa"`, `scope`, and four `shortcuts` — Pay dues, Requests, Documents, Channels — under
  the resolved community's slug (`?source=shortcut`). A host that resolves to no community (the platform's own)
  gets no shortcuts rather than 404 links. The route now also selects `slug`.
- **Push semantics** — payload: `tag` (`collection:item`, with `renotify` in the worker), `url`, **`badgeCount`**
  (renamed from `badge`, see deviation 1) and `actions`. `sw.js` now: reads `badgeCount` (a legacy numeric `badge`
  still works), shows `actions` (capped at `Notification.maxActions`, each button's link carried in `data` and
  looked up on the click), and on click focuses an open same-origin window and posts `push-navigate`, else
  `openWindow`; API downloads (the `.ics`) always open in a new window. Added from Earnest: the
  `pushsubscriptionchange` self-heal (HOA's routes: `/api/user/push/config` and `/subscribe`, which now deletes
  the member's own replaced endpoint when given `previous_endpoint`).
- **Reminder buttons** — `reminderPushActions` (`core/shared/reminders/messages.ts`): dues → **Pay**
  (`/payments`), meeting → **Add to calendar**, request → **Open** (the request's own page); violation, poll and
  vendor coverage get none. `sendReminder` → `notifyUsers({ pushActions })` → `buildPushPayload` resolves each
  link (org-scoped, absolute with the origin, or a `root` path for an API route).
- **`GET /api/meetings/:id/calendar`** — the `.ics` behind "Add to calendar" (deviation 3). Authenticated,
  member of the meeting's community, 404 if unpublished or undated. Pure builder `core/shared/meetings/ics.ts`.
- **`@vite-pwa/nuxt` removed** (configured nowhere). `pnpm remove` took it out of `package.json` and the root
  importer; `pnpm install --frozen-lockfile` passes. See deviation 6 for what the lockfile still carries.
- **Docs** — `docs/push-verification.md` (the matrix as a checklist for Peter, the test route, the reminder
  buttons, a record table); `docs/go-live-checklist.md` §5 points at it.
- **Tests** — `pwa-manifest` (4), `pwa-install` (8: iOS Safari, iPadOS, iOS Chrome, captured prompt, installed,
  dismissed-this-build), `reminder-push-actions` (8), `meeting-ics` (3), `push.test.ts` (+4: tag, url,
  badgeCount, actions), `send-reminder.test.ts` (3: the same notifications as before plus the buttons, TTL and
  urgency unchanged, push off), `notify-reminder-options` (+1: actions reach the payload).

Deviations, with reasons:

1. **`badge` → `badgeCount`.** The payload's `badge` held the unread count, but on the Notification API `badge` is
   the monochrome icon URL — the worker would have had two meanings. Earnest renamed it; so did this. Nothing
   in HOA's senders set it (the one test did), and the worker still reads a numeric `badge`.
2. **No sender computes a per-user `badgeCount` yet.** `notifyUsers` fans one payload to everyone; a per-user
   unread total would be a read per recipient. Without it a push bumps the icon by one and an open page
   corrects it to the truth — as before. The payload and worker support the count; this is the follow-up if the
   drift is felt on devices (recorded in `docs/push-verification.md`).
3. **An `.ics` route was needed.** "Meeting → Add to calendar" had nothing to land on: no calendar file existed
   anywhere. The meeting row has a start and no end, so the event is an hour long (the title, place and the
   community's name carry the rest). Meetings reminders only reach published meetings; so does the route.
4. **The link trap is bubble-phase, not capture.** Earnest's `capture: true` handler runs before RouterLink's, so
   `defaultPrevented` is still false and every NuxtLink tap would be a full reload in standalone mode. In the
   bubble phase RouterLink's `preventDefault` is seen first. The browser script checks a router link keeps its
   JS state.
5. **iOS gets no action buttons.** WebKit ignores `actions`; the tap itself goes to the right page. The
   verification doc says so. The card is Safari-only on iOS (iOS Chrome can install on 16.4+, but its steps
   differ; it shows nothing rather than the wrong steps).
6. **The lockfile keeps a stale `apps/app` importer** that still lists `@vite-pwa/nuxt` (and its tree); that
   directory no longer exists. Pre-existing and harmless (`--frozen-lockfile` passes); `pnpm install` without the
   flag would prune it — left for the next dependency change so this diff stays four lines.
7. **The invitation page does not end on the card** (the plan's §6.3 has it; the kickoff prompt scoped it to the
   two homes). Not built.
8. **Headless Chromium crashes when a service worker calls the Badging API** (macOS; the signed-in page posts the
   unread count to the worker on every load, now that a worker exists everywhere). Not a product bug —
   real Chrome is fine — but it means the browser script drops the page's `badge` message and has no
   `setAppBadge`. Said at the top of that script.

Gates (final tree):
- typecheck 0;
- vitest **134 files / 2,231 tests** (from 129 / 2,200 at Session 10);
- `pnpm build` (node-server) green;
- `audit:hairline-surfaces` 0;
- browser, `scripts/browser/verify-p6-pwa.cjs` on a local build (`:3418`), demo org, light and dark, a real
  session: **52/52** — the worker registered on load (scope `/`, `updateViaCache: none`, activated) with no push
  opt-in; the install card absent until `beforeinstallprompt`, then shown as a glass surface with an Install
  button on the admin home and the resident view, dismissed, and still hidden after a reload; the iPhone-Safari
  user agent shows the Share steps and no button; standalone sets `html[data-standalone]`, hides the card and
  leaves a router link a client-side navigation; the manifest serves `id`, `start_url` and four shortcuts under
  the slug on a community host and none on the platform host; `sw.js` is no-cache; the `.ics` route is auth-gated.
  No page errors. Screenshots were not read.

**Not verified, and not claimed:** any push **delivery** on a device, the notification buttons on Android or desktop
Chrome, the badge on a Home Screen icon, and the OS "Install" dialog. Those are `docs/push-verification.md`.

Operator TODOs (Peter):

- [ ] **Push is yours**: this session's two commits (code + docs) on local `main`.
- [ ] **Go-live §5 first**, if not done: the production VAPID pair, then a redeploy — push stays inert without it.
- [ ] **Run `docs/push-verification.md`** on an iPhone (installed, iOS 17+), an Android phone and desktop Chrome;
      record the results in its table. That closes go-live §5.
- [ ] With a reminder rule on, tap **Send me a test** on a phone and confirm the buttons (Pay / Add to calendar /
      Open) where the device shows them.
- [ ] The first deploy puts a service worker on every visitor's device (it was opt-in before). It caches
      nothing and has no fetch handler, so there is nothing to go stale; if a device ever looks pinned to an old
      build, `sw.js` is served no-cache and re-checked on every foreground.
- [ ] Still open from Sessions 7–10 (unchanged).

#### Phase 6 — kickoff prompt (Sonnet 5.5, effort high)

```
Continue the Earnest Parity Round 3 programme for HOA Connect. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log entry for Session 10 (Phase 5b: shipped, deviations,
operator TODOs), §Token budget, and §6. Do not read §7 onwards, the Session
log before Session 10, or docs/spec-email-send-queue.md, and never open
docs/plan-earnest-parity-round2.md. Do not re-survey Earnest beyond the files
named below.

This session = Phase 6 (PWA and push completion) ONLY, on Sonnet 5.5 at effort
high. Earnest reference: ~/Sites/earnest/earnest — read only its sw.js, its
pwa-standalone.client.ts and its install composable/card, and only the lines
you need (`sed -n`). This is a specified port, not a design.

HOA side, already verified: core/public/sw.js (the worker; push and click
handling mostly exist — diff against Earnest's and close the gaps),
core/server/utils/push.ts and core/shared/notifications/push.ts (the payload),
core/server/utils/notify.ts (`push: false | { urgency, ttlSeconds }` — Phase 5a;
the reminders send through it), core/server/api/user/push/{config,subscribe,
test,unsubscribe}.ts, core/app/composables/useAppBadge.ts,
core/server/api/manifest.webmanifest.get.ts (the per-host manifest),
app/pages/account.vue (the iOS add-to-home-screen steps are buried there),
docs/go-live-checklist.md §5 (VAPID: built, inert until the production pair
exists). Push for reminders is the new thing since Round 2: `sendReminder`
(core/server/utils/reminders.ts) passes urgency and TTL; a dues, meeting or
request notification should carry an action.

Deliverables (§6, fitted to what exists):
1. The service worker registered app-wide from a `pwa.client.ts` plugin
   (`updateViaCache: 'none'`, `update()` on visibility), not only after a push
   opt-in; keep no fetch handler and no precache. Port pwa-standalone.client.ts
   (`html[data-standalone]`, same-origin link taps through `location.assign`).
2. Remove `@vite-pwa/nuxt` from devDependencies (configured nowhere; the plan's
   default). Say so in the log and check `pnpm install` leaves the lockfile
   consistent.
3. `useInstallPrompt()` + a glass `InstallCard` on the portal home and the admin
   home (dismissible per build; the iOS Share → Add to Home Screen steps);
   manifest `shortcuts` (Pay dues, Requests, Documents, Channels), `id`,
   `start_url: /?source=pwa`.
4. Push semantics: `tag` (renotify), `badgeCount`, `url`; `notificationclick`
   focuses an open client and posts `push-navigate`, else `openWindow`;
   notification **actions** for the reminder types (dues → Pay, meeting → Add to
   calendar, request → Open) — carry them from `sendReminder` through
   `notifyUsers` to the payload. Channels' push waits for Phase 7.
5. docs/push-verification.md: the device matrix as a checklist for Peter (iOS 17+
   Safari standalone, Android Chrome, desktop Chrome: subscribe → `POST
   /api/user/push/test` → received → click routes → badge clears). Device
   verification is Peter's, not the model's: write the doc and the test route
   notes, do not claim a device passed.

Tests: the payload (tag, badgeCount, url, actions per reminder type), the
manifest route (shortcuts, id, start_url), `useInstallPrompt` states (iOS Safari
not standalone, beforeinstallprompt captured, already installed, dismissed for
this build), and that `sendReminder` still sends the same notifications.

Use a Haiku 5.5 subagent for any census (where the SW is registered today; every
caller of `navigator.serviceWorker`). Read only the lines you need. Gates in the
background, tail only: `pnpm test | tail -6`; typecheck with
NODE_OPTIONS=--max-old-space-size=6144 into a log, grep `error TS`; build into a
log, grep exit; `pnpm audit:hairline-surfaces`. Browser verification is one
headless Playwright script (scripts/browser/verify-p6-pwa.cjs, demo org, light
and dark: the worker is registered on load, the install card shows and
dismisses, the manifest serves its shortcuts). playwright@1.63.0 was installed
in earlier sessions' scratchpads: find one with `find /private/tmp/claude-501
-type d -path '*pw/node_modules/playwright'` and use it with NODE_PATH; only if
none is left, ask Peter before installing it into this session's scratchpad.
Screenshots are read only on failure.

Local session: work on main, ask before pushing. When done: update the Status
row, append Session 11 to the Session log (shipped, deviations, operator TODOs),
write the Phase 7 kickoff prompt (Sonnet 5.5, effort high), and stop. One phase
per session.
```

#### Phase 7 — kickoff prompt (Sonnet 5.5, effort high)

```
Continue the Earnest Parity Round 3 programme for HOA Connect. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log entry for Session 11 (Phase 6: shipped, deviations,
operator TODOs), §Token budget, §7 and Decisions (1 and 6). Do not read §8
onwards, the Session log before Session 11, or docs/spec-email-send-queue.md,
and never open docs/plan-earnest-parity-round2.md. Do not re-survey Earnest
beyond the files you name yourself from §7's own words, and only the lines you
need (`sed -n`).

This session = Phase 7 (Channels gap-close) ONLY, on Sonnet 5.5 at effort
high. §7 extends code that exists on both sides; the one design point is the
notify-on-message fan-out, and §7.2 fixes it.

HOA side, already located (verify with a quick ls/grep, don't re-survey):
app/components/channels/{ChannelThread,ChannelMessage,ChannelEditor,
ChannelsList,ChannelsWorkspace,ChannelMembersPanel,CreateChannelModal}.vue;
core/app/composables/{useChannelAccess,useChannelSearch,useChannelUnread,
useChannelsPanel,useRealtimeSubscription,useWebSocketManager}.ts;
core/server/api/hoa/channels/** (create, moderate, moderation-log, pin, report,
unread, [channel]/mute…); core/server/api/websocket/token.get.ts;
core/server/utils/channel-unread.ts; the per-member `notifications_enabled`
(read it from the mute route). Push comes from Phase 6, and it is ready:
`notifyUsers({ …, push, pushActions })` (core/server/utils/notify.ts) carries
`tag` (collection:item, so "3 new in #board" REPLACES the older push and
re-buzzes), `url`, `badgeCount` and buttons; the worker (core/public/sw.js)
focuses an open window and posts `push-navigate`, which pwa.client.ts routes
in-app. A channel message's push should be tagged per channel, link to the
channel, and carry an "Open" button (see `reminderPushActions` for the shape).
Per-user `badgeCount` is NOT computed anywhere yet (Session 11, deviation 2) —
channel unread is the natural first place; decide whether it is worth a read
per recipient, and say so in the log.

Deliverables (§7, fitted to what exists):
1. Message editing: own messages; 15-minute window for members, unlimited for
   managers (Decision 6); `is_edited` + `edited_at`; realtime update; a
   moderation-log entry on manager edits. Server-enforced window, not just UI.
2. Notify on message: a collapsed bell row per member ("3 new in #board") and a
   push, unless that member has `notifications_enabled` off or has the channel
   open (presence, item 4); mentions keep their own row; email only via the
   digest. Start from the existing unread/mention paths; do not notify the
   author; scope recipients to the channel's roster.
3. DMs as private channels (Decision 1): `is_private` + `is_dm`, a seeded
   two-person roster, a "Direct" group in the roster, created from a member's
   profile and from the Spotlight "Message …" verb. No new collection (if a
   field is missing, write the `pnpm` script the earlier phases did and say
   so — ask Peter first whether to run it).
4. Presence (cheap): a 60 s heartbeat per open channel over the existing WS
   manager → "who's here" avatars in the thread header and the suppression in
   item 2. No typing indicators.
5. Embed ChannelThread in the request and project slide-over panels with a
   "Start a channel" verb when none is linked.
6. Shell: ChannelsPanel and the composer on glass, `confirm()` → `useConfirm`,
   CreateChannelModal on BottomSheet below md.

Tests: the edit window (member inside/outside, manager always, not-your-message,
the moderation entry), the notify fan-out (collapse into one row, the
author/muted/channel-open exclusions, mention keeps its row, tag per channel),
DMs (roster of two, no third party can join, listed under Direct), presence
(heartbeat expiry). Use a Haiku 5.5 subagent for any census (every place a
channel message is created; where unread rows are written; the slide-over
panels). Gates in the background, tail only: `pnpm test | tail -6`; typecheck
with NODE_OPTIONS=--max-old-space-size=6144 into a log, grep `error TS`; build
into a log, grep exit; `pnpm audit:hairline-surfaces`. Browser verification is
one headless Playwright script (scripts/browser/verify-p7-channels.cjs, demo
org, light and dark). Reuse the harness note in verify-p6-pwa.cjs (headless
Chromium crashes if a service worker calls the Badging API — drop the page's
`badge` message and delete `setAppBadge`). playwright@1.63.0 lives in an
earlier session's scratchpad: `find /private/tmp/claude-501 -type d -path
'*pw/node_modules/playwright'`, use it with NODE_PATH; only if none is left, ask
Peter before installing it. Screenshots are read only on failure. Real push
delivery to a device is Peter's (docs/push-verification.md) — write the
channel rows into that doc's matrix and do not claim a device passed.

Local session: work on main, ask before pushing. When done: update the Status
row, append Session 12 to the Session log (shipped, deviations, operator
TODOs), write the Phase 8 kickoff prompt (Sonnet 5.5, effort high), and stop.
One phase per session.
```

**Session 12 — Phase 7: Channels gap-close** (2026-11-04) — local, on `main`, Sonnet 5.5 at effort high.
One Haiku 5.5 census (every message-create path, unread/mention writers, schema flags, panels, WS manager,
Spotlight). One code commit (`34870ed`), one docs commit. Earnest was not read: §7 extends code that exists on both sides.

The census changed the brief in three ways, so the session asked first (and Peter answered): channel messages are
**created and edited straight from the browser** (no server moment exists); `edited_at`, `is_dm` and any presence
field **do not exist**; and there is **no project slide-over** (only `request` and `task`). Answers: edit through a
route AND narrow the Directus permission; notify through a client-called route; write the schema script but **don't
run it**; embed on the request panel *and* the project pages.

Shipped:

- **Edit** — `POST /api/hoa/channels/:channel/edit` (`core/shared/channels/rules.ts` → `checkEditAllowed`): the author for
  15 minutes (`EDIT_WINDOW_MS`), a manager (admin / board / channel admin) with no limit, and a manager may correct
  **another member's** message — which writes a `hoa_channel_moderation_log` row (`action: "edit"`, the ORIGINAL text
  as the snippet). Anyone else 403; a hidden message 409; empty text refused unless attachments. Sets `is_edited` +
  `edited_at` (retries without `edited_at` if the column isn't there yet). UI: a pencil in `ChannelMessage` (same rule, a
  30 s clock so it doesn't outlive its window) opening the inline `ChannelEditor`; the "edited" badge already existed.
- **Notify on message** — `POST /channels/:channel/notify {messageId}` → `notifyChannelMessage`
  (`core/server/utils/channel-fanout.ts`). Called by the thread after the message and its mentions are written (and by
  replies). The caller names a message, not an audience: it must be **their own, published, ≤ 2 minutes old**, and is
  fanned out **once** (per-instance replay guard; the age window is the real bound). Recipients = the channel's roster
  minus the author, `notifications_enabled: false`, anyone present (`present_at` ≤ 90 s), and anyone @-mentioned in
  that message (their mention keeps its own row + push). `notifyUsers` gained **`bellCollapse`**: one unread (inbox)
  `directus_notifications` row per member per channel, updated in place to "N new in #board" / "N new from Ana"; a read
  (archived) row starts a fresh "1 new". The push is `collection:item` = `hoa_channels:<id>` so the next one replaces the
  last and re-buzzes, with an **Open** button. No email (digest only). New notification **category `channel`**
  ("Channel messages", on by default, mutable in Account → Notifications; sample added to the email preview map). The bell
  type for a channel row is `mention` (its `metadata.channelId` deep-links to the channel).
- **DMs** — a private channel, slug `dm-<sorted pair>` (stable for the pair), `is_private` + `is_dm`, two roster rows
  (plain `member`, so nobody can add or remove anyone). `POST /channels/dm {organization, userId}` finds or creates it;
  both people must be able to use channels (org admins + active board — the `getOrgChannelEnrollees` set). `invite` and
  `remove-member` refuse a DM (`refuseIfDirectMessage`). `GET /channels/dm-peers` tells each side who the OTHER person
  is (members can't read each other's roster rows). The roster groups DMs under **Direct**, titled with the other
  person; entry points: a **Message** button on member rows (people with a login, not yourself) and a **Message …**
  group in Spotlight over the member hits (`SearchHit.userId`). The client recognises a DM **by its slug**, so the
  roster/thread still render before `is_dm` is migrated.
- **Presence** — `useChannelPresence`: a 60 s heartbeat while a channel is open and the tab visible →
  `POST /channels/:channel/presence` stamps `hoa_channel_members.present_at` and answers who else is here (avatars in the
  thread header); `{leaving:true}` on close/pagehide. A **timestamp on the roster row**, not server memory, so it holds
  across serverless instances. No typing indicators.
- **Embedded threads** — `ChannelThread` inline in `RequestDetail` (a Discussion toggle where there was a link out; "Start a
  channel" replaces "Spawn channel") and a new **Discussion tab on the project page** via `EntityChannel` (looks up
  `hoa_channels.project`, else "Start a channel"; `/channels/create` now accepts `project`). Mounted lazily so a record
  nobody is discussing holds no subscription or heartbeat.
- **Shell** — the thread's header/main go transparent inside the glass panel, the composer is a `glass-surface` card, the
  hand-rolled delete-channel dialog became `useConfirm` (no native `confirm(` remained), and `CreateChannelModal` was
  already on `AppBottomSheet`.
- **`scripts/add-channel-phase7.ts` (`pnpm add:channel-phase7`)** — `hoa_channel_messages.edited_at`, `hoa_channels.is_dm`,
  `hoa_channel_members.present_at`, the "Edit" choice on the moderation log, and it **removes the browser's `update`
  permission on `hoa_channel_messages`** (HOA Admin + HOA Member) so the 15-minute window can't be skipped with a hand-made
  API call. Nothing in the app updates a message from the browser; hide/remove already run on the admin token. **Written,
  not run.**
- **Docs** — `docs/push-verification.md` gained the channel rows (push, replace-not-stack, one bell row, suppressed while
  open, muted, DM, mention, author).
- **Tests** — `channel-rules` (+19: the window table, presence TTL, fan-out set, collapsed subject, DM slug/roster/title),
  `channel-phase7` (+28: the edit route's 10 cases, the fan-out's 7, DM roster/guard, presence), `notify-bell-collapse`
  (+6). Search/bell/preferences tests untouched and green.

Deviations, with reasons:

1. **Schema script written, not run** (Peter's call). Until it runs: DM creation answers 409 "run `pnpm add:channel-phase7`";
   presence returns an empty room (so nothing is suppressed — fail-safe: a notification that could have been skipped,
   never a lost one); edits still work, just without `edited_at`; the browser can still update messages directly.
2. **Manager edits of others' messages.** §7.1 says "own messages … moderation log entry on manager edits". Read as: a
   manager may also correct another member's message, and that is logged; a manager editing their *own* message is not.
3. **`edited_at` is written, never read.** It is not in any field list, so an unmigrated database can't break the thread's
   realtime read. The badge says "edited"; a "when" tooltip is a one-line follow-up once the script has run.
4. **No per-user `badgeCount` for channel pushes** (Session 11, deviation 2). A per-recipient unread read per message in a
   busy channel is not worth it: the push bumps the icon by one and the open page corrects it. Recorded in
   `docs/push-verification.md`.
5. **DMs are identified by slug on the client** (`dm-…`), by `is_dm` on the server's guards. Redundant on purpose: it keeps the
   roster working across the migration. A user-made channel slugged `dm-…` would be listed under Direct — harmless, and
   channel creation is admin/board only.
6. **Spotlight "Message …" is a result group over member hits, not a `create-verbs` entry** — a verb has no way to pick a person.
   Typing `message` alone does not surface it; typing a name does.
7. **DMs are admin/board only.** Channels are an admin/board tool and `/channels/dm` refuses anyone else; a resident-to-
   resident DM would be a separate decision (the channel read policy is membership-scoped, so it would work — the product
   question is whether residents get Channels at all).
8. **The bell groups a channel row under "Mentions"** (it has no channel type of its own); preference gating is by the new
   `channel` category, not the bell type.
9. **No HTML sanitizing was added** — channel bodies are stored as the editor sent them (create already did, and renders
   with `v-html`). Edit keeps that trust model; the audience is admins and board members. Worth a look in Phase 9.
10. **Replay guard is per-instance memory.** The 2-minute age window and "your own message" are the real bounds; the
    guard only stops a double-click inflating "N new".

Gates (final tree, before the docs commit):
- typecheck 0 (`error TS`);
- vitest **137 files / 2,284 tests** (from 134 / 2,231);
- `pnpm build` green; `audit:hairline-surfaces` 0;
- browser, `scripts/browser/verify-p7-channels.cjs` on a local build (`:3419`), demo org, light and dark, a real session:
  **32/32** — the composer is a glass surface; a sent message gets a pencil; Save updates the text and badges it "edited";
  the edit route 404s a foreign id; notify refuses a missing message; presence answers and no "here" avatars show when
  alone; a DM to a non-member is 403; the throwaway channel is soft-deleted; no page errors. The demo org ships with **no
  channels and no projects**, so the script creates (and soft-deletes) one channel per pass.

**Not verified, and not claimed:** the project page's Discussion tab and the request panel's inline thread (no project in
the demo org; the request toggle is a straight reuse of the same thread, unrendered here), a **DM end to end** (needs the
script run and a second person), **"who's here" with two people**, the Spotlight "Message …" rows and the member-row
button, the collapsed bell row on a real recipient (unit-tested against the notification calls, not seen), and any push
on a device (`docs/push-verification.md`). Screenshots were not read.

Operator TODOs (Peter):

- [ ] **Run `pnpm add:channel-phase7`** (then `pnpm generate:types`) **before the next deploy** — DMs and presence need it, and
      it closes the edit-window bypass. It is idempotent.
- [ ] **Push is yours**: this session's two commits (code + docs) on local `main`.
- [ ] After the script: open a DM from a member row between two admin/board logins, post, and confirm the other side's bell
      reads "1 new from <name>" and the roster lists it under Direct; confirm "who's here" shows the other person.
- [ ] Run the new channel rows in `docs/push-verification.md` on a device.
- [ ] Still open from Sessions 7–11 (unchanged).

#### Phase 8 — kickoff prompt (Sonnet 5.5, effort high)

```
Continue the Earnest Parity Round 3 programme for HOA Connect. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log entry for Session 12 (Phase 7: shipped, deviations,
operator TODOs), §Token budget, and §8. Do not read §9 onwards, the Session log
before Session 12, or docs/spec-email-send-queue.md, and never open
docs/plan-earnest-parity-round2.md. Re-survey Earnest only at its scripts/
audit-*.ts, eslint.config.js, lint-staged.config.js and its ci.yml, and only the
lines you need (`sed -n`).

This session = Phase 8 (Audit gates and CI) ONLY, on Sonnet 5.5 at effort high.
This is porting plus MEASURING: each audit's regex must be re-censused against
this app's spelling before its baseline means anything (the round-2 lesson — the
hairline regex matched nothing until rewritten for `t-border`). Report mode
first, baseline second, gate third; an audit that finds 0 from day one is a gate
at 0, one that finds a count is a ratchet at that count.

Verified starting points: scripts/audit-hairline-surfaces.ts exists and is
wired into the pre-commit hook (it just ran on Session 12's commit) — use it as
the house style for the others; check package.json "audit:*" and .husky/ and
.github/ for what is already in CI before adding anything. Phase 1 already
removed native confirm()/alert() and raw date inputs in app code (Session 12
confirmed no `confirm(` remains under app/components/channels), so
`native-dialogs` and `raw-date-inputs` should measure 0 — gate them at 0, and
say if they don't.

Deliverables (§8): one script per row of the table (14), each with report mode,
the recorded baseline in this plan file, and a `--check` that exits non-zero on
regression; an ESLint flat config + lint-staged ported and trimmed to what this
repo can pass; `pnpm lint` and the whole audit set in `.husky/pre-commit` and
CI (`ci.yml`) so CI is red on any gate; `docs/ux-standards.md` (the one-page
digest, adapted to HOA's class names, with the `allow-*:` markers). Do not fix
the findings — record them; a ratchet only stops it getting worse.

Tests: each audit's pure matcher gets a table test (a hit, a near miss, the
allow marker). Use a Haiku 5.5 subagent for the census of how many hits each
regex finds. Gates in the background, tail only: `pnpm test | tail -6`;
typecheck with NODE_OPTIONS=--max-old-space-size=6144 into a log, grep
`error TS`; build into a log, grep exit. No Playwright this phase — an audit is
proved by its output on the real tree plus a deliberate violation that turns it
red (add one, see it fail, remove it).

Local session: work on main, ask before pushing. When done: update the Status
row, append Session 13 to the Session log (shipped, deviations, baselines,
operator TODOs), write the Phase 9 kickoff prompt (Opus 5.5, effort high), and
stop. One phase per session.
```

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

_Designed in Session 6: **`docs/spec-email-send-queue.md`** decides items 7–12 below and
names the tests. Where the spec and this section differ (state names, the lease, `run_key`,
`delivery_status`, one tick route doing both phases), the spec wins — it was written against
the code and the Directus SDK's actual update semantics._

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

## Token budget — which model runs each phase, and how a session stays cheap

Prices (Anthropic API, cached 2026-10-06, per million tokens in / out): **Fable 5.1**
$10 / $50 · **Opus 5.5** $4 / $20 · **Sonnet 5.5** $2 / $10 · **Haiku 5.5** $0.10 / $0.50.
Opus is 2.5× cheaper than Fable, Sonnet 2× cheaper than Opus, Haiku 20× cheaper than
Sonnet. A session's bill is dominated by **input** tokens re-read every turn, so the two
levers that matter most are (1) which model, and (2) how much of the repo the session
pulls into context. The second lever is bigger than the first.

### Model per phase

The rule: **design and cross-cutting primitives on Opus 5.5; mechanical sweeps and
well-specified ports on Sonnet 5.5; Fable 5.1 only for the one design whose failure
sends residents money notices twice.** Effort: `xhigh` for Opus design sessions, `high`
for Sonnet sweep sessions (Claude Code's default is `xhigh`; lower it in the session).

| Phase | Session | Model | Effort | Why this model |
|---|---|---|---|---|
| 0 | Pre-flight | Opus 5.5 | high | Done. Security reasoning across four routes; small diff. |
| 1a | Shell primitives: glass overlays, motion module, `useConfirm`, date pickers, Spotlight, BottomSheet switch, EmptyState props, button tiers | **Opus 5.5** | xhigh | Nine primitives every later phase builds on; a wrong `useConfirm` or overlay class costs every subsequent session. |
| 1b | The sweeps: 34 `confirm()` → `useConfirm`, 18 raw date inputs → `DateInput`, stone/gray → tokens, 6 create flows → BottomSheet, 8 empty states | **Sonnet 5.5** | high | Identical edits with an exact recipe from 1a. Hand each sweep to a Sonnet subagent; the main session reviews the diff, not the files. |
| 2 | Dock, navigation, page-title outlet, App Library, create verbs | **Opus 5.5** | xhigh | Layout and registry architecture; touches `auth.vue`, `useAppNav`, `useSectionNav`. |
| 3a | Email compliance: classes, opt-out, tokens, one-click route, headers, footer, suppression from the webhook | **Opus 5.5** | xhigh | Legal surface plus audience-exclusion logic; moderate diff, high consequence. |
| 3b-design | The send queue's state machine: claim/settle, at-most-once under a Vercel kill, stale-claim expiry, progress arithmetic — **as a written spec + the test list, no code** | **Fable 5.1** | high | The one place correctness outweighs cost: a wrong at-most-once design re-sends dues notices. A short design session (one doc, ~50 tests named) spends few Fable tokens. |
| 3b-build | Implement that spec: recipients-as-queue schema, `continue-sends` cron, progress route and UI, sender unification | **Opus 5.5** | xhigh | Builds to a spec with named tests; Opus is enough once the design is fixed. |
| 4 | Email health (pause/resume), recurrence, MJML partial composition, preview route | **Opus 5.5** | high | The 1,475-line `email-templates-mjml.ts` refactor needs judgment; the rest is Sonnet-grade. Keep one session; drop to `high`. |
| 5a | Reminder engine: `hoa_reminder_log`, rules module, cron tick, org timezone | **Opus 5.5** | xhigh | Idempotency and audience rules per entity type. |
| 5b | Reminder templates, Settings → Reminders with dry run, the six resident notification events | **Sonnet 5.5** | high | UI and wiring onto 5a's engine. |
| 6 | PWA and push: always-on SW, install card, manifest shortcuts, notification actions | **Sonnet 5.5** | high | A specified port of `sw.js`, two plugins and one card. Device verification is Peter's, not the model's. |
| 7 | Channels gap-close: edit, notify-on-message, DMs, presence, embedded threads | **Sonnet 5.5** | high | Extends code that already exists on both sides; the notify-on-message fan-out is the only design point and the plan fixes it. |
| 8 | Audit gates and CI | **Sonnet 5.5** | high | Porting 14 scripts and re-censusing regexes against this app's spelling. Baselines are measured, not reasoned. |
| 9 | Launch polish, money-path tests, GTM checklist | **Opus 5.5** | high | The Stripe webhook replay fixtures need care; the rest is cleanup. |

**Subagents inside any session:** Explore / census work (grep the 34 call sites, list the
raw date inputs, count a class) on **Haiku 5.5**; sweep subagents that apply a recipe to
N files on **Sonnet 5.5**; never spawn a subagent on the session's own model for a
mechanical job. Give every subagent the exact file list and the recipe, and have it
return a diff summary, not file contents.

### Session hygiene (the bigger lever)

1. **Do not re-survey Earnest.** The `## Context` section and the Earnest file names in
   each phase are the map. Read only the Earnest files the phase names, and only the
   lines you need (`sed -n`), never whole 1,000-line components.
2. **Never open `docs/plan-earnest-parity-round2.md`** (4,857 lines, ~60K tokens). It is
   history. Everything a Round 3 session needs from it is restated here.
3. **The kickoff prompt names the files.** A session reads those plus what `grep` points
   to — not the directory. Reading a file to "get a feel" is the most common waste.
4. **Sweeps are recipes, not reading.** For N identical edits: write the recipe once,
   hand it to a Sonnet subagent with the file list, review `git diff --stat` and spot-
   check three files. Do not read all N before or after.
5. **Gates run in the background and only the tail is read.** `pnpm test | tail -6`;
   typecheck and build into a log file, grep `error TS` / `exit`. Typecheck needs
   `NODE_OPTIONS=--max-old-space-size=6144` (it OOMs at the default 2 GB heap).
   Never read a full build log.
6. **Browser verification is a script.** One headless Playwright script per phase that
   asserts the checks (class present, dialog opened, reduced-motion honoured) and
   writes screenshots to the scratch dir. Read a screenshot only when an assertion
   fails — every image read is a vision-token spend.
7. **One phase per session, then stop.** End with the Status row, the Session log entry
   and the next kickoff prompt. A fresh session per phase starts with a cold cache but a
   short context; a long session re-reads its whole history every turn. Split 1 and 3
   as the table says; never run two phases in one session.
8. **Do not paste file contents into the plan or the PR body.** Name the file and the
   line; the diff is the record.
9. **Cloud sessions branch, local sessions don't.** A cloud session (claude.ai/code)
   works on `feat/parity3-p<N>-<slug>` off `main` and opens a draft PR; `main`
   auto-deploys, so it never pushes there. A local session on Peter's machine keeps the
   round-2 convention (work on `main`, ask before pushing).

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

Roughly **14 sessions** after the model/phase splits in §Token budget. Single-phase
sessions; Vercel auto-deploys `main` on push, so each session ends with a green gate
and a deploy decision (a cloud session's PR merge is that decision).

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

Pick the model and effort from §Token budget before starting the session. Fill in the
phase, the session's half (1a / 1b / 3a / 3b-design / 3b-build / 5a / 5b), and the branch.

```
Continue the Earnest Parity Round 3 programme. Read
docs/plan-earnest-parity-round3-gtm.md first — only these parts: the Status
table, the Session log, §Token budget, and the section for THIS phase. Do not
read the rest, do not re-survey Earnest, and never open
docs/plan-earnest-parity-round2.md.

This session = Phase <N><half> (<name>) ONLY, on <model> at effort <level>.
Earnest reference checkout: /home/user/earnest (cloud) or
~/Sites/earnest/earnest (local). Read only the Earnest files this phase names,
and only the lines you need. Reuse the HOA functions the plan names instead
of duplicating them. The public site (Org/Landing/*, LandingBuilder/*, the
public theme blocks) is out of scope.

Cloud session: branch feat/parity3-p<N><half>-<slug> off main, push it, open
a DRAFT PR, and never push to main — it auto-deploys. Local session: work on
main, ask before pushing. Tool shells have no node/pnpm locally: run
`eval "$(/usr/local/bin/fnm env)"` in every one.

Token rules: subagents on Haiku 5.5 for census/grep, Sonnet 5.5 for N-file
sweeps with an exact recipe; review diffs, not files. Gates run in the
background; read only the tail. Typecheck with
NODE_OPTIONS=--max-old-space-size=6144. Browser checks are one headless
Playwright script; read a screenshot only when an assertion fails.

Quality gate, per commit: typecheck 0, vitest green, build green (serially,
never both at once), every audit at or under baseline, org-scope tests for
every new endpoint, plus the phase's browser verification in BOTH light and
dark on the demo org with a real session (`/api/demo/login`). Delete every
row you create; `demo-classic` is a CONTROL — diff both orgs before and
after.

When done: update the Status row, append to the Session log (shipped,
deviations, operator TODOs), write the next session's kickoff prompt, and
stop. One phase per session.
```

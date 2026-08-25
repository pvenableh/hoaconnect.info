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
| 2 | Phase 2a — WS manager + adapter shims | [x] | `feat/parity2-p2a-ws-manager` | All three composables kept as adapters; deletion deferred one release, as planned. |
| 3 | Phase 2b/2c — Notification unification + bell cutover | [x] | `main` | Bell is on the WS manager; **one** socket with bell + channels, verified. |
| 4 | Phase 3 — Channels round 2 | [x] | `main` | Ships with **two blocking findings outside the phase** — see Session 4. Channels are write-broken and mentions unpickable on this Directus. |
| 5 | Phase 4 — Notices engine + attention scoring | [x] | `main` | Also fixed Session 4's two carried blockers. `permissions` is **ignored on create** in Directus 11 — proved, then routed around. |
| 6 | Phase 5 — Director layer + trust surfaces + action lifecycle | [x] | `main` | Earnest's singular/plural boundary **does not exist here**; HOA's is `violation`/`ticket` → `request`. `preview` is a text column — every proposal card was rendering character-by-character. |
| 7 | Phase 6 server — Boardroom collections, plan endpoint, utils | [x] | `main` | Slide bullets had to LEAD the briefing — asked for last, the live model never wrote them. Money mode needed a fourth util. |
| 8 | Phase 6 UI — Boardroom page + components + nav | [x] | `main` | Multiplayer is a POLL, per Peter's call. The 403 probe wrote two rows into `demo-classic` — the diff caught it. |
| 9 | Phase 7 core — stacks home | [x] | `main` | The rework target was `DashboardPage.vue`, not the `[slug]/admin/index.vue` redirect shim. Reading a briefing needed a new read-only door. |
| 10 | Phase 7 polish — rails, ambient, wizard | [x] | `main` | The rails EXTRACTED the three chart widgets' fetches; mounting those widgets now costs zero extra requests. Light alphas needed raising, not halving. |
| 11 | Phase 8 — Glass sweep + gate flip to 0 | [x] | `main` | Gate is at **0** and blocking. The census and the plan's named list were different lists; both got swept. Two live bugs fell out of measuring: a focused control squared itself off, and `.glass-field` cannot reach a native `<select>`. |

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

**Session 2 — Phase 2a** (2026-08-24) — 4 commits, fast-forwarded from
`feat/parity2-p2a-ws-manager` into `main`, branch deleted, pushed to `origin/main`
(`5ce1d5f..e2f2a27`).

**Workflow change from here on:** Peter's standing instruction is to work on `main`
in the main checkout — no phase branches, no worktrees. Rule 2 above is rewritten
accordingly and the Status table's Branch column reads `main` for Sessions 3–11.

Shipped:

- `core/app/composables/useWebSocketManager.ts` ← Earnest `useWebSocketManager.ts`.
  N→1 multiplexed singleton: uid routing, dedupe by
  `collection:filter:fields:sort`, exponential backoff (base 1s → cap 16s, 5
  attempts), 30s idle teardown, `online`/`visibilitychange` revive that resets the
  attempt counter, stale-socket guards on every listener, ping→pong.
- The three overlapping composables are now thin adapters with unchanged public
  signatures: `useDirectusRealtime.ts`, `useDirectusWebSocket.ts`,
  `useRealtimeSubscription.ts` (+ `useRealtimeItem`). None deleted — that is next
  release, per the plan's Risk 2. `useDirectusSubscription.ts` and
  `useOrgItems().useSubscription()` ride the change for free through
  `useDirectusRealtime`.
- `tests/composables/useWebSocketManager.test.ts` — 24 tests over multiplexing,
  dedupe, uid routing, auth ordering, backoff/give-up/revive, idle teardown and
  session lifecycle. `tests/setup.ts` gained `getCurrentScope`/`toRaw`/`unref`.

Deviations from the plan, all deliberate:

1. **Raw `WebSocket`, not the Directus SDK's `realtime()`.** The SDK gives each
   subscription its own async iterator pulling off one shared connection, so
   concurrent subscriptions compete for frames — the exact failure the manager
   exists to prevent. The manager speaks the Directus WS protocol directly.
   `DIRECTUS_WEBSOCKET_URL` already points at `/websocket`, so the URL is used
   verbatim (with the old `url.replace('http','ws')` fallback kept).
2. **Two Earnest bugs fixed in the port.** (a) `_teardown()` cleared the shared-sub
   registry but left the uid routing table populated, so anything resubscribed
   after a teardown — `reconnect()` included — fanned out to an empty registry and
   went silently dead. Teardown now keeps both registries and only logout clears
   them. (b) A stale release closure could delete a shared subscription that had
   since been unsubscribed and re-created by another component; `_release` now
   checks registry identity first.
3. **Earnest's `resubscribe(uid, query)` was not ported.** It mutated the entry's
   query without touching the dedupe key, so the registry would then lie about what
   that subscription watches. The adapters release and re-subscribe instead.
4. **Adapter semantics that had to change,** documented in each file: `connect()`
   no longer opens a socket eagerly (the manager connects lazily on first
   subscribe; it still rejects when logged out), and `disconnect()` releases only
   that instance's subscriptions rather than closing a socket other components are
   using. Cleanup moved from `onUnmounted` to `onScopeDispose`.
5. **`useRealtimeSubscription` stopped leaking.** A changing filter previously left
   the old subscription live for the connection's lifetime — switching channels
   accumulated subscriptions nobody read. It now releases the previous one first
   and hands its subscription back on scope dispose.
6. **Two list-behaviour fixes in the same file**, both pre-existing and both
   user-visible: `create` now appends on ascending sorts instead of always
   prepending (comments and reactions sort `date_created` ascending, so new items
   landed at the top until a refetch), and skips an item the REST baseline already
   carries; and `delete` now reads the payload as a KEY. Directus sends deletes as
   bare ids (`data: ["id-1"]`), so reading `.id` off a string matched nothing and
   deleted rows stayed on screen. Channel messages soft-delete via `status` and hide
   this; hard-deleted reactions do not.
7. **`useDirectusWebSocket`'s callback now matches its own declared type**
   (`{type, data[]}`). It previously forwarded the raw SDK frame, which did not.
   Zero call sites, so nothing churns.

Quality gate: typecheck **0 errors** · vitest **934/934 in 60 files** · `pnpm build`
green · hairline audit green at baseline 26.

Browser-verified on the demo org, with `window.WebSocket` wrapped by a counter
installed *before* the socket under test existed:

- Sat on a page with no realtime subscribers for ~38s → the idle teardown closed the
  socket. Returning to channels opened **exactly one** socket
  (`wss://admin.hoaconnect.info/websocket`), and it stayed at one with the channels
  roster, a channel thread (two subscriptions) and the notification bell all open
  simultaneously. `/api/websocket/token` — fetched once per socket — was requested
  **once** for the whole session.
- Switching channels (filter change → release + re-subscribe) still ended at one
  socket.
- Subscriptions fire: a message created out-of-band via the Directus REST API
  appeared in the thread live; editing it updated in place; deleting it removed it;
  a channel created out-of-band appeared in the roster and deleting both removed
  them — all without a refetch, all over the one socket.

Note for Session 3: the bell (`useNotifications.ts`, the 1061-LOC aggregator) opens
no socket at all today — it polls. So "one connection with bell + channels open" is
currently a channels-side count; Phase 2c is what puts the bell on the manager, and
should re-run this proof after the cutover.

**Session 3 — Phase 2b + 2c** (2026-08-24) — 2 commits straight onto `main`
(`f26e2f4`, `8c45ecc`), not pushed.

Shipped — **2b, the send path**:

- `notifyUsers()` now decides three channels independently and gained an email
  leg: bell on `<category>_bell`, email on the email master AND `<category>`,
  push on the BELL's switch and never on the email master. The email twin reuses
  `sendBrandedTransactionalEmail` (which re-scopes and re-checks with the same
  shared helpers — a boundary that only holds when its caller remembers to check
  is not a boundary). Return shape is now `{bell, push, email}`.
- **The prefs retry.** A missing or perm-blocked `notification_preferences`
  column 403s the whole bulk read; treating that as "everyone opted out"
  silently zeroes a fan-out (Earnest hit this in prod). The read is now repeated
  WITHOUT the field and missing keys fall back to their documented opt-in
  default. Only when even the reduced read fails do we degrade to bell-only.
- Invariant test **written against the new risk surface**, not just re-asserted:
  the retry is a second place a recipient list gets used, so
  `tests/server/notify-org-scope.test.ts` now asserts BOTH reads are fed the
  gate's output and that the retry does not degrade to bell-only.
  `tests/server/notify.test.ts` gained a channel-independence block (9 tests).
- **The audit of the ten collections, and what it actually found.** Most of the
  gap was structural, not forgotten: announcements, meetings, mentions and
  comments are written straight from the browser through the Directus proxy, so
  there was no server moment where a fan-out could hang. Announcement authoring
  is retired entirely (Phase 9 moved it to Communications) — the only writer left
  is the AI executor, and everything it writes outbound is a DRAFT, so no
  notification is correct there. `payment_requests` has no mutation surface in
  the app at all. `hoa_requests` and `hoa_tasks` were already covered.
- So 2b added the missing server moment: `POST /api/org/notify-event`. The client
  sends only `(collection, action, itemId)`; the copy, the category and the
  recipients are derived server-side from the row the server re-reads for
  itself, and the org is taken from the row — "I'm in org A" + "notify about org
  B's meeting" cannot pass. Split as a pure planner
  (`core/shared/notifications/events.ts`, 28 tests) and a server resolver
  (`core/server/utils/notification-events.ts`, 9 org-scope tests).
- Three raw `createNotification` loops migrated to `notifyUsers` — inquiry-routing,
  request-join, public-inquiry. All three wrote bell rows with no per-category
  gating, no push, and no tenancy check on ids that came from org settings.
- New call sites: document publish (one row for a batch, not ten), approved join
  request, the AI's `add_comment` executor, plus mentions / published meetings /
  comments from the browser via `useNotifyEvent()`.

Shipped — **2c, the bell**:

- `useDirectusNotifications.ts` rewritten as the bell store over the Phase 2a WS
  manager. Module singleton, throttled + coalesced refresh, archived pagination,
  optimistic mark-read. Read is `status: "archived"`.
- `core/shared/notifications/bell.ts` — pure row → renderable mapping (17 tests).
  Collection first, subject heuristics only for rows predating `notifyUsers`.
- `useUnreadByCategory`, `useMarkItemRead`, `useAppBadge` (+ `trackUnread()`
  mounted once in the `auth` layout), `useNotificationPreferences`.
- `useNotifications()` is now a flag branch — `NUXT_PUBLIC_BELL_V2` defaults ON,
  `false` restores the aggregator without deploying new code.
- Bell dropdown gained an **Earlier** tab over archived rows and inline
  per-category switches. Toast stopped archiving rows on auto-close and stopped
  toasting the unread backlog on mount.
- `scripts/backfill-notifications.ts` (`pnpm backfill:notifications`), last 30
  days, all archived, idempotent on (recipient, collection, item).

Deviations from the plan, all deliberate:

1. **Push mirrors the BELL, not the email.** The plan said "push mirrors email
   but is NOT gated on the email master" — Earnest's semantics, where there is
   only one per-category key. HOA has two (`<category>` and `<category>_bell`),
   and `shared/notifications/push.ts` already documents push as the bell's mobile
   twin. Gating push on the email key would let someone mute the payments *bell*
   and still get a payments *push* — a push with no row behind it. Push ⊆ bell.
2. **The prefs+email toggles landed in `Notification/Bell.vue`, not `Sheet.vue`.**
   The plan mapped Earnest's `NotificationsMenu.vue` onto "Sheet", but HOA's
   Sheet is the single-notification DETAIL sheet; the dropdown is the menu.
3. **The components are fed through an adapter rather than rewritten.** Bell,
   Sheet and Toast are not the interesting part of this cutover — where a
   notification comes from and where "read" lives are — so `useNotifications()`
   branches and the v2 store speaks the aggregator's API. Retiring the aggregator
   becomes the deletion of one branch instead of a diff across every component.
4. **`hoa_announcements` has a plan but is NOT client-announceable.** The AI
   executor creates announcements server-side, so the planner handles them; no
   browser should be able to address a whole community by naming a row.
5. **`useMarkItemRead` is shipped but not yet mounted on any detail page.** It is
   a one-line drop-in and the pages it belongs on (requests, documents, meetings)
   are being reworked in Phases 4–7; adding it now would be churn against files
   about to move. Called out here so it does not get lost.
6. **Rejected join requests notify nobody, deliberately** — the applicant has no
   membership, so the tenancy gate would drop them anyway.
7. **Reaction upsert was not ported.** HOA has no `reactions` notification
   category and reactions never produced bell rows here, so Earnest's
   `upsertReactionBell` had nothing to fold into.

Quality gate: typecheck **0 errors** · vitest **998/998 in 63 files** ·
`pnpm build` green · hairline audit green at baseline 26 · org-scope tests on
both new surfaces.

Browser-verified on the demo org (headless, dev server via the preview tool):

- The v2 bell renders from `directus_notifications`: a row created out-of-band
  raised the badge 0 → 1 **live, with no refresh**, on the channels page; the
  dropdown showed it under TODAY with the right type chip ("Meeting", resolved
  from `collection: hoa_meetings`), the right filter chips ("All 1",
  "Meetings 1"), and an unread dot. The dock badge lit at the same time off the
  same list.
- Clicking it archived the row: the badge cleared and the server row read
  `status: "archived"` — the cross-device read state localStorage never had. The
  **Earlier** tab then paged it back in.
- The inline preference switch wrote `{"meeting_bell": false}` to
  `directus_users.notification_preferences` — the exact key `bellAllowed()`
  reads. Restored to `{}` afterwards.
- **Socket proof re-run now that the bell is on the manager:** exactly **one**
  `/api/websocket/token` request (one per socket) for the whole page load on
  `/demo/admin/channels`, with the bell mounted and live and the channels roster
  subscribed. A `window.WebSocket` counter installed after load recorded **zero**
  additional sockets across bell opens, preference writes and the live arrival.
  Session 2's note is now closed: the bell no longer polls.
- `/api/org/notify-event` boundaries, live: 401 unauthenticated · 400 for a
  non-notifiable collection · `{ok:false,"item not readable"}` for a bogus id ·
  and **`{ok:false,"not authorized for this organization"}`** when the demo user,
  a real member of Harborview, pointed at another community's published meeting.
- The comment path ran end-to-end and resolved **zero** recipients, correctly:
  the demo org has exactly one member with a user account and that member was
  the actor, so nobody else was in the conversation.
- Backfill: dry run across all 7 orgs planned 18 rows; run + re-run on the test
  fixture org wrote 1 then skipped 1, and the written row was `archived`.

Not verified live, and worth knowing: **the mention path**. The demo org has no
channels and creating one out-of-band failed on required fields, so
`hoa_channel_mentions` was exercised only by its unit tests. It is the first
thing to try in Session 4, which touches channels anyway.

**One thing I got wrong, reported rather than buried:** while clearing my probe
rows I deleted every row in `directus_notifications`, which swept one
pre-existing real row — "Profile change to review" for recipient
`0fe9c5f1…`, pointing at change request `772a23a8…`. I recreated it with the
same recipient, subject, collection and item, still unread; the change request
it points at is still `pending`, so the notification is still accurate. Only its
timestamp differs (now, instead of the original). Nothing else was touched.

**Session 4 — Phase 3** (2026-08-24) — 2 commits straight onto `main`
(`219100a`, `7e4632f`), not pushed.

Shipped:

- `core/server/utils/channel-unread.ts` + **GET `/api/hoa/channels/unread`**.
  Earnest's two-bucket algorithm, adapted. `hoa_channel_members.last_read_at`
  has been in the schema since channels shipped and had **never once been
  written**, which is why every unread surface in the app was either absent or
  guessing.
- **POST `/api/hoa/channels/:channel/read`** — the write half, auto-joining like
  Earnest's, with a monotonic cursor (`nextReadCursor`; see deviation 3).
- **GET `/api/hoa/channels/search`** + `core/server/utils/channel-scope.ts`.
- `core/app/composables/useChannelUnread.ts` — `useState` singleton, in-flight
  guard, optimistic `markRead`, live over the Phase 2a socket rather than
  Earnest's 45s poll.
- `useChannelSearch.ts` repointed at the route; unchanged signatures, so its
  three call sites did not move. Results now carry the author.
- `ChannelThread.vue`: the **"New" divider** anchored to the cursor as it stood
  when the channel opened (captured before `markRead`); the **enter/leave
  reconciler** (`enteringIds` / `leavingIds` / `_snapshots` / `_settled`);
  **`moderatedIds`** local eviction; jump-to-message.
- `ChannelsList.vue`: **roster folders** off a new `hoa_channels.category`,
  falling back to the project / request / vendor a channel already points at,
  with a "Move to folder" dialog. Per-row unread badges.
- Unread rolls into the **Communications dock badge** (`badgeCountsFor` gained a
  `channelUnread` argument), the **top-nav chat button**, and **`useAppBadge`**
  alongside the bell's count.
- `scripts/add-channel-category-field.ts` + `pnpm add:channel-category`
  (idempotent; run against prod, `generate:types` re-run).
- Tests: `tests/server/channel-unread.test.ts` (18), `channel-scope.test.ts` (9),
  `tests/composables/useChannelUnread.test.ts` (10).

Also fixed here, all pre-existing:

- **`useDirectusSubscription.handleEvent`'s `delete` branch** — the key-vs-object
  bug Session 3 left as a TODO. Deletes never left the list.
- **The thread rendered its descending array verbatim**, so the newest message
  sat at the TOP while the pane scrolled to the bottom — i.e. to the oldest thing
  in the channel.
- **A duplicate `id="msg-<id>"`**: `ChannelMessage` already carries it, so
  `getElementById` was resolving by luck.

Deviations from the plan, all deliberate:

1. **Earnest's `role: null` audience gate is dropped, and bucket 2 is narrowed.**
   Earnest keeps a `channel_members` row after revoking access so it survives as
   a read cursor; HOA has no such state — the row IS the grant. More
   importantly, HOA's member policy is *membership-scoped*, so a plain member
   with no row cannot open the channel at all. Bucket 2 (readable without a row)
   therefore applies only to **org admins and seated board members**, whose
   policy is org-scoped. Badging anyone else would point at a door that will not
   open.
2. **No org-join floor recorded → count nothing, not everything.** A missing
   `hoa_members.date_created` is not a licence to badge an entire history.
3. **The cursor is monotonic; there is no future-timestamp clamp.** The first
   version clamped a "future" cursor to the server's `now`. That was wrong in a
   way only the browser could show: the timestamp a client sends is not its
   clock, it is `date_created` off the row it just rendered, stamped by
   **Directus, on a different machine**. Directus ran ~3.5s ahead of the app
   server here, so the clamp rewrote the cursor to just *before* the message it
   was acknowledging and the badge never cleared while you read. Forward-only
   also covers what the clamp was reaching for.
4. **`useChannelSearch.ts` was not orphaned** (the plan said it was) — it had
   three call sites doing client-side `_icontains` through the Directus proxy.
   Access was correct *by accident* there: the caller's own token carried the
   membership-scoped policy. Moving it server-side spends the admin token, so
   `channel-scope.ts` now reproduces that rule explicitly and the query is fenced
   to the result. Two-character minimum centralised in the route.
5. **`category` is a string, not a collection.** A folder is a label someone
   types while organising their own sidebar; a collection would mean a second
   admin surface and would turn renaming into something other than a rename.
6. **`scroll-behavior: smooth` removed from the pane, and jump-to-message is
   instant.** Easing is the first thing an environment drops — it is a no-op
   under reduced motion and in headless Chrome — and both jumps were silently
   doing nothing because of it.
7. **No `muted` UI.** `notifications_enabled` is honoured by the computation
   (count reported, excluded from the total) but has no toggle yet; the members
   panel is the natural home and it is not in this phase.

Quality gate: typecheck **0 errors** · vitest **1035/1035 in 66 files** ·
`pnpm build` green · hairline audit green at baseline 26 · org-scope tests on
both new surfaces.

Browser-verified on the demo org (headless, dev server via the preview tool),
then every fixture deleted — see the cleanup note below:

- **Cross-user badge, live.** Three messages authored by another user raised the
  chat-button badge to **3** and the Communications dock badge to **3** with no
  reload, from the dashboard.
- **The divider lands and stays put.** It rendered directly above the first
  unread message, and stayed there while a fourth, then a seventh, message
  arrived beneath it.
- **The cursor keeps up while you read**: after the monotonic fix, a message
  arriving with the channel open left the badge at zero and the server cursor
  ahead of it.
- **Search jumps mid-history**: "roof inspection" → one hit carrying its author,
  click → scrollTop 362 → 0 with the target ring-highlighted and the popover
  closed.
- **A new member sees zero backlog.** A member created *after* nine messages saw
  `total: 0` — and then exactly **1**, anchored to their join date, once a single
  message landed after they joined. Bucket 2 is live, not merely silent.
- **Roster folders**: `phase3-ungrouped` (ungrouped, first) above a
  `Building 2027` folder holding `phase3-verify`, appearing live over the socket.
- **Moderation eviction**: a hidden message left the pane immediately.
- **Exactly one WebSocket.** One `/api/websocket/token` request for the whole
  session with the bell, the roster, a thread, the slide-over panel, and three
  badge watchers mounted; a post-load `window.WebSocket` counter recorded **zero**
  further sockets across a live message arrival, opening the bell, and opening
  and closing the channels panel.

**The mention path is verified — and two things block it in the UI.**

Session 3's open item is closed at the level that matters: a
`hoa_channel_mentions` row plus the exact `POST /api/org/notify-event` call
`announce()` makes, sent with the demo admin's own session, returned
`{ok: true, bell: 1}` and wrote a real `directus_notifications` row for the
mentioned user — `status: "inbox"`, subject **"Demo Admin mentioned you"**,
message excerpting the channel and the content, `collection`/`item` pointing at
the mention. Channel creation through the UI also worked, so that half of
Session 3's blocker is gone.

But driving it from the composer is impossible today, for two **pre-existing,
out-of-phase** reasons. Neither is caused by Phase 3; both are live on prod
Directus and both deserve their own fix:

1. **Nobody can post a channel message.** `hoa_channel_messages.create`
   validation is `{channel: {organization: {_in: "$CURRENT_USER.hoa_members.organization"}}}`
   for BOTH the HOA Admin and HOA Member policies. On create, Directus evaluates
   that against the submitted payload, where `channel` is a bare uuid it cannot
   traverse — so every send fails with `Validation failed for field "channel".
   Value is required.` Reproduced through the composer, through
   `/api/directus/items`, and through raw REST with each role's own token; only
   the static admin token (which bypasses validation) succeeds. That is why
   Session 2 could create messages "out-of-band" and why nobody noticed. The
   org check belongs in `permissions`, not `validation`, on this collection.
2. **The @-mention picker can never offer anyone.** `directus_users` read is
   scoped to `{id: {_eq: "$CURRENT_USER.id"}}` on every app policy, so
   `hoa_members.user` expands to `null` for everyone except yourself. The picker
   filters on `m.user` and so always shows "No users found" — and every message
   from another person renders as **"Unknown User"**. Both need a users-read
   scope covering people who share an organisation (id / first_name / last_name /
   avatar only). That is a platform-wide access decision, so it is written down
   here rather than changed quietly.

**Cleanup, stated precisely.** Everything created for this verification was
deleted afterwards: two channels (`phase3-verify`, `phase3-ungrouped`) with all
14 messages, 1 mention, 2 moderation-log rows and 4 membership rows; two
`hoa_members` rows and two `directus_users` (`phase3.tester@example.com`,
`phase3.newcomer@example.com`); and **only** notification id 8, the one this
session created — id 7, the pre-existing "Profile change to review" row, was
listed first and left alone. The demo org is back to 0 channels and its original
6 members. The one intended residue is the new `hoa_channels.category` field.

**Session 5 — Phase 4** (2026-08-24) — 3 commits straight onto `main`
(`a1869b0`, `cc587b8`, `0e2ca2c`), not pushed.

### First: Session 4's two carried blockers, both fixed (Peter approved both)

**Channels are writable again — but not the way the TODO said.** The TODO's
first suggestion was "move the org check from `validation` to `permissions`".
That was tried, and **it opens a cross-org write hole: Directus 11 ignores
`permissions` on the `create` action.** With the org rule moved there, the demo
admin successfully created a message in a channel belonging to 605 Lincoln Road,
an organisation they are not a member of. The row was deleted, the permission
reverted, and the approach abandoned before anything shipped. **Anyone reaching
for `permissions` on a create rule in this Directus should read this paragraph
first.**

What works is keeping the rule in `validation` and writing it so Directus can
evaluate it against a *payload*. The original failed because
`{channel: {organization: {_in: "$CURRENT_USER.hoa_members.organization"}}}`
asks Directus to traverse `channel.organization` on a payload whose `channel` is
a bare uuid — so it reported the nested key as a missing required field
(`Validation failed for field "channel". Value is required.`). The fix validates
the payload's `channel` **scalar** against a dynamic list instead:

    { channel: { _in: "$CURRENT_USER.channel_memberships.channel" } }

`$CURRENT_USER.channel_memberships` needs a reverse O2M alias on
`directus_users` before Directus can resolve it — the same prerequisite
`hoa_members` already satisfies for the org filter. `scripts/fix-channel-message-write.ts`
(`pnpm fix:channel-writes`) creates it and rewrites the rules.

This is **membership-scoped rather than org-scoped**, i.e. tighter than what was
originally intended, and it matches the model channels already use: the
`hoa_channel_members` row IS the grant. Nobody loses the ability to post, because
opening a channel auto-joins — `ChannelThread.openChannel()` awaits `markRead()`,
which POSTs `/api/hoa/channels/:channel/read`, which creates the row before the
composer is usable. `hoa_channel_mentions.create` carried the identical broken
filter; HOA Member had no create row for it at all, so a member's @-mention
silently wrote nothing, and now has one.

`update` was checked and deliberately left alone: it carries the same traversal
and works, because an update has an existing row to resolve against.

**Everyone else is no longer "Unknown User".** `directus_users` read was
`{id: {_eq: "$CURRENT_USER.id"}}` on all three app policies. A second read rule
per policy now matches people who share an organisation, exposing
`id / first_name / last_name / avatar` and nothing else
(`scripts/widen-users-read-to-org.ts`, `pnpm widen:users-read`). The self rule is
untouched, and that is what makes it safe: **Directus 11 applies field
permissions per matching rule, not as a union across rules** — verified before
writing the script, and again after. An org peer's `email`, `role`, `status`,
`provider`, `password` and `tfa_secret` all come back `null`; `token`,
`last_access` and `external_identifier` are refused outright; own records still
read complete through the self rule.

Verified live against prod Directus 11.13.4 with each role's own token: a member
with no channel row is refused; with a row, the send succeeds and is attributed
to *them*, not the service account; a cross-org send is refused for both admin
and member. Both scripts are idempotent and were re-run to prove it.

### Then: Phase 4 proper

Shipped:

- `core/shared/ai/attention.ts` — Earnest's curve, ported unchanged in shape and
  constants: base 40, overdue ramp to 14d, hot to 45d, decay to 120d, stale floor
  0.22, log10 money to a cap of 22, buckets 82/64/46. Every dial is a named
  export so the tests assert constants rather than magic numbers.
- `core/server/utils/ai-notices.ts` — eight generators over HOA's entities
  (requests aged / overdue / unowned, member balances, projects stale / overdue /
  over budget, unanswered channels, vendor cover expiring or lapsed, meetings
  without minutes, unpaid `payment_requests`, low AI credits), `collectOrgNotices()`,
  and `collectDirectorAgenda()` with seven subjects — built now because Phase 6
  depends on it.
- `core/server/api/ai/notices/index.get.ts` — org-scoped, admin/board only.
- `core/app/composables/useAINotices.ts` — localStorage dismissal, scoped per
  org and pruned against what the server still returns.
- `core/server/api/ai/notices/check.post.ts` — cron-secret-guarded; urgent/high
  only, deduped by an `ai_notice_history` hash to one fire per notice-type per
  entity per calendar month; degrades loudly (warn, skip dedup, still send) when
  the ledger is absent.
- `ai_insight` in `core/shared/notifications/preferences.ts`; the account sheet
  and the digest pick it up from the shared list with no other change.
- `scripts/create-ai-notice-history.ts` (`pnpm create:ai-notice-history`) —
  **already run against prod** — plus `generate:types` committed.
- `docs/ai-notices-cron.md`.
- Tests: 109 new across four files.

Deviations from the plan, all deliberate:

1. **No vendor *insurance* field exists.** `hoa_vendors` has no insurance column;
   `active_until` is the only cover/contract end date in the schema, so the
   generator uses it and the copy says "contract/insurance" rather than claiming
   a distinction the data cannot make.
2. **"Unpaid invoices" means `payment_requests`.** There is no invoice
   collection. `amount_remaining` is preferred over `amount` so a partial payment
   is reported honestly.
3. **A member who has never paid is not scored as ancient.** Nothing records when
   a balance first went unpaid, so `last_payment_date` is the only honest anchor
   — and its absence means "no anchor", not "infinitely overdue". Inventing an
   age is exactly how a nine-year-old account pins itself to the top of a feed.
4. **`proposedAction` is guarded twice, not once.** An allow-list
   (`PROACTIVE_ACTIONS`) *and* a check against `ACTION_CATALOG`'s own `outbound`
   flag. The second is what holds if someone later adds an outbound key to the
   list by mistake or flips an existing action's flag; the catalog stays the
   single source of truth for what leaves the building. Asserted in tests
   against the live catalog rather than a copied list.
5. **The cron is daily, not hourly, and is a bare `curl`.** The thresholds are
   measured in days, so a second run the same day can only find what the first
   handled. Being a `curl` at a deployed URL, it structurally avoids the
   digest worker's documented checkout-path hazard — it has no checkout to keep
   in step with the repo layout. `docs/ai-notices-cron.md` says so explicitly so
   nobody models it on the digest line.
6. **Dismissal is per-browser, and that is a decision.** The server is
   deterministic and will return the same notice tomorrow, so "I have seen this"
   is a fact about the reader. A shared row would let one board member hide a
   notice from the treasurer. The cost — dismissals don't roam, and clearing site
   data restores them — is acceptable because the notice is never the record.

Two things the plan did not anticipate, both caught by the work rather than by
review:

- **Date-only columns were off by one, then ages were off by one the other way.**
  `hoa_projects.due_date` and `hoa_vendors.active_until` parse as UTC midnight,
  so measuring them in elapsed milliseconds against a mid-day `now` lost up to a
  day ("expires in 30 days" read as 29) — caught by the unit tests. Then the
  browser caught the opposite: `ageInDays` negated a floored *signed* delta, and
  `Math.floor(-31.0005)` is `-32`, so a request seeded 31 days ago reported
  "Open 32 days". Unit fixtures built from `now − N days` are exact multiples and
  cannot catch this; real rows never are. Both fixed, both with regression tests.
- **`ai_notice_history` needed an export decision.** Phase 3's Data Trust guard
  (`tests/shared/export-collections.test.ts`) failed the build until the new
  collection was placed deliberately — full export, not shareable, because a row
  reading "member-balance, urgent" names one household's standing to anyone
  holding the archive. The guard did exactly what it was built for.

Quality gate: typecheck **0 errors** · vitest **1144/1144 in 70 files** ·
`pnpm build` green · hairline audit green at baseline 26 · org-scope tests on
both new endpoints.

Browser-verified headlessly on the demo org (this session's own dev server,
logged in through `/api/demo/login` — a real session, not a token):

- **The seeded notice appears.** A request backdated 31 days produced
  `request-aged` and `request-unassigned`, both scored **84 → urgent**, the first
  carrying a `create_task` proposal with the request id in its payload.
- **Org scope holds through the real auth path.** `orgId` for a community the
  caller has no standing in → **403**; no `orgId` → **400**.
- **The cron fires once.** Run 1: escalated 2, notified 2, two
  `ai_notice_history` rows and two real `directus_notifications` rows. Run 2,
  same day: escalated **0**, skipped 2, notified **0**. Ageing the ledger rows
  into the previous month re-opened the gate — run 3 escalated 2 again. No
  secret and a wrong secret both **401**.
- **A human sent a channel message from the composer** — the thing Session 4
  could not do — and it rendered as "Demo Admin · just now".
- **The @-mention picker offered a person** ("P4 Probe"), where it was previously
  always empty, and that person's earlier message rendered under their real name
  rather than "Unknown User".
- **"Assistant insights" appears** in the account Preferences sheet beside
  Mentions / Comments / Membership, with no UI change.

**Cleanup, stated precisely.** Everything created for this verification was
deleted afterwards: the `p4-perm-probe` channel with all 4 messages and both
membership rows; the backdated request; the 4 `ai_notice_history` rows; the
probe `hoa_members` row and `directus_users` (`p4.probe@example.com`); and
**only** notifications 9–12, the ones these runs created — id 7, the pre-existing
"Profile change to review" row, was listed first and left alone. The cross-org
message written while disproving the `permissions`-on-create approach was
deleted immediately. The demo org is back to 0 channels, 0 requests and 0 notice
history. The intended residue is: the `ai_notice_history` collection, the
`directus_users.channel_memberships` alias, and the rewritten permission rules.

**Session 6 — Phase 5** (2026-08-24) — 2 commits straight onto `main`
(`299200a`, `b23af9b`), not pushed.

Shipped:

- `core/shared/ai/trust.ts` — the earned-trust arithmetic. Milestones 3/10/25 →
  tiers 1/2/3, gated on approvals outnumbering rejections 2:1. Every function
  returns a *recommendation*; nothing in this phase writes `ai_autonomy_tier`.
- `core/app/composables/useDirectorLayer.ts` — composes `useAiContext` +
  `useAINotices` (P4) + `useAiActions`, owns the vocabulary boundary, and holds
  the scope→subject map for the HOA hubs.
- `app/components/Director/Layer.vue` — one component, two shapes. Scope mode is
  a rounded-full pill with an **outline** button and a collapsed approvals chip;
  entity mode pins to a record. `<ClientOnly>`, self-hides when empty,
  localStorage dismissal on the scope banner only. Mounted on six hubs
  (requests, projects, payments, meetings, members, and both detail pages) —
  which is what fixes `AiEntityCard`'s 2-of-8 reach.
- `app/components/Director/TrustBar.vue` — tier ring in the top chrome on every
  workspace page; popover mounts the existing `<AiTrustDial>` (not a second
  dial) plus recently-handled with one-click Undo, and the nudge sentence.
- `core/server/api/ai/actions/bulk.post.ts` — per-row results, cross-org rows
  refused as that row's 404, batch capped at 200, ids de-duped. **Every id goes
  through the real `decideAiAction`.**
- `core/server/api/ai/actions/expire-stale.post.ts` — pending past
  `AI_ACTION_EXPIRY_DAYS` (default 14) → `rejected` tagged `auto-expired`.
  Cron secret sweeps everything; a session must name an org it is authorized
  for. Idempotent, with a working `dryRun`.
- `core/server/api/ai/actions/trust.get.ts` — this person's clean-approval
  record in this community, the org's tier, and the nudge computed from both.
  Writes nothing; fails soft to zeros, which produce no nudge.
- `core/server/api/ai/notices/propose.post.ts` — **the new door.** A notice's
  `proposedAction` becomes a real pending row. The body carries a notice id and
  nothing else; the server re-derives the action and payload from the same
  generators and routes them through `proposeAction()`.
- `AUTO_EXPIRED_PREFIX` / `isAutoExpired()` in `core/shared/ai/actions.ts`, so
  the sweep and the card cannot drift over one string.
- `docs/ai-action-expiry-cron.md`.
- Tests: 86 new across five files (trust math, the three lifecycle endpoints,
  the propose endpoint, the layer's vocabulary boundary, and the notices-scope
  regression).

Deviations from the plan, all deliberate:

1. **Earnest's singular/plural boundary is not ported, because HOA does not
   have one.** Notices, page context and `ai_actions.entity_type` all speak the
   same singular words. What HOA has instead is a *vocabulary* split: a
   violation page announces itself as `violation` and a ticket page as `ticket`,
   but both are rows in `hoa_requests`, so the generators and `entityRefFor()`
   both say `request`. Ask the notices endpoint about a `violation` and you get
   an empty list, silently, forever. `groundedType` is that translation, in one
   place, with tests.
2. **"Draft a plan" opens the assistant; it does not call
   `/api/ai/director/plan`.** That endpoint is Phase 6. Wiring the button to a
   route that does not exist yet would ship a 404 behind a button. It opens the
   panel with a scope-grounded planning prompt instead — same wallet, same HITL
   queue for anything it proposes — and Phase 6 swaps the one handler. The
   phase's verification point stands either way: **the pill drafts nothing
   without a click**, confirmed by the network log on a cold load.
3. **A fourth endpoint the plan did not list.** Phase 5's brief is "proposals
   escape the assistant panel", and the kickoff explicitly asks that a notice's
   `proposedAction` become a real row through `proposeAction()`. That needs a
   route, so `notices/propose.post.ts` exists. It takes an id, never a payload.
4. **Auto-approved runs no longer record an approver.** `decideAiAction` was
   stamping `approved_by` with whoever's chat turn proposed the action. Nobody
   approved those — the org's dial did — and counting them would let a tier-2
   org bootstrap itself toward tier 3 on the strength of its own automation.
   `approved_by` now means "the person who decided", full stop. The ledger
   already distinguishes the two out loud ("ran automatically under the
   community's trust settings" vs "Demo Admin approved").
5. **"Approve all" excludes outbound rows.** The server does not care — bulk
   routes through the same approval path either way and would happily execute
   them — so this is a UI judgement, stated in the component so nobody later
   "fixes" it: approving an email one at a time is a decision; approving nine at
   once, sight unseen, is a different act wearing the same name.
6. **The nudge is per-person, the dial stays per-org**, exactly as the plan
   specifies. What the endpoint returns is a sentence for the person who earned
   it, suggesting the *association's* dial could move, actionable only by an
   administrator through the existing `autonomy.post.ts`.

Two things the plan did not anticipate, both found by the browser rather than by
review:

- **Every proposal card rendered as a numbered list of letters.**
  `ai_actions.preview` is a `text` column, so Directus hands it back as a JSON
  *string* while `payload` and `result` (real json columns) come back as
  objects. `ActionCard` renders the preview generically with `Object.entries`,
  and on a string that enumerates CHARACTERS: `185: r · 186: e · 187: · 188: i`.
  This has been broken since Phase 4 of the July round and was invisible while
  the only way to see a card was to open the assistant panel; Phase 5 put the
  review queue on six hub pages. Parsed once at the API boundary
  (`actions/index.get.ts`) so every consumer sees the object the writer wrote.
- **`useAINotices` pruned its dismissal list against whatever the last fetch
  returned.** Correct while only the org-wide caller existed. The moment an
  entity-scoped caller appeared, opening a single request would prune the whole
  community's dismissals — everything you hid this morning back tomorrow because
  you clicked into a ticket. A scoped read no longer prunes; it is not evidence
  about anything but its own record. The composable also gained an optional
  `stateKey` so a detail page's feed does not overwrite the hub's.

Quality gate: typecheck **0 errors** · vitest **1230/1230 in 74 files** ·
`pnpm build` green · hairline audit green at baseline 26 · org-scope tests on
all four new endpoints · and an explicit test that an outbound proposal stays
`pending` at autonomy tier 3, asserted against the live `ACTION_CATALOG` rather
than a copied list (Risk 4).

Browser-verified headlessly on the demo org, through a real session
(`/api/demo/login`) on this session's own dev server:

- **A notice became a proposal, and the proposal became work.** A request
  backdated 45 days produced `request-aged` and `request-unassigned`, both
  urgent; the first carried a "Follow up on …" button, the second correctly
  carried none (choosing an assignee is not the assistant's call). One click
  wrote a pending `create_task` row scoped to that request; the chip appeared
  reading "1 approval waiting"; expanding it rendered the real card; Approve
  executed it and created the task; Undo from the trust popover deleted the
  task and struck the row through.
- **Entity mode.** The request detail page read "The assistant is watching P5
  probe — irrigation valve leaking", fetched notices with
  `entityType=request`, and queried its pending queue with the same word.
- **The pill drafts nothing without a click.** A cold load fired
  `/api/ai/notices`, `/api/ai/actions/pending-count` and `/api/ai/actions` —
  and no `/api/ai/chat` or `/api/ai/draft` at any point.
- **Tier 3, both halves.** With the dial at 3, the notice proposal
  auto-executed through `proposeAction` and recorded **no approver**. An
  outbound proposal in the same community at the same tier still required a
  person: bulk-approving it executed under that person's name and produced a
  `status: draft` email — nothing sent.
- **Bulk is per-row.** A batch of two, one of which belonged to the other demo
  community, returned `approved: 1, failed: 1` with "Action not found" against
  the foreign id, which stayed `pending`.
- **The sweep.** Dry run on a community with one stale row counted 1 and
  changed nothing; the real run expired it with
  `error_message: "auto-expired (stale 14 days)"` and `result: {expired: true}`;
  the second run reported **0**. A session with no `orgId` got 400.
- **All four endpoints 403 on a foreign community** (1033 Lenox), through the
  real auth path.
- **No hydration mismatch.** A cold load of a Director-mounted hub in a fresh
  tab is clean; the only 404 is the pre-existing dev-only
  `_nuxt/vue-sonner/style.css`.

**Not verified by clicking, and why.** The "Expired" label renders in the
assistant panel's history view, which would not open under synthetic clicks
(the reka-ui gotcha). Rather than assert it by eye, the magic string was made
one shared export — `isAutoExpired()` — and the sweep's test now asserts the
real reader against the real writer, plus a companion test that a genuinely
rejected proposal is *not* called expired.

**Cleanup, stated precisely.** Everything created for this verification was
deleted afterwards: the backdated request, all four `ai_actions` rows (both
communities), both created tasks, the draft email, and the four `org_audit_log`
entries with their four `ai_ledger_chunks`. Both demo orgs are back to
`ai_autonomy_tier: 0` with zero actions, zero tasks and zero ledger rows. There
is no intended residue — this phase adds no collections, no fields and no env
vars.

**Session 7 — Phase 6 server** (2026-08-24) — 3 commits straight onto `main`
(`5232b7f`, `a497010`, `85bf74b`), not pushed.

Shipped:

- `scripts/create-boardroom-collections.ts` (`pnpm create:boardroom`) →
  `hoa_director_briefings`, `hoa_director_sessions`, `hoa_director_minutes`,
  plus `ai_actions.session_id` and a `plan` choice on
  `ai_transactions.feature`. **Already run against prod**; a re-run creates
  nothing. `generate:types` committed.
- `core/server/api/ai/director/plan.post.ts` — the planner. Grounded in
  `collectDirectorAgenda()` *before* the model; `completeWithTools` with
  exactly four tools; zero tool calls → forced `toolChoice:"any"` second pass
  keeping the first pass's prose; steps created through the existing
  `proposeAction()` with `sessionId = planId`; metered like chat; refused at a
  zero balance before a token is spent.
- `core/server/utils/director-briefings.ts` — `directorBriefingCacheKey()` (the
  ONE derivation both writer and reader use), a 6h TTL overridable via
  `NUXT_DIRECTOR_BRIEFING_TTL_HOURS`, and `splitTldr()`.
- `core/server/utils/director-sessions.ts` — create/end, attendees as a JSON
  list on the row, `recordActivity()` bumping `revision` (the sync clock), and
  `loadPlanSteps()` — `plan_id === ai_actions.session_id` is the whole link.
- `core/server/utils/director-minutes.ts` — save/load/list/share, with
  `summarizeMinutesSteps()` so the rollup cannot contradict the steps under it.
- `core/server/utils/director-intel.ts` — the money block, built from the same
  pure `shared/reporting/ledger.ts` the Finances tab renders.
- `parseActionPreview()` lifted into `core/shared/ai/actions.ts` — Session 6's
  fix, now shared by `actions/index.get.ts` and `loadPlanSteps()`.
- `toolChoice` on the LLM provider (`auto` | `any`), sent only alongside tools.
- `useDirectorLayer.planThis()` now POSTs to `/api/ai/director/plan` (the
  Session 6 TODO), with `planning` / `plan` / `planError` state, a "Drafting…"
  button and an error line outside the notices block.
- The three new collections classified in the export map (`FULL_ONLY`).
- Tests: 86 new across three files (37 endpoint, 40 utils, 9 composable).

Deviations from the plan, all deliberate:

1. **A fourth util, `director-intel.ts`.** The plan says "ground in
   `collectDirectorAgenda()` + mode intel", and HOA had no server-side money
   snapshot to be that intel. The agenda reports *exceptions* — this invoice is
   41 days late — which is not a financial position, so a planner asked "how are
   we doing" would have had to guess at a balance to say anything about one. It
   reuses `shared/reporting/ledger.ts` rather than reimplementing the
   arithmetic, so the briefing and the Finances tab cannot disagree.
2. **No `briefing.get.ts`.** The cache read lives on the plan endpoint itself:
   a POST without `refresh` serves the saved briefing, re-reads its steps live,
   and charges nothing. One door, and the TTL contract has one owner. Session 8
   needs no extra route to reopen a section.
3. **The four tools are one per `ACTION_CATALOG` category** — `create_task`
   (internal), `update_request_status` (record_update), `schedule_meeting`
   (scheduling), `send_email` (comms/outbound). Principled rather than
   favourite-picking, and the outbound one is what makes the cap testable on
   this path at all. Everything else in the catalog needs context a plan does
   not reliably have (a vendor id, a staff email address), and a step that
   cannot execute on approval is worse than one never proposed.
4. **`ai_actions.session_id` had to be added** — the plan specifies
   `plan_id = ai_actions.session_id` and HOA's `ai_actions` had no such column
   (Earnest's does). A plain string, not a relation: the plan id is minted
   before any row exists to point at. `proposeAction()` gained one passthrough
   field and nothing else.
5. **Attendees ride on the session row as JSON.** Earnest has
   `director_participants` and `director_qa` as separate collections; the plan
   here names three collections, and attendance is small, bounded, and
   meaningless apart from its session.
6. **All three collections are admin-only, as the plan specifies.** That means
   nothing in a browser can subscribe to the session row yet, so Session 8's
   "second admin sees the revision update" is a POLL against a state endpoint
   unless it first adds a scoped read policy. Flagged as an operator TODO
   rather than decided here — and Directus's create-rule trap does not apply,
   because a read policy is all it would need.
7. **`plan` added to the `AiFeature` union** and to the field's dropdown
   choices, so a board can see what planning costs rather than having it
   disappear into "chat".

**The thing the tests could not have caught.** Asked for at the END of the
prompt — exactly as Earnest asks for it — the `TL;DR:` line never arrived.
Twice, against the live model: the planner wrote its briefing, went straight to
emitting tool calls, and simply never came back for the closing instruction.
`points` was empty both times, and Session 8 would have rendered a slide deck
with no slides off a prompt that reads as though it should work. Asked for
FIRST, it is simply how the reply opens. `splitTldr()` already read the marker
wherever it landed, so only the prompt moved.

Quality gate: typecheck **0 errors** · vitest **1316/1316 in 76 files** ·
`pnpm build` green · hairline audit green at baseline 26 · org-scope test on
the new endpoint · schema script run against prod (idempotent) with
`generate:types` committed · cache_key writer/reader identity asserted through
the real save and load · TTL expiry both sides · wallet charged per plan · and
an outbound plan step landing `pending` at autonomy tier 3.

Browser-verified headlessly on the demo org (Harborview Lofts), through a real
session (`/api/demo/login`) on this session's own dev server:

- **A real briefing, really grounded.** A request backdated 45 days produced
  `request-aged` and `request-unassigned`; the plan opened "This single ticket
  (irrigation valve leaking at the east gate) has sat open for 45 days with
  nobody assigned", proposed two steps, and both carried the real request id.
- **Metering is exact.** 7996 → 7981 on the first draft (15 credits), and every
  subsequent draft moved the balance by exactly what it returned. The debits
  carry `feature: "plan"`, `model: claude-sonnet-5`, and real token channels.
- **The cache holds.** Reopening the same section returned `cached: true`,
  `credits: 0`, the same `planId` and the same bullets — and its steps were
  re-read LIVE, so a step approved in between showed as `executed` on reopen
  rather than replaying the saved snapshot.
- **A plan step is an ordinary queue row.** Approving one through the existing
  `/api/ai/actions/[id]/approve` executed it and created the real task.
- **Tier 3, in one plan, all three at once.** With the dial at 3: `create_task`
  **executed**, `update_request_status` **executed**, `send_email`
  **pending** — and `hoa_emails` stayed at **0**. The auto-runs recorded
  `approved_by: null`; the person-approved step recorded the real user id.
  This is Risk 4 proved on the plan path, with the internal steps beside it
  proving tier 3 was genuinely on.
- **The anti-hallucination rule, tested against its own worst case.** The demo
  org had no financial records at all, so `buildMoneyIntel` returned null and
  the prompt said so. The briefing answered "Collected: Not on record… Spent:
  Not on record… the association is flying blind financially" and proposed
  bookkeeping steps — it invented no balance, no trend, and no arrears figure.
- **And with real figures.** Seeded two payment requests and one expense with
  Directus's string decimals ("750.50"): the block reported income $601,
  expenses $325, outstanding $751 in the 61–90 day bucket, named Ava Bennett
  as carrying all of it, and flagged the missing opening balance. No NaN, no
  silent $0.00 — the decimal-as-string trap does not reach this path.
- **All three refusals through the real auth path**: 403 on 1033 Lenox with
  **zero** rows read before the refusal, 400 without an `orgId`.

**Cleanup, stated precisely.** Everything created for this verification was
deleted: the backdated request, five tasks, one meeting, three payment rows,
all `ai_actions`, all four briefings, and nine `org_audit_log` entries with
their nine `ai_ledger_chunks`. The demo org now matches the untouched
`demo-classic` control exactly on every collection, and `ai_autonomy_tier` is
back to 0. **Two things were deliberately NOT reverted**: the wallet is 133
credits lower and the `ai_transactions` debits remain, because those tokens
were really bought — deleting the ledger would make it disagree with the
balance.

**A cleanup bug worth recording.** The first cleanup script deleted `hoa_tasks`
for the whole org rather than only its own rows, and threw before resetting the
trust dial. Both were caught and corrected, and the blast radius was confirmed
to be zero by diffing against `demo-classic`, which was never touched: both
demo orgs carry members and nothing else. Next time, filter the delete the same
way the create was filtered.

**Session 8 — Phase 6 UI** (2026-08-24) — 2 commits straight onto `main`
(`ca2d03f`, `3f722c1`), not pushed.

Shipped:

- Eight HTTP doors on Session 7's three utils:
  `GET|POST /api/ai/director/sessions`, `GET|POST /api/ai/director/sessions/[id]`,
  `GET|POST /api/ai/director/minutes`, `GET|POST /api/ai/director/minutes/[id]`.
- `core/app/composables/useBoardroomSession.ts` — convene / join / leave /
  attach a plan / present / report a decision / end, plus the poll.
- `core/app/composables/useBoardroomMinutes.ts` — list / record / load / share.
- `app/components/Boardroom/{Header,Slides,Briefing,Steps,Agenda,LiveSessions,MinutesStrip}.vue`.
- `app/components/pages/BoardroomPage.vue` + `app/pages/[slug]/admin/boardroom/index.vue`.
- `app/components/pages/BoardroomMinutesPage.vue` +
  `app/pages/[slug]/admin/meetings/minutes/[id].vue`, and the decision-records
  strip mounted on the meetings hub.
- `planThis()` gained an options argument (subject / topic / entity / refresh).
- `loadPlanSteps()` now carries `result`, so a plan step that executed offers
  Undo in the room the same way it does in the queue.
- Nav: "Board Room" in the Dashboard section of `useSectionNav`, and
  `/admin/boardroom` on the dashboard slot's `match` in `useAppNav`.
- Tests: 49 endpoint + 23 composable + 6 on the planner overrides.

**Peter's decision, asked before any of it was built.** Multiplayer is a POLL
against a session-state endpoint, not a scoped read policy on
`hoa_director_sessions`. No prod script, no widened read. The page's contract is
the socket's contract either way — "the revision moved, re-read the steps" — so
the WS upgrade stays a drop-in if the policy is ever run. The operator TODO is
resolved.

Deviations from the plan, all deliberate:

1. **Two doors per resource, not six.** Earnest has
   `sessions/[id]/{join,leave,plan,present,end,step,qa,invite,presence}.post.ts`.
   Join, leave, attach-a-plan, present, report-a-decision and end are not six
   resources — they are six things that happen to one meeting, and every one of
   them ends in the same `revision` bump. `POST /sessions/[id]` carries them all
   behind an `op`, which means one authorization gate, one org check, and one
   place a seventh op can forget neither. Minutes share the shape (`op: "share"`).
2. **The minutes route has no field for a step list.** The plan says minutes are
   a durable decision record; a record whose tally arrived from the screen that
   was displaying it can be wrong in exactly the way nobody notices. The browser
   sends the plan id, the server re-reads the steps and rolls them up with
   `summarizeMinutesSteps()`. Same reasoning made `op: "activity"` read the step
   back before writing the room's activity line — a client cannot tell the room
   an approval happened.
3. **Minutes live under Meetings** (kickoff item 2), at
   `/{slug}/admin/meetings/minutes/[id]`, with the strip on the meetings hub.
   The Board Room shows the same strip so the person who recorded a set sees it
   land, but the canonical home is Records → Meetings.
4. **The Board Room joins the Dashboard section, not the dock.** The dock is
   seven deliberate slots; the Board Room plans the WHOLE association, so filing
   it under any one content section would misstate its scope. It sits beside AI
   spend, where the assistant's other surfaces already are.
5. **A page-owned `drafting` flag, not `layer.planning`.** Re-syncing the plan
   after a decision goes through the same composable (cached, free), and showing
   "Drafting…" while nothing is being drafted would be a small lie told several
   times a session.
6. **`planThis(opts)` — a caller that passes options owns the scope, including
   by leaving it empty.** "The whole association" is the ABSENCE of a subject.
   Falling back to the route would have made that chip silently plan Requests
   whenever the room was opened from a Requests page. Caught by writing the test
   first and disliking the assertion it produced.
7. **`.glass-refract` on the Boardroom header now** (kickoff item 3), not swept
   later — verified painting in the browser: the `::before` band, the three-stop
   gradient, `mask-composite: exclude`, and dark alphas that drop from
   .65/.24/.04 to .26/.10/.02.
8. **`import.meta.server`, not `!import.meta.client`,** guards the poll — the
   same guard `useWebSocketManager` uses, and the one that reads correctly in a
   plain vitest run. Written the other way first, the poll silently never
   started under test and four tests passed vacuously.

**The thing the tests could not have caught.** Probing the eight doors for a
403, I used `demo-classic` as the "other community" — and the demo login is an
admin of BOTH demo orgs, so two POSTs returned 200 and **wrote a session and a
set of minutes into the control org I was using to prove blast radius**. The
diff caught it, both rows were deleted, and the refusal was re-tested against
1033 Lenox, where all eight doors returned 403 with zero rows written. A control
org is only a control if you never write to it.

Quality gate: typecheck **0 errors** · vitest **1394/1394 in 79 files** ·
`pnpm build` green · hairline audit green at baseline 26 · org-scope test on all
eight new endpoints (refused, and refused before a row is read).

Browser-verified headlessly on the demo org (Harborview Lofts), through a real
session (`/api/demo/login`) on this session's own dev server:

- **A briefing generates, grounded.** A request backdated 45 days produced a
  briefing that opened "This single request — the leaking irrigation valve at
  the east gate — has been sitting open for 45 days with no one named as owner",
  four TL;DR bullets in the slide strip, and two steps carrying the real request
  id.
- **Credits decrement.** 7863 → 7840 on the draft (23 credits), and the spend
  breakdown moved `plan` 124 → 147. Nothing else moved.
- **The cached reopen makes no model call.** Balance 7840 → 7840, call count
  20 → 20, and the page said so: "This briefing was already written, so
  reopening it cost nothing."
- **A step approved from the plan shows in recently-handled.** Approving step 1
  flipped it to `executed` in the room, moved the counter to "1 of 2 decided",
  and `GET /api/ai/actions?status=executed` — the exact query the trust bar's
  recently-handled list runs — returned it, attributed to Demo Admin and
  undoable. The Undo button appearing is also what proves `result` now reaches
  the card.
- **Multiplayer, end to end.** Room convened ("1 at the table · Demo Admin
  opened the room"); a second browser context saw it under "Live now", joined
  for **zero credits** (7839 → 7839, calls 21 → 21) and was handed the same plan
  with the same statuses. Approving the second step in the first context bumped
  the revision 3 → 4 and wrote `{type: "decision", status: "executed", label:
  "Set request status to in_progress"}` — the status and label read back from
  the row, not taken from the client. The follower's poll picked it up on its
  own: "1 of 2 decided" → "2 of 2 decided", `PENDING` → `EXECUTED`, and the
  header line changed to "Demo Admin approved …". **Stated precisely:** the two
  contexts are the same demo login, because the demo org has one admin account;
  the transport under test is user-agnostic (a session id and a revision), and
  the two-people case — a second attendee seated without unseating the host — is
  the unit test.
  The headless pane reports every tab as `hidden`, and the poll deliberately
  stands down when hidden, so `visibilityState` was overridden on the follower.
  That is the only thing faked; the timer, the request and the merge are real.
- **Minutes.** Recorded from the room with server-computed stats
  (`done: 2, total: 2`), rendered at
  `/demo/admin/meetings/minutes/{id}` under the Meetings sub-nav with the
  tallies, the bullets, the briefing and "the steps, as they stood", shared to
  `SHARED`, and listed on the meetings hub as
  "Requests · Association-wide · 2 approved of 2 · Demo Admin".
- **Ending the meeting** from the header cleared the live list to zero.
- **Refusals through the real auth path**: all eight doors 403 against
  1033 Lenox with zero rows written; 400 without an `orgId`; and 404 — not a
  leak — when a real session/minutes id is asked for from a community it does
  not belong to.
- **Dark and mobile**: rim alphas swap correctly, no horizontal overflow at
  375px, no new console errors and every API call 200.

**Cleanup, stated precisely.** Deleted: two `ai_actions` (filtered by
`session_id = <planId>`, not by org), one briefing (by `plan_id`), the one task
the approved step created (by `result.taskId`), the one seeded request (by id),
one session and one set of minutes in the demo org (by id), the **two rows the
403 probe wrongly wrote into `demo-classic`** (by id), and two `org_audit_log`
rows with their two `ai_ledger_chunks` (by id). Every filter mirrors the create
that made the row — Session 7's correction, applied from the start. The demo org
now matches `demo-classic` exactly on all fourteen collections, and
`ai_autonomy_tier` is 0, where it started. **Deliberately NOT reverted**: the
wallet is 25 credits lower and three `ai_transactions` debits remain, because
those tokens were really bought and deleting the ledger would make it disagree
with the balance.

**Session 9 — Phase 7 core** (2026-08-24) — 1 commit straight onto `main`
(`7dd35f8`), not pushed.

Shipped:

- `core/app/composables/useStackItems.ts` — the item model, seven pure adapters,
  and `buildStacks()`, which owns the once-only rule. Decide = pending
  `ai_actions` + notices carrying a `proposedAction`; Do = actionable notices +
  unread channels; Know = insight notices + saved briefing headlines.
- `core/server/api/ai/director/briefing.get.ts` — a read-only door onto a saved
  briefing (see deviation 2).
- `app/components/Home/{Stack,StackItemRow,StackClearWizard,Stacks}.vue`.
- `app/components/pages/DashboardPage.vue` — the stacks band above the fold, the
  `useDashboardWidgets` grid demoted below it. The registry, `WidgetCard` and
  `WidgetGallery` are untouched.
- Tests: 20 on `useStackItems` (11 of them on de-duplication alone) + 8 on the
  new endpoint.

**The de-duplication, stated precisely.** Every item carries a `factKey` naming
the underlying FACT rather than the row that reported it, and the piles are
built in order — Decide, then Do, then Know — so a fact claimed by an earlier
pile is gone from every later one. The load-bearing collision is a notice's
`proposedAction` against the `ai_actions` row created from it: neither knows
about the other, so they meet on `act:<entityType>:<entityId>:<actionType>`,
deliberately the same identity `/api/ai/notices/propose` already dedupes pending
proposals on. Verified live, and it turned out to be **symmetric**: approving the
proposal that was claiming a fact un-claims it, and the notice behind it comes
straight back — which is correct, because the request really is still open 45
days.

Deviations from the plan, all deliberate:

1. **The rework target is `app/components/pages/DashboardPage.vue`, not
   `app/pages/[slug]/admin/index.vue`.** The plan calls the latter "a 22-line
   wrapper", and it is 22 lines — but it is a *redirect* shim, not a dashboard.
   The admin dashboard IS the org root (`/{slug}`), which renders
   `<PagesDashboardPage>`; `/{slug}/admin` is reachable three ways and bounces to
   the root. Reworking the shim would have broken all three redirects and changed
   nothing anybody sees.
2. **A new endpoint, `GET /api/ai/director/briefing`.** The kickoff allows the
   home page to read a saved briefing but never to draft one, and says to show
   nothing rather than guess. `POST /api/ai/director/plan` cannot be used: it
   serves a cache free for six hours, but on a cold cache it drafts and bills.
   So the read is split from the write. The new handler calls
   `loadLatestDirectorBriefing()` and nothing else — no wallet lookup, no
   Anthropic client in its module graph, no branch that reaches one. The test
   asserts the only collection it touches is `hoa_director_briefings` and the
   only operation is a read.
3. **`Home/Stacks.vue` — a band component, not 200 lines inlined.**
   `DashboardPage.vue` was already 585 lines; the band owns its own composable
   and mounts as one tag.
4. **The proposal row renders `<AiActionCard>` WHOLE, with no wrapper.** The card
   already draws its own border; wrapping it in the row's `ios-card` would have
   put a box around a box. `send_email`'s expandable preview is therefore the
   card's own "Show content" — the To, Subject and outbound chip always visible,
   the body one tap away, collapsed by default. One implementation, not a second.
5. **Decisions and proposals are emitted upward, never posted in a row.** The
   page owns `useAiActions` and its shared `aiPendingCount`; a row that fetched
   for itself would leave the launcher badge disagreeing with the screen. Written
   the other way first — with `useDirectorLayer()` instantiated per row — and
   changed, because proposing from a notice has to refresh the queue the new row
   lands in, and only the page can do that.
6. **Domain dots, not priority dots.** The plan demotes domain to the coloured
   dot, so that is what the dot means; priority survives as the sort key inside
   each pile. `Director/Layer.vue` keeps its own priority dots — a different
   surface answering a different question.
7. **Headlines get a SECOND, text-based de-dup guard; structured rows do not.**
   Briefing bullets are prose restatements of the same agenda the notices come
   from, and prose has no structural identity. A headline whose normalised text
   matches a title already on screen is dropped. That guard is deliberately not
   applied to notices or proposals — two genuinely distinct records can share a
   title, and there is a test that says so.
8. **No `useGsap()`.** That composable builds inside a `gsap.context` on mount
   and reverts on unmount, which is right for a component whose animation is
   its arrival. The fan is imperative and re-runs on every tap, so it uses the
   motion policy's memoised dynamic `import("gsap")` instead — and the
   reduced-motion guard runs BEFORE it, so a person who asked for less motion
   never loads the library at all.

Quality gate: typecheck **0 errors** · vitest **1422/1422 in 81 files** ·
`pnpm build` green · hairline audit green at baseline 26 · org-scope test on the
one new endpoint (403 before a row is read).

Browser-verified headlessly on the demo org (Harborview Lofts), through a real
session (`/api/demo/login`) on this session's own dev server:

- **Landing on the dashboard makes ZERO billable AI calls.** Every `/api/ai/*`
  request on a cold load is a GET read: `actions/pending-count`, `autonomy`,
  `actions?status=pending`, `notices`, `director/briefing`. No POST to any AI
  route, no `/plan`, no `/chat`, no `/draft`, no `/ask`. The wallet reads 7837
  before the load and 7837 after it, with three piles' worth of data on screen.
- **De-duplication, live.** With a pending `create_task` on request A and the
  notices engine also proposing `create_task` on request A, Decide showed the
  ROW and not the notice, and the notice did not fall through to Do either. The
  aged notice for request B — which had no competing proposal — did appear.
- **Approve-from-stack round-trips.** Approving the `create_task` from the pile
  flipped it to `executed` with a real `result.taskId`, dropped it out of Decide,
  and left it `_undo`-able; `POST /undo` reversed it and deleted the task. It
  costs **1 credit**, which is a Voyage EMBED of the Community Ledger line the
  approval writes (Phase 5 behaviour, no LLM call) — the same cost approving from
  anywhere else.
- **Outbound is never approved blind.** The `send_email` row showed the OUTBOUND
  chip, To and Subject always, and the body only behind "Show content", which
  expanded to the real text and collapsed again.
- **The fan is transform-only.** Driving GSAP's ticker by hand and sampling every
  inline property written: the pile receives **only `height`** (the deliberate
  height tween — 474 → 755 → 788 → 790px, the `expo.out` signature, so the piles
  below slide instead of jumping) and the rows receive only
  `translate/rotate/scale/transform/visibility/opacity`. No filter, no shadow, no
  layout property. `clearProps` lands it: afterwards the pile and all three rows
  have an EMPTY style attribute.
- **The fold keeps its rows.** Collapsing held `is-closing` for the whole
  timeline with all three rows still mounted, tweened the height back down
  762 → 400 → 293, then unmounted to one visible row with no residue.
- **Reduced motion is guarded first.** With `prefers-reduced-motion` stubbed,
  expanding created **0 tweens**, showed all rows instantly, wrote no inline
  style at all, and collapsed instantly too. GSAP is never even asked for.
- **Empty piles reach the win state.** Dismissing the three Do notices landed
  "Nothing overdue, nothing unread." and dropped the count chip; the dismissals
  persisted to `hoa.ai-notices.dismissed.<orgId>`, so `useAINotices`'s
  localStorage path is intact. With every source empty the band shows "Nothing is
  waiting on you."
- **The walkthrough.** 1 of 3 → 2 of 3 → 3 of 3 → "Nothing left to walk through",
  progress bar to 100%, and closing it folded the source pile back to its
  collapsed card — the `defineExpose({ collapse })` path.
- **The widget grid still works below the fold.** Customize enters edit mode, the
  gallery appears, hiding drops 8 → 7 and persists to
  `dashboard-widgets-admin-v1`, Reset restores 8, Done exits.
- **Glass, dark and mobile.** `.glass-refract` paints on the band
  (`mask-composite: exclude`), rim alphas swap .65/.24/.04 → .26/.10/.02 in dark,
  the ghost pile layers derive from the theme-aware foreground token, and at
  375px **zero** elements overflow the band. Every request 200.

**Two things the tests could not have caught.**

1. **Overriding `document.visibilityState` fools page JS, not the compositor.**
   Session 8's note gets a sharper edge: in the headless pane `requestAnimationFrame`
   never fires and CSS transitions stay frozen mid-flight *even after* the
   override, because the page genuinely is not being composited. A first probe
   read "the ghost layers never hide" and "the pile is stuck at 293px" — both
   were the frozen compositor, not bugs. Measuring the fan honestly needed
   `gsap.ticker.tick()` driven by hand in a busy-wait loop (inline styles are
   written by JS, so they are real) and a temporary `transition: none` to read
   what the CSS RULE targets rather than the frame the pane is parked on.
2. **Directus ignores `date_created` on create.** It is a special date-created
   field, so a request seeded "45 days ago" arrived stamped now and the notices
   engine correctly reported nothing. A follow-up `PATCH` sets it fine. (And the
   stamp confirmed the known clock skew: Directus wrote `2026-08-25T00:22` while
   the app was on 2026-08-24.)

**Cleanup, stated precisely.** Created in the demo org: two `hoa_requests`, two
`ai_actions`, one `hoa_director_briefings`, and — as side effects of the approve
and the undo — one `hoa_tasks`, two `org_audit_log` and two `ai_ledger_chunks`.
All deleted, each filtered the way its create was made: the task by the
`result.taskId` the row recorded (not by title), the audit rows by
`event_type` within the demo org, and the rest by the ids this session wrote
down. The demo org now matches `demo-classic` exactly on all fourteen
collections censused. **`demo-classic` was read and never written — zero change
on every collection**, which is what a control org is for. **Deliberately NOT
reverted**: `ai_transactions` is +2 (7838 → 7836) because those two Voyage embed
debits were really spent, and deleting the ledger would make it disagree with
the balance — Session 8's precedent.

**Session 10 — Phase 7 polish** (2026-08-24) — 3 commits straight onto `main`
(`ac52453`, `f557196`, `4710776`), not pushed.

Shipped:

- `core/shared/home/glances.ts` — the pure arithmetic behind every number on
  the home: `collectionMonths`, `ageingBuckets`, `pastDue`, `requestBuckets`,
  `staleRequests`, `summariseOccupancy`, plus `owed()` and the string-decimal
  `num()` guard.
- `core/app/composables/useHomeGlances.ts` — five shared reads:
  `useMoneyGlance`, `useRequestsGlance`, `useUnitsGlance`, `useMembersGlance`,
  `useEmailActivityGlance`.
- `core/shared/home/waves.ts` — the wave geometry and the whole-number-harmonic
  invariant, in `shared/` so a test can hold it there.
- `core/app/composables/useHomeAmbient.ts` — waves → orbs → off, localStorage,
  read deferred to `onNuxtReady`.
- `app/components/Home/{AmbientBackground,GlanceRail,ChartRail}.vue`.
- `app/components/dashboard/{Collections,RequestsHealth,Occupancy}Widget.vue`
  rewritten onto the shared composables; `DashboardPage.vue` mounts the ambient
  in its own stacking context, puts the stacks + glance rail in the main column
  with the chart rail sticky beside them at `xl`, and takes its members, units
  and email-activity numbers from the same composables.
- Mobile/dark tuning of Session 9's band (commit 3).
- Tests: 27 on the glance arithmetic, 9 on the wave geometry, 9 on the ambient
  preference — 45 new, 1467 total.

Deviations from the plan, all deliberate:

1. **The extraction target was the dashboard WIDGETS, not the `Admin/*Glance.vue`
   bands.** The plan says to extract the fetch logic out of those bands, and
   four of the five have none: `MoneyGlance`, `RequestsGlance` and
   `MeetingsGlance` are props-driven, fed by the page that already loaded the
   rows. The components that *did* fetch the same questions are
   `dashboard/CollectionsWidget`, `RequestsHealthWidget` and `OccupancyWidget`,
   each with its own `useAsyncData` key. Those are what moved. `PeopleGlance`
   also fetches, but its query is a three-way `allSettled` including
   `hoa_board_members`, and it never co-exists with the home — extracting it
   would have created a SECOND `hoa_units` query on the dashboard, which is the
   thing the instruction forbids. It is untouched.
2. **One `payment_requests` query, not two.** The Collections widget asked only
   for paid rows; the rails also need what is owed. Rather than add a second
   query the filter became the union — paid OR still owing — and money-in,
   outstanding-by-age and past-due all derive from the one result. Capped at
   1000 rows, newest first, documented as a truthfulness limit: past it the
   glance under-reports and the Money surface is authoritative.
3. **One `hoa_units` query serving three different filters.** The dashboard's
   Units stat counts active AND inactive; the occupancy split is active-only.
   `useUnitsGlance` fetches both statuses and `summariseOccupancy` narrows to
   active, so each number keeps exactly the meaning it had.
4. **`GlanceRail` is not `ios-card` tiles.** Earnest's is. Five bordered boxes
   directly under a glass band is five more surfaces competing with the thing
   that wants attention, so this is a hairline-separated rail — the 1px grid gap
   showing through tiles that paint the page ground. It also adds nothing to the
   Phase 8 census.
5. **`ChartRail` reuses the colour system, not the chart components.** The plan
   says to use `App/Chart/*` where they fit, and at 240×36 they do not: the kit
   is unovis-backed and card-sized, all axes, margins, tooltips and legends. The
   five glances are hand-rolled SVG and CSS bars, and what they share with the
   full charts is `shared/home/glances` — the same buckets and the same status
   colours — so a rail bar and its full chart can never disagree.
6. **The org id is a PARAMETER to every glance composable.** `useSelectedOrg()`
   is async and these live in plain `.ts`. `<script setup>` wraps its top-level
   awaits in `withAsyncContext`, restoring the Nuxt instance afterwards; a plain
   function gets no such wrapper, so awaiting the org inside the composable
   stripped the instance from `useDirectusItems`, `useAsyncData` and everything
   after it, and the dashboard 500'd on SSR. Caught in the browser, not by the
   typechecker. Each composable's `await useAsyncData(...)` is now deliberately
   the last instance-dependent call it makes.
7. **`light-dark()` carries the two alphas, not a CSS variable pair.** The plan
   asks for light and dark tuned separately against `html.theme-app`. Because
   `color-mix()` returns a colour, `light-dark(color-mix(...L), color-mix(...D))`
   is a single valid `stop-color`, so both values ride one declaration off the
   `color-scheme` the theme already sets — no second selector to keep in sync.
   Earnest does this with `:root:not(.dark) { opacity: 0.55 }`, which is exactly
   the one-value-with-a-multiplier the kickoff rules out.
8. **The light alphas went UP, not down.** First pass had light at roughly half
   of dark, and the field was invisible over `#f6f8fb` — visible only with the
   blur removed. What eats a light-mode wash is CONTRAST against the ground, not
   opacity: cyan at 0.20 over near-black shifts a pixel about 40 units, the same
   alpha over near-white shifts it ten. Light now sits within a few points of
   dark for both bands and orbs.

Quality gate: typecheck **0 errors** · vitest **1467/1467 in 84 files** ·
`pnpm build` green · hairline audit green at baseline 26. **No new endpoints**,
so no new org-scope test — this phase added no server routes at all; every read
goes through the existing org-filtered Directus queries.

Browser-verified headlessly on the demo org through a real session
(`/api/demo/login`) on this session's own dev server, against a 17-row fixture
seeded into `demo` and deleted afterwards:

- **Landing on the dashboard still makes ZERO billable AI calls.** Every
  `/api/ai/*` request on a cold load is a GET read — `actions/pending-count`,
  `autonomy`, `actions?status=pending`, `notices`, `director/briefing` — the
  same five Session 9 recorded. No POST to any AI route. `GET /api/ai/notices`
  is computed, never persisted: `ai_actions` stayed at 0 throughout.
- **One request per collection, proved by mounting the widgets.** The dashboard
  registers exactly twelve `useAsyncData` keys, with `home-money-glance-*`,
  `home-units-glance-*`, `dash-requests-health-*`, `dashboard-members-*` and
  `dashboard-email-activity-*` appearing ONCE each. Turning Collections,
  Requests Health and Occupancy on from the gallery — three components that
  each used to run their own query — issued **zero** new fetches, and their
  figures matched the rails exactly ($2,101 collected, 4 open · 2 over 30 days,
  50% owner-occupied).
- **The arithmetic is right.** Past due $1,701 / 3 charges (300 + 500.75 + 900);
  outstanding $2,151 including the $450 not yet due; money in $2,101; homes 6
  with 50% owner-occupied from 4 recorded ACTIVE units, the inactive one counted
  as a home and correctly excluded from the donut. Every debt landed in exactly
  one ageing band; the donut arcs came out 50/25/25 with the right offsets.
- **Each glance self-hides when its series is empty.** On the seeded org four of
  five rendered and Mail did not, because there is no mail. Feeding the shared
  email-activity key seven days of sends (client-side only, no writes) made the
  fifth appear with correct bar heights and weekday initials. With the fixture
  deleted the whole rail stops rendering and the glance rail reports honest
  zeros.
- **The ambient is transform-only.** Over 400 hand-driven ticker ticks the ONLY
  property that changes on an orb is `transform`; the wave bands take a
  translate-only `matrix()` and nothing else — no filter, no opacity, no layout
  property. Ten wave tweens: five `ease:"none"` slides and five `sine.inOut`
  bobs, all `repeat:-1`. Each band travels exactly its own period — 420, 330,
  510, 290, 640, directions mixed — which with the unit test's
  `y(x) === y(x + period)` is the seamless loop.
- **It pauses when hidden.** All ten tweens report `paused: true` after a
  `visibilitychange` with `document.hidden` overridden, and `false` again after.
- **Reduced motion is static and never loads GSAP.** With
  `prefers-reduced-motion` stubbed, remounting the layer rendered all five bands
  and created **0 tweens**, wrote no inline style and no transform attribute,
  and 300 ticks moved nothing.
- **The hover lift cannot strand a phone.** Both the resting `opacity: 0.45` and
  the `:hover/:focus-visible → 1` rule live inside one `@media (hover: hover)`
  block — read out of the served CSS, not the source. On a 375px touch viewport
  `(hover: hover)` is false and all four glances compute `opacity: 1`. On
  desktop, with transitions neutralised, the hovered glance computes `1` and its
  three neighbours `0.45`. The entrance tween's `clearProps: "all"` leaves an
  EMPTY style attribute, so no inline opacity is left to outrank the rule.
- **Both alpha sets read.** Wave peak stops resolve to 0.20 / 0.17 / 0.15 / 0.13
  / 0.11 under `.dark` and 0.17 / 0.15 / 0.125 / 0.11 / 0.09 without it, with
  the edge stops fully transparent. Orbs carry `filter: none` in both — the
  softness is the gradient's own stop. "Off" really unmounts the layer.
- **The sticky guard is live.** At 1440×900 the rail is `position: sticky`,
  `top: 88px`, `width: 240px`, `max-height: 748px` with `overflow-y: auto`;
  at 375px it is a static two-column tile grid with no cap.
- **The band's mobile fix, measured.** At 375px the title column went from 180px
  to 270px and the action group dropped below it; at 1440px the controls are
  still alongside. The pile ghosts resolve to near-white at 0.07 / border 0.12
  over `#151d25` in dark and near-black at 0.035 / 0.06 over white in light.

Blast radius, measured before and after: the fixture created 7 `payment_requests`,
4 `hoa_requests` and 6 `hoa_units`, all in `demo`, all deleted — the cleanup
reads each row back and refuses to delete anything whose `organization` is not
the demo org. `demo-classic` **was never written to**: 0 / 0 / 0 across those
three collections at every census, and its 5 members untouched. `ai_actions`
stayed 0 in both.

**A note for Session 11 on verifying anything visual here.** Session 9's finding
holds and got sharper: the headless pane is not composited, and it additionally
**cannot rasterise `filter: blur()`** — the wave field photographs as a blank
ground until the blur is removed, which is how the light alphas looked correct
when they were not. Also, successive synchronous `gsap.ticker.tick()` calls
advance almost nothing (the delta is real elapsed time, ~0 between calls); to
finish a tween, call `tween.progress(1)`. And to read what a CSS rule targets,
inject `transition: none !important` first — otherwise every computed value is
a frozen mid-transition sample.


- [x] ~~Push Session 1~~ — done; `main` carries Phases 0 and 1.

### Operator TODOs (carried forward until done)

> **2026-08-25 — the droplet thread is closed.** The four scheduled jobs now sit
> in **two** systems, split on whether the job needs a checkout of this repo:
> the digest and export workers on **GitHub Actions**, the two AI crons on
> **Vercel Cron** (`vercel.json`), because each is a single HTTP request at an
> endpoint that already exists and booting a runner to send it is pure overhead.
> The export is additionally **dispatch-driven** — queuing one wakes the
> workflow immediately, and the hourly schedule is only the net. This mirrors
> how Earnest runs the identical endpoints. See the rewritten
> `docs/notification-digest-cron.md`, `docs/data-export-cron.md`,
> `docs/ai-notices-cron.md`, `docs/ai-action-expiry-cron.md` and go-live §3/§3b.

- [x] ~~**Set three GitHub repository secrets**~~ — done by Peter 2026-08-25.
      `DIRECTUS_STATIC_TOKEN` is proven by the dispatch runs, which reach
      Directus and would throw on a bad token. `SENDGRID_API_KEY` is not yet
      exercised — the first digest run is its first real use.
- [x] ~~**Set `GITHUB_DISPATCH_TOKEN` in Vercel env**~~ — done by Peter and
      proven working 2026-08-25 (see the end-to-end entry above).
- [x] ~~**Confirm both Vercel crons appear**~~ — done 2026-08-25. Both show in
      the Cron Jobs tab: `10 7 * * *` and `40 7 * * 0`, times in UTC. The weekly
      one surviving proves the project is on **Vercel Pro**; Hobby caps crons at
      daily granularity, so that question is settled and needs no further hedging.
- [x] **Pushed and verified in production 2026-08-25** (`c6eb27d`). CI green on
      both commits. A real `repository_dispatch` ran the export worker in 36s —
      it reached Directus and reported `built=0` on an empty queue, which also
      proves the `DIRECTUS_STATIC_TOKEN` secret. Both AI endpoints answer `401`
      to a GET carrying a wrong Bearer token, which is Vercel Cron's exact
      request shape: route accepts GET, auth enforced, no side effects.
- [x] **`GITHUB_DISPATCH_TOKEN` proven end to end 2026-08-25.** Queued an export
      on `demo` (Harborview Lofts) through the deployed app as the demo user:
      row created **17:42:02**, `repository_dispatch` run created **17:42:15**
      (13s), archive ready **17:42:55**, run ended 17:42:59. **53 seconds from
      request to downloadable archive**, against up to 15 minutes under the old
      polling. Every row created was then deleted — export row, archive file and
      notification 35 — and both demo orgs were diffed before and after:
      `demo` exports 0→0 / activity 449→449, `demo-classic` 0→0 / 13→13, the
      `Data exports` folder back to its single transition-test archive. API
      calls do not write `hoa_activity` rows; browsing does.
- [ ] **Watch the first run of each of the four jobs go green.**
      A failed Actions run emails you; a *green* digest run that sends nothing is
      expected — see the `candidates=1` note below.
- [ ] **`candidates=1` platform-wide** (2026-08-25): exactly one user across
      every org has a non-null `notification_preferences`. The digest will
      correctly send almost nothing, so green ticks with no mail are the
      expected result rather than a broken schedule. Whether that number should
      be higher is a product question — preferences have barely been set.
- [ ] **The digest can miss an hour.** GitHub delays scheduled runs under load
      and sometimes drops them, and the worker's only idempotence is matching
      the CURRENT hour — so a run delayed past the boundary is a MISSED digest,
      not a late one. The schedule is `7 * * * *` to buy margin. If misses show
      up, the fix is a per-member `last_digest_at` guard so the schedule can run
      every 15 minutes safely — **not** a higher frequency, which would send
      duplicates.
- [ ] **A `#core/…` import inside `core/shared/` breaks every standalone
      script that reaches it, and no gate catches it.** `#core` is a Nuxt and
      vitest alias with no `imports` map in `package.json`, so vitest,
      `nuxt typecheck` and `nuxt build` all pass while `tsx` dies on
      `ERR_PACKAGE_IMPORT_NOT_DEFINED`. `core/shared/` is imported by the app,
      by vitest AND by scripts; keep its intra-package imports relative. This
      is what actually kept the export worker dead, not the missing droplet.
- [ ] **A workflow can be valid YAML and still be REJECTED by GitHub.**
      `${{ runner.temp }}` in a JOB-level `env:` is a context-availability
      error — job env allows only github / needs / strategy / matrix / vars /
      secrets / inputs — and no local YAML parser catches it. The symptom is
      distinctive: the workflow lists under its FILENAME instead of its `name:`,
      and the push produces a run with ZERO jobs. `runner` is fine at step
      level. Cost one bad commit on 2026-08-25, fixed in `c6eb27d`.
- [ ] **Vercel Cron issues GET, and only GET, and cannot send a custom header.**
      A `.post.ts` route on a Vercel cron answers **405 and the job silently
      never runs**. That is why `check.post.ts` / `expire-stale.post.ts` became
      `.ts`, and why both accept `Authorization: Bearer $CRON_SECRET` alongside
      `x-cron-secret` via `core/server/utils/cron-auth.ts`. Three other routes
      still read the header directly — `demo/reset`,
      `internal/recompute-member-counts`, `email/process-scheduled` — and would
      need the same treatment before any of them could move to Vercel Cron.
- [x] ~~**`app/lib/directus.ts` exports a `useDirectusRealtime()` that nothing
      imports**~~ — deleted 2026-08-25 with its `createDirectusRealtimeClient`
      helper. Worth recording what the grep turned up: **nothing imports
      `app/lib/directus.ts` at all**, so the two functions left in it
      (`createDirectusClient`, `useDirectus`) are dead too. Left in place
      because deleting the file was outside that session's scope.

- [ ] **`pnpm install` on every machine/clone** once this lands — the new `prepare`
      script is what installs the husky hooks; without a fresh install the pre-commit
      audit silently does not run.
- [ ] Nothing to run on prod for this phase. No schema changes, no new env vars.
      (`NUXT_PUBLIC_APP_VERSION` exists as an override but should stay unset.)
- [ ] **Phase 2a: nothing to run on prod.** No schema changes, no new env vars —
      `DIRECTUS_WEBSOCKET_URL` was already set and is unchanged.
- [x] ~~**Delete `useDirectusWebSocket.ts` and `useDirectusRealtime.ts` one
      release after 2a ships**~~ — done 2026-08-25. `useDirectusSubscription`
      now calls `useWebSocketManager()` directly and keeps the two behaviours
      the shim added: the logged-out guard and skipping the `init` frame.
- [x] **`pnpm backfill:notifications` — RUN on prod 2026-08-25**, the day 2b/2c
      deployed. Wrote 18 archived rows (17 meetings for 1033 Lenox, 1 document
      for the transition fixture). Idempotent on (recipient, collection, item),
      so a re-run is a no-op.

      ⚠️ **Directus EMAILS the recipient for every `directus_notifications` row
      it creates.** This backfill therefore sent Peter 17 emails in eight
      seconds. The rows themselves are `archived` and correct — history visible,
      nothing unread — but nobody had priced the mail. Any future bulk write to
      that collection needs the same thought, and there is no in-script switch
      for it: the send happens inside Directus, not in the script.

      ⚠️ Attribution never fully resolved. The scripted run was `--dry-run` and
      reported `Would write 18 … nothing was written`; `main()` runs once and
      the single `createNotification` sits behind a correct `if (DRY_RUN)
      continue`. The rows nonetheless carry that script's exact composer and
      came from a node process using the admin token on Peter's machine. Most
      likely a second, un-flagged run by hand. Recorded rather than tidied
      away.
- [ ] **Phase 2b/2c: no schema changes and no new env vars.**
      `NUXT_PUBLIC_BELL_V2` exists but should stay UNSET (defaults on); set it to
      `false` only to fall back to the old aggregator.
- [ ] **Delete `useLegacyAggregator` (the 1061-line body of
      `core/app/composables/useNotifications.ts`) and the `bellV2` flag one
      release after 2c ships**, together with the 2a adapter deletions above.
- [x] ~~**Mount `useMarkItemRead()` on the request / document / meeting detail
      pages**~~ — done 2026-08-25. Both request detail pages and the document
      detail page take it in one line each. Meetings have **no detail page** —
      `notificationTargetPath` sends a meeting notification to the list — so the
      detail DIALOG is the mount point, and landing on the list deliberately
      does not clear the badge. Verified end to end per collection with a seeded
      notification, reading `status` back from Directus. ⚠️ `markItemRead`
      prefers rows it already holds, so the common case issues an UPDATE and
      never sends the item-filtered query: watching the network for that query
      shows nothing and looks exactly like dead wiring.
- [x] ~~`useDirectusSubscription.handleEvent`'s `delete` branch key-vs-object bug~~
      — fixed in Session 4.
- [x] **Phase 3 schema: `pnpm add:channel-category` — already run against prod**
      (idempotent, re-run is a no-op) and `pnpm generate:types` committed. No new
      env vars. The roster renders ungrouped if it is ever run against a fresh
      Directus without it.
- [x] ~~**Fix `hoa_channel_messages.create`**~~ — done in Session 5, and **not**
      the way this TODO proposed. Moving the check to `permissions` was tried
      and **opens a cross-org write hole: Directus 11 ignores `permissions` on
      the `create` action** (proved live, then reverted). The rule stays in
      `validation`, rewritten to be payload-evaluable. `pnpm fix:channel-writes`
      — **already run against prod**, idempotent. See the Session 5 entry.
- [x] ~~**Widen `directus_users` read to same-org people**~~ — done in Session 5
      with Peter's approval. `pnpm widen:users-read` — **already run against
      prod**, idempotent. Adds a SECOND read rule per policy
      (id / first_name / last_name / avatar); the self rule is untouched, which
      is what keeps it safe.
- [x] ~~**Mute UI for channels.**~~ — done 2026-08-25.
      `POST /api/hoa/channels/:channel/mute` plus a toggle at the TOP of the
      members panel (above the roster: that row is about you, the rest is about
      other people). The endpoint mirrors `read.post.ts`'s authorization shape
      and auto-join, so an admin with org-wide access but no membership row can
      still mute. Verified: the count stays, the TOTAL drops to 0, and the state
      survives a reload. **No prod script and no new env var** — the column has
      existed since channels shipped.
- [x] **Phase 4 schema: `pnpm create:ai-notice-history` — already run against
      prod** (idempotent) and `pnpm generate:types` committed. Without it the
      notices cron still sends but repeats every run; it warns loudly when the
      collection is missing.
- [x] ~~**Add the notices cron to the droplet crontab**~~ — superseded
      2026-08-25. There is no droplet crontab and never was. It is now
      `.github/workflows/ai-notices.yml`, nightly at 07:10 UTC.
      ⚠️ `CRON_SECRET` now needs to exist in **two** places: the app's env
      (unchanged) and as a **GitHub repository secret**, which is where the
      caller reads it. See `docs/ai-notices-cron.md`.
- [ ] **Phase 4: no new env vars.** `ANTHROPIC_API_KEY` is irrelevant here —
      the notices engine makes no LLM call at any point.
- [x] ~~**Add the stale-proposal sweep to the droplet crontab**~~ — superseded
      2026-08-25, same as the notices cron. It is now
      `.github/workflows/ai-action-expiry.yml`, Sundays at 07:40 UTC.
      `AI_ACTION_EXPIRY_DAYS` is optional and still defaults to 14.
- [ ] **Phase 5: nothing to run on prod.** No schema changes, no new
      collections, no new fields, no `generate:types`.
- [~] **Make `ai_actions.preview` a `json` column.** Script written and
      registered — `pnpm convert:preview-json` — and **deliberately NOT RUN**.
      It is the only schema script here that ALTERS AN EXISTING COLUMN, and a
      text→json cast aborts on a single bad row, so it refuses to proceed until
      it has read every row and proved the cast survives (an EMPTY STRING is the
      trap; NULL is fine). `--dry-run` on prod 2026-08-25: 7 rows, 5 valid JSON,
      2 NULL, 0 failures. Still tidiness rather than a fix — the boundary parse
      is correct either way and stays — so it is queued behind a green deploy
      alongside the two release-gated deletions.
- [x] ~~**Wire "Draft a plan" to `/api/ai/director/plan` in Phase 6.**~~ — done
      in Session 7. `planThis()` posts to the endpoint, holds the button while
      it runs, and refreshes the approvals queue the steps land in.
- [x] **Phase 6 schema: `pnpm create:boardroom` — already run against prod**
      (idempotent; a re-run creates nothing) and `pnpm generate:types`
      committed. It adds three collections plus `ai_actions.session_id` and a
      `plan` choice on `ai_transactions.feature`. Without it the Board Room
      still drafts and still queues steps — the briefing cache is simply inert,
      so every reopen redraws and re-bills.
- [ ] **Phase 6: no new env vars.** `NUXT_DIRECTOR_BRIEFING_TTL_HOURS` exists
      as an override for demos and should stay unset (defaults to 6 hours).
      `ANTHROPIC_API_KEY` is already required by chat; the planner needs no
      more than chat does.
- [x] ~~**Decide Session 8's multiplayer transport.**~~ — Peter chose **(a)
      poll a session-state endpoint**, asked before anything was built.
      `GET /api/ai/director/sessions/[id]?since=<revision>` returns the session
      row always and the steps only when the revision has moved, and the poll
      stands down while the tab is hidden. **No prod script, no widened read.**
      The WS upgrade stays available: the page's contract is already "the
      revision moved, re-read the steps", so putting `hoa_director_sessions` on
      the manager later would not change the page.
- [ ] **Phase 6 UI: nothing to run on prod.** No schema changes, no new
      collections, no new fields, no new env vars, no `generate:types`.
      `pnpm create:boardroom` was already run in Session 7; without it the room
      and the minutes are inert (and say so) rather than broken.
- [ ] **Phase 7 core: nothing to run on prod.** No schema changes, no new
      collections, no new fields, no new env vars, no `generate:types`. The new
      `GET /api/ai/director/briefing` reads `hoa_director_briefings`, which
      `pnpm create:boardroom` already created in Session 7; without that
      collection the endpoint returns `{ briefing: null }` and the Know pile
      simply shows fewer rows. It can never draft, so it can never bill.
- [ ] **Phase 7 polish: nothing to run on prod.** No schema changes, no new
      collections, no new fields, no new env vars, no `generate:types`, and no
      new endpoints. Everything the rails read was already being read; the
      change is that it is now read once.
- [ ] **Watch the Know pile once briefings are common.** Headline de-duplication
      is text-based by necessity (deviation 7). If real briefings start
      restating notices in wording the normaliser misses, the fix is a
      structural key on the briefing's points — not a fuzzier text match.
- [ ] **Beware `permissions` on a `create` rule anywhere in this Directus.**
      It is silently ignored (11.13.4, verified). A create rule must express its
      constraint as `validation` over payload SCALARS, resolving dynamic lists
      through a reverse O2M alias on `directus_users` — the
      `channel_memberships` alias added in Session 5 is the worked example.

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
2. **Work on `main`, in the main checkout (`~/Sites/hoaconnect`) — no phase branch, no
   worktree.** Peter's standing instruction as of Session 3; it supersedes the
   `feat/parity2-p<N>-<slug>` convention Sessions 1 and 2 used (both of which ended by
   fast-forwarding into `main` and deleting the branch anyway, which is what made the
   branch step ceremony). Start every session with `git pull --ff-only`, commit in
   reviewable chunks, and **ask before pushing**. A worktree is the wrong tool here for
   a second reason: `.env` is gitignored, so a fresh worktree has no Directus
   credentials and cannot run the dev server or any browser verification.
3. End by: quality gate green → update the plan's `## Status` checklist (what shipped, deviations, operator TODOs like "run `pnpm create:X` on prod") → tell Peter the exact kickoff prompt for the next session.
4. If a session runs long, stop at a green commit and record the stopping point in
   `## Status` — **never leave `main` red.** Since work now lands directly on `main`,
   run the quality gate before each commit rather than only at session end; recovery
   from a bad commit is a `git reset`, not deleting a branch.

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

### Kickoff prompt — Session 11 (Phase 8 — glass sweep + gate flip, ready to paste)

```
Continue the Earnest Parity Round 2 program — this is the LAST session.

Work on `main`, in /Users/peterhoffman/Sites/hoaconnect itself — no phase
branch, no worktree. Start with `git pull --ff-only`. Tool shells have no
node/pnpm on PATH: run `eval "$(/usr/local/bin/fnm env)"` first. Commits land
straight on main, so run the quality gate before each commit — never leave
main red. Check `git status` is clean first and report rather than commit over
anything you find. Note: main is well ahead of origin and deliberately
unpushed — check with `git rev-list --count origin/main..main` and do not push
without asking.

Read docs/plan-earnest-parity-round2.md — it is the source of truth, including
the deviations Sessions 1–10 recorded there. Phase 7 is complete: the stacks
band, the glance rail, the chart rail and the ambient backdrop all ship on
`DashboardPage.vue`, and the three dashboard chart widgets now read through
`useHomeGlances` rather than querying for themselves.

This session = Phase 8, the whole of it:

- Sweep the NAMED components, worst-first, guided by a fresh census rather
  than the plan's counts: `ai/{ActionCard,AiAssistantPanel,AskTheHoa}.vue`,
  `channels/{ChannelThread,ChannelEditor}.vue`, `dashboard/WidgetCard.vue`
  (`.dash-widget` → `.ios-card`), `.glass-field` onto workspace inputs (2 call
  sites today vs Earnest's 208), `.glass-refract` on hero surfaces. Do not
  sweep wholesale — 361 borders across 102 files is the debt, the named list
  is the scope, and the gate is what stops it growing.
- Consolidate `core/app/assets/css/glass.css` into `earnest-ui.css`, keeping
  `tests/shared/theme-app-tokens.test.ts` green through the move.
- Verify the custom-property declaration-site trap: no `--glass-focus-*-h`
  style token whose `:root` declaration bakes the accent fallback; consuming
  rules must reference `var(--app-accent-h, 220)` directly. Earnest documents
  this at `themes.css:176-185`.
- Flip `scripts/audit-hairline-surfaces.ts` BASELINE from 26 to **0** and make
  `findApplyGlass` block. The husky pre-commit hook from Phase 1 then prevents
  regressions permanently — which also means a red gate blocks YOUR commits, so
  flip it last.

Two things already known that will save you time:

1. `.glass-refract` and `.ios-card` are already the material on the two newest
   surfaces (the Board Room header and the stacks band), by design — they are
   not sweep targets, they are the reference.
2. `Home/GlanceRail.vue` and `Home/ChartRail.vue` deliberately draw no borders
   at all; their separators are a 1px grid gap. Leave them be.

Quality gate: typecheck 0, vitest green, build green, hairline audit green at
the NEW baseline of 0, and in-browser verification that the swept components
still render correctly in BOTH light and dark — the light-mode alphas are where
this codebase keeps getting caught, most recently in Session 10.

Verify with a REAL session on your own dev server (`/api/demo/login`), and
clean up every row you create afterwards — diff the demo org against
`demo-classic` to prove the blast radius. `demo-classic` is a CONTROL: never
write to it. Note the browser-pane limits Session 10 recorded: the pane is not
composited, it cannot rasterise `filter: blur()`, successive synchronous
`gsap.ticker.tick()` calls advance almost nothing (use `tween.progress(1)`),
and to read what a CSS rule targets you must inject
`transition: none !important` first.

Drive it headlessly — I supervise from an iPad, don't ask me to look at a
screen.

When done: update the Status checklist (shipped, deviations, operator TODOs),
and since this closes the program, give me a short wrap-up of what the eleven
sessions produced and what is still unpushed. Ask before pushing.
```

### Kickoff prompt — Session 10 (Phase 7 polish — rails, ambient, ready to paste)

```
Continue the Earnest Parity Round 2 program.

Work on `main`, in /Users/peterhoffman/Sites/hoaconnect itself — no phase
branch, no worktree. Start with `git pull --ff-only`. Tool shells have no
node/pnpm on PATH: run `eval "$(/usr/local/bin/fnm env)"` first. Commits land
straight on main, so run the quality gate before each commit — never leave
main red. Check `git status` is clean first and report rather than commit over
anything you find. Note: main is well ahead of origin and deliberately
unpushed — check with `git rev-list --count origin/main..main` and do not push
without asking.

Read docs/plan-earnest-parity-round2.md — it is the source of truth, including
the deviations Sessions 1–9 recorded there. Session 9 shipped the stacks core:
`useStackItems` (with its de-duplication rule and 20 tests), `Home/Stack.vue`,
`StackItemRow.vue`, `StackClearWizard.vue`, and the band component
`Home/Stacks.vue`, which `app/components/pages/DashboardPage.vue` mounts above
the widget grid. Note deviation 1: the dashboard is `DashboardPage.vue`, NOT
`app/pages/[slug]/admin/index.vue` — that file is a redirect shim and must stay
one.

This session = Phase 7 POLISH: `GlanceRail.vue`, `ChartRail.vue`,
`Home/AmbientBackground.vue` + `core/app/composables/useHomeAmbient.ts`, and
mobile/dark tuning of the band Session 9 built. Phase 8's glass sweep and the
gate flip are Session 11 — do NOT start those. Earnest reference repo:
~/Sites/earnest/earnest.

The plan's specifics, which matter more than the file names:

- GlanceRail = numbers without cards. EXTRACT the fetch logic out of the
  existing `Admin/*Glance.vue` bands into shared composables; do not write a
  second set of queries against the same collections. If a query cannot be
  shared cleanly, say so and leave that number out rather than duplicating it.
- ChartRail = five hand-rolled SVG glances. Reuse `App/Chart/*` primitives
  where they fit. Resting opacity 0.45 lifting to full ONLY inside
  `@media (hover:hover)` — a phone has no hover state to leave behind. Each
  glance self-hides when its series is empty, and the rail carries a sticky
  max-height guard.
- AmbientBackground: waves are five bands of WHOLE-NUMBER harmonics summed —
  that is the seamless-loop invariant, and a non-integer harmonic is a visible
  seam. `ease:'none'`, three-stop gradients, viewport overhang so the blur
  falls off outside the frame. Orbs get BAKED gradient softness, never a
  runtime blur. Transform-only, `visibilitychange` pause, static under reduced
  motion, deterministic drift, and a localStorage kill switch.
- Tune the light and dark alphas SEPARATELY against `html.theme-app`. They are
  not one value with an opacity multiplier.

Two things Session 9 measured that will shape how you verify:

1. The headless browser pane is genuinely not composited. Overriding
   `document.visibilityState` fools page JS but NOT `requestAnimationFrame` or
   CSS transitions, which stay frozen mid-flight. To measure motion, drive
   `gsap.ticker.tick()` by hand in a busy-wait loop and read INLINE styles
   (JS writes those, so they are real); to read what a CSS rule targets,
   inject `transition: none !important` first. `$gsap` is reachable at
   `document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$gsap`.
   The ambient's `visibilitychange` pause needs the override to be testable at
   all.
2. Directus IGNORES `date_created` on create (it is a special date-created
   field). Seed a backdated row with a follow-up PATCH, or the row arrives
   stamped now and every generator correctly reports nothing.

Quality gate: typecheck 0, vitest green, build green, org-scope test for every
new endpoint, and in-browser verification: the ambient runs transform-only and
pauses when hidden, reduced motion renders it static, each chart glance
self-hides when empty, the hover lift does not leak onto a touch viewport,
light and dark alphas both read, and — assert this explicitly again — landing
on the dashboard still makes ZERO billable AI calls.

Verify with a REAL session on your own dev server (`/api/demo/login`), and
clean up every row you create afterwards — diff the demo org against
`demo-classic` to prove the blast radius, and filter your deletes the same way
you filtered your creates. `demo-classic` is a CONTROL: never write to it (the
demo login is an admin of BOTH demo orgs, which is how a 403 probe once wrote
two rows into it).

Drive it headlessly — I supervise from an iPad, don't ask me to look at a
screen.

When done: update the Status checklist (shipped, deviations, operator TODOs)
and give me the kickoff prompt for Session 11. Ask before pushing.
```

### Kickoff prompt — Session 9 (Phase 7 core — stacks home, ready to paste)

```
Continue the Earnest Parity Round 2 program.

Work on `main`, in /Users/peterhoffman/Sites/hoaconnect itself — no phase
branch, no worktree. Start with `git pull --ff-only`. Tool shells have no
node/pnpm on PATH: run `eval "$(/usr/local/bin/fnm env)"` first. Commits land
straight on main, so run the quality gate before each commit — never leave
main red. Check `git status` is clean first and report rather than commit over
anything you find. Note: main is well ahead of origin and deliberately
unpushed — check with `git rev-list --count origin/main..main` and do not push
without asking.

Read docs/plan-earnest-parity-round2.md — it is the source of truth, including
the deviations Sessions 1–8 recorded there.

This session = Phase 7 CORE: `useStackItems`, `Home/Stack.vue`,
`StackItemRow.vue`, `StackClearWizard.vue`, and the rework of
app/pages/[slug]/admin/index.vue. Session 10 does the polish — GlanceRail,
ChartRail, AmbientBackground, mobile/dark tuning — so do NOT start those.
Earnest reference repo: ~/Sites/earnest/earnest.

Every source the stacks read already exists and is verified live. Compose
them; do not re-derive them:

- Decide = pending `ai_actions` (via `useAiActions(orgId)` — `pending`,
  `approve`, `reject`, `undo`, `busyId`) plus notices carrying a
  `proposedAction` (via `useAINotices`, whose localStorage dismissal must keep
  working).
- Do = actionable notices + overdue operational items, plus unread channels
  from `/api/hoa/channels/unread` (Phase 3).
- Know = insights + Boardroom briefing headlines. The Board Room's `points`
  ARE the headlines: `POST /api/ai/director/plan` without `refresh` serves the
  saved briefing for six hours and charges nothing, so the home page may read
  one — but it must NEVER draft. A home page that spends credits on mount is
  the one thing this phase can get catastrophically wrong. If you cannot read a
  briefing without risking a draft, show nothing in Know rather than guess.
- A fact appears exactly ONCE across the three piles. That de-duplication is
  the composable's job and deserves its own tests.

Reuse `<AiActionCard>` inside `StackItemRow` for proposals — Session 8 made
the same call for the Board Room's steps, and a third proposal card would be a
third place the outbound warning and the Undo affordance can drift.
`send_email` proposals get an expandable preview: never approve outbound
blind.

Motion policy, from the plan: dynamic GSAP import, reduced-motion guard FIRST,
height tween alongside the row stagger (`expo.out`), `clearProps`, a `closing`
flag that keeps rows mounted through the fold, `defineExpose({collapse})`, and
a win state when a pile is cleared. Transform-only.

Phase 8 names the stacks home as a `.glass-refract` first adopter alongside
the Boardroom header — build it that way now rather than sweeping it later.
`app/components/Boardroom/Header.vue` is the worked example.

Quality gate: typecheck 0, vitest green, build green, org-scope test for every
new endpoint, and in-browser verification: the fan runs transform-only, an
approve-from-stack round-trips, empty piles reach the win state, the existing
`useDashboardWidgets` grid still works below the fold, and — assert this
explicitly — landing on the dashboard makes ZERO billable AI calls.

Verify with a REAL session on your own dev server (`/api/demo/login`), and
clean up every row you create afterwards — diff the demo org against
`demo-classic` to prove the blast radius, and filter your deletes the same way
you filtered your creates. Two warnings from Session 8: `demo-classic` is a
CONTROL, so never write to it (the demo login is an admin of both demo orgs,
which is how a 403 probe accidentally wrote two rows into it); and the headless
browser pane reports every tab as `hidden`, so anything gated on
`document.visibilityState` needs that overridden to be testable.

Drive it headlessly — I supervise from an iPad, don't ask me to look at a
screen.

When done: update the Status checklist (shipped, deviations, operator TODOs)
and give me the kickoff prompt for Session 10. Ask before pushing.
```

### Kickoff prompt — Session 8 (Phase 6 UI, ready to paste)

```
Continue the Earnest Parity Round 2 program.

Work on `main`, in /Users/peterhoffman/Sites/hoaconnect itself — no phase
branch, no worktree. Start with `git pull --ff-only`. Tool shells have no
node/pnpm on PATH: run `eval "$(/usr/local/bin/fnm env)"` first. Commits land
straight on main, so run the quality gate before each commit — never leave
main red. Check `git status` is clean first and report rather than commit over
anything you find.

Read docs/plan-earnest-parity-round2.md — it is the source of truth, including
the deviations Sessions 1-7 recorded there.

This session = Phase 6 UI: the Boardroom page, its components, and the nav
entry. Phase 7's stacks home is Session 9 — do not start it. Earnest reference
repo: ~/Sites/earnest/earnest.

The whole server half exists and is verified live, so build against it rather
than re-deriving it:

- POST /api/ai/director/plan takes { orgId, subject?, entityType?, entityId?,
  topic?, refresh? } and returns { planId, cacheKey, cached, savedAt, intro,
  points, money, agenda, steps, stepCount, skipped, credits, balanceCredits }.
  Without `refresh` it serves the saved briefing for six hours and charges
  nothing, re-reading its steps LIVE — so a reopen is free and still truthful.
  `refresh: true` redraws and bills. A zero balance comes back as a 402 BODY,
  not a throw: { error: "insufficient_credits" }.
- `points` is the TL;DR strip, already split off the prose. `intro` is the
  briefing. `steps` are ai_actions rows with a PARSED preview — render them
  with the existing proposal row components, never a second card.
- useDirectorLayer already calls it: planThis() / planning / plan / planError.
  Reuse that composable rather than fetching from the page.
- The three director-* utils are on the server and tested but have no HTTP
  door yet. Sessions and minutes need routes when you know what the page wants;
  `loadPlanSteps`, `recordActivity`, `saveMinutes`, `listMinutes` and
  `summarizeMinutesSteps` are the functions to build them on.

Three things the plan asks for that need a decision from you:

1. Multiplayer. The Board Room collections are ADMIN-ONLY, so nothing in the
   browser can be pushed a `revision` bump. The plan's verification point is
   "a second admin sees the revision update" — pick polling a session-state
   endpoint, or ask Peter before adding a scoped READ policy on
   hoa_director_sessions and putting it on the WS manager. It is a prod script
   run either way, so ask first. See the operator TODO.
2. Minutes belong on the meetings hub, not only inside the Board Room — that
   is the natural HOA fit and it is why the collection exists.
3. Phase 8 names the Boardroom header as a first adopter of `.glass-refract`.
   Build it that way now rather than sweeping it later.

Quality gate: typecheck 0, vitest green, build green, org-scope test for every
new endpoint, and in-browser verification: a briefing generates, credits
decrement, a step approved from the plan shows in recently-handled, and the
cached reopen makes no model call.

Verify with a REAL session on your own dev server (`/api/demo/login`), and
clean up every row you create afterwards — diff the demo org against
`demo-classic` to prove the blast radius, and filter your deletes the same way
you filtered your creates. Session 7's cleanup script did not, and had to be
corrected.

Drive it headlessly — I supervise from an iPad, don't ask me to look at a
screen.

When done: update the Status checklist (shipped, deviations, operator TODOs)
and give me the kickoff prompt for Session 9. Ask before pushing.
```

### Kickoff prompt — Session 7 (Phase 6 server, ready to paste)

```
Continue the Earnest Parity Round 2 program.

Work on `main`, in /Users/peterhoffman/Sites/hoaconnect itself — no phase
branch, no worktree. Start with `git pull --ff-only`. Tool shells have no
node/pnpm on PATH: run `eval "$(/usr/local/bin/fnm env)"` first. Commits land
straight on main, so run the quality gate before each commit — never leave
main red. Check `git status` is clean first and report rather than commit over
anything you find.

Read docs/plan-earnest-parity-round2.md — it is the source of truth, including
the deviations Sessions 1–6 recorded there.

This session = Phase 6 SERVER ONLY (Boardroom collections, the plan endpoint,
the three director-* utils). The Boardroom PAGE and components are Session 8 —
do not start them. Earnest reference repo: ~/Sites/earnest/earnest.

Build on what Phases 4 and 5 shipped rather than re-deriving it:
`collectDirectorAgenda()` in core/server/utils/ai-notices.ts is the grounding
packet and already buckets into seven subjects; `completeWithTools` lives in
core/server/utils/llm/provider.ts; the wallet metering is the same path chat
uses. Plan steps MUST be created through the existing `proposeAction()` so
`shouldAutoApprove` and the outbound cap apply unchanged — Risk 4 is
specifically that the cap gets reimplemented somewhere it can drift, and
Session 6 has an explicit tier-3 test you should extend rather than replace.
`plan_id = ai_actions.session_id`.

Two things Session 6 left for you, both noted in the plan's operator TODOs:
useDirectorLayer.planThis() currently opens the assistant panel and is the
single handler to point at /api/ai/director/plan; and HOA speaks SINGULAR
entity types everywhere (`request`, not `requests`) — the boundary that exists
here is `violation`/`ticket` → `request`, already handled by `groundedType`.

Quality gate: typecheck 0, vitest green, build green, org-scope test for every
new endpoint, the schema script run against prod plus `generate:types`
committed, cache_key writer/reader identity, TTL expiry, wallet charged per
plan, and an explicit test that an outbound plan step lands pending at
autonomy tier 3.

Drive it headlessly — I supervise from an iPad, don't ask me to look at a
screen.

When done: update the Status checklist (shipped, deviations, operator TODOs)
and give me the kickoff prompt for Session 8. Ask before pushing.
```

### Kickoff prompt — Session 6 (Phase 5, ready to paste)

```
Continue the Earnest Parity Round 2 program.

Work on `main`, in /Users/peterhoffman/Sites/hoaconnect itself — no phase
branch, no worktree. Start with `git pull --ff-only`. Tool shells have no
node/pnpm on PATH: run `eval "$(/usr/local/bin/fnm env)"` first. Commits land
straight on main, so run the quality gate before each commit — never leave
main red. Check `git status` is clean first and report rather than commit over
anything you find.

Read docs/plan-earnest-parity-round2.md — it is the source of truth, including
the deviations Sessions 1–5 recorded there.

This session = Phase 5 (Ambient Director layer + trust surfaces + action
lifecycle) ONLY. Earnest reference repo: ~/Sites/earnest/earnest.

Phase 4 shipped the grounding you build on, so reuse it rather than
re-deriving it: `collectOrgNotices()` / `collectDirectorAgenda()` in
core/server/utils/ai-notices.ts, the curve in core/shared/ai/attention.ts
(every notice already carries a `score` as well as a `priority`), and
`useAINotices()` with its localStorage dismissal. The proposed-action
allow-list lives in `PROACTIVE_ACTIONS` and is guarded against
ACTION_CATALOG's own `outbound` flag — when Phase 5 turns a notice's
`proposedAction` into a real pending `ai_actions` row, route it through the
existing `proposeAction()` and the one `shouldAutoApprove` path. Do not add a
second approval lane; Risk 4 in the plan is specifically that the outbound cap
gets reimplemented somewhere it can drift.

Quality gate: typecheck 0, vitest green, build green, org-scope test for every
new endpoint, plus the phase's browser verification — and an explicit test
that the outbound cap survives bulk/plan paths at autonomy tier 3.

Drive it headlessly — I supervise from an iPad, don't ask me to look at a
screen.

When done: update the Status checklist (shipped, deviations, operator TODOs)
and give me the kickoff prompt for Session 7. Ask before pushing.
```

**Session 11 — Phase 8** (2026-08-25) — 5 commits straight onto `main`
(`654c961`, `87013b0`, `7ca56d2`, `143d556`, `82d8beb`), not pushed.
**This closes the program.**

Shipped:

- `core/app/assets/css/glass.css` folded into `earnest-ui.css` as a final
  "LANDING GLASS SYSTEM" block; `main.css` import removed; the two stale
  pointers at it (`LandingWidgetShell.vue`, `docs/prompts/landing-theme-nav.md`)
  updated.
- The declaration-site trap fixed, with `tests/shared/glass-accent-tokens.test.ts`
  as its tripwire (4 tests, both halves negative-tested).
- The named sweep: `ai/{ActionCard,AskTheHoa,AiAssistantPanel,EntityCard}`,
  `channels/{ChannelEditor,ChannelThread,ChannelLinkPreview}`,
  `dashboard/WidgetCard`.
- The census sweep: 12 surfaces to `ios-card`, 3 status banners onto semantic
  tokens, 5 `allow-hairline-surface` tags, 15 workspace inputs onto
  `.glass-field`.
- `scripts/audit-hairline-surfaces.ts` BASELINE **26 → 0**, `FLOATING` taught
  this app's shadow spelling, `.husky/pre-commit` comment rewritten.

Deviations from the plan, all deliberate:

1. **The census and the named list were two different lists, and the session
   needed both.** The plan says "sweep the named components" and "flip BASELINE
   to 0" as if they were the same job. They are not. A fresh census found 26
   findings, and `ai/ActionCard`, `ai/AskTheHoa`, `ChannelThread` and
   `WidgetCard` were in NONE of them — while `DocumentsPage`, `profile`,
   `approvals`, `UnitRecordList` and five marketing mocks, which the plan never
   names, were most of the 26. The named list is a glass-material list; the
   census is a `border t-border` list; getting to 0 required the census, and
   honouring the phase required the named list. Both were done.
2. **`.dash-widget → .ios-card` was already done, elsewhere.** `WidgetCard` does
   not draw a surface at all — it is a layout wrapper whose only paint is the
   edit-mode drag outline, and every widget slot inside it already renders
   `ios-card`, directly or through `AppChartCard` from the content-first round.
   What was actually left in that file was its edit-mode chrome, so that is what
   moved: three pills onto `glass-btn-soft`, and a hardcoded
   `hsl(0 80% 55% / 0.12)` / `hsl(0 70% 45%)` remove button — a fixed red at
   roughly 3:1 on the dark pill — onto `--destructive`.
3. **`.glass-field` does not reach a native `<select>`, and putting it on one is
   worse than leaving it off.** theme.css:983 sweeps every native select into the
   app's underline control language with a bare `select { … }` rule, and that
   rule is UNLAYERED, so it beats `.glass-field` in `@layer components` on layer
   order regardless of specificity. The select keeps `border-radius: 0`, its
   bottom hairline and `box-shadow: none`, and all `.glass-field` achieves is an
   opaque fill behind the underline. Measured on a `<select>`, an `<input>`, a
   `<textarea>` and a `<div>` side by side in the running app; the select was the
   only one that did not take the rim. 11 selects were swept and then reverted.
   Their old `border t-border rounded-lg bg-white` was already inert for exactly
   the same reason — dead classes nobody knew were dead — so those are gone and
   the selects keep the language they were always rendering with. Documented at
   `.glass-field`'s definition site.
4. **A focused control was squaring itself off, and had been for a while.**
   `.ui-kit *:focus-visible { border-radius: inherit }` was overwriting the
   ELEMENT'S radius with its parent's — unlayered, beating every `rounded-*`
   utility — so any rounded control inside `.ui-kit` went square the moment you
   clicked into it and rounded again on blur. Found because six identical
   `rounded-lg` inputs in the meetings form reported `border-radius: 11.25px`
   and the focused one reported `0px`. An `outline` already follows
   `border-radius` on its own; the declaration never did the job it was written
   for. Pre-existing, not introduced here, but the field sweep is what made it
   visible and it is one line.
5. **The status banners nearly shipped under AA — the light-mode alpha trap
   again.** Recolouring `border t-border bg-amber-500/10` to
   `border-warning/30 bg-warning/10 text-warning` is the obvious move and it is
   wrong: the status ink on its own 10% tint measures **4.04:1** for warning and
   **4.48:1** for destructive over the page, both under AA. The colour belongs to
   the RIM and the ICON; the body text stays `t-text`. After: 15.05 / 14.62 in
   light, 13.94 / 14.69 in dark, with the icons keeping the cue at 4.04–9.67
   (a graphical element needs 3:1). One of the three was
   `bg-amber-50 text-amber-800`, a fixed pair that rendered a near-white callout
   in dark mode.
6. **Six of the 26 were never findings; the fix was the script, not the
   markup.** `FLOATING` had been ported knowing Earnest's shadow spelling and
   not this app's — the same porting bug `FULL_BORDER` already had with
   `border` / `t-border` in Session 1. `t-shadow-*` is theme.css's own shadow
   family and it is unlayered, so ANY weight of it beats `@layer components`
   outright and is a hard disqualifier; five marketing app-window mocks sat in
   the census because of it. And a stacked layer that is `relative z-50` rather
   than `absolute` is still floating — `DialogScrollContent` is the case.
7. **The trap fix is a selector LIST that includes `:root`, not a replacement
   for it.** A surface left off the list degrades to today's behaviour — the
   root accent — rather than to no shadow at all, which a bare
   `var(--glass-edge-shadow)` with nothing to resolve would have produced. The
   test is what stops the list going stale.
8. **Three image wells tagged rather than converted.** A 64px photo well is not
   a card: the hairline is what shows it is empty, its dashed twin sits beside
   it in the same markup, and the refracted rim would draw an inner highlight
   across the top of the uploaded photo that reads as glare.
9. **`ChannelThread`'s dividers were left alone.** The plan names the file; the
   sweep's own rule is that `border-b t-border` under a header is a rule, not a
   box. Its header and composer keep their dividers; what changed is the one
   actual surface in the file, the in-channel search panel.

Quality gate: typecheck **0 errors** · vitest **1471/1471 in 85 files** ·
`pnpm build` green · hairline audit green **at the new baseline of 0**. No new
endpoints, so no new org-scope test.

Browser-verified headlessly on the demo org through a real session on this
session's own dev server, in **both light and dark**, with the
`prefers-reduced-transparency` fallback forced back off — this machine has
macOS "Reduce transparency" ON, so without that the translucent path most users
get would never have been measured at all:

- **The trap, before and after.** Before: inside `.accent-violet`,
  `--app-accent-h` read 262 while `--glass-shade` still read
  `195 18% 42% / 0.12`. After: an `.ios-card` in the same container paints its
  rim shade `rgba(102, 88, 126, 0.12)` against a plain card's
  `rgba(88, 117, 126, 0.12)`, and the plain card is byte-identical to before.
- **The rim is visible on a near-white light surface.** The painted ring reads
  `rgb(235, 239, 238)` on white at **1.154:1**, against **1.218:1** for the flat
  `t-border` hairline it replaced — softer, present, and the same rim `.ios-card`
  has worn since the UX refresh.
- **The dark tier thumb is not the regression it looks like.**
  `.glass-active-thumb` separates from its track at **1.359:1** — exactly what
  the `bg-white/10` it replaced gave — and adds a top highlight at **2.352:1**
  that the old flat fill had no equivalent for. Active label 13.56:1 vs
  inactive 7.60:1.
- **Fields, both modes.** Inputs and textareas: rim present, `border-width: 0`,
  radius held on focus, text 17.83:1 light / 15.74:1 dark, surface separating
  from its container at 1.035 / 1.048. The AI composer, the meetings form, the
  rules search and the channels composer all measured.
- **`:focus-within` really drives the channels composer.** Its root is now a
  `div.glass-field` around a ProseMirror contenteditable; focusing the
  contenteditable matches `:focus-within` on the host and adds the accent halo,
  which is what retired the JS `editor.isFocused` class swap.
- **`glass-refract` renders on AskTheHoa.** `::before` resolves with content
  `""`, inset 0, 1px padding and `mask-composite: exclude`, and the card's
  `overflow-hidden` does not clip it.
- **The consolidation's one order-sensitive overlap is inert.** A `.glass-widget`
  under `theme-modern-light` still measures `border-radius: 16px` and
  `blur(16px) saturate(1.5)` from landing.css's override, not the base rule's
  `12.75px` / `blur(14px)` — specificity still beating the new source order.
- **Both halves of the gate block, tested live.** A hand-rolled card surface
  dropped into `UnitRecordList` fails with the file and line; a
  `@apply rounded-xl\n glass-edge;` split across a newline is caught at the
  right line. `findApplyGlass` needed no change — it has had no baseline since
  Phase 1.

Blast radius: **no rows were created deliberately** — this phase writes nothing.
Browsing itself wrote 22 `hoa_activity` page-view rows into `demo` (the
first-party activity tracker), every one identifiable by `ip = ::1` plus the
Electron user agent plus a timestamp inside the session window; all 22 deleted,
and `demo` is back to its pre-session 449. Session 10's 19 rows from the same
localhost client, earlier the same day, were deliberately left alone.
`demo-classic` **was never written to**: 13 `hoa_activity` rows at every census,
before, during and after, and no other collection moved in either org.

Browser-pane limits worth carrying forward, on top of Session 10's:

- The pane can start at a **0×0 viewport**, which silently degrades layout and
  makes every `getBoundingClientRect()` zero. `resize_window` with an explicit
  width and height fixes it; the `desktop` preset did not.
- **Toggling the `.dark` class does not re-resolve `light-dark()`.** Half the
  page flips and half stays, so a class toggle cannot be used to compare modes.
  Set `localStorage.appearance` and reload.
- `getComputedStyle` returns **`oklab()` / `oklch()` unresolved** for Tailwind's
  colour utilities, so alpha compositing has to be done on a canvas —
  `ctx.fillStyle = ground; ctx.fillStyle = tint;` then read the pixel — which is
  the browser doing the same blend it does on screen.

---

## Programme retrospective — what eleven sessions produced

**Shipped, all on `main`:** release tooling and a "What's new" surface;
one shared WebSocket behind every realtime feature; a unified notification
model with the bell cut over to it; channels round two; a notices engine with
attention scoring; the director layer, trust surfaces and the action lifecycle;
the Board Room, server and UI; the stacks home with its glance rail, chart rail
and ambient backdrop; and the glass sweep with a gate that keeps it swept.

**The recurring lesson, stated once:** almost every deviation in this log is the
same shape — *the code says one thing and the running app does another, and only
the running app is evidence*. Earnest's regexes measured nothing here until they
were re-censused against this app's spelling. `permissions` on create is ignored
by this Directus. A `text` column holding JSON is a string. `preview` rendered
character-by-character. Light-mode alphas needed raising, not halving. The glass
accent was baked at `<html>`. `.glass-field` cannot reach a `<select>`. Every one
of those was found by measuring in the browser or against the live API, and none
of them by reading the source.

**Still open, for whoever picks this up:**

- **40 commits ahead of `origin/main`, deliberately unpushed** — 29 carried in
  from Sessions 2–10, 6 from Session 11, and 5 from the follow-up round below.
  Nothing is blocked on them; they are waiting on Peter's call.

### Follow-up round (2026-08-25, after the programme closed)

Peter asked for the carried-forward list to be cleaned up before deploying. Two
of the five items are RELEASE-GATED by Risk 2 — the WS adapters and the
`BELL_V2` flag exist to give one release of coexistence, and none of these
commits has ever been deployed, so "one release" has not elapsed at all.
Deleting them before the first prod exposure would remove the fallback exactly
when it is most likely to be wanted. Asked; Peter chose to hold both until the
deploy is green. So:

- **Done:** `useMarkItemRead` mounted · channels mute toggle · the
  `preview → json` script written and guarded (unrun, see its entry above).
- ~~**Held until the deploy is green**~~ — **ALL THREE DONE 2026-08-25**, in the
  post-deploy cleanup session, after Peter confirmed the bell and realtime had
  behaved in front of real members. See "Post-deploy cleanup — DONE" below.
- Also fixed in this round, both found by measuring rather than reading: a
  native `<select>` was the one control still on pre-glass styling (`.glass-field`
  cannot reach it — theme.css's unlayered `select` rule wins on layer order), and
  35 unreferenced CSS classes plus 3 orphaned tokens were deleted.

⚠️ One vitest run during this round reported 2 failures while the dev server was
under load; the failing tests were not captured, and four subsequent runs — three
with nothing else competing — were 1471/1471. Recorded as contention flakiness
rather than proved as such.
- ~~The three legacy realtime composables are still adapters over the WS
  manager.~~ **Resolved 2026-08-25**: two of the three are deleted, and
  `useRealtimeSubscription` — the one with real callers — stays, talking to the
  manager directly.
- Operator TODOs recorded by earlier sessions still stand — see each session's
  entry.

### Droplet reality — RESOLVED 2026-08-25

> **Outcome:** Peter chose GitHub Actions for all four scheduled jobs. The
> runbooks below are kept as the diagnosis; the machine they describe was never
> going to be built, and it turned out not to be the whole problem anyway —
> the export worker could not have started on a perfect droplet either. See
> go-live §3b for the full account. What follows is what was found on the day.

#### The original finding

Checked 2026-08-25 against `~/Sites/605/admin/var/www/admin/docker-compose.yml`.
The droplet runs **three containers and nothing else**: `database` (postgis),
`cache` (redis), `directus` (container name `admin`). There is **no node service
and no hoaconnect checkout**. The `directus/directus` image carries Directus's
own runtime, not this repo.

So the digest and export workers have **never had anywhere to run** — `crontab
-l` on the droplet returns "no crontab for root". This is not the stale
`/apps/app` path `notification-digest-cron.md` describes; it was never set up at
all, which matches the `hoa_data_exports` row that has sat `queued` since
2026-08-20.

`notification-digest-cron.md`, `data-export-cron.md` and go-live §3/§3b all
assume a host checkout with pnpm and need rewriting once a direction is chosen:
(a) host checkout + host cron, (b) a worker service added to that compose stack
— node version pinned to the image, survives `down/up`, disk via a volume for
`EXPORT_WORK_DIR` — or (c) move the digest off the droplet entirely and leave
only the export worker there.

⚠️ The two AI crons (`notices/check`, `actions/expire-stale`) need NONE of this.
They are `curl` at the deployed Vercel app — no checkout, no node, no container.
Both were dry-run green on prod 2026-08-25. A GitHub Actions `schedule:` is
probably a better home for them than the droplet.

⚠️ That compose file is stale as a source of truth: the live Directus sends from
a `huestudios.company` address while the file says `contact@hoaconnect.info`.

### Kickoff prompt — post-deploy cleanup (ready to paste)

The programme is complete and DEPLOYED (2026-08-25, `7a2dd4b`). This is the
follow-up session for the three items that were held behind a green deploy.

```
The Earnest Parity Round 2 programme is finished and deployed — read
docs/plan-earnest-parity-round2.md first, especially "Operator TODOs" and the
"Follow-up round" note in the retrospective. That file is the source of truth,
not chat.

Work on `main` in /Users/peterhoffman/Sites/hoaconnect — no branch, no worktree.
`git pull --ff-only` first. Tool shells have no node/pnpm: run
`eval "$(/usr/local/bin/fnm env)"` in every one. main is now level with origin
and Vercel AUTO-DEPLOYS on push, so a push IS a production deploy — never push
without asking, and never run `vercel --prod` (it just makes a redundant second
deployment of the same commit).

Three items were deliberately held until the deploy went green. It has. In
order of value:

1. Delete `useLegacyAggregator` — the 1061-line body of the 1181-line
   `core/app/composables/useNotifications.ts` — together with the `BELL_V2`
   flag and its `NUXT_PUBLIC_BELL_V2` plumbing.
2. Delete `core/app/composables/useDirectusWebSocket.ts` and
   `useDirectusRealtime.ts`. ⚠️ **Corrected 2026-08-25 — this said FOUR
   importers and there is ONE.** Re-measured:
   `useDirectusWebSocket` has **zero** real callers (only its own file and a
   doc comment in `useWebSocketManager.ts`) — a straight delete.
   `useDirectusRealtime` has exactly **one**: `useDirectusSubscription.ts:29`,
   whose sole caller in turn is `useOrgItems.ts:193`. The other three
   "importers" were two doc comments and `app/lib/directus.ts:49`, which
   *defines its own* `useDirectusRealtime()` of a different shape that nothing
   imports at all. Retire or re-point `useDirectusSubscription` first, but the
   job is far smaller than this prompt used to claim.
3. Run `pnpm convert:preview-json` (ai_actions.preview text → json), then
   `pnpm generate:types` and commit the regenerated `core/types/directus.ts`.
   The script refuses to run unless every row survives the cast; dry run on
   2026-08-25 was 7 rows / 5 valid / 2 NULL / 0 failures.

⚠️ Items 1 and 2 are Risk 2 FALLBACKS, not dead code. They buy one release of
coexistence for the WS manager and the bell cutover, both of which reached
production for the first time on 2026-08-25. Before deleting either, confirm
with Peter that the new bell and realtime have behaved in front of real members
for long enough. If he wants more time, do item 3 and stop.

Quality gate, per commit: typecheck 0, vitest green, build green, hairline audit
green at BASELINE 0 (`pnpm audit:hairline-surfaces` — it BLOCKS commits now via
the husky pre-commit hook). Verify in the browser in BOTH light and dark, on
your own dev server with a real session (`/api/demo/login`), and delete every
row you create. Merely BROWSING demo writes `hoa_activity` page-view rows —
identify them by `ip = ::1` plus the Electron user agent plus a timestamp inside
your session window, and clean them up. `demo-classic` is a CONTROL: never write
to it, and diff both orgs before and after to prove it.

⚠️ Do not run `pnpm build` and `pnpm typecheck` at the same time — they both
write `.nuxt` and corrupt each other's cache. Run them serially.

When done: update this plan's Operator TODOs, and ask before pushing.
```

### Kickoff prompt — template for Sessions 3+

```
Continue the Earnest Parity Round 2 program. Read
docs/plan-earnest-parity-round2.md (plan + Status checklist) first —
it is the source of truth, including any deviations recorded by
earlier sessions.

Work on `main`, in ~/Sites/hoaconnect — no phase branch, no worktree.
Start with `git pull --ff-only`. Since commits land straight on main,
run the quality gate before each commit, not just at session end.

This session = Phase <N> (<name>) ONLY. Earnest reference repo:
~/Sites/earnest/earnest. Port patterns per the plan; reuse the existing
HOA functions the plan names instead of duplicating them.

Quality gate: typecheck 0, vitest green, build green, org-scope tests
for every new endpoint, plus the phase's browser verification. Drive
the browser verification headlessly — do not ask me to look at a
screen, I supervise from a different device. When done: update the
Status checklist (shipped items, deviations, operator TODOs), and give
me the kickoff prompt for the next session. Ask before pushing.
```

---

## Post-deploy cleanup — DONE 2026-08-25

All three held items shipped in one session, on `main`, each gated at
typecheck 0 · vitest 1473 · build green · hairline audit 0.

- **`useLegacyAggregator` deleted**, with the `bellV2` flag, its
  `NUXT_PUBLIC_BELL_V2` runtime-config entry and the dispatcher.
  `useNotifications.ts` goes 1181 → 297 lines and the adapter over
  `directus_notifications` IS `useNotifications` now. The three surfaces
  (`Bell`, `Sheet`, `Toast`) are untouched — the point of having built the v2
  side as an adapter rather than a rewrite.
- **`useDirectusWebSocket.ts` and `useDirectusRealtime.ts` deleted.** The
  corrected count held: zero real callers and one, respectively.
  `useDirectusSubscription` now calls `useWebSocketManager()` directly.
- **`pnpm convert:preview-json` run on production** — 7 rows, 5 valid, 2 NULL,
  0 failures, exactly matching the dry run. Verified after: `preview` comes back
  as a real object, the two NULLs intact. `core/types/directus.ts` regenerated
  (`preview?: string | null` → `Record<string, any> | null`).

### ⚠️ The landmine this session stepped on: `$fetch` route typing

Deleting the aggregator — 884 lines out of one composable — was enough to tip
`TS2321: Excessive stack depth` on a repo that had been sitting at TypeScript's
instantiation-depth limit for a while. There was already a comment inside the
aggregator about keeping a helper inline "to avoid tipping the `$fetch`
route-union type recursion", so this was known and unrecorded.

**The failure mode is what makes it expensive.** Nitro types `$fetch` by
resolving the request literal against a union of ~229 generated API routes,
scoring each candidate with per-segment template-literal recursion. When that
tips, the error lands on whichever of the app's ~233 `$fetch` calls the checker
reaches FIRST — and rewriting that call site just moves the error to the next
one. Confirmed three times (`useHomeGlances.ts:249` → `useDirectusItems.ts:68`
→ `useDirectusNotifications.ts:83`) before giving up on local fixes. **The file
the error names is never the cause.** Reducing nesting at the site doesn't help
either; only removing the route comparison entirely does.

Fixed globally, with Peter's agreement, by patching nitropack —
`patches/nitropack@2.13.1.patch`, wired through `pnpm.patchedDependencies`.
`MatchedRoutes` becomes an exact-match lookup, so static routes keep their
handler's response type and routes carrying `:params` or `**` fall back to the
default and want an annotation. Nothing relied on that inference (typecheck 0).
Types only — no runtime change; build and all 1473 tests unaffected.

Two rejected alternatives, measured rather than guessed: dropping the
`InternalApi` augmentation from the app program costs 26 explicit annotations
across 8 files AND needs a fragile `prepare:types` hook; rewriting the ~233 call
sites is a 102-file diff. **Re-check the patch on every nitropack upgrade** —
pnpm refuses to apply a patch whose version moved, so it cannot rot silently.

### Verified in the browser

Real session via `/api/demo/login` on a local dev server, light and dark. The
bell opens from the v2 store, badges `1 unread`, and both tabs work — Unread
shows the live row, Earlier pages the archived one, which is the v2-only path
and could not have come from the aggregator. `demo` activity 449 → 457 → 449
(all 8 page-view rows deleted), `demo-classic` 13 → 13, untouched throughout.

⚠️ **`useDirectusSubscription` has no live call sites.** Its only consumer is
`useOrgItems.useSubscription`, which nothing in the app calls. Its re-point to
the manager is covered by typecheck and build, NOT by a runtime exercise — say
so rather than implying it was clicked through.

---

## Next round — per-org email branding

Queued 2026-08-25. The cleanup half of this round is done (above); what remains
is the new ask from Peter after the droplet round closed.

### Where the email templates actually live

Answering the question directly, because the system is larger than it looks and
splits in two:

**Transactional / notification email — built in code.**
`core/server/utils/email-templates-mjml.ts` (~47 KB, 1,200 lines) is the single
renderer. `buildEmailHtml()` / `buildEmailText()` produce every system email;
`buildWebViewHtml()` produces the "view in browser" page. Six variants exist as
an `EmailType` union — `basic · alert · newsletter · announcement · reminder ·
notice`. `core/server/utils/transactional-email.ts` wraps it as
`sendBrandedTransactionalEmail()`, and `core/server/utils/email-branding.ts`
resolves which branding applies, with precedence **per-send override → per-org
default (`block_settings`) → fallback**.

**Campaign email — user-edited in the app.** The `hoa_email_templates` /
`hoa_template_blocks` collections behind `app/components/EmailBuilder/*` and
`app/pages/[slug]/admin/communications/templates/`. Already per-org and already
editable. **This is not the gap.**

### What is already white-labeled, and what is not

Per-org today: the **sending domain / from address**, the **logo**
(`block_settings.logo`, rendered at 200px), a **custom header line**
(`header_text`, with `{name}` / `{legal_name}` tokens), a **footer building
photo** (`footer_image`), and the **homepage link**. Per-send overrides exist
for the header line and footer photo.

Not per-org: **every colour, every icon, and the typography.**
`emailTypeStyles` at `core/server/utils/email-templates-mjml.ts:46` is a
module-level constant mapping each `EmailType` to a fixed `headerBg`,
`accentColor` and emoji `icon`. Six palettes, hardcoded, identical for every
community on the platform. `defaultSalutations` just below it is the same shape.
So an org's alert email is `#7f1d1d` dark red and a 🚨 whatever its brand is.

**The org's brand palette already exists and is already live** —
`block_settings.colors` is `Array<{ primary, secondary, accent }>`, set through
`app/components/Settings/BrandingSettingsForm.vue`, and read today by
`useOrgBranding.ts:69` and `manifest.webmanifest.get.ts:76`. There are also
`heading_font` / `body_font` (`serif` | `sans-serif`) and a `theme`
(`classic` | `modern`) on the same settings bag. **The email renderer ignores
all of it.** That is the whole gap: not new plumbing, one existing field the
renderer never reads.

### The shape of the work

- Make `emailTypeStyles` a **function of the org**, not a constant — derive
  `headerBg` / `accentColor` from `settings.colors[0]`, keeping the current six
  palettes as the fallback when an org has set no colours. Every existing send
  must look identical for an org with no palette, or this is a regression
  dressed as a feature.
- Decide what a *semantic* type means once colour is org-driven. An alert must
  still read as urgent when the brand palette is soft; the emoji icon may be
  carrying more of that weight than the colour is. Worth settling deliberately
  rather than falling out of the implementation.
- Consider `heading_font` / `body_font` in the MJML, which is a genuinely
  separate (and fiddlier) job — email typography is not web typography.
- Extend `BrandingSettingsForm.vue` with an email preview so an admin can see
  the result. `buildWebViewHtml()` already renders standalone, so the preview
  has a renderer.
- Tests: `resolveEmailBranding` has a precedence chain that is easy to break.
  Cover org-with-palette, org-without, and per-send override.

⚠️ Do not send test mail to real members. Note also that a
`directus_notifications` write **emails the recipient from inside Directus** —
one row is one mail, and no flag suppresses it.

### Kickoff prompt — next session (ready to paste)

```
Continue HOA Connect. Read docs/plan-earnest-parity-round2.md first — the
"Post-deploy cleanup — DONE 2026-08-25" section and then "Next round — per-org
email branding". That file is the source of truth, not chat.

Work on `main` in /Users/peterhoffman/Sites/hoaconnect/hoaconnect — note the
repo root is the NESTED directory; the parent is a workspace folder, and any
`cd` elsewhere resets your shell there. No branch, no worktree.
`git pull --ff-only` first. Tool shells have no node/pnpm: run
`eval "$(/usr/local/bin/fnm env)"` in every one. Vercel AUTO-DEPLOYS on push,
so a push IS a production deploy — ask before pushing, never run `vercel --prod`.

The post-deploy cleanup round is DONE — do not redo it. Both Risk 2 fallbacks
are deleted, `ai_actions.preview` is a json column, and a nitropack patch fixed
the `$fetch` route-typing landmine. If typecheck ever reports TS2321 "Excessive
stack depth", read that section before touching the file it names: the file it
names is never the cause, and rewriting that call site just moves the error.

This session = PER-ORG EMAIL BRANDING. The investigation is already written up
under "Where the email templates actually live" and "The shape of the work" —
start from it rather than re-deriving. Two systems exist and only one is the
gap: campaign email (`hoa_email_templates`) is already per-org and editable,
and is NOT the job.

The gap is the transactional renderer. `emailTypeStyles` at
`core/server/utils/email-templates-mjml.ts:46` is a module-level constant
mapping each of six `EmailType`s to a fixed `headerBg`, `accentColor` and emoji
`icon` — identical for every community on the platform. Meanwhile
`block_settings.colors` already holds each org's `{ primary, secondary, accent }`
palette, is already set through `app/components/Settings/BrandingSettingsForm.vue`,
and is already read by `useOrgBranding.ts:69`. The renderer ignores it.

In order:

1. Make `emailTypeStyles` a function of the org rather than a constant, deriving
   `headerBg` / `accentColor` from `settings.colors[0]`. ⚠️ An org that has set
   no palette must render BYTE-IDENTICALLY to today — keep the current six
   palettes as the fallback, or this is a regression dressed as a feature.
2. Settle what a *semantic* type means once colour is org-driven. An alert has
   to still read as urgent when the brand palette is soft; the emoji icon may be
   carrying more of that weight than the colour is. Decide it deliberately.
3. `heading_font` / `body_font` in the MJML — genuinely separate and fiddlier,
   because email typography is not web typography. Fine to defer, but say so.
4. Extend `BrandingSettingsForm.vue` with an email preview. `buildWebViewHtml()`
   already renders standalone, so the preview has a renderer.
5. Tests: `resolveEmailBranding` in `core/server/utils/email-branding.ts` has a
   precedence chain (per-send override → per-org default → fallback) that is
   easy to break. Cover org-with-palette, org-without, and per-send override.

Quality gate per commit: typecheck 0, vitest green (1473 baseline), build green,
hairline audit green at BASELINE 0 (it BLOCKS commits via husky). Do NOT run
`pnpm build` and `pnpm typecheck` concurrently — they corrupt each other's
`.nuxt` cache. When capturing an exit code, capture the COMMAND's, not a
pipeline's.

⚠️ Nuxt auto-imports do not exist under vitest. A new auto-imported util used in
server code needs `vi.stubGlobal` in the affected tests — and if it is an auth
helper, stub the REAL implementation, not a stand-in, or the test asserts
nothing.

⚠️ DO NOT SEND TEST MAIL TO REAL MEMBERS. A write to `directus_notifications`
EMAILS the recipient from inside Directus — one row is one mail, a bulk write is
a bulk mailing, and no script flag suppresses it. Render to HTML and read it;
don't send.

Verify in the browser in both light and dark on your own dev server with a real
session (/api/demo/login), and delete every row you create. Note API calls do
NOT write hoa_activity rows — only browsing does. demo-classic is a CONTROL:
never write to it, and diff both orgs before and after to prove it.

When done: update the plan's Operator TODOs and ask before pushing.
```

## Per-org email branding — DONE 2026-08-25

Shipped in one session on `main`, gated at typecheck 0 · vitest 1488 (baseline
1473 + 15 new) · build green · hairline audit 0. Byte-identity for orgs without
a palette was proven, not assumed: 72 sha256 hashes (4 org variants × 6 types ×
html/text/webview) captured before the change and diffed clean after it.

**The renderer.** `emailTypeStyles` stays as the platform-default table;
`resolveEmailTypeStyle(emailType, settings)` sits on top of it and is what
`buildEmailHtml` now calls. When `block_settings.colors[0]` holds valid hex
colours, the org's **primary** paints the header and bottom bands and its
**accent** paints the type badge. The semantic decision, settled deliberately:
**brand paints the chrome; the badge's icon + label carry the type; alert keeps
its red pill whatever the palette**, so urgency survives a soft brand.
Two guards that matter:

- Only literal hex (`#rgb`/`#rrggbb`) is accepted — palette values land
  unescaped in inline styles, so anything else is ignored, which also makes
  junk data fall back gracefully.
- A YIQ brightness test flips the overlay text dark on light palettes. This is
  real, not theoretical: 605 Lincoln's stored primary is `#8f8f8f` and its
  accent `#00E1FF` — white-on-gray and white-on-cyan would both be unreadable.
  The overlay colours are carried on the resolved style and the fallback path
  uses the exact historical literals, which is how byte-identity holds.

Five settings field lists had omitted `colors` and needed it added:
`sendEmailJob.ts`, `email/preview.post.ts`, `email/send.post.ts`,
`email/test.post.ts`, `email/debug-html.post.ts`. `transactional-email.ts`
already fetched the whole settings object. The invitation emails don't use
`buildEmailHtml`, and the web view never used the type palette — both untouched.

**The settings form.** `BrandingSettingsForm.vue` got its colour pickers back —
they were deliberately removed in `7a785f7` (January) when the theme dropdown
arrived and nothing but the landing consumed colours; email consuming them is
the reason to return. New "Brand Palette" card (primary/secondary/accent, with
per-field hints of what each drives) plus a **live email preview** at the bottom
of the Email Branding card: a type selector and an iframe fed by the new
`POST /api/email/branding-preview`, which renders a sample send with the org's
real defaults and an optional palette override — so unsaved colour edits
preview instantly. Render-only endpoint; nothing sent, nothing written.

**A latent form bug fixed while there:** the form had always written the
default palette (`#2563eb/#64748b/#f59e0b`) into `colors` on ANY save when the
org had none — harmless while nothing read colours, consequential now. `colors`
is only written when the org already had a palette or the user touched a
picker; a "Reset to defaults" button writes `null` explicitly.

**Verified live** (dev server against prod Directus, real session via POST
`/api/demo/login`): palette edits re-render the preview with the new colours
and the Reset button appears; the alert type keeps `#ef4444` under a brand
palette; the light-gray/cyan palette flips overlay text dark; the endpoint
401s without a session. Light and dark UI both checked. `demo` activity
449 → 455 → 449 (all six page-view rows deleted), `demo-classic` 13 → 13 and
`colors` still `null` on both — nothing persisted anywhere.

**Deferred, explicitly: `heading_font` / `body_font` in the MJML.** Email
typography is its own project — web font stacks don't survive email clients,
Outlook needs conditional fallbacks, and the current Avenir/system stack is
fine for every org today. The fields stay on settings, untouched; take it up
as its own session if an org actually asks for serif email.

### 1033 Lenox given a real palette — DONE 2026-08-25

The org's stored palette WAS the old form-default blue (`#2563eb`), written by
the latent bug above and never chosen by anyone. Peter's call was to make the
org work with the system rather than opt out of it, so it now carries its
actual brand:

```
primary   #454545   ink      → email header + bottom bands, meta theme-color
secondary #8b7355   warm brown (their link/accent-tertiary)
accent    #c9a96e   gold     → email type badge
```

**Where those values come from, so nobody re-derives them by eye:** 1033 is on
`landing.palette: "gold"` — the original warm 1033lenox.com ramp, which
`core/app/assets/css/landing.css` (`html.landing-palette-gold`) carries
verbatim from the reference stylesheet. `theme.css`'s cyan/teal is the *shared*
`classic` theme after it was re-tinted cool; it is NOT what 1033 renders. Taking
gold's `--theme-text-primary`, `--theme-link-color` and `--theme-accent-primary`
is a faithful three-slot translation of the site.

The ink band rather than a gold one is deliberate: the site is cream paper with
ink text and gold *accents*, so a full gold masthead would be louder than the
brand ever is. Verified by rendering their real email (their logo, their
address) before the write: ink band takes white text via the YIQ flip, the gold
badge takes dark text, and `alert` still shows its red pill. `basic` stays
brand-neutral.

**Blast radius, checked rather than assumed.** `colors[0].primary` has three
consumers: the email chrome (new, waits for deploy), `useOrgBranding.themeColor`
→ `<meta name="theme-color">` on the org's pages, and the per-host PWA manifest.
**The manifest one does not apply to 1033**: it resolves by verified custom
domain, and 1033 has none — `605-lincoln` is the only org that does. So the sole
immediate, deploy-independent effect is the mobile browser chrome tint on their
portal pages, blue → ink. (`1033lenox.com` itself is still the legacy standalone
site on its own Directus, not this tenant — see [[1033-landing-migration]].)

Old value backed up in the session scratchpad; rollback is one PATCH of
`block_settings` row `9b87c106` back to
`[{primary:#2563eb, secondary:#64748b, accent:#f59e0b}]`, or "Reset to
defaults" in the branding form. demo / demo-classic / 605-lincoln were diffed
after the write and are untouched.

### Operator TODOs — per-org email branding

- [x] Nothing operational: no new env vars, no migrations, no crons. The
      feature is data-driven off `block_settings.colors`, which already exists.
- [x] **1033 Lenox's palette set to its real brand 2026-08-25** (above), so no
      org deploys with accidental chrome. demo/demo-classic have no palette and
      render byte-identically to today.
- [ ] Worth knowing, not blocking: `POST /api/email/branding-preview` scopes to
      `requireUserSession` and takes an arbitrary `organizationId`, exactly like
      the existing `email/preview.post.ts` it sits beside. Everything it can
      expose (name, logo, address, palette) is already on the org's public
      landing page, so this is consistent rather than a new hole — but if that
      pair is ever tightened, tighten both together.

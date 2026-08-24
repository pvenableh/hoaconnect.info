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
| 5 | Phase 4 — Notices engine + attention scoring | [ ] | `main` | |
| 6 | Phase 5 — Director layer + trust surfaces + action lifecycle | [ ] | `main` | |
| 7 | Phase 6 server — Boardroom collections, plan endpoint, utils | [ ] | `main` | |
| 8 | Phase 6 UI — Boardroom page + components + nav | [ ] | `main` | |
| 9 | Phase 7 core — stacks home | [ ] | `main` | |
| 10 | Phase 7 polish — rails, ambient, wizard | [ ] | `main` | |
| 11 | Phase 8 — Glass sweep + gate flip to 0 | [ ] | `main` | |

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

### Operator TODOs (carried forward until done)

- [x] ~~Push Session 1~~ — done; `main` carries Phases 0 and 1.
- [ ] **`pnpm install` on every machine/clone** once this lands — the new `prepare`
      script is what installs the husky hooks; without a fresh install the pre-commit
      audit silently does not run.
- [ ] Nothing to run on prod for this phase. No schema changes, no new env vars.
      (`NUXT_PUBLIC_APP_VERSION` exists as an override but should stay unset.)
- [ ] **Phase 2a: nothing to run on prod.** No schema changes, no new env vars —
      `DIRECTUS_WEBSOCKET_URL` was already set and is unchanged.
- [ ] **Delete `useDirectusWebSocket.ts` and `useDirectusRealtime.ts` one release
      after 2a ships** (Risk 2: adapter coexistence). `useDirectusRealtime` still has
      one real importer, `useDirectusSubscription.ts`; retire that first or point it
      at the manager directly.
- [ ] **Run `pnpm backfill:notifications` on prod** once 2b/2c deploys — ideally
      just before, so members' bells have history the moment the new one appears.
      Writes the last 30 days ARCHIVED, is idempotent on
      (recipient, collection, item), and is safe to run again afterwards.
      `--dry-run` first: it planned 18 rows across the 7 orgs from here.
- [ ] **Phase 2b/2c: no schema changes and no new env vars.**
      `NUXT_PUBLIC_BELL_V2` exists but should stay UNSET (defaults on); set it to
      `false` only to fall back to the old aggregator.
- [ ] **Delete `useLegacyAggregator` (the 1061-line body of
      `core/app/composables/useNotifications.ts`) and the `bellV2` flag one
      release after 2c ships**, together with the 2a adapter deletions above.
- [ ] **Mount `useMarkItemRead()` on the request / document / meeting detail
      pages** when Phases 4–7 next touch them (deviation 5 above).
- [x] ~~`useDirectusSubscription.handleEvent`'s `delete` branch key-vs-object bug~~
      — fixed in Session 4.
- [x] **Phase 3 schema: `pnpm add:channel-category` — already run against prod**
      (idempotent, re-run is a no-op) and `pnpm generate:types` committed. No new
      env vars. The roster renders ungrouped if it is ever run against a fresh
      Directus without it.
- [ ] **Fix `hoa_channel_messages.create` — channels are write-broken on prod.**
      The create *validation* traverses `channel.organization`, which Directus
      cannot resolve from a create payload, so every send fails for every role.
      Move the org check to `permissions` (or drop the create validation and gate
      server-side). Reproduced live in Session 4; see that entry for the full
      diagnosis. **This is the highest-priority item in this file.**
- [ ] **Widen `directus_users` read to people who share an organisation**
      (id / first_name / last_name / avatar only). Today it is
      `{id: {_eq: "$CURRENT_USER.id"}}` on every policy, which makes the
      @-mention picker permanently empty and renders every other person's
      messages as "Unknown User". Needs Peter's call because it is a
      platform-wide access change, not a channels one.
- [ ] **Mute UI for channels.** `notifications_enabled` is honoured by
      `/api/hoa/channels/unread` (count reported, excluded from the total) but
      has no toggle; the members panel is its natural home.

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

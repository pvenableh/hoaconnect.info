# Prompt — Phase 8: Channels as an internal admin/board comms system (integrate what exists, rework access, link to tickets, add search)

> Hand this to a fresh Claude Code session in the `hoaconnect` repo. Self-contained.
> Strategic context: `docs/ROADMAP.md`; conventions mirror the Phase 6/7 prompts
> (idempotent `scripts/` migrations, **confirm before running**, then
> `pnpm generate:types`, then permissions in the same script). Product is a
> multi-tenant HOA SaaS (Nuxt 4 + Directus, code name **Property Flow**).
> `types/directus.ts` is the schema source of truth.

## TL;DR — this is mostly an INTEGRATION job, not a build-from-scratch

A Slack-like channel system is **already ~85% built but orphaned**: the pages live
at a **main-domain path** (`app/pages/admin/channels/`), never reachable inside the
org-slug app, and there is **no dock entry**. Mentions, the TipTap editor, file
attachments, threading, realtime, and mention-notifications **already work** — do
NOT rebuild them. The real work is: (1) move it into the `[slug]` org context, (2)
rework access so it's an **internal admin/board tool** (not member-facing), with
**per-channel member invites**, (3) **link it to the requests/tickets system** so a
ticket can spawn a task and a channel, and (4) add **search** (within + across
channels).

---

## What ALREADY EXISTS — verified, do NOT rebuild

### Collections (live in Directus; in `types/directus.ts`)
- **`hoa_channels`** — { status(published|draft|archived), name*, slug*, description,
  is_private (default false), is_default (default false), organization* (M2O), system }.
- **`hoa_channel_messages`** — { status(published|draft|deleted), content* (HTML w/
  @mentions), channel* (M2O), parent_message (self M2O → threads), is_edited,
  attachments (JSON file-id array), system }.
- **`hoa_channel_members`** — { channel*, user*, hoa_member (optional), role(admin|
  member|guest), invited_by, last_read_at, notifications_enabled, date_created }.
  **This is the per-channel access table** — the basis for "invite a member to one channel."
- **`hoa_channel_mentions`** — { message*, mentioned_user*, mentioned_by*, channel*,
  is_read, date_created } — powers @mention notifications.

The `scripts/create-channels-collections.ts` migration already ran (these collections
exist). Re-run it only if you add fields; it's idempotent.

### UI + components (work today; reuse as-is, just relocate/adjust)
- `app/pages/admin/channels/index.vue` — channel list + welcome screen.
- `app/pages/admin/channels/[channel].vue` — full chat: message list, input, realtime
  subscription, threading, connection-status badge.
- `app/components/channels/ChannelsList.vue` — sidebar selector (realtime).
- `app/components/channels/ChannelMessage.vue` — message + thread replies, edit/soft-delete,
  file + mention rendering.
- `app/components/channels/ChannelEditor.vue` — **TipTap editor with @mention typeahead
  (org members), drag/drop + paste file upload, inline images**. Extensions: StarterKit,
  Placeholder, Link, Image, **Mention** (`@tiptap/extension-mention`), custom FileUpload.
- `app/components/channels/CreateChannelModal.vue` — create channel (name→slug, is_private,
  is_default).

### Infrastructure (reuse)
- **Realtime**: `useDirectusRealtime.ts` + `useRealtimeSubscription(collection, fields,
  filter, sort)` — WebSocket via Directus SDK; token from `/api/websocket/token`; graceful
  REST fallback. Channels/messages already subscribe live.
- **Notifications**: `useNotifications.ts` already transforms `hoa_channel_mentions` →
  unified notification (type `"mention"`, "X mentioned you in #channel"). Don't reinvent.
- **Files**: `useDirectusFiles().upload(file, meta)` → file id; `getUrl(id)`.
- **TipTap deps** are all installed (`@tiptap/*@^3.14.0`, incl. `extension-mention`).

---

## Desired model (from the product owner)

Channels are an **internal communications system for admins + board members** — think
internal tracking, NOT a community-wide chat:

1. **Admins and board members can create and see all channels** in their org.
2. **Regular members do NOT see channels** by default. A member can be **granted access
   to a specific channel on a per-channel basis** (a `hoa_channel_members` row) — e.g.
   the resident who filed a ticket gets pulled into that ticket's channel.
3. **All users can submit a ticket** (this already exists — the requests system). Tickets
   are managed by admin/board. From a ticket, admin/board can **spawn a task** (a `task`-type
   request) and/or **spawn a channel** (internal discussion for that ticket), optionally
   inviting the ticket's author into the channel.

> **Role gotcha (read `docs/.../memory` + Phase 6):** there is **no Directus "board member"
> role** — board status is app-derived from active `hoa_board_member_terms`. So "board sees
> all channels" CANNOT be a Directus row policy. See Track A for the chosen approach.

---

## Track A — Rework the access model (the crux)

Today, the HOA Member policy can **read all org channels** — wrong for an internal tool.
New model, designed to stay **realtime-compatible** (realtime enforces the user's own row
permissions, so access must be expressible as row policies or via membership rows — not via
elevated server routes, which realtime can't use):

1. **Membership-scoped read for non-admins.** Change the **HOA Member** permissions
   (`scripts/create-channels-collections.ts`, or a new `scripts/restrict-channel-access.ts`):
   - `hoa_channels` read filter → `{ channel_members: { user: { _eq: "$CURRENT_USER" } } }`
     (only channels they're a member of), NOT the current org-wide filter.
   - `hoa_channel_messages` read filter → `{ channel: { channel_members: { user: { _eq:
     "$CURRENT_USER" } } } }`. Keep create/update/delete scoped to own messages **in channels
     they belong to**.
   - Confirm `hoa_channel_members` read stays "own rows", and add member ability to read
     other members of channels they belong to (for the member list UI) if needed.
2. **Admins keep org-wide CRUD** (existing admin policy) — works with realtime.
3. **Board members see all channels via auto-enrollment, not a policy.** Because board isn't
   a role and realtime can't use elevated routes, the robust path is: **auto-create a
   `hoa_channel_members` row (role `admin`) for every active board member when a channel is
   created**, and **backfill** when a board term becomes active. Implement server-side:
   - On channel create, an elevated server route (`server/api/hoa/channels/create.post.ts`,
     `getTypedDirectus()` + `checkAdminAccess`/board-term lookup, mirroring
     `server/api/hoa/units/records.get.ts`) creates the channel **and** the channel_member
     rows for all current admins + active board members.
   - A small backfill endpoint/script to enroll a newly-seated board member into existing
     channels. (Document the trade-off; keep it simple.)
   - Confirm this approach with the user before building — an alternative is an elevated
     read route + disabling realtime for board, but auto-enrollment keeps realtime working.
4. **Migration discipline:** any permission change goes in an idempotent script, confirmed
   before running, then `pnpm generate:types` if fields changed.

---

## Track B — Bring it into the org-slug app + dock + module gate

1. **Relocate the pages under `[slug]`** so org users actually reach them:
   `app/pages/admin/channels/{index,[channel]}.vue` → `app/pages/[slug]/admin/channels/
   {index,[channel]}.vue`. Switch `definePageMeta` middleware from `["admin","subscription"]`
   to **`["admin-or-board","subscription"]`** (the `app/middleware/admin-or-board.ts` guard
   already admits admins + active board members). Resolve org via `useActiveHoa`/
   `useSelectedOrg` (the current pages use main-domain context — fix any `orgId` lookups and
   internal links to use `buildOrgPath`/the slug).
   - *(Members invited to a channel:)* decide whether invited members reach channels at
     `/[slug]/admin/channels` (guard would need to also admit channel-members) or a lighter
     `/[slug]/channels` surface. Simplest: keep one route under `admin-or-board` and **also
     admit users who have any `hoa_channel_members` row** (extend the middleware or add a
     `channel-access` middleware). Confirm with user.
2. **Dock**: add a **Channels** app (icon `messages-square` or `hash`) to `ADMIN_APPS` in
   `useAppNav.ts` → `/admin/channels`, key `channels`. It must show for admins **and board
   members** — note `appsFor(isAdmin)` currently only branches admin vs member; you'll need
   the dock to include Channels when the user is admin OR board OR has channel memberships.
   (See `useSelectedOrg().isBoardMember`.)
3. **Module gate (Phase 7b system):** add `channels` to the module system so an org can turn
   it off:
   - `useModules.ts` → add `"channels"` to `ModuleKey`.
   - `app/components/Settings/ModulesForm.vue` → add a **Channels** toggle (put it under a new
     "Internal" group or "Community"). No migration needed — `useModules` treats missing keys
     as enabled, and `scripts/add-org-modules-field.ts` already seeds a default map (add
     `channels: true` there for new orgs).
   - `app/middleware/module.global.ts` → add `{ module: "channels", prefixes:
     ["/admin/channels", "/channels"] }` to `MODULE_PREFIXES`.

---

## Track C — Per-channel member invites

Admins/board need to grant a specific member access to a single channel:
1. In the channel view (`[channel].vue`) add a **"Members"** affordance (e.g. a button in the
   header opening a panel/modal) listing current `hoa_channel_members` and an **"Invite member"**
   picker (org members via `hoa_members`, like the `ChannelEditor` mention list).
2. Inviting creates a `hoa_channel_members` row `{ channel, user, hoa_member, role: 'member',
   invited_by }`. Removing deletes it. This is what makes the channel visible to that member
   (per Track A's membership-scoped policy).
3. Respect `is_private` semantics already on the collection. Surface a private/internal badge.

---

## Track D — Tickets ↔ channels/tasks (the integration the owner wants)

The requests system already exists: `hoa_requests` { type(maintenance|arc|violation|complaint|
**task**), status, title, description, assigned_to, member (subject), organization, … }, with
admin UI at `app/pages/[slug]/admin/requests/{index,[id]}.vue` and `useRequests`/
`app/config/requestWorkflows.ts`. **"Tasks" are just `type: 'task'` requests** — there is no
separate tasks collection.

1. **Add a link between a request and a channel.** New `scripts/link-requests-channels.ts`
   (idempotent, confirm first): add `channel` (M2O → `hoa_channels`, SET NULL) to
   `hoa_requests` **or** add `request` (M2O → `hoa_requests`) to `hoa_channels` — pick one
   (a channel-per-ticket suggests `hoa_channels.request`, plus a convenience reverse lookup).
   Then `pnpm generate:types`.
2. **From a ticket (`admin/requests/[id].vue`), add actions:**
   - **"Spawn channel"** → creates an internal `hoa_channels` row (name like
     `ticket-<short-id>` or the ticket title), links it to the request, auto-enrolls admins +
     board (Track A), and offers to **invite the ticket's author** (the request `member`'s
     user) into the channel. Navigate to the new channel.
   - **"Spawn task"** → creates a linked `type: 'task'` request (reuse the request-create
     flow), carrying over title/subject/assignee context. (If a parent/child link between
     requests is wanted, add a `parent_request` self-M2O in the same migration.)
3. Surface the linked channel on the ticket detail (a "Discussion" link) and, on the channel,
   a back-link to its source ticket.

---

## Track E — Search (within + across channels)

No message search exists today (only a `search-x` empty-state icon). Add:
1. **In-channel search**: a search input in the channel header that filters the open channel's
   messages by text — Directus filter `{ content: { _icontains: query }, channel: { _eq: id },
   status: { _eq: 'published' } }`. Highlight/scroll to matches.
2. **Org-wide channel search**: a global search (command-palette or a search route/panel) across
   **all channels the user can see** (membership/admin scoped by the Track A policies, so results
   are automatically access-correct). Show channel name + snippet + timestamp; clicking opens the
   channel at that message (`/admin/channels/<slug>?message=<id>` then scroll/anchor).
3. Keep it a simple `_icontains` over `content` (HTML). Strip tags for the snippet. A
   `useChannelSearch()` composable wrapping `useDirectusItems('hoa_channel_messages')` is enough —
   no new collection. (Note: searching HTML content matches tag text too; acceptable for v1.)

---

## Conventions (apply to every track)
- **Backend changes** = idempotent TS script in `scripts/` (copy an existing one),
  needs `DIRECTUS_STATIC_TOKEN`, **explicit user confirmation before running**, then
  `pnpm generate:types`, then permissions in the same script. Only query fields that exist.
- **Match Phase 7a UI**: wrap pages in `<PageContainer>`; tables `text-sm` body, headers
  `text-xs font-medium uppercase tracking-wide t-text-muted`; circular row-action buttons
  `inline-flex items-center justify-center w-10 h-10 rounded-full t-bg-subtle`; pill buttons;
  `t-*` theme utilities; glass via `.ios-card`/`WidgetGlass`; `.spinner-ios`. UI primitives
  under `app/components/ui` auto-import without prefix; others are path-prefixed (e.g.
  `<ChannelsList>`, `<ChannelEditor>`).
- **Module system (Phase 7b)** already gates the dock (`useAppNav` filters by `useModules`)
  and pages (`app/middleware/module.global.ts`). Wire `channels` into both.
- **Charts** (if any added): `@unovis/vue` is NOT SSR-safe — wrap in `<ClientOnly>` (see the
  dashboard charts).

## Role / access model gotchas (read before Track A)
- **No "board member" Directus role** — board is app-derived from active board terms
  (`useSelectedOrg().isBoardMember`, `activeBoardTerms`). Org-wide/temporal access is enforced
  via elevated server routes (`getTypedDirectus()` + `checkAdminAccess` + board-term lookup),
  e.g. `server/api/hoa/units/records.get.ts` — NOT row policies.
- **Realtime enforces the subscriber's own permissions.** That's why Track A grants board
  access via **auto-enrolled `hoa_channel_members` rows** (a real row policy) rather than an
  elevated read route — so live subscriptions still work for board members.

## Verification setup (gotchas — same as prior phases)
- Preview runs on **:3000** (Directus CORS only allows `http://localhost:3000`). Use `preview_*`
  tools. **Login is manual** — ask the user; org dashboard is `/605-lincoln/dashboard`.
- **Realtime/WebSocket may not connect in the preview/headless context** — the UI falls back to
  REST; verify message send/receive via a manual refresh if the live socket is down. Don't treat
  a `[auth-refresh] 401 No refresh token` console line as a bug (preview session aging).
- Verify compilation by fetching transformed modules (`/_nuxt/@fs/<abs-path>.vue`) and watching
  `preview_console_logs`/`preview_logs`.
- **Clean up any test rows** (channels, messages, memberships, test tickets) on the live Directus
  when done.

## Suggested order
Track B (relocate + dock + module — makes it visible/testable fast) → Track A (access rework —
the foundation; confirm the auto-enrollment approach with the user) → Track C (per-channel
invites) → Track E (search — self-contained) → Track D (ticket↔channel/task link — needs a
migration + touches the requests UI).

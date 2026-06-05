# Prompt — Phase 5: Universal comments + reactions, and the Requests/Tickets system

> Hand this to a fresh Claude Code session in the `hoaconnect` repo. It is
> self-contained. Skim `docs/ROADMAP.md` for strategic context and
> `docs/channels-schema.md` for the pattern this work mirrors. The product is a
> multi-tenant HOA SaaS (Nuxt 4 + Directus, code name **Property Flow**), aiming
> to be a **one-stop-shop for HOAs**.

## The big idea (read this first)

The channels feature already built a complete messaging substrate — threaded
messages, attachments, @mentions, real-time, role-gated. **A comment is just a
message scoped to an arbitrary entity instead of a channel.** So instead of
building bespoke comment threads per feature, this phase builds **three shared
rails** that every entity in the app plugs into:

```
                 ┌─────────── COMMENTS ──────────┐
  Announcements ─┤                               │
  Documents     ─┤   hoa_comments (polymorphic)  ├─→ REACTIONS (hoa_reactions)
  Meetings       │   target_collection+target_id │        │
  Requests       ─┤   parent_comment (threads)   │        ▼
  Payment reqs   ─┤   organization (tenancy)      │   NOTIFICATIONS
  Channels ───────┘                              │   (useNotifications.ts)
                 └───────────────────────────────┘
```

Build comments + reactions **once, polymorphically**, and every entity gets a
conversation and reactions for free — gated by role. Then the **Requests/Tickets**
system is "just another surface on these rails": a request's conversation *is* the
comment thread; status changes post as system comments; assignment + mentions
flow through the existing notification center. This is the architectural
coherence that makes the app feel like one product, not bolted-on modules.

**Decisions already locked with the user (do not relitigate):**
- Requests system: **Tier 1 generic collection + Tier 2 config-driven per-type
  workflows** (NOT a full SLA/queue/vendor-portal ticketing system — that's the
  QuickBooks trap the roadmap warns against).
- Request types for launch: **maintenance/service, ARC (architectural review),
  violations, complaints + board tasks**.
- Comments/reactions backend: **custom `hoa_comments` + `hoa_reactions`**
  collections (NOT Directus-native `directus_comments`), mirroring the existing
  `hoa_channel_*` patterns for full role gating, threading, and reactions on both
  comments and entities.

## Where things stand (already built — do NOT rebuild)

- **Channels (Slack-like, production-ready)** — collections `hoa_channels`,
  `hoa_channel_messages` (threaded via `parent_message`, `attachments` JSON,
  `is_edited`), `hoa_channel_members` (roles admin/member/guest, `last_read_at`,
  `notifications_enabled`), `hoa_channel_mentions` (@mention → notification).
  Created by `scripts/create-channels-collections.ts` (`pnpm create:channels`).
  UI in `app/components/channels/*` (`ChannelsList`, `ChannelEditor`,
  `ChannelMessage`, `CreateChannelModal`). Real-time via
  `useRealtimeSubscription`. **`ChannelEditor.vue` is already a generic,
  channel-agnostic TipTap composer** — its @mention search queries `hoa_members`
  by `organizationId` (not by channel), and `channelId` is an optional,
  effectively unused prop. Reuse it directly for comments (contract in Task 1)
  rather than writing a new editor. Caveat: today it only **inlines images** into
  the HTML; it does not populate a separate attachments array — Task 1 extends it
  for general file uploads (see below).
- **Notifications** — `app/composables/useNotifications.ts` aggregates sources
  into a `UnifiedNotification` (`{ id, type, title, subtitle, content, date,
  isRead, priority, metadata, originalData }`). Types today: `announcement |
  mention | email | meeting` (+ `payment | document | membership` if Phase 4
  landed). Each source has a `transformX` fn + isolated try/catch in
  `fetchNotifications`. Helpers: `getUnseenCount`, `getUnseenCountByType`,
  `getNotificationsByType`, `getNotificationStyle`, `markAsSeen`,
  `markAllAsSeen`. UI: `Notification/{Bell,Sheet,Toast}.vue` from
  `app/layouts/auth.vue`. Dock badges in `App/Dock.vue` map `n.type` → app key.
- **Meetings** (`hoa_meetings`, `hoa_meeting_attendees`, `hoa_meetings_files`),
  **Announcements**, **Documents** (`hoa_documents`), **Payment requests**
  (`payment_requests`), **Units** (`hoa_units`), **Members** (`hoa_members`).
- **Permissions** — Directus 10.10+ policy model. Roles/policies `HOA_ADMIN`,
  `HOA_MEMBER`, `APP_ADMIN`. Applied by `scripts/setup-directus-permissions.ts`
  (`pnpm setup:permissions`, `:audit` to dry-run). New collections must be added
  here.
- **Source of truth for schema**: `types/directus.ts` (regenerate with
  `pnpm generate:types`). Only query fields that exist.

## Conventions to follow (match these exactly)

- **Collection creation** = an idempotent TS script in `scripts/` using helpers
  `directusFetch()`, `collectionExists()`, `createCollection()`, `createField()`,
  `createRelation()`. Copy the structure of `create-channels-collections.ts` /
  `create-meetings-collections.ts`. Wire a `pnpm` script in `package.json`. Needs
  `DIRECTUS_URL` + `DIRECTUS_STATIC_TOKEN` in `.env`. **Get explicit user
  confirmation before running any backend-mutating script**, then
  `pnpm generate:types`, then add permissions in `setup-directus-permissions.ts`.
- **Rich text & file uploads = TipTap.** All body/description rich text in this
  phase (comments, request descriptions) is **TipTap-produced HTML**, stored in a
  `text` field with `input-rich-text-html`. Use the existing TipTap-based
  `ChannelEditor.vue` — do not introduce a second editor library. **File uploads**
  go through `useDirectusFiles` (as `ChannelEditor` already does for images): the
  resulting file IDs are stored in the row's **`attachments` JSON array**, and
  rendered as a chip/preview list under the body. Images may additionally be
  inlined in the HTML; non-image files (PDF, docx — ARC plans, violation evidence,
  maintenance docs) live only in `attachments`.
- Standard system fields on every collection: `status`, `organization`
  (M2O `hoa_organizations`, required, for tenancy), `user_created`/`date_created`/
  `user_updated`/`date_updated` (Directus specials).
- Tailwind v4 (`app/assets/css/tailwind.css` `@theme inline` is authoritative);
  `color-mix`, not raw HSL. Glass styling via `.ui-kit` / `.glass*` / `.ios-card`;
  spinners `.spinner-ios`; pill buttons; segmented-pill tabs; hand-authored
  `dropdown-menu` for reka-ui v2.

---

## Schema designs (confirm with user, then build via a `scripts/` creator)

### `hoa_comments` — polymorphic threaded comments

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `status` | string | `published` / `draft` / `deleted` (soft-delete like messages) |
| `target_collection` | string | e.g. `hoa_announcements`, `hoa_requests`, `hoa_documents`, `hoa_meetings`, `payment_requests` |
| `target_id` | string | id of the target row (string to tolerate uuid/int pks) |
| `parent_comment` | uuid → `hoa_comments` | threaded replies |
| `body` | text (`input-rich-text-html`) | HTML with mentions, same as channel messages |
| `attachments` | json | array of file IDs |
| `is_edited` | boolean | default false |
| `is_internal` | boolean | default false — **board/admin-only note**, hidden from members (key for requests/violations) |
| `organization` | uuid → `hoa_organizations` | required, tenancy |
| `user_created`/`date_created`/`user_updated`/`date_updated` | specials | |

Reuse `hoa_channel_mentions` shape for comment @mentions, OR add `mentioned_users`
JSON to the comment and let `useNotifications` derive mention notifications. Prefer
a dedicated `hoa_comment_mentions` only if you need per-mention read state;
otherwise keep it simple with a JSON list + the notification layer.

### `hoa_reactions` — polymorphic emoji reactions (on comments OR entities)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `target_collection` | string | can be `hoa_comments` (react to a comment) or any entity (react to the thing itself) |
| `target_id` | string | |
| `emoji` | string | unicode emoji or shortcode |
| `user` | uuid → `directus_users` | |
| `organization` | uuid → `hoa_organizations` | required |
| `date_created` | special | |

Enforce **one (user, target, emoji)** — dedupe in the create path (and ideally a
DB unique index). Aggregate client-side into `{ emoji, count, reactedByMe }`.

### `hoa_requests` — the generic requests/tickets collection (Tier 1)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `status` | string | shared lifecycle: `open` / `in_progress` / `waiting` / `resolved` / `closed` (Tier 2 may add per-type states) |
| `type` | string | `maintenance` / `arc` / `violation` / `complaint` / `task` |
| `title` | string | required |
| `description` | text | rich text |
| `priority` | string | `low` / `normal` / `high` / `urgent` |
| `category` | string | optional free/enum subcategory per type |
| `submitted_by` | uuid → `directus_users` | reporter |
| `assigned_to` | uuid → `directus_users` | owner (board/manager/committee) |
| `unit` | uuid → `hoa_units` | the unit/property the request concerns |
| `member` | uuid → `hoa_members` | subject member (e.g. the violator, the requester) |
| `due_date` | timestamp | |
| `attachments` | json | file IDs (photos for maintenance/violations) |
| `metadata` | json | **type-specific fields live here** (see Tier 2) |
| `organization` | uuid → `hoa_organizations` | required, tenancy |
| `user_created`/`date_created`/`user_updated`/`date_updated` | specials | |

The conversation/audit trail is **not** columns on this table — it's the
`hoa_comments` thread targeting (`hoa_requests`, id). Status/assignment changes
should post `is_internal`-aware system comments so the timeline is the single
source of truth.

### Tier 2 — config-driven per-type workflows (no new tables)

Define workflows in a code config (e.g. `app/config/requestWorkflows.ts`), not in
the DB. Each type declares its states, allowed transitions, who can transition,
and the extra `metadata` fields it shows:

- **maintenance**: states `open → assigned → in_progress → resolved → closed`;
  metadata `{ vendor, scheduled_for, cost_estimate, location }`. Member submits,
  manager assigns/closes.
- **arc** (architectural review): states `submitted → under_review → approved /
  denied → completed`; metadata `{ improvement_type, contractor, start_date,
  end_date, committee_votes[] }`. Member submits, ARC committee decides.
- **violation**: states `reported → notice_sent → cure_period → escalated →
  resolved`; metadata `{ rule_cited, cure_by, fine_amount, notice_count }`.
  **Board → member direction.** Members see only their own; `is_internal`
  comments for board deliberation.
- **complaint / task**: light lifecycle `open → in_progress → resolved → closed`.
  Tasks are internal board action items (often spawned from a meeting — consider
  a "create task from meeting" affordance linking `metadata.meeting_id`).

Keep transitions as data; render a single generic request UI that adapts to the
type's config. This is what keeps Tier 2 cheap and avoids per-type code sprawl.

---

## Role-based authorization (the "authorized users depending on role" part)

Start **code-first**, harden into Directus permissions after the UX is proven.
Define a capability map, e.g. `app/config/commentCapabilities.ts`:

```ts
// who may comment / react / see-internal per target collection
{
  hoa_announcements: { comment: 'member', react: 'member', internal: 'board' },
  hoa_documents:     { comment: 'board',  react: 'member', internal: 'board' },
  hoa_meetings:      { comment: 'board',  react: 'member', internal: 'board' },
  hoa_requests:      { comment: 'participants', react: 'participants', internal: 'board' },
  payment_requests:  { comment: 'participants', react: 'none', internal: 'board' },
}
```

Where roles resolve against the current user's HOA role + relationship to the
record (`'participants'` = submitter, assignee, or board/admin). `is_internal`
comments are filtered out for non-board viewers both in the query and the UI.
**Backend enforcement still matters** — add matching filter rules to
`setup-directus-permissions.ts` so the API can't be bypassed; the code map is for
UX affordances, not the security boundary.

**Row-level read scope on `hoa_requests`** (distinct from comment `is_internal`,
and required before launch — especially for violations): a `hoa_member` reads
only requests where they are the `submitted_by` or `member` (their own); board /
managers (`hoa_admin`) read all requests in their `organization`. Encode this as
the `hoa_requests` read filter in `setup-directus-permissions.ts`:
- member read filter: `{ _and: [ { organization: { _eq: "$CURRENT_USER.organization" } }, { _or: [ { submitted_by: { _eq: "$CURRENT_USER" } }, { member: { user: { _eq: "$CURRENT_USER" } } } ] } ] }`
- admin read filter: `{ organization: { _eq: "$CURRENT_USER.organization" } }`
Same org-scope filter applies to `hoa_comments`/`hoa_reactions` reads, plus the
`is_internal` board-only condition for members.

---

## Notification + dock integration

Extend `useNotifications.ts` additively (same pattern as meetings/payments):
- New `NotificationType`s: `comment` (someone commented/replied on a thread you
  participate in or own), `request` (new request, status change, or assignment to
  you), and reuse `mention` for comment @mentions.
- **Participant derivation for `comment` notifications** (spell this out — don't
  leave it implicit): for a given `target_collection`+`target_id`, a notification
  recipient is anyone in the thread's **participant set** = {distinct
  `user_created` of non-internal comments on that target} ∪ {the target entity's
  owner/author and `assigned_to` (e.g. `hoa_requests.submitted_by` +
  `assigned_to`)}, **minus the comment's own author** (don't notify yourself).
  `is_internal` comments only notify board/admin participants. Skip recipients who
  were already @mentioned (they get a `mention` instead, to avoid double-notifying).
- Add `transformComment` / `transformRequest`, each fetched in its **own
  try/catch** so one failure can't drop the rest. Only request fields that exist
  in `types/directus.ts`.
- `getNotificationStyle` cases (pick distinct accent + icon: e.g. comment =
  slate/message, request = amber/clipboard).
- Dock badge mapping in `App/Dock.vue`: requests → a new **Requests** app entry
  (clipboard/inbox icon); comment/mention badges can ride the entity's own app.

Add a **Requests** app to the dock and routes:
`app/pages/[slug]/admin/requests/index.vue` (manager/board queue, filter by
type/status/assignee) and `app/pages/[slug]/requests/index.vue` (member: my
requests + "new request" with a type picker). A request detail view renders the
metadata-driven workflow header + the comment thread.

---

## Tasks (this session) — suggested order

Confirm scope/schema with the user before each backend mutation.

1. **Universal comments + reactions foundation (build first — everything depends
   on it).**
   - `scripts/create-comments-collections.ts` → `hoa_comments` + `hoa_reactions`
     (+ optional `hoa_comment_mentions`). `pnpm create:comments`. Then
     `pnpm generate:types` + add permissions.
   - Composables: `useComments(targetCollection, targetId)` (list/threaded,
     create, edit soft-delete, real-time via `useRealtimeSubscription`) and
     `useReactions(targetCollection, targetId)` (toggle, aggregate).
   - Components: `app/components/comments/{CommentThread,CommentItem,CommentComposer,ReactionBar}.vue`.
     For the composer, **reuse `app/components/channels/ChannelEditor.vue`
     directly** — it's already org-scoped and channel-agnostic. Its contract:
     props `modelValue`, `placeholder`, `disabled`, `showToolbar`,
     `organizationId` (drives @mention member search), `channelId` (optional,
     unused by the editor — omit it); emits `update:modelValue`, `mention`,
     `submit` (Enter without Shift), `blur`; exposes `focus()` and `clear()`.
     TipTap-based, uploads images via `useDirectusFiles` inline. Optionally
     relocate it to a shared dir (e.g. `components/shared/RichTextEditor.vue`) and
     re-import from channels, but no logic extraction is needed.
   - **Extend the composer for general file uploads — behind a prop (don't break
     channels).** `ChannelEditor` is live in the channels feature, which is
     intentionally images-only. Do NOT change its default behavior. Add an opt-in
     prop (e.g. `allowFileAttachments?: boolean` + an overridable `accept`) that,
     when enabled, accepts any file type, uploads via `useDirectusFiles`, and
     emits the resulting file IDs (an `attachments` v-model/event). Channels keep
     calling it without the prop (images-only, unchanged); `CommentComposer` passes
     `allowFileAttachments` and writes the IDs to `hoa_comments.attachments`.
     `CommentItem` renders the body HTML plus an attachment chip/preview list. Keep
     image inlining as-is; route non-image files (PDF/docx) to `attachments` only.
   - Wire the capability map (`commentCapabilities.ts`) for who-can-do-what +
     `is_internal` filtering.

2. **Drop the comment thread + reaction bar onto existing entities** to prove the
   substrate: announcements detail, document detail, meeting detail. (This also
   exercises the Phase 4 document deep-link route if it exists.)

3. **Requests collection + generic UI (Tier 1).**
   - `scripts/create-requests-collections.ts` → `hoa_requests`. Permissions +
     types.
   - Admin queue page + member "my requests" page + detail view (workflow header
     + comment thread). Add the **Requests** dock app.

4. **Tier 2 workflow config + per-type affordances.**
   - `app/config/requestWorkflows.ts` (states, transitions, transition-roles,
     metadata fields per type). Generic UI renders from config.
   - Status/assignment changes post `is_internal`-aware system comments.
   - ARC committee vote affordance; violation cure-period dates; maintenance
     vendor/schedule; task-from-meeting link.

5. **Notification + dock wiring.** `comment` + `request` notification types,
   transforms, styles, dock badges, deep links. Demo end-to-end with the user.

## Constraints

- **Additive & non-destructive.** Don't touch unrelated fetch/data logic. Don't
  re-add fields that aren't in `types/directus.ts` (a prior 500 came from querying
  nonexistent announcement fields).
- **Do NOT build Tier 3 ticketing** (SLAs, assignment queues, vendor portal,
  email-in, kanban automations). Roadmap says simple, not QuickBooks. If you find
  yourself adding queues/SLAs, stop and confirm.
- Reuse the messaging substrate (channels editor/mentions/real-time) instead of
  reinventing it.
- Backend changes need `DIRECTUS_STATIC_TOKEN`, the `scripts/` idempotent
  conventions, explicit user confirmation, then `pnpm generate:types` + permission
  updates.

## Verification setup (gotchas)

- Preview server runs HOA on **:3000** (Directus CORS only allows
  `http://localhost:3000`). Use the `preview_*` tools, not Bash/Chrome MCP.
- **Login is manual**: the MCP preview uses its own browser session; ask the user
  to log in in the preview window. After login the org dashboard is
  `/605-lincoln/dashboard`.
- The recurring **`[auth-refresh] 401 No refresh token available`** console errors
  are just the preview session aging — NOT a code bug; a re-login clears them.
- Verify compilation by fetching transformed modules
  (`/_nuxt/@fs/<abs-path>.vue`) and watch `preview_console_logs`/`preview_logs`
  for real errors vs. this known auth noise.
- For the live demo: create a test request + a couple comments/reactions, confirm
  the thread, the Requests dock badge, and the notification center all light up,
  then delete the test data to leave no live rows.

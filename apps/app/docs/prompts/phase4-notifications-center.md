# Prompt — Finish WS4 (notification center) + cleanup

> Hand this to a fresh Claude Code session in the `hoaconnect` repo. It is
> self-contained. Skim `docs/ROADMAP.md` for strategic context. The product is a
> multi-tenant HOA SaaS (Nuxt 4 + Directus, code name **Property Flow**).

## Where things stand (already built — do NOT rebuild)

A large design + feature pass already landed across prior sessions:

- **Design system**: iOS/glass material layer in `app/assets/css/earnest-ui.css`
  (`.glass*`, `.glass-surface`, `.ios-card`, `.river-skeleton`, `.spinner-ios`,
  per-section `--app-accent-*` + `.accent-*` presets). Widgets in
  `app/components/Widget/{Glass,Stat,Skeleton}.vue`.
- **Theme** (`app/assets/css/theme.css`, `app/composables/useTheme.ts`): default
  is now **Modern = "glass"** — white-on-white (`--theme-bg-primary:#F9FAFB`,
  white cards) with soft, wide, low-opacity shadows; accent `#00BFFF`; 15px base
  type (`main.css`). **Classic = "editorial"** (terracotta `#b14d2b` on cream
  `#f7f3ea`, Bauer Bodoni + Source Serif). Luxury unchanged.
- **Floating dock** (`app/components/App/Dock.vue`, `app/composables/useAppNav.ts`):
  macOS-style magnification (pointer-tracked, background expands via layout
  margins), perfect-circle chips, short labels + hover tooltips, glass/solid
  chrome toggle. Apps (admin): Dashboard, Announcements, Meetings, Documents,
  Directory, Email. Color **palettes**: Fresh / Aurora / Neutral / Vivid
  (sampled across apps via `pickGappy`). Appearance controls live in the **avatar
  dropdown** (`app/components/App/AppearanceSettings.vue`): palette swatches,
  show-labels, glass-chrome, dock position. Header (`app/components/App/Nav.vue`)
  is simplified — logo + **breadcrumb** (active app ▸ sub-page) + bell + avatar;
  all navigation is via the dock.
- **Meetings feature** (WS3, complete): collections `hoa_meetings`,
  `hoa_meeting_attendees` (with `board_term` M2O hard-link to `hoa_board_members`
  + frozen `role_at_meeting` snapshot), `hoa_meetings_files` (M2M). Created via
  `scripts/create-meetings-collections.ts` (`pnpm create:meetings`, uses
  `DIRECTUS_STATIC_TOKEN`). UI: `app/components/pages/MeetingsAdminPage.vue`
  (CRUD + attendees) and `MeetingsPage.vue` (member view), routed at
  `app/pages/[slug]/admin/meetings/index.vue` and `[slug]/meetings/index.vue`.

## Notifications — current state (the base for this work)

`app/composables/useNotifications.ts` aggregates multiple sources into a
`UnifiedNotification` (`{ id, type, title, subtitle, content, date, isRead,
priority, metadata, originalData }`) with localStorage "seen" tracking. Types
today: **`announcement | mention | email | meeting`**.
- `fetchNotifications(audienceFilter)` fetches announcements, channel mentions,
  emails (via `hoa_email_recipients`), and **published meetings** (`hoa_meetings`,
  audience-mapped: `"board members"` → `"board_members"`), each via a
  `transformX` function. Meetings were just added and validated (query 200).
- Helpers: `getUnseenCount`, `getUnseenCountByType(type)`,
  `getNotificationsByType(type)`, `getNotificationStyle(n)` (per-type bg/text/icon
  — meeting = violet/users), `markAsSeen`, `markAllAsSeen`, `clearSeenNotifications`.
- UI: `app/components/Notification/Bell.vue` (header bell + list dropdown),
  `Sheet.vue` (glass detail sheet — has cases for announcement/mention/email/
  **meeting**), `Toast.vue` (new-item toast). Rendered from `app/layouts/auth.vue`.
- The **dock badges** in `Dock.vue` map `n.type` → app key
  (`announcement→announcements`, `email→email`, `meeting→meetings`) and count
  `!isRead`. They only render when there are unread items.
- NOTE: a prior bug — querying nonexistent announcement fields
  (`button_text/button_link/external_link/show_toast`) — caused a 500; those
  fields were removed from the query. Don't re-add fields that aren't in the
  schema (`types/directus.ts` is the source of truth; regenerate with
  `pnpm generate:types`).

## Tasks (this session)

### 1. Category filter chips in the notification center
Add category filter chips to the notification list (`Notification/Bell.vue`, and/or
a dedicated center) so the user can filter by category (All, Announcements,
Meetings, Payments, Documents, Membership, Mentions, Email). Use the existing
`.ui-kit` glass styling and `getUnseenCountByType` for per-chip counts. Read/unread
state, deep links, and "mark all read" should keep working. Confirm with the user
whether the center should stay in the Bell dropdown or become a full glass sheet.

### 2. Remaining notification categories (confirm sources with user first)
Extend `useNotifications.ts` with these `NotificationType`s + `transformX` +
`fetchNotifications` sources + `getNotificationStyle` cases + dock badge mapping
in `Dock.vue`:
- **`payment`** — from `payment_requests` (see `app/pages/payments/index.vue` for
  shape: `title`, `amount`, `due_date`, `status`, `member`, `organization`).
  Member-facing: new/overdue payment requests for the current user.
- **`document`** — from `hoa_documents` (new published docs for the org/audience).
- **`membership`** — likely from `hoa_members` (new member joined) and/or
  `hoa_invitations`; this one is more admin-facing. Confirm intent with the user.
Each source query must only request fields that exist (verify against
`types/directus.ts`); isolate each fetch in its own try/catch like the meetings
one so a single failure can't drop the rest. Map each new type to its dock app
(payment→payments app for members; document→documents; membership→directory).

### 3. Demo the meeting → notification flow end-to-end
With the user logged in on the preview, create + **publish** a test meeting in
`/{slug}/admin/meetings`, confirm it appears in the notification center and lights
up the **Meetings dock badge** (unread count), then delete the test meeting to
leave no live data. (There are currently zero published meetings, which is why no
meeting notification shows.)

### 4. Fix the broken document deep-link route (cleanup)
The console shows repeated `Vue Router warn: No match found for
/{slug}/documents/{id}`. Find what links there (likely a documents list/notification
deep link) and either add the missing route
(`app/pages/[slug]/documents/[id].vue` detail page) or point the links at an
existing route. Confirm the desired behavior with the user.

## Constraints
- **Additive & non-destructive**: don't change unrelated data/fetch logic.
- Tailwind v4 (`app/assets/css/tailwind.css` `@theme inline` is authoritative);
  use `color-mix`, not raw HSL triplets. shadcn UI components live in
  `app/components/ui/*` (buttons are pill `rounded-full`; tabs are segmented pills;
  a hand-authored `dropdown-menu` set exists for reka-ui v2).
- Directus schema/permission changes need `DIRECTUS_STATIC_TOKEN` in `.env` and the
  `scripts/` conventions (`create-*-collections.ts`); get explicit user
  confirmation before mutating the backend, then `pnpm generate:types`.

## Verification setup (gotchas)
- A preview server runs HOA on **:3000** (Directus CORS only allows
  `http://localhost:3000`). Use the `preview_*` tools, not Bash/Chrome MCP.
- **Login is manual**: the MCP preview uses its own browser session; ask the user
  to log in in the preview window (the session cookie is httpOnly and reading the
  password is blocked). After login the org dashboard is `/605-lincoln/dashboard`.
- The recurring **`[auth-refresh] 401 No refresh token available`** console errors
  are just the preview session aging (a background client plugin) — they are NOT a
  code bug; a re-login clears them. Don't chase them.
- Verify compilation by fetching transformed modules
  (`/_nuxt/@fs/<abs-path>.vue`) and watch `preview_console_logs`/`preview_logs`
  for real errors vs. this known auth noise.

## Suggested order
4 (quick cleanup) → 1 (filter chips) → 2 (new categories, confirm sources) →
3 (live demo). Confirm scope for 1, 2, and 4 with the user before building.

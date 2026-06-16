# Prompt — Phase 3 polish + app-like shell, meetings, notifications, header

> Hand this to a fresh Claude Code session in the `hoaconnect` repo. It is
> self-contained. Read `docs/ROADMAP.md` first for strategic context.

## Role & goal

You are continuing the HOA Connect SaaS (Nuxt 4 + Directus, product name
"Property Flow"). The Earnest-style design system is already built and rolled
out across the admin pages. This task finishes the Phase 3 polish AND levels up
the app shell: a floating macOS-Dock-style navigation with color options and
"Apps" for content flow, a new **Meetings** feature for boards, a rethink of
**announcements + notifications**, and a clean **avatar dropdown** in the header.

Work in priority order (below). After each workstream, verify live (see
"Verification") and report before moving on. Confirm the open decisions with the
user BEFORE building the larger pieces (nav model, meetings schema).

## What already exists (don't rebuild)

Design system (additive, keyed off `--theme-*` vars via `color-mix`, scoped to
`.ui-kit`):
- `app/assets/css/earnest-ui.css` — `.glass*`, `.glass-surface`, `.ios-card`,
  `.ios-group`, `.river-skeleton`, `.spinner-ios`, `.ios-press`, accent presets
  (`.accent-cyan|blue|violet|emerald|amber|rose|gold`), and
  `.ui-kit [data-slot='card']` which **auto-upgrades every shadcn `<Card>`** to
  the iOS look inside any `.ui-kit` page.
- `app/components/Widget/{Glass,Stat,Skeleton}.vue` → `<WidgetGlass>`,
  `<WidgetStat>`, `<WidgetSkeleton>`.
- `app/pages/ui-kit.vue` — living style guide at `/ui-kit`.
- Per-section accent system: set `--app-accent-h/s/l` (or an `.accent-*` class)
  on a container; glass tint, river shimmer, spinner, selection all follow.

Conversion pattern already applied to admin pages (dashboard, members, units,
documents, announcements, email, settings): wrap the page root in
`class="ui-kit accent-<x> ..."` + an optional `<WidgetGlass strong>` hero. This
converts a page with no rewrite of its data logic.

Theme system: `app/composables/useTheme.ts` (styles classic/modern/luxury ×
light/dark; persists to localStorage + Directus user `theme_light`/`appearance`).
`app/assets/css/theme.css` defines the `--theme-*` tokens.

Key existing pieces to integrate with, not duplicate:
- Header/nav: `app/components/App/Nav.vue` (572 lines, traditional top bar).
- Layouts: `app/layouts/auth.vue` (app shell, renders `<AppNav>`,
  `<SubscriptionBanner>`, notification components), `app/layouts/default.vue`.
- Notifications: `app/composables/useNotifications.ts`,
  `useDirectusNotifications.ts`; components `app/components/Notification/*`,
  `app/components/Announcement/{Bell,Sheet,Toast}.vue`.
- Board data: `hoa_board_members`, `hoa_board_member_terms` collections (titles,
  terms) — see `types/directus.ts`.

## Earnest reference (patterns to port, in ~/Sites/earnest/earnest)

- `app/components/AppRail.vue` (922 lines) — the floating nav. Studies:
  positionable glass pill (left/right/top/bottom/floating via `useAppsMode`),
  per-app accent chips from `useAppAccent` (macOS-app-icon style), macOS-Dock
  hover magnification, per-app notification badges (`useUnreadByCategory`),
  haptics on switch, glass-chrome toggle.
- `app/components/Layout/AppRailSettingsPanel.vue`,
  `AppRailPositionPicker.vue`, `MobileToolbar.vue`.
- `app/composables/useAppAccent.ts` — `APP_ORDER`, palette spreading
  (`pickGappy`), per-app accent + icon strategies, `applyPaletteToDocument()`.
- `app/composables/useAppPalette.ts` (palette + glass-chrome), `useAppsMode.ts`
  (rail position / labels). Already summarized in `docs/ROADMAP.md` history.

Port the *concept and CSS*, adapted to HOA Connect's `--theme-*` + `.ui-kit`
token approach (do NOT copy Earnest's raw-HSL-triplet tokens; use `color-mix`
like `earnest-ui.css` already does).

## Workstreams

### 1. Finish Phase 3 polish (do first — low risk, fast)
- Convert remaining pages with the established `.ui-kit` + glass-hero pattern:
  - Member dashboard: `app/components/pages/MemberDashboardPage.vue`
  - Board page: `app/pages/[slug]/board.vue` (find its component)
  - Payments: `app/pages/payments/index.vue`, `app/pages/payment/confirmation.vue`,
    `app/pages/settings/subscription.vue`
- Swap spinner loaders: replace `<Icon name="lucide:loader-2" class="animate-spin"/>`
  usages with `<span class="spinner-ios spinner-ios--lg" />` across converted pages.
- Convert remaining bare panels (`t-bg-elevated` / ad-hoc divs) to `.ios-card`.
- Acceptance: each page renders live with real data, no compile errors,
  consistent glass/iOS look.

### 2. App-like floating navigation (confirm model with user first)
Replace the traditional top bar with a floating, macOS-Dock-style toolbar.
- Define the **"Apps"** (content groups) for HOA Connect — propose a set and
  confirm with the user. Likely: Dashboard, Announcements, Documents, Meetings
  (new), Members/Units (Directory), Payments, Email, Settings. Map current routes.
- Build an `AppRail`-equivalent: a fixed glass pill (`glass-surface`) with
  per-app accent chips, positionable (start with top + bottom-on-mobile; add
  left/right + "floating" if time), dock hover magnification, active-app accent
  drives `--app-accent-*` for the whole page.
- Color options: a palette/accent picker (reuse the `.accent-*` presets +
  `--app-accent-*`); persist choice to the Directus user profile like `useTheme`.
- Per-app unread badges sourced from the notifications system (workstream 4).
- Keep `OrgSelector` and subscription banner accessible.
- Acceptance: nav floats, switches apps, retints per app, remembers palette +
  position, works on mobile (bottom), and the old top-bar links are removed/migrated.

### 3. Meetings feature (new — confirm schema with user first)
Boards post meeting **notices, agendas, minutes, recordings**.
- New Directus collection(s), proposed: `hoa_meetings` with fields: `organization`
  (M2O), `title`, `type` (board/annual/special/committee), `status`
  (scheduled/completed/canceled), `meeting_date` (datetime), `location` / `virtual_url`,
  `notice_file` (M2O files), `agenda` (rich text or file), `minutes` (rich text or
  file), `recording_url` / `recording_file`, `attachments` (M2M files), `is_published`,
  audience (reuse announcement audience pattern). Confirm fields with user.
- Follow existing schema-script conventions: `scripts/create-channels-collections.ts`
  and `scripts/setup-directus-permissions.ts` (run with `pnpm create:channels` /
  `pnpm setup:permissions`). Add a `create-meetings-collections.ts` analog. NOTE:
  Directus schema/permission changes need the admin token in `.env`; flag clearly
  and get user confirmation before mutating the backend.
- UI: a Meetings "app" — list (upcoming/past), detail view (notice, agenda,
  minutes, recording), and admin create/edit (board/admin only). Use `.ios-card`,
  glass hero, `.river-skeleton` loaders. Add to nav (workstream 2).
- Regenerate types after schema change: `pnpm generate:types`.
- Acceptance: board admin can create a meeting and attach agenda/minutes/recording;
  members can view published meetings; live-verified.

### 4. Announcements + notifications rethink (design then build)
- Audit current: `useNotifications.ts`, `useDirectusNotifications.ts`,
  `Notification/*`, `Announcement/{Bell,Sheet,Toast}.vue`. Document how
  announcements vs notifications differ today and where they overlap.
- Propose a unified model: announcements (org broadcasts, audience-targeted) feed
  the notification center; add categories (announcement, meeting, payment, document,
  membership) so the nav can show per-app unread badges (mirrors Earnest's
  `useUnreadByCategory`). Confirm with user before refactor.
- Build: a single notification center (glass sheet) with category filters,
  read/unread, deep links; toast for new items; bell in header with unread count.
- Acceptance: posting an announcement / creating a meeting generates categorized
  notifications; unread counts drive nav badges; live-verified.

### 5. Avatar dropdown + header cleanup
Currently `App/Nav.vue` has the avatar as a plain link to `/account` (lines
~348-374) and a separate Logout button (~375-382).
- Replace with a shadcn `DropdownMenu` triggered by the avatar containing:
  My Profile (`/account`), **Theme** submenu (classic/modern/luxury, gated by
  premium per `useTheme.getAvailableThemes`), **Dark mode toggle**
  (`useTheme.toggleMode`), palette/accent options (workstream 2), and **Logout**
  (`handleLogout`).
- Remove the standalone Logout button and the status badge clutter; keep it clean.
- Ensure shadcn `dropdown-menu` + `switch` components exist in `app/components/ui`
  (add via shadcn-vue if missing).
- Acceptance: clicking the avatar opens a tidy menu; theme/dark/logout all work
  and persist; header is visually clean.

## Constraints

- **Additive & non-destructive**: never change a page's data/fetch logic when
  restyling. Keep edits to templates/markup + the design layer.
- **Verify live** on the `605-lincoln` tenant (see below) — screenshots, not just
  compile checks. Use real Directus data.
- Schema/permission changes are the only backend mutations; get explicit user
  confirmation first and use the `scripts/` conventions.
- Tailwind v4 (tokens in `app/assets/css/tailwind.css` `@theme inline`; the
  legacy `tailwind.config.js` is not authoritative). Use `color-mix` for alpha,
  not raw HSL triplets.

## Verification setup (important gotchas)

- Directus CORS authorizes **only `http://localhost:3000`**. Run HOA on :3000.
- Port 3000 is normally held by the user's **other** project
  `~/Sites/greaterops/2026`. Ask before stopping it; restart it afterward with
  `cd ~/Sites/greaterops/2026 && TMPDIR=/tmp pnpm dev`, and if it 500s on boot,
  `rm -rf .nuxt` then restart (stale-cache issue).
- `.env` has `ADMIN_EMAIL`/`ADMIN_PASSWORD` but **logging in programmatically is
  blocked**: the session cookie is httpOnly and safety tooling blocks reading the
  password into the transcript. **Ask the user to log in manually** in the preview,
  then continue (navigate + screenshot). Do not write creds to a web-served file.
- Use the preview tools (`.claude/launch.json` runs HOA on :3000). After login,
  the org dashboard is at `/605-lincoln/dashboard`.

## Suggested order
1 (polish) → 5 (avatar/header, quick win) → 2 (nav model, confirm + build) →
4 (notifications, needed for nav badges) → 3 (meetings). Confirm scope/decisions
for 2, 3, 4 with the user before large builds.
</content>

# Prompt — Phase 9: Consolidate the dashboard + building feed, and rationalize Announcements vs Email

> Hand this to a fresh Claude Code session in the `hoaconnect` repo. Self-contained.
> Conventions mirror prior phase prompts: idempotent `scripts/` migrations (**confirm
> before running**), then `pnpm generate:types`, then permissions in the same script.
> Product is a multi-tenant HOA SaaS (Nuxt 4 + Directus, code name **Property Flow**).
> `types/directus.ts` is the schema source of truth. Match Phase 7/8 UI: `<PageContainer>`,
> `t-*` theme utilities, `text-sm` tables, circular `w-9 h-9 rounded-full` row actions,
> pill buttons, `.ios-card`/glass, `.spinner-ios`. `@unovis/vue` charts are NOT SSR-safe —
> wrap in `<ClientOnly>`.

## Two related goals (the product owner's intent)

The owner finds two parts of the admin experience confusing/redundant and wants them
simplified toward an Earnest-style, focused UX:

1. **Dashboard + Building feed feel like they should be one place.** Today the dashboard
   and the building/community feed are **separate dock apps**. The owner expected the feed
   to live **inside the dashboard as tabbed content**.
2. **Announcements vs Email is confusing.** A member only learns about an announcement if it
   triggers a notification — and the notification that actually leaves the app is an email.
   So today there are effectively **two authoring surfaces** for one intent.

---

## Goal 1 — Dashboard with a tabbed Building feed

### Current state (verify, then build)
- Dashboard: `app/components/pages/DashboardPage.vue` (admin) and
  `app/components/pages/MemberDashboardPage.vue` (member); routed under `/[slug]/dashboard`
  and the member home.
- Feed: `app/pages/[slug]/feed/index.vue` (admin + member building/community timeline,
  comments, moderation, report-a-comment from Phase 4/5).
- Dock: `app/composables/useAppNav.ts` — `ADMIN_APPS` has a `feed` entry (label "Building",
  icon `building-2`, path `/feed`); `MEMBER_APPS` likewise. Module gating via
  `app/composables/useModules.ts` + `app/middleware/module.global.ts` (`feed` prefix `/feed`).

### What to build
1. Add a **tabbed layout to the dashboard** — e.g. "Overview" (current dashboard widgets) and
   "Building" (the feed). Reuse the existing feed component/logic; extract the feed body from
   `feed/index.vue` into a component (e.g. `app/components/feed/FeedTimeline.vue`) usable from
   both the standalone route and the dashboard tab, to avoid duplication.
2. **Decide the dock treatment** (confirm with owner):
   - **Option A (recommended):** keep a "Building" dock entry, but point it at the dashboard's
     Building tab (`/dashboard?tab=building` or a nested route `/dashboard/building`). One
     surface, two entry points. Keep `/feed` as a redirect for back-compat.
   - **Option B:** remove the Building dock app entirely; the feed is only reachable as a
     dashboard tab. Simpler dock, less discoverable.
3. Use a query param or nested route for tab state so it's linkable (notifications/deep-links
   to the feed should land on the right tab). Keep the module gate working (`feed` module off →
   hide the tab + block the route).
4. Mirror for the **member** dashboard (`MemberDashboardPage.vue`) if the member home should
   also tab the feed — confirm scope with owner.

---

## Goal 2 — Announcements = content, Email = delivery + activity

### Current state (verify, then build)
- Announcements: `app/components/pages/AnnouncementsAdminPage.vue` + the member announcements
  page; collection likely `hoa_announcements` (audience targeting: all / owners / tenants /
  board — see `app/layouts/auth.vue` `audienceFilter`). Generates in-app notifications
  (`useNotifications.ts` → type `"announcement"`).
- Email: `app/components/pages/EmailPage.vue`, `EmailActivityPage.vue`, `EmailDetailPage.vue`;
  send endpoint `server/api/email/send.post.ts`; an Email dock app. Delivery tracking
  (sends/opens/etc).
- Notifications: `app/composables/useNotifications.ts` unifies announcement/email/meeting/etc
  into one feed; the bell + `NotificationSheet`/`NotificationToast` in `auth.vue`.

### Recommended model (confirm with owner before building)
- **Announcement = the content/record** — persistent, browsable in-app, audience-targeted.
  This is the single source of truth for "a message to the community."
- **Email = a delivery option on an announcement**, not a separate composer:
  - On the announcement composer, add an **"Also send by email"** toggle (+ audience inherited
    from the announcement). Sending reuses `server/api/email/send.post.ts`.
  - The **Email screen becomes the delivery/activity dashboard only** (sends, opens, bounces,
    history) — reporting, not authoring.
- Link an announcement to its email send (e.g. `hoa_announcements.email` M2O → the email/send
  record, or a `sent_by_email_at` timestamp + reference). Idempotent migration; then
  `pnpm generate:types`.
- Keep the unified notification behavior: an announcement always creates the in-app
  notification; the email toggle additionally emails it. This makes "to notify a member it
  has to email them" explicit and intentional rather than two disconnected tools.

### Migration discipline
Any schema change (e.g. announcement↔email link, a `sent_by_email_at`) = idempotent TS script
in `scripts/`, **confirmed before running**, then `pnpm generate:types`, permissions in the
same script. Only query fields that exist.

---

## Open questions to resolve with the owner (use AskUserQuestion early)
1. Dock treatment for the feed (Option A redirect-to-tab vs Option B remove the app).
2. Should the **member** home also tab the feed, or admin dashboard only?
3. Announcements/email: confirm the "announcement is the record, email is a delivery option"
   model, and whether the standalone Email composer should be **removed** or kept as an
   advanced/one-off sender.
4. Back-compat: keep `/feed` and the Email composer as redirects, or hard-remove?

## Verification (same gotchas as prior phases)
- Preview on **:3000** (Directus CORS only allows `http://localhost:3000`). Use `preview_*`
  tools. **Login is manual** — ask the user; org dashboard `/605-lincoln/dashboard`.
- The dev session ages out — re-request login if you hit `/auth/login`; ignore
  `[auth-refresh] 401` noise.
- Confirm compilation via `/_nuxt/@fs/<abs-path>.vue` fetches + `preview_console_logs`/`preview_logs`.
- Clean up any test rows (announcements, emails) on the live Directus when done.

# Prompt — Phase 7a: UI consistency pass (page widths, header, breadcrumbs, back buttons, icons)

> Hand this to a fresh Claude Code session in the `hoaconnect` repo. Self-contained.
> Strategic context: `docs/ROADMAP.md`; conventions mirror
> `docs/prompts/phase6-resident-records-governance.md`. Product is a multi-tenant
> HOA SaaS (Nuxt 4 + Directus, code name **Property Flow**). This is a
> **front-end-only** pass — no Directus schema changes, no migration scripts.

## Goal

A polish pass to make the authenticated app feel consistent: one page width
everywhere, a centered org identity in the header with a small uppercase
breadcrumb row beneath it, and a single shared "back" link style used everywhere.

## Where things stand (verified)

- Authenticated pages use `layout: "auth"` → `app/layouts/auth.vue`, which renders
  `<AppNav />` (top header), a `<main class="flex-1 pb-28"><slot/></main>`, plus a
  floating `<AppDock />` (the macOS-style dock) and `<AppFooter />`.
- The header is `app/components/App/Nav.vue`: a `<nav>` with
  `<div class="max-w-7xl mx-auto py-4"><div class="flex justify-between items-center">`
  — org logo/name on the **left** (`orgLogoUrl`, `orgName` computeds), nav +
  notifications + user menu on the right.
- Dock apps are defined in `app/composables/useAppNav.ts` (`ADMIN_APPS` and
  `MEMBER_APPS` arrays; each has `icon` = a lucide name without prefix).
- **Page widths are inconsistent** — pages set their own container, mixing
  `max-w-7xl / 6xl / 5xl / 4xl / 3xl / 2xl / md`. Empty pages visibly shrink.
- **Back links are ad-hoc** and styled differently per page. Examples to unify:
  `app/pages/[slug]/admin/units/[id].vue` ("← All units"),
  `app/pages/[slug]/admin/requests/[id].vue`, `app/pages/[slug]/requests/[id].vue`,
  `app/pages/[slug]/documents/[id].vue`, `app/pages/[slug]/admin/teams/index.vue`,
  `app/pages/[slug]/board.vue`.

## Tasks

### 1. One page container width
- Create `app/components/ui/PageContainer.vue` (or `app/components/AppPageContainer.vue`)
  — a simple wrapper: `<div class="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6"><slot/></div>`.
  Pick **`max-w-5xl`** as the standard (widest pages like the Directory grid may
  opt into `max-w-6xl` via a `wide` prop — keep it to those two). Make the empty
  state sit inside the same container so the width never changes between empty and
  full.
- Adopt it across the authenticated `[slug]` pages and their `app/components/pages/*`
  page components. Replace the bespoke `max-w-*` wrappers. Don't touch marketing/
  auth pages (`/`, `/auth/*`, sell sheets) — those have their own intentional
  widths.
- Acceptance: navigating between e.g. Dashboard, Rules, Units, a unit with no
  records, and an empty Requests list shows **no horizontal width jump**.

### 2. Meetings icon → calendar
- In `useAppNav.ts`, change the `meetings` app `icon` from `users` to
  `calendar-days` in **both** `ADMIN_APPS` and `MEMBER_APPS`.

### 3. Header: center org identity + breadcrumb row
- In `app/components/App/Nav.vue`, move the org logo/name to the **horizontal
  center** of the header (logo + name as one centered link to the org home).
  Keep notifications + user menu pinned right; if needed use a 3-column grid
  (`grid-cols-[1fr_auto_1fr]`) so the center stays truly centered regardless of
  the left/right widths.
- Add a **breadcrumb row beneath the header** (either at the bottom of `AppNav`
  or as a slim bar in `auth.vue` directly under `<AppNav/>`). Build
  `app/components/App/Breadcrumbs.vue` that derives crumbs from the current route
  (org home → section → page; use the dock `AppDef.label` for the section name
  where it matches, and humanize the rest). Style: **very small, uppercase, wide
  tracking**, muted — e.g. `text-[11px] uppercase tracking-widest t-text-muted`,
  separated by a `lucide:chevron-right` (w-3). Each crumb except the last is a
  link. Hide on the org home/dashboard root if it would be a single crumb.

### 4. One back-link style everywhere
- Build `app/components/ui/BackLink.vue` (props: `to: string`, `label: string`).
  Render a `NuxtLink` styled to **match the breadcrumbs**: small, uppercase, wide
  tracking, muted, with a leading `lucide:chevron-left` (w-3.5) — e.g.
  `inline-flex items-center gap-1 text-[11px] uppercase tracking-widest t-text-muted hover:t-text`.
- Replace every ad-hoc back link in the `[slug]` pages listed above with
  `<BackLink :to="…" label="…" />`. Use `useOrgNavigation().buildOrgPath()` for
  the `to`.

## Conventions
- **No backend changes.** No `scripts/`, no `generate:types`.
- Tailwind v4 (`color-mix`, not raw HSL); glass via `.ios-card`/`.glass*`;
  `t-*` theme utilities; pill buttons. UI primitives live under
  `app/components/ui` and are auto-imported **without** a path prefix
  (`<Button>`, `<PageContainer>`, `<BackLink>`). Other components use a path
  prefix (`<AppBreadcrumbs>`).
- Keep the floating dock as the primary nav; this pass is about the header/identity
  and page chrome, not replacing the dock.

## Verification setup (gotchas — same as prior phases)
- Preview server runs HOA on **:3000** (Directus CORS only allows
  `http://localhost:3000`). Use the `preview_*` tools.
- **Login is manual** — ask the user to log in; org dashboard is `/605-lincoln/dashboard`.
- Recurring `[auth-refresh] 401 No refresh token available` console errors are
  preview session aging — NOT a bug.
- Verify by snapshotting several pages (full + empty states) and confirming the
  container width is identical, the header identity is centered, the breadcrumb
  row renders small/uppercase, and back links match.

## Suggested order
PageContainer + adopt across pages → meetings icon → BackLink + replace usages →
header centering → breadcrumbs.

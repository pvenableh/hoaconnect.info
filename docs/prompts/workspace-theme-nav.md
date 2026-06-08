# Workspace theme-driven nav (classic sidebar / modern dock)

> Status: PLANNED, not started. Build on the **main branch** (no worktree).
> Companion to `docs/prompts/landing-theme-nav.md` (the landing already does this split).

## Problem
The logged-in WORKSPACE is "modern-only": the app coerces the `classic` theme to
`modern` and ALWAYS renders the floating dock. We want the workspace to honor the
ORG's theme and render the matching primary nav — exactly like the PUBLIC LANDING
already does (sidebar for classic/luxury, dock for modern). Extend that split from
the landing into the logged-in workspace.

## Goal
When a member/admin is logged in, the org's theme persists into the workspace:
- Org theme = **classic OR luxury** → persistent **LEFT SIDEBAR** for primary nav
  (collapsible; collapsed = icon-only with hover tooltips, like the dock).
- Org theme = **modern** → keep the current floating **dock** (AppDock), unchanged.
Apply consistently across member, admin, AND board sections (no per-section theme).

## Decisions (locked with the product owner — do not re-litigate)
1. **Org forces the theme.** Every logged-in member of a classic org sees the
   classic sidebar look. **Hide** the per-user theme STYLE picker in the workspace.
   Keep options minimal — do NOT add new user-facing theme toggles. A light/dark
   MODE toggle may remain if trivial, but the STYLE selector is hidden when the org
   forces a theme. Classic needs a small, defined ACCENT/HIGHLIGHT scheme for active
   nav states / focus / primary buttons — design it minimally.
2. **Keep the existing top bar** (org switcher, chat, avatar, search). The sidebar
   is ADDITIVE for primary nav (Linear/Slack style: top bar + left rail). On screens
   `< lg`, do NOT show a fixed rail — fold the sidebar's nav items into the existing
   mobile sheet / a slide-over drawer.
3. Nav mapping mirrors the landing's existing split.

## Current architecture (verified; file:line)
- **Nav data (single source of truth):** `app/composables/useAppNav.ts` — `ADMIN_APPS`
  (~148-162), `MEMBER_APPS` (~164-172), `AppDef` (~16-26: {key,label,shortName,icon,
  path,match}). `appsFor(isAdmin)` filters by `useModules().isEnabled(app.key)`. Also
  `activeKeyFor`, `go`, `accentsForApps`, `palette`, `dockPosition`, `showLabels`.
  The new sidebar MUST consume this same composable (the dock does).
- **Dock:** `app/components/App/Dock.vue` — consumes useAppNav(); shown for logged-in
  org users (`v-if="user && isOnOrgPage"`, ~127). TOOLTIP: `.dock-item__tip` CSS
  (~259-289), markup `<span class="dock-item__tip">{{ app.label }}</span>` (~149).
  REUSE this tooltip CSS for the collapsed sidebar icons.
- **Top nav:** `app/components/App/Nav.vue` — always present. Avatar dropdown has
  `<ThemeSelector>` (~485-489) — the per-user style picker to HIDE when org-forced.
  Mobile sheet ~512-698 (fold sidebar nav in here for mobile).
- **Auth layout:** `app/layouts/auth.vue` — AppNav + AppBreadcrumbs + SubscriptionBanner
  + main(slot) + AppFooter + `<ClientOnly><AppDock/></ClientOnly>` + AppChannelsPanel +
  notifications + `<ClientOnly><OrgViewSwitcher/></ClientOnly>`. Theme applied via
  `useTheme().initTheme()` + `useHead({htmlAttrs:{class:`theme-${style}-${mode}`}})`
  (~9-15). Uses the USER/app theme, NOT the org's — must change.
- **Theme system:** `app/composables/useTheme.ts` — styles 'classic'|'modern'|'luxury'.
  **CRITICAL GOTCHA:** `normalizeStyle()` (~30-33) coerces 'classic' → 'modern', and
  `THEME_OPTIONS` (~25-28) only lists Modern/Luxury, so classic never renders in-app
  today. `forceThemeStyle(style, mode)` (~159-174) is SSR-safe (useHead, no persist) —
  the landing uses it. `themeState.style`, `setThemeStyle`, `initTheme` (~211-237).
- **Org theme storage:** `hoa_organizations.settings.theme` ('classic'|'modern'|
  'luxury'); `BlockSetting.theme` in `types/directus.ts` (~97). Read example:
  `app/pages/[slug]/index.vue` (~146-156) forceThemeStyle's the org theme on the landing.
- **How the landing does the split:** `app/components/Org/Landing/LandingNav.vue`
  dispatches to `LandingSidebar.vue` (classic/luxury) vs `LandingDock.vue` (modern);
  shared model `app/composables/useLandingNav.ts`. `LandingSidebar.vue` has the
  production collapse: `useState("landingNavCollapsed")` + GSAP timeline animating rail
  width (240↔56) while the body slides its FULL width with matched easing (power3.inOut,
  0.46s ≈ the page's cubic-bezier(0.65,0,0.35,1) padding transition); collapsed = icon
  rail. REUSE this collapse mechanism.
- **Org context:** `useSelectedOrg()` → `currentOrg.organization.settings.theme` +
  `isAdmin`; `app/composables/useActiveHoa.ts` → `activeHoa`.

## Implementation steps
1. **Apply the org theme in the workspace.** In `auth.vue` (or a small composable it
   calls), read the current org's `settings.theme` (via useSelectedOrg's currentOrg)
   and apply with `forceThemeStyle` — PRESERVING 'classic' (do NOT route classic
   through `normalizeStyle`'s classic→modern for the workspace). Watch for org switches;
   default modern when unset; SSR-safe (no hydration mismatch). Verify app-shell
   components (Nav, cards, buttons, tables) look acceptable under the classic token set
   (`theme-classic-light`); define/adjust classic accent tokens (active nav highlight,
   focus rings, primary buttons) minimally for legibility. **This (classic palette on
   the whole app shell) is the part most likely to need design iteration.**
2. **New `app/components/App/Sidebar.vue` (AppSidebar).** Fixed left rail, lg+ only.
   Consumes useAppNav() (appsFor(isAdmin), activeKeyFor, go, module gating). Expanded:
   org logo/branding at top + icon+label nav list with active-state highlight.
   Collapsed: icon-only with hover tooltips (reuse Dock's `.dock-item__tip` CSS).
   Collapse toggle with persisted state (reuse the landing sidebar's GSAP collapse
   pattern; NEW state key e.g. `"appNavCollapsed"` + localStorage, separate from
   `"landingNavCollapsed"`).
3. **Layout conditional in `auth.vue`.** Derive `navStyle` from the applied org theme:
   'sidebar' for classic/luxury, 'dock' for modern. Render `<AppSidebar>` (lg+) when
   sidebar; render `<AppDock>` when dock (never both). Apply a content left-offset
   synced to the collapse state (`lg:pl-14` / `lg:pl-60` with `transition-[padding]
   duration-[460ms] ease-[cubic-bezier(0.65,0,0.35,1)]`, exactly like
   `app/components/Org/PublicLanding.vue`). Keep the top AppNav in BOTH modes.
4. **Mobile (`< lg`).** No fixed rail. Fold sidebar nav items into `App/Nav.vue`'s
   mobile sheet (or a slide-over drawer). Dock already handles its own mobile.
5. **Hide the user theme-STYLE picker when org-forced:** in `App/Nav.vue` avatar
   dropdown, conditionally hide `<ThemeSelector>` style options (keep light/dark mode
   only if trivial). Do not add new toggles.

## Acceptance criteria
- Classic-themed org: workspace shows the classic palette + a collapsible left sidebar
  (collapsed = icons + tooltips); NO dock; top bar retained; mobile nav works; style
  picker hidden.
- Modern-themed org: unchanged (dock + modern palette).
- Luxury-themed org: sidebar (matches landing behavior).
- Active route highlights correctly; module-gated items hidden identically to the dock;
  admin vs member item sets correct; board sections use the same theme (consistent).
- No hydration mismatches; SSR renders the correct nav + theme on first paint.

## Verification
- Preview server on :3000 — use browser-preview tools. **NOTE:** in the headless
  preview, `requestAnimationFrame` is FROZEN, so GSAP tween PROGRESS can't be observed
  (only `gsap.set` endpoints apply). Verify endpoints + logic via computed styles;
  confirm motion in a real foreground browser.
- To preview a classic workspace: ensure an org's `settings.theme` is 'classic'
  (`1033-lenox` is classic) and log in as a member/admin of it. `/{slug}` clean root
  renders the workspace for members/admins.
- Run typecheck/build before finishing.

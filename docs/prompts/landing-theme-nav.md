# Prompt: theme-specific landing navigation (editorial sidebar + macOS dock)

> Paste this into a new session. It assumes the org public-landing redesign is
> already shipped (PRs #287–#291). Plan before building (EnterPlanMode).

## Goal

The public landing (`app/components/Org/PublicLanding.vue`, shared by
`app/pages/[slug]/index.vue` and the custom-domain `app/pages/index.vue`)
currently uses ONE navigation chrome for every theme: a right-hand glass drawer
(`app/components/Org/Landing/LandingDrawer.vue`) opened by a hamburger, plus an
avatar. Make the navigation **theme-specific**:

1. **Classic / Luxury (editorial)** → a persistent **left sidebar** like
   **1033lenox.com** (owner's reference; code at `~/Sites/1033/main`). Vertical,
   always-visible on desktop, editorial type (Bauer Bodoni headings, ultra-wide
   tracked labels, hairline rules). Collapses to a drawer/overlay on mobile.
2. **Modern (iOS)** → a **floating macOS-style dock**: bottom-centered, frosted
   glass, rounded, app-style icons that **magnify on hover**, using the modern
   color story (cyan accents, soft layered shadows). Mobile: a slimmer floating
   bar or the existing drawer.

Both must keep working for logged-out visitors AND logged-in non-members, and
must not interfere with the chromeless layout (the landing renders under the
`auth-blank` layout — no app header/footer).

## What to reuse (don't reinvent)

- **Theme detection**: the active theme is an `html` class — `theme-classic-*`,
  `theme-luxury-*`, `theme-modern-*` (set by `useTheme().forceThemeStyle` from
  `org.settings.theme`). Drive the nav variant off the same signal. Tokens live
  in `app/assets/css/theme.css`; landing aesthetic layer in
  `app/assets/css/landing.css`; glass utilities in `app/assets/css/glass.css`.
- **Nav content & behavior** already in `LandingDrawer.vue`:
  - Explore anchors (Home/Amenities/Listings/Board/Contact, conditionally shown).
  - The **locked "Member portal"** section (Dashboard, Announcements, Documents,
    Meetings, Payments, Requests, Rules, Polls, Directory) filtered by
    `org.modules` (missing/null = enabled); lock target = logged-out → `/auth/login`,
    logged-in non-member → `/{slug}/request-join`.
  - Footer auth actions: login / request access / create account.
  - **Member terminology** via `shared/utils/terminology.ts`
    (`orgMemberNoun(org.type)` → Resident vs Member).
  - Avatar for signed-in users: `app/components/Org/Landing/LandingAvatar.vue`.
  Extract this shared nav model (links, portal list, terminology, auth actions)
  into a composable or shared child so the sidebar and dock both consume it —
  avoid duplicating the lists in three places.

## Suggested structure

- New `app/components/Org/Landing/LandingSidebar.vue` (editorial) and
  `LandingDock.vue` (macOS dock). Keep `LandingDrawer.vue` for mobile fallback
  (and/or the modern mobile case).
- A small `useLandingNav(organization, slug, user)` composable returning
  `{ exploreLinks, portalLinks, lockHref, memberNoun, isModuleEnabled }` — single
  source of truth, reused by drawer + sidebar + dock.
- In `PublicLanding.vue`, pick the chrome by theme: classic/luxury → sidebar
  (with the hero/content offset to make room on desktop, e.g. `lg:pl-64`);
  modern → dock; mobile → drawer. The hero glass-widget row, scroll cue, and
  content sections stay as-is.

## macOS dock specifics (modern)

- Bottom-centered, `position: fixed`, glass (`backdrop-filter` blur), rounded-2xl,
  modern shadow tokens. Items = the portal sections (locked) + Home + an
  Inquire/Contact action + avatar/login.
- Magnify-on-hover (scale the hovered icon and gently its neighbors) — pure CSS
  `:hover` scale is fine; a JS distance-based magnification is a nice-to-have.
- Cyan accent (`--theme-accent-primary` in modern), labels as tooltips on hover.
- Respect `prefers-reduced-motion` (no magnify). Hide/condense on small screens.

## Editorial sidebar specifics (classic/luxury)

- Fixed left column (~`16rem`) on `lg+`; the page content gets matching left
  padding. Cream/parchment surface per theme tokens (NOT the dark glass — the
  sidebar is part of the editorial page, like 1033lenox.com), terracotta/brass
  hairline dividers, serif section headers, ultra-wide tracked nav labels.
- Top: org logo/name. Middle: Explore + locked Member portal (with lock icons).
  Bottom: login / request access / create account + avatar when signed in.
- On `< lg`: hide the sidebar, show the existing hamburger → drawer.
- NOTE: legibility — unlike the dark hero drawer, the sidebar sits on a light
  editorial surface, so use `t-text*` tokens (dark text), not white.

## Acceptance / verification

- All three themes: nav renders correctly, links work, locked portal shows lock
  icons + routes correctly (login vs request-join), terminology adapts
  (residential "Resident" vs commercial "Member").
- Chromeless layout intact (no HOA Connect app header/footer on the landing).
- Mobile: a working condensed nav in every theme.
- `pnpm build` passes; screenshot each theme via the preview MCP (classic
  sidebar, modern dock) on a real org slug (e.g. `605-lincoln` = commercial →
  modern dock test; set a residential org to classic for the sidebar).
- Respect reduced-motion; basic a11y (focus states, aria on toggles).

## Reference

- Inspiration: 1033lenox.com; local code `~/Sites/1033/main`.
- Current landing: `app/components/Org/PublicLanding.vue`,
  `app/components/Org/Landing/*`, `app/assets/css/{theme,glass,landing}.css`.
- Memory: `memory/org-landing-redesign.md`.

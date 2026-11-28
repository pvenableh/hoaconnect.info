# Plan — Apple platform direction for HOA Connect

**Status:** Sessions 1 (code side; device walk pending), 2 and 3 done · **Author:** Peter + Claude · **Date:** 2026-11-27

This plan follows Earnest's `docs/apple-platform-direction-plan.md`, whose eleven phases are all on Earnest's `main`.
That file holds the Apple evidence (HIG and WWDC25/26 links, §2) and the as-built notes (§6–§6i); this plan cites it as
**E§n** and does not repeat it.

**How HOA Connect was read.** A survey agent read the repo at `1ed274cb` on 2026-11-27, and the counts in §1 and §3 were
re-run by grep afterwards. Anything from the survey alone is marked _(survey)_; anything nobody checked is in §8. This
file is the source of truth for the work: update the §6 table at the end of each session.

## 1. Where HOA Connect starts

HOA Connect is ahead of where Earnest started, so this is a shorter plan. Already in step with Apple, keep as is:

- **Materials are named and gated.** `.material-bar` / `-menu` / `-sheet` / `-solid` in `earnest-ui.css`, and
  `audit:materials` keeps `backdrop-filter` in that file _(survey)_. Cards are `.ios-card` (104 files).
- **Motion has tokens.** `--spring`, `--spring-out`, `--motion-*` in `variables.css`, twinned in `core/shared/motion`
  with a drift test _(survey)_. 40 `cubic-bezier(` literals in 12 files, against Earnest's 199.
- **Navigation is one registry** (`core/shared/nav/registry.ts`) feeding the dock, pills, Spotlight and the gate; push
  and pop transitions are direction-aware; the page title collapses _(survey)_.
- **Zoom is allowed** (`maximum-scale=5`, `core/nuxt.config.ts:392`), `viewport-fit=cover` is set, the manifest has four
  shortcuts, and the sheet and slide-over both trap focus with reka-ui `FocusScope`.

Three things to settle before building, because they change what the gap is:

| Looks true                                       | What the code says                                                                                                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push is done (round 3 says "code shipped")       | `docs/push-verification.md` has 20 unchecked boxes: nothing was confirmed on a real phone _(survey)_.                                                                                                       |
| The device's Reduce Transparency turns glass off | Earnest found on Peter's iPhone that iOS does not expose `prefers-reduced-transparency` or `prefers-contrast` to a page at all (E§7). If that holds here, those rules are dead on iOS and no switch exists. |
| The four materials are the system the app uses   | No `.vue` file under `app/` names a `material-*` class (grep, 0 files). They may be applied inside `earnest-ui.css` or from `core/`; session 1 finds out which.                                             |

No native shell exists (no Capacitor, no Swift) _(survey)_. Earnest parked widgets, Live Activities, App Intents and
Spotlight actions for that reason (E§1, decided 2026-11-26). This plan assumes the same for HOA Connect; say so if not.

## 2. Apple's direction

Unchanged from E§2: glass is a layer for chrome, colour is rationed, shapes are concentric, navigation floats and gets
out of the way, sheets have detents, every size is a window, every command has a key, accessibility settings reshape the
material. Read E§2 for the links.

## 3. The gaps

Ordered by how much a person feels them. HOA members skew older than Earnest's users, which moves H1 and H2 up.

| #   | Gap                                                                                                                                                                                                                  | E§2 item | Where                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| H1  | **Push is unproven on a device**, and the service worker must be alive for it: no declarative push (`web_push` appears nowhere in `core/`).                                                                          | 8        | `docs/push-verification.md`, `core/public/sw.js`    |
| H2  | **Increase Contrast and Reduce Transparency are thin, and probably unreachable on iOS.** `prefers-contrast` is in 2 files, `prefers-reduced-transparency` in 5, against 86 `backdrop-filter` hits. No in-app switch. | 9        | `earnest-ui.css`, `App/AppearanceSettings.vue`      |
| H3  | **The installed app is locked to portrait** (`core/shared/pwa/manifest.ts:69`), and only the bottom safe-area inset is used (5 places); top, left and right appear nowhere. Unlocking needs the side insets first.   | 6        | `manifest.ts`, `layouts/auth.vue`, `App/Dock.vue`   |
| H4  | **Reduced motion switches motion off.** `variables.css` flattens every duration to 1ms (`variables.css:72-82`); Apple swaps slides for short fades. No ratchet stops new easing literals.                            | 9        | `core/app/assets/css/variables.css`                 |
| H5  | **Width is decided in three places.** `BottomSheet.vue:67` (768), `Dock.vue:38` (767), `AccountMenu.vue:49` (639), each its own `matchMedia`. No shared width class, and no pointer axis.                            | 6        | those three files                                   |
| H6  | **The dock never gets out of the way.** `Dock.vue` has no scroll handling; no soft edge where content passes under it.                                                                                               | 3, 4     | `App/Dock.vue`                                      |
| H7  | **Sheets have one height and do not guard edits.** No detents, and nothing in `BottomSheet.vue` tracks unsaved changes. 52 `AppDialogContent` uses sit beside 25 sheets _(survey)_, so some forms are dialogs.       | 5        | `App/BottomSheet.vue`, `scripts/audit-form-dialogs` |
| H8  | **Slide-overs are always modal.** `SlideOverStack.vue:318` is `aria-modal` at every width; no inspector beside the list.                                                                                             | 5, 6     | `App/SlideOverStack.vue`                            |
| H9  | **One shortcut.** ⌘K in `Spotlight.vue:256` is the only global key; no registry, no list.                                                                                                                            | 7        | `App/Spotlight.vue`                                 |
| H10 | **Pointer is an afterthought.** Six files query `pointer` or `hover`; targets are one size for finger and mouse.                                                                                                     | 6, 9     | app-wide                                            |
| H11 | **Haptics do nothing on iPhone.** `useHaptic.ts` is `navigator.vibrate`, which iOS Safari lacks, as the file says.                                                                                                   | —        | `core/app/composables/useHaptic.ts`                 |
| H12 | **Glass as a layer is unaudited for content.** `audit:materials` gates where blur is written, not what wears it. Earnest needed a mockup and a sweep (E§6i); HOA Connect may need only a check.                      | 1, 2     | `earnest-ui.css`, `scripts/audit-materials.ts`      |

Not gaps: typography. Proxima Nova and the `type-*` scale are the brand; this plan does not move to system fonts.

## 4. What to adopt, per width

Lay out by **width class**, never by device: **compact** < 640px, **regular** 640–1023px, **wide** ≥ 1024px, with
`pointer: fine` as a separate axis (E§4). HOA Connect's 768px line moves to these in session 4.

| Surface       | Compact                                                                                    | Regular                 | Wide                                             |
| ------------- | ------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------ |
| Navigation    | The dock. Add: folds on scroll down, returns on scroll up or tap; soft fade above it.      | The dock (decision D2). | The dock (decision D2).                          |
| Detail        | Full-screen push (today).                                                                  | Modal slide-over.       | Inspector beside the list from 1280px, no scrim. |
| Create / edit | Bottom sheet, medium and large detents, drag on the header, confirm before discarding.     | Centred form sheet.     | Centred card; ⌘↩ saves, Esc cancels.            |
| Targets       | 44px.                                                                                      | 44px.                   | 28px under `pointer: fine`, with hover.          |
| Keyboard      | Works when a keyboard is attached.                                                         | Same.                   | ⌘K, ⌘N, ⌘F, ⌘, and ⌘/ for the list.              |
| Installed app | Shortcuts, badge, declarative push, any orientation.                                       | Same.                   | Same.                                            |
| Accessibility | All widths: a Solid surfaces switch; Increase Contrast gives borders; Reduce Motion fades. |                         |                                                  |

## 5. Decisions for Peter

- **D1. Native shell.** Assumed parked, as in Earnest. Homeowners may expect a store app more than agency staff do.
- **D2. The dock at regular and wide.** The dock is HOA Connect's design at every width (role-first plan, session 18).
  Earnest built a tab row at regular and a rail at wide. Recommendation: keep the dock, build nothing, revisit only if
  session 4's width classes show it crowding at 640.
- **D3. ⌘F.** In Earnest it now opens Spotlight and takes the browser's find-in-page away (E§6f). Recommendation: leave
  ⌘F to the browser here; governing documents are long text people search.

## 6. Sessions

Legend: `[ ]` not started · `[~]` in progress · `[x]` shipped and green. Each session names its model and its whole
reading list; do not survey the repo. Earnest paths are under `~/Sites/earnest/earnest`.

| Session | What                                                                                                                                                                                                                                                                                  | Closes  | Model      | Read first                                                                                             | State |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- | ------------------------------------------------------------------------------------------------------ | ----- |
| 1       | **Truth on a device.** Peter walks `push-verification.md` on his iPhone. Copy Earnest's `public/media-probe.html` and read what iOS reports with Increase Contrast and Reduce Transparency on. Find where `material-*` is applied. Add `apple-mobile-web-app-title`.                  | H1 part | Sonnet 5.5 | `docs/push-verification.md`; `earnest-ui.css:1298-1413`; `core/nuxt.config.ts:385-400`                 | [[~]   |
| 2       | **Solid surfaces.** Every `backdrop-filter` rule answers Reduce Transparency and Increase Contrast. Appearance gains a per-device Solid surfaces switch that applies the same rules by attribute, stamped before first paint. Port Earnest's PostCSS copy so rules stay written once. | H2      | Sonnet 5.5 | E§7 third bullet; Earnest `scripts/postcss-solid-surfaces.ts`, `useSolidSurfaces`; `useAppearance.ts`  | [[x]   |
| 3       | **Motion that degrades.** Under reduced motion, slides become 150ms fades (sheet, slide-over, page push). Add `audit:easing` to `audit:all` at today's count and lower it.                                                                                                            | H4      | Sonnet 5.5 | E§6b; `variables.css:50-85`; `core/shared/motion/index.ts`; Earnest `scripts/audit-easing.ts`          | [[x]   |
| 4       | **Width classes and orientation.** One composable returns `widthClass` and `pointer`; the three `matchMedia` sites read it. Add left, right and top safe-area insets to the shell, dock and sheet, then drop `orientation` from the manifest. No visual change at a phone upright.    | H3, H5  | Opus 5.5   | E§6c first bullet; Earnest `app/composables/useAppsMode.ts`; `Dock.vue:30-45`; `BottomSheet.vue:60-75` | [ ]   |
| 5       | **The dock gets out of the way.** Compact only: fold on scroll, return on scroll up, tap, focus or route change; a soft scroll edge above it. Hold the page's bottom padding while folded (E§6e "two heights").                                                                       | H6      | Opus 5.5   | E§6e; `App/Dock.vue`; `layouts/auth.vue:225-241`                                                       | [ ]   |
| 6       | **Sheets.** Detents, header drag, unsaved-changes confirm through `useConfirm()`, ⌘↩ submit, only the topmost sheet hears keys. Then sort the `AppDialogContent` uses into forms, confirms and viewers, and move the forms.                                                          | H7      | Opus 5.5   | E§6d; Earnest `app/components/apps/AppBottomSheet.vue`; `App/BottomSheet.vue`; `audit-form-dialogs.ts` | [ ]   |
| 7       | **Keyboard and pointer.** A shortcut registry, the standard set per D3, a ⌘/ list generated from it, `--target-min` 44px / 28px and a `.hit-target` helper.                                                                                                                           | H9, H10 | Sonnet 5.5 | E§6f; Earnest `app/composables/useShortcuts.ts`, `shared/shortcuts.ts`; `Spotlight.vue:240-270`        | [ ]   |
| 8       | **Inspector.** The slide-over docks beside the list from 1280px: no scrim, no trap, no `aria-modal`; same-type rows re-point it with `router.replace`. Needs session 4.                                                                                                               | H8      | Opus 5.5   | E§6g; Earnest `app/components/apps/AppSlideOverStack.vue`; `SlideOverStack.vue`; `SlideOverShell.vue`  | [ ]   |
| 9       | **Installed app.** Declarative push beside the service-worker path; launch intents so each manifest shortcut opens its surface and consumes its param; an iOS haptic path if §8's item checks out. Needs session 1's device results.                                                  | H1, H11 | Sonnet 5.5 | E§6h; `core/public/sw.js`; `core/shared/pwa/manifest.ts`; `usePush.ts`; `useHaptic.ts`                 | [ ]   |
| 10      | **Glass as a layer.** List what wears a material or blur outside chrome. If the list is short, fix it and add a content gate like Earnest's `audit:glass-content`. If it is long, mock it and get Peter's yes before any sweep.                                                       | H12     | Opus 5.5   | E§6i; `earnest-ui.css:1298-1413`; `scripts/audit-materials.ts`; `docs/ux-standards.md`                 | [ ]   |

Why this order: 1 is a question whose answer shapes 2 and 9. 2 and 3 are CSS and config, and serve the members most
likely to need them. 4 is the hinge for 5, 6 and 8. 10 is last because it may restyle content and should be argued from
a list, not found mid-sweep.

**Rules every session inherits**

- The house rules: husky runs `audit:all`; never raise an audit baseline; `ui/` stays stock, changes go in `App/`
  wrappers; theme tokens and `type-*` only.
- A surface feels instant only if its endpoint does not queue behind its own access check (E§5, a rule that came from
  HOA Connect's approvals endpoint). Sessions 5 and 9 touch chrome counts; time them the same way if they change a read.
- Check in the Browser pane on the demo orgs (`pnpm seed:demo`, Harborview Lofts and The Beaumont Residences) at 375,
  820 and 1440, light and dark, and write what was and was not checked into §7.

## 7. As built

One subsection per session, in Earnest's form: what changed, what was checked and how, what was not checked.

### Session 1 — Truth on a device (2026-11-27, code side; device walk pending)

**What changed.**

- `public/media-probe.html`: Earnest's probe, copied unchanged but for its header comment. Static, no app code; it lists
  what the browser reports for `prefers-reduced-transparency`, `prefers-contrast`, reduced motion, inverted and forced
  colours, colour scheme and display mode, and four swatches that turn green only if CSS applies the query.
- `apple-mobile-web-app-title`: a default of "HOA Connect" in `core/nuxt.config.ts`, and per host in
  `useOrgBranding.ts` beside `theme-color`, from a new `homeScreenName` (settings title, then org name, then
  `companyName`). That is the chain the manifest's `short_name` uses, so the name iOS offers on Add to Home Screen
  matches the manifest. It is not `siteName`: on the platform host that falls back to `siteTitle`, "HOA Connect -
  Premier Property Management App", too long for an icon.

**Where `material-*` is applied: nowhere.** No `.vue`, `.ts` or `.js` file in `app/` or `core/` names `material-bar`,
`-menu`, `-sheet`, `-solid` or `-highlight` (grep, 0 files). The app wears the older aliases that share their rules in
`earnest-ui.css`: `glass-surface glass-surface--strong` (the sheet material) on 21 files, chiefly the `App/` wrappers for
dialog, sheet, popover, select, dropdown, tooltip, combobox, confirm and bottom sheet, plus the four auth forms;
`glass-surface` alone (the menu material) only in `Responsibilities/Map.vue` and `MapSlider.vue`; `glass-bar` (the bar)
only in `App/Nav.vue`; `glass-active-thumb` (the highlight) in 7; `glass-btn-primary` from `button-variants.ts`.

**Found for session 2.** The `prefers-reduced-transparency` block in `earnest-ui.css` lists `.material-bar`,
`.glass-bar`, `.material-menu`, `.material-sheet` and the toast, but not `.glass-surface` or `.glass-surface--strong`.
So every dialog, sheet, popover and menu keeps its blur under Reduce Transparency even in a browser that reports it.
Session 2 should rename the uses to `material-*` or add the aliases to every solid rule; either way the rule must name
what the templates name. (Only lines 1298–1413 were read; the scoped-blur block after them was not.)

**Checked, and how.** On the dev server: `/` serves one `apple-mobile-web-app-title` of "HOA Connect" (unhead keeps
one tag, the composable's); `/demo` serves "Harborview Lofts" and `/demo-classic` "The Beaumont Residences";
`/media-probe.html` answers 200 `text/html`; `/api/manifest.webmanifest` on the platform host has `short_name` "HOA
Connect". ESLint on both files (one existing warning, unused `route`) and `audit:all` (21 green). The Browser pane
refused the localhost tab this session, so checks were by `curl`; nothing here changes layout, so no 375/820/1440 pass.

**Not checked — Peter's device walk.**

- [ ] Media probe, Safari tab and Home Screen, with Reduce Transparency, Increase Contrast and Reduce Motion each
      toggled. Needs this commit deployed. Record per query: supported or not, and whether it changes live.
- [ ] `docs/push-verification.md`: "Before you start" and the iPhone row. Record in its Record table.
- [ ] Add to Home Screen on a community host offers the community's name, not "HOA Connect".
- [ ] The haptic switch-checkbox from §8, if convenient: it decides whether session 9 builds an iOS haptic path.

When those are in, write the results here, tick session 1 in §6, and move the §8 items they settle.

### Session 2 — Solid surfaces (2026-11-27)

Run before session 1's device results, because it builds both halves either way: the media rules, for a browser that
reports the settings, and the switch, the only route on iOS if Earnest's finding holds here.

**What changed.**

- **Every blur answers both settings.** Each `@media (prefers-reduced-transparency: reduce)` block now reads
  `(prefers-reduced-transparency: reduce), (prefers-contrast: more)`, as in Earnest: Increase Contrast also makes the
  glass opaque. Twelve existing blocks across `earnest-ui.css`, `theme-app.css`, `SlideOverShell.vue`, `SlideOverStack.vue` and
  `SubNav.vue`.
- **The materials block names what the templates wear.** The block after Material v2 sets `--mat-bar-fill`,
  `--mat-menu-fill` and `--mat-sheet-fill` to 100% (`:root` and `.dark`), so each surface keeps its own ground (bar:
  elevated; menu and sheet: card) and stops showing through. It also drops the blur from `.glass-surface`,
  `.glass-surface--strong` and `.dark .glass-surface--strong`. Before, those three re-added their blur after the older
  block near the top of the file, so every dialog, sheet, popover, menu, the dock and the auth cards kept their glass
  under Reduce Transparency even where the browser reported it.
- **The public site too.** `.glass-widget`, `.landing-drawer`, `.landing-glass-btn` (earnest-ui.css), `.landing-blur-sm`
  / `-md`, `.landing-cta`, `.landing-dock`, the modern-theme widget (landing.css) and the drawer CTAs
  (`LandingDrawer.vue`) lose their blur. Controls over a photo take `--landing-solid-ground`, a near-black token in
  landing.css, so the white label holds on any image; the drawer and the dock take `--theme-bg-elevated`.
- **Increase Contrast edges reach the menus.** Reka writes an inline `outline: none` on every popper, which beat the
  edge rule, so menus, popovers, selects and comboboxes never got their edge. The edge is now `!important`, and the rule
  also names `.material-*`.
- **Solid surfaces.** Appearance gains a fourth row (`AppearanceSettings.vue`, `data-appearance-solid`). It is per device:
  `useSolidSurfaces` stores `app-solid-surfaces` in localStorage and toggles `data-a11y-solid` on `<html>`. A head script
  in `core/nuxt.config.ts` stamps the attribute before first paint on every page, the public site included. The key,
  the attribute and the script live in `core/shared/a11y/solid-surfaces.ts`.
- **The rules stay written once.** `core/build/postcss-solid-surfaces.ts` (Earnest's plugin, wired in
  `core/nuxt.config.ts` `postcss.plugins`) copies every block whose query uses either setting behind the attribute, at
  the original specificity. One change from Earnest: a selector that starts with `[data-` is no longer taken for
  `<html>`. Here `[data-slot="dialog-overlay"]` sits on the element, and treating it as the root left the dialog scrims
  blurred under the switch. Only `[data-tint…]` counts as the root now.
- **Tests.** `tests/build/postcss-solid-surfaces.test.ts` (Earnest's, plus the `data-slot` case) and
  `tests/build/solid-surfaces-coverage.test.ts`. The second fails if any blur in a stylesheet or Vue `<style>` (outside
  `ui/`) has no `backdrop-filter: none` twin under both settings, or if a block answers Reduce Transparency alone. It
  checks that the twin exists, not that it wins the cascade.

**Checked, and how.** In the Browser pane, signed in as the demo user on Harborview Lofts (`/demo`):

- The switch sets the attribute and the key. After a reload the head script (first script in `<head>`) has the
  attribute on before the app mounts.
- With the switch on, no element on the dashboard has a `backdrop-filter`: not with the Create menu open, not with
  Spotlight open. The bar, dock, pills and menu are opaque with a drawn edge; Spotlight's scrim is a flat 60% black.
- Checked at 375 dark, 820 light and 1440 light. With the switch off at 1440, the bar, pills and dock blur again.
- On the login page, test elements wearing every glass and landing class go opaque, light and dark, and the auth card
  goes from 92% to solid white.

Also run: `audit:all` (21 green, after the near-black moved into a token), `pnpm test` (310 files, 5033 tests),
`typecheck` (exit 0). A production build has 71 gated rules in the emitted CSS, unprefixed `backdrop-filter: none` kept.
The build ran out of memory at Node's default heap after writing the client CSS, and finished with
`NODE_OPTIONS=--max-old-space-size=8192`. Whether that OOM predates this session was not checked; Vercel builds with
its own memory.

**Not checked.**

- The media-query path itself: the pane cannot emulate either setting (§8), so only the attribute copies were exercised.
  The coverage test is what ties the two together.
- The public landing pages in the pane. Their classes were checked on test elements, not on a rendered community page.
- A slide-over and the bottom sheet open with the switch on. Their rules are in the coverage test, but they were not
  opened.
- On a device. Session 1's probe decides whether the media rules ever fire on iOS; whatever it says, the switch is the
  route there and wants one look on the iPhone.

### Session 3 — Motion that degrades (2026-11-27)

**What changed.**

- **A fade token.** `--motion-fade: 150ms` in `variables.css` and `DURATION.fade` in `core/shared/motion`, twinned like
  the rest (`motion-tokens.test.ts`). It is the one duration the reduced-motion block does not collapse to 1ms; the
  floor for everything else stays as it was.
- **Page push, pop and floor moves** (`main.css`): under reduced motion, no transform; the leaving and entering views
  cross-fade on opacity over `--motion-fade`. Before, they swapped with no transition at all. `motion-kit-a.test.ts`
  now pins the fade instead of `transition: none`.
- **Slide-over stack** (`SlideOverStack.vue`): this one was a bug. The panels' inline transition used a 400ms literal,
  which the token block cannot reach, so under reduced motion they still slid for 400ms on a linear curve. Now
  `usePreferredReducedMotion` (reactive) keeps every panel at the identity transform and moves only opacity over
  `DURATION.fade`. The panel behind keeps its 0.6 dimming, and the backdrop fades on the same timing. The unmount
  timers follow the fade (182ms, not 432ms). The shell's FLIP flight was already skipped under reduced motion.
- **Bottom sheet**: it already faded instead of rising; its 160 / 140ms fades now read `--motion-fade`.
- **`audit:easing`** (`scripts/audit-easing.ts`, in `audit:all`, ported from Earnest on `audit-kit`): counts every
  `cubic-bezier(` outside comments in `app/**` and `core/**`, except the five house tokens in `variables.css`, the JS
  home `core/shared/motion/index.ts` and `ui/`. **29 at HEAD → 16**:
  - Deleted as unused (no reader anywhere): `--bounce`, `--curve`, `--bounce2`, `--hoverEasing`, `--returnEasing`, and
    `--theme-transition-slower` (three definitions, plus its line in theme.css's reduced-motion block).
  - The four charts' settle (`0.22, 1, 0.36, 1` in Meter, Ring, Sparkline and StatusTrack) is now
    `var(--ease-out-expo)`, a near-identical expo-out.
  - theme.css's `var(--spring, cubic-bezier(…))` lost its fallback.
  - The 16 left are the landing site's editorial ease (landing.css, LandingNav, LandingDrawer), the
    `--theme-transition-*` scale in theme.css, and `Payment/Methods.vue`.

**Checked, and how.** In the Browser pane, signed in as the demo user on Harborview Lofts.

- **Page moves.** The reduced-motion rules were switched on through the CSSOM (§8). The push, pop, floor and neutral
  classes then compute to `opacity 0.15s`, `transform: none` and opacity 0 at the from/to poses. `--motion-fade` stays
  150ms while `--motion-page` drops to 1ms and `--spring` to linear. Before the switch, the push still computed
  `translateX(100%)` on the spring.
- **Slide-over.** `matchMedia` was stubbed to report reduced motion, and the stack was remounted by routing through a
  page on another layout. Opening a request through `?slide=request:…`, the panel stayed at the identity matrix. Its
  opacity read 0.11, 0.74 and 1.00 at 60, 110 and 250ms, with the backdrop in step. On close it read 0.89 and 0.15 at
  60 and 120ms, and was unmounted by 220ms. With the stub removed and the stack remounted, the same panel slid in on
  the spring (`translateX` 520px at 80ms, 80px at 200ms, settled by 700ms).
- **Sheet.** The served stylesheet carries the sheet's reduced-motion animations on `var(--motion-fade, 150ms)`.

Also run: `audit:all` (22 green, easing at 16), `pnpm test` (310 files, 5034 tests), `typecheck` (exit 0).

**Not checked.**

- A real Reduce Motion setting. The pane cannot emulate it, so the CSS was switched by CSSOM and the stack by a stub. On
  the iPhone, the media probe's reduced-motion swatch says whether iOS reports it to a page; Earnest's notes do not
  record that row.
- An actual page navigation under reduced motion. The computed rules were checked, and the settle hooks end on the
  shorter transition by construction, but no push was watched with the rules on.
- The bottom sheet opened under reduced motion: only its CSS was read.
- The charts on the new curve were not looked at; the change is a near-identical expo-out.

## 8. Lessons from Earnest, and what is not verified

Carry these over; each cost Earnest a round.

- The Browser pane cannot emulate `prefers-contrast`, `prefers-reduced-transparency` or reduced motion. Earnest switched
  the rules on through the CSSOM (E§6a). A hidden pane stalls `requestAnimationFrame`, so motion checks need it visible.
- A sheet released mid-drag jumped because `max-height` sprang from its limit, not its shown height (E§6d, Motion).
- Escape aimed at a teleported menu closed the menu and the sheet under it; keys from outside the sheet belong to that
  layer. The shadcn `Button` has no default `type`, so inside a new `<form>` it submits (E§6d).
- Shrinking the page's bottom padding mid-scroll reads as a scroll up and reopens a folded bar (E§6e).
- A docked inspector that pushes history per row makes Close step back through every row looked at (E§6g).

Not verified:

- That `prefers-contrast` and `prefers-reduced-transparency` are dead on iOS in HOA Connect too. Earnest saw it on one
  iPhone on 2026-11-27. Session 1 checks.
- An iOS haptic path. A hidden `<input type="checkbox" switch>` toggled through its label is reported to tick on iOS
  17.4 and later; no Apple or WebKit page was read for it. Test on a device before session 9 builds on it.
- The dialog and sheet counts in H7, and which `AppDialogContent` uses are forms: from the survey, not from reading the
  files. (`BottomSheet.vue` already has its own reduced-motion fade; H4 is about the surfaces that only read the
  tokens.)
- Whether iOS 26 honours `theme-color` or tints its bars from the page background (E§7). HOA Connect sets `theme-color`
  per org in `useOrgBranding.ts:118`, so this matters more here than in Earnest.
- Which browsers hand ⌘N and ⌘, to a page outside the installed app (E§6f).

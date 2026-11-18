# Role-first UX — Session 12 (Phase 4 part 1, glass as a layer and appearance)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. This is the material itself: which surfaces are glass, the tint in light and dark against the contrast audit, the appearance settings that replace six knobs, and the one attention treatment for solid cards. The phase table names Opus for the material and Sonnet for the sweep, so this session builds the rules and the settings and writes the sweep's prompt (Session 13, Sonnet 5.5) from its own census. Census and grep go to Haiku 5.5 subagents.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s12-glass-appearance.md and carry out the prompt in its code block exactly: Phase 4 part 1 (glass and appearance) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build the first half of Phase 4 (plan §2.4, decisions 4 and 8): glass as a
layer, appearance from six settings to two, a per-person tint colour, the OS
accessibility settings honoured, and one attention treatment for solid cards.
No new route unless a stored preference needs one beyond
/api/user/app-prefs (if so, stop and ask me). No schema:
directus_users.app_prefs is already JSON.

Read, in this order: docs/ux-standards.md, docs/plan-role-first-ux.md §2.4
(all of it, including "Attention on a solid card"), §6 decisions 4 and 8,
the §4 phase table row for Phase 4, and the Session 9 log in §7. Do not read
the rest of the plan.

What exists (read it, do not rebuild):
- The material: core/app/assets/css/earnest-ui.css (glass-surface,
  glass-surface--strong, glass-field, glass-widget, glass-edge, glass-btn*,
  glass-active-thumb, and ios-card, which today sits in the same selector
  list as glass-surface), theme-app.css (the workspace tokens, graded light
  and dark by audit:contrast-pairs), variables.css (motion tokens).
- Light, dark, system: core/app/composables/useAppearance.ts, the one
  writer of the `dark` class; ThemeSelector.vue (used in Nav.vue and
  account.vue with hide-styles).
- The accent: core/shared/branding/accent.ts (hexToHsl, deriveAdminAccent,
  getAdminAccent, accentCssVars), fed by the community's brand colour.
- The six knobs: app/components/App/AppearanceSettings.vue (rendered from
  Nav.vue) over core/app/composables/useAppNav.ts: dock palette (fresh,
  aurora, neutral, vivid), dock position, dock labels, glass chrome
  (`dock.glass`, which Dock.vue reads as `dock-item--solid`), plus light,
  dark and system. Stored per user by core/shared/nav/app-prefs.ts
  (sanitizeAppPrefs, mergeAppPrefs; unknown keys are dropped) through
  GET and PATCH /api/user/app-prefs, cached in localStorage for the first
  frame.
- About ten rules already mention prefers-reduced-transparency or
  prefers-contrast; find them before adding more.
- The public landing (Org/Landing*, LandingBuilder, Marketing) keeps its own
  three styles: out of scope.

Decided (do not reopen): Appearance is Light / Dark / Auto. Tint is On / Off:
off is clear, neutral glass that takes its colour from what is behind it; on
carries a colour and is slightly more opaque, as iOS's tinted glass is. When
Tint is on, a short fixed row of swatches appears; the first is the
community's accent and is the default; each person's choice is stored with
their app prefs and feeds accent.ts as the one place a colour is resolved.
Every swatch has a contrast-checked pair in light and dark, added to
audit:contrast-pairs (that is why it is a fixed set, not a picker). Removed
from the panel: dock palettes (the tint replaces them), the glass chrome
switch (prefers-reduced-transparency decides), the dock label switch
(labels on), and dock position. Glass on: top bar, dock, section pills,
sheets and slide-overs, menus, toasts, and floating controls such as the
register map's rail and slider. Not glass: tables, cards of content, form
fields. No glass on glass. Nested radii share a centre. The accent tint is
reserved for the one primary action per screen. No coloured strip down one
side of a rounded card.

Ask me in ONE message before building, with a recommended answer for each:
1. The swatch set: how many and which colours (recommended: the community's
   accent plus five fixed hues that pass AA in both modes).
2. Tint's default for a new person: on or off.
3. Dock position: gone entirely (bottom only), or kept somewhere outside the
   appearance panel.
4. The `vivid` palette, which the plan does not name: removed with the
   others (recommended).
5. The attention treatment: a faint warning tint across the card, or a
   warning rim that follows the radius (show both in the browser first).
Write the answers into §2.4 as decided, then build.

Build, one commit each, gated as below:

1. The rules, pure and tested: the stored shape in app-prefs.ts gains the
   tint switch and the swatch id (sanitized like the rest; the old dock keys
   are read once and dropped, since no community is live), the swatch list
   and the function that turns a swatch and a mode into the accent
   (accent.ts), and table tests for both. Contrast pairs for every swatch,
   light and dark, in audit:contrast-pairs, all passing.
2. The material: glass-surface and its variants as the floating layer only.
   ios-card leaves the glass selector list and becomes the solid content
   card. Clear and tinted glass from the chosen swatch.
   @media (prefers-reduced-transparency: reduce) turns every glass surface
   solid; @media (prefers-contrast: more) gives them a visible edge. One
   attention class for a solid card, in place of side strips: apply it to the
   four cards in §2.4's census (the map's Unassigned cards, two on
   app/pages/payments/index.vue, one on app/pages/[slug]/payments/index.vue).
3. The settings: AppearanceSettings.vue becomes Appearance (Light, Dark,
   Auto) and Tint (On, Off, and the swatches when on), on the same
   persistence; the four removed knobs go, with their code paths in
   useAppNav.ts and Dock.vue. A person's tint follows them to another device,
   as the dock prefs do today.

Rules: a role never sees a control it cannot use; the public landing is
untouched; a stored value is never one that can be derived; every colour is
a token (no hex in a rule outside the token files); never raise an audit
baseline. If a ratchet goes down, lower its BASELINE in the same commit.

Out of scope: moving glass off every content page (Session 13's sweep,
below), the public site's three styles, role homes (Phase 9).

Learned the hard way in earlier sessions:
- The local dev server talks to the LIVE Directus (DIRECTUS_URL in .env is
  admin.hoaconnect.info). Test as the demo admin (POST /api/demo/login, slug
  `demo`, is_demo). Never change 1033 Lenox. App prefs are per user: the
  demo admin's are shared with anyone using the demo, so put them back.
- The browser pane can be hidden, which pauses animation frames; read motion
  from the DOM, and say it was not watched. It cannot emulate
  prefers-reduced-transparency, prefers-contrast or prefers-reduced-motion:
  check the compiled @media rules and say so.
- /ui-kit cannot be opened in the preview (a signed-in user is bounced);
  update its glass demos anyway and say they were not seen.
- pnpm audit:all reads tracked files: `git add -N` new files before the gate.
- Leaving the admin's "Member" preview on redirects admin routes until Exit.

Local session: work on main, ask before pushing. Verify in the browser
preview at 375, 768 and 1280 px, in light and dark, with Tint on (two
swatches) and off, on the dock, a sheet, a menu, the register's map (rail and
slider over content) and the Payments pages.

Quality gate per commit, run serially: typecheck 0, vitest green, build
green, pnpm audit:all at or under baseline, lint under the warning cap. Run
the typecheck and the build with NODE_OPTIONS=--max-old-space-size=6144.

When done: census, with a Haiku subagent, every content surface still wearing
glass (glass-surface, glass-widget, glass-edge on cards, tables and form
sections in app/ and core/app, not the public landing), and write
docs/prompts/role-first-s13-glass-sweep.md from it for Sonnet 5.5, in this
file's shape: the census as its file list, the rules this session set, and
the same gate. Then update the §7 Status rows (12 shipped, 13 queued), append
to the Session log (shipped, what each role now sees, the five answers,
deviations, operator TODOs), and end your reply with Session 13's "Start it
with" sentence in a code block. Then stop.
```

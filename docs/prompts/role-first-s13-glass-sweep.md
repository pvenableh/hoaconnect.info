# Role-first UX — Session 13 (Phase 4 part 2, the glass sweep)

Model: Sonnet 5.5 (`claude-sonnet-5-5`), medium effort. Session 12 (Opus) built the material, the settings and the rules; this is the sweep the phase table gives to Sonnet: take glass off every content surface the census found, stop per-page accents overriding a person's tint, and put the stray text back on the one left edge. No new material, no new setting, no design calls beyond the ones below.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s13-glass-sweep.md and carry out the prompt in its code block exactly: Phase 4 part 2 (the glass sweep) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build the second half of Phase 4 (plan §2.4): move glass off every content
surface, drop the per-page accent overrides, and put text outside cards on
the one left edge. Session 12 set the rules and wrote the census below; this
session applies them file by file. No route, no schema, no new CSS class, no
new token: everything you need exists.

Read, in this order: docs/ux-standards.md, docs/plan-role-first-ux.md §2.4
(all of it, including the five decisions of 2026-11-18), and the Session 12
log in §7. Do not read the rest of the plan.

The rules (Session 12, do not reopen):
- Glass is the floating layer only: top bar (`glass-bar`), dock, section
  pills and sub-nav, sheets and slide-overs, dialogs, menus, popovers,
  toasts, and controls floating over content (the register map's rail and
  slider). Content is solid: cards of content, page headers and heroes,
  stat tiles, tables, form sections, notices inside a page.
- The solid content card is `ios-card`. A page header is not a box: a
  heading, a description and the actions, with spacing (AppPageHeader or
  AppHeaderOutlet), on the page's left edge.
- A card that needs attention takes `card-attention` (a faint warning tint
  across the card; earnest-ui.css). Never a coloured strip down one side.
- No glass on glass: a card inside a sheet or dialog is not a box at all
  (spacing, a hairline, a heading), per the overlay-boxes rule.
- The colour is the person's tint (useAppearance writes --app-accent-*). A
  page must not set its own accent: remove `accent-*` classes and `accent`
  props in the workspace (the public landing keeps its own).
- One left edge: text outside a card or container (titles, descriptions,
  section labels, counts, toolbar text, summaries, empty and error lines)
  carries no horizontal padding or margin of its own. Text inside a card
  keeps the card's padding. Use gap on a row, not margin-left on its text.
- Every colour is a token; never raise an audit baseline. If a ratchet goes
  down, lower its BASELINE in the same commit.

Census A: content still wearing glass (2026-11-18, Haiku, checked by hand).
Five of these come through one wrapper, app/components/Widget/Glass.vue
(`WidgetGlass` hardcodes `glass-surface p-5`): retire it on content.
 1. app/components/Home/Stacks.vue:110 — dashboard "What needs you" band
    (glass-edge glass-body glass-refract) → ios-card. Its comment (lines
    17-20) records it as a glass-refract adopter: update the comment.
 2. app/components/Boardroom/Header.vue:67 — Board Room header box → no box.
 3. app/components/pages/BoardroomMinutesPage.vue:110 — minutes header box
    → no box.
 4. app/components/Profile/EmailPreferences.vue:90 — the Email section of
    the profile → ios-card (or no box, if the page's other sections have none).
 5. app/components/App/InstallCard.vue:27 — "Add to Home Screen" notice
    (WidgetGlass accent="blue") → ios-card, no accent.
 6. app/components/requests/RequestDetail.vue:328 — embedded discussion
    → ios-card.
 7. app/components/channels/EntityChannel.vue:79 — embedded channel → ios-card.
 8. app/components/channels/ChannelThread.vue:823 — "Posting paused" notice
    → ios-card card-attention.
 9. app/components/channels/ChannelThread.vue:827 — composer, in flow at the
    foot of the thread. Judge: if it stays pinned over scrolling messages it
    is a floating control (keep); if it scrolls with them, ios-card.
10. app/components/pages/StorageManagerPage.vue:560 — file browser area → ios-card.
11. app/components/ai/AiAssistantPanel.vue:488 — credit pack rows inside a
    dialog (glass on glass) → rows with a hairline, no box.
12. app/pages/payments/index.vue:3 — "My Payments" header (WidgetGlass strong)
    → no box.
13. app/pages/[slug]/payments/index.vue:141 — Payments hero with the amount
    due → ios-card (the amount is content).
14. app/pages/[slug]/admin/communications/audience/index.vue:76 — header → no box.
15. app/pages/[slug]/admin/communications/channels/index.vue:32 — header with
    New channel → no box; keep the heading and the button.
16. app/pages/ui-kit.vue:1092 — the kit's "Posting paused" specimen →
    ios-card card-attention.
Also: app/components/ai/AskTheHoa.vue:84 (`ios-card glass-refract`) → drop
glass-refract. Judged allowed, leave alone: the auth cards (LoginForm,
RegisterForm, PasswordResetForm, PasswordResetRequestForm) float over the
auth backdrop; UpdatePrompt, ChannelsPanel, Dock, BottomSheet, AppLibrary,
the assistant takeover (glass-ultra), ChannelThread's search popover, the
map's rail and slider, StorageManagerPage:777 (the floating bulk bar), the
kit's create-verbs menu. Decide with Peter's rules, not a new one, for the
auth-blank state cards: app/pages/[slug]/signup.vue:88 and :93 and
app/pages/unsubscribe.vue:61 (status cards, not forms: probably ios-card).
When no content uses WidgetGlass any more, delete Widget/Glass.vue (check
with a grep, and the unresolved-components audit).

Census A2: per-page accents that override a person's tint (remove each):
- class `accent-violet`: app/pages/[slug]/projects/index.vue:23,
  app/pages/[slug]/projects/[id].vue:33, app/pages/[slug]/admin/projects/index.vue:72,
  app/pages/[slug]/admin/projects/[id].vue:144, app/pages/[slug]/admin/units/[id].vue:135
- class `accent-emerald`: app/pages/payments/index.vue:2,
  app/pages/[slug]/payments/index.vue:138, app/pages/payment/confirmation.vue:2
- class `accent-cyan`: app/pages/[slug]/admin/communications/audience/index.vue:72,
  app/pages/[slug]/admin/communications/channels/index.vue:28
- prop `accent`: app/components/App/InstallCard.vue:29. Leave the `/ops`
  pages' AppStatCard accents (ops is HOA Connect's own console, not a
  community's workspace) unless Peter says otherwise.
After the sweep, if no workspace page uses the `.accent-*` presets at the top
of earnest-ui.css, say so in the log; do not delete them (the public site
may), and do not add a new one.

Census B: text outside a card with its own inset (2026-11-18, Haiku,
checked by hand). The token behind most of it (`--surface-inset`) is
already gone, so this is short:
 1. app/pages/[slug]/rules/index.vue:227 — `px-1` on the section <h2> → drop.
 2. app/components/Director/Layer.vue:267 — `px-4` on the plan error line → drop.
 3. app/components/Director/Layer.vue:337 — `px-1` on the propose error line → drop.
 4. app/components/projects/ProjectGantt.vue:439 — `px-1` on "Add dates…"
    (outside its card) → drop, keep py-3.
 5. app/components/channels/ChannelsList.vue:513 — `px-3` on "No archived
    channels." in the sidebar → drop if the list rows above it carry no
    inset; if the rows do (it is a list, not a card), match them instead.
 6. app/components/projects/ProjectTimeline.vue:133 — `px-2` → drop; the
    component has no users, so say whether it should be deleted (do not
    delete it without asking).
 7. app/pages/ui-kit.vue:612 — `pl-5` on the helper list → `list-inside`.
 8. app/pages/[slug]/governing/review/[document].vue:393 — `ml-2` on "Open
    Full Size" in the toolbar → gap on the row.
Census B covered classes on text elements. While you are on each page in
the browser, also look for the other way a page breaks one edge: a page
root whose own gutter differs from its siblings', or a header outside the
container the cards are in. Fix what you find on the pages you touch, and
list the rest for a later session rather than widening this one.

Build, one commit each, gated as below:
1. Census A and A2: glass off content, per-page accents gone, WidgetGlass
   retired if nothing uses it. The ui-kit's specimens follow.
2. Census B and whatever the browser pass finds on the same pages.

Rules: a role never sees a control it cannot use; the public landing is
untouched (Org/Landing*, LandingBuilder, Marketing, the public pages); every
colour is a token; never raise an audit baseline.

Learned the hard way in earlier sessions:
- The local dev server talks to the LIVE Directus (DIRECTUS_URL in .env is
  admin.hoaconnect.info). Test as the demo admin (POST /api/demo/login, slug
  `demo`, is_demo). Never change 1033 Lenox. App prefs are per user: the
  demo admin's are shared with anyone using the demo, so put them back
  (Session 12 left them empty: Tint on, community swatch, Auto).
- The browser pane can be hidden, which pauses animation frames: a
  screenshot can catch a stagger or a sheet mid-entry. Read opacity from the
  DOM before calling something broken.
- The pane cannot emulate prefers-reduced-transparency or prefers-contrast;
  check the compiled @media rules if you touch them.
- /ui-kit cannot be opened in the preview (a signed-in user is bounced);
  update its specimens anyway and say they were not seen.
- pnpm audit:all reads tracked files: `git add -N` new files before the gate.
- Leaving the admin's "Member" preview on redirects admin routes until Exit.
- A "What's new" dialog may cover the first page after sign-in: Got it.

Local session: work on main, ask before pushing. Verify in the browser
preview at 375 and 1280 px, light and dark, Tint on and off, on every page
you changed: each page's title, description, toolbar and first card share
one left edge (measure getBoundingClientRect().left, do not eyeball), no
sideways scroll at 375, and no content surface left with a backdrop-filter
(getComputedStyle(el).backdropFilter === 'none' on the cards you converted).

Quality gate per commit, run serially: typecheck 0, vitest green, build
green, pnpm audit:all at or under baseline, lint under the warning cap. Run
the typecheck and the build with NODE_OPTIONS=--max-old-space-size=6144.

When done: re-run census A's grep (glass-surface, glass-widget, glass-edge,
glass-refract, WidgetGlass in app/ and core/app, public landing excluded)
and list what remains with a reason for each. Then update the §7 Status row
for Session 13 (shipped) and append to the Session log (shipped, what each
role now sees, deviations, operator TODOs). Then stop.
```

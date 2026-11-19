# Role-first UX — Session 18 (Phase 4 part 4, the dock and focus)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. Five asks from Peter after Sessions 15–17 (2026-11-19), two of them design calls that need a mock-up and one question before building, plus the small leftovers the earlier logs recorded. Sessions 12–17 are local and unpushed; build on them.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s18-dock-and-focus.md and carry out the prompt in its code block exactly: Phase 4 part 4 (the dock and focus) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build Phase 4 part 4 (plan §2.4; Sessions 15–17 in §7 built the account
menu, the phone dock, Search-or-ask and the Building pill). Peter asked on
2026-11-19:

  1. "Messages is now buried. Can we move a button for messages back into
     the header or into the floating dock?"
  2. "Is there a toggle to show/hide app names in the floating dock? I'd
     like them hidden by default."
  3. "The responsibilities map and grid need to hide the items not assigned
     to the user/role selected so it's focused. Also the unassigned items
     need to be able to be hidden; could that be its own toggle? It is very
     hard to read at the moment with all of the responsibilities there."
  4. "The active app in the floating dock is not highlighted: give it an
     accented border or colour differentiation."
  5. "The 'Worth a look' and 'Needs you' callouts are a little much and push
     content down the page. Can we create a condensed concept for that
     content that can be easily collapsed or moved aside?"

Read, in this order: docs/ux-standards.md; docs/plan-role-first-ux.md §2.4
(Glass, Chrome without a bar, One account menu, The dock on a phone) and the
Session 12, 15, 16 and 17 logs in §7. Do not read the rest of the plan. Then
the files named under each item.

── First: look, mock, ask (once) ─────────────────────────────────────────
Sign in as the demo admin (preview server, POST /api/demo/login) and look
at the dock at 375 and 1280 px, the account menu, the dashboard's "What
needs you", the "Worth a look" strip on Members and Projects, and the
responsibilities register (Grid and Map) and the owner page. Then make ONE
Design canvas of mock-ups (the Artifact tool's quickstart, intent
"design"; Session 15 made the last one,
https://claude.ai/artifact/VDipXb8rkn5MBwdGNcJNaR, reuse its look):
  - Messages: (A, recommend) a messages glyph back in the header between
    Search and the avatar, with its own unread badge, at every width (the
    avatar's badge then stops counting messages; the menu's Messages row
    stays or goes, say which); (B) a Messages chip at the dock's right end,
    outside the app list (a slide-over, not an app). Show both at 375 and
    1280.
  - The callouts: two or three condensed concepts for "What needs you"
    (Home/Stacks.vue, the dashboard) and "Worth a look" (the attention part
    of Director/Layer.vue, on Members, Meetings, Payments, Projects, the
    Board Room and others). Recommend one. Candidates: a one-line summary
    chip ("3 need you · 2 worth a look") that expands in place and
    remembers being collapsed per person; a side rail at xl that the
    content does not wrap around, collapsing to the chip below xl; the
    count moved into the section capsule or the page title's meta slot,
    opening a popover. Whatever is picked must keep what is there (the
    items, Propose, Dismiss, Open) reachable in one tap.
Ask Peter both in ONE AskUserQuestion (the canvas link in the question),
recommend one each, then build. Items 2, 3 and 4 need no question; their
defaults are below.

── 1. Messages ───────────────────────────────────────────────────────────
Files: app/components/App/Nav.vue (the right cell), App/AccountMenu.vue (the
badge sum), App/AccountMenuBody.vue (the Messages row), App/Dock.vue if (B).
Same audience as before (showChat: admins, active board members, anyone in a
channel; channels module on). Opens useChannelsPanel(). 44 px target on a
phone. Its badge uses the existing unread count (useChannelUnread).

── 2. App names in the dock, hidden by default ───────────────────────────
This reverses Session 12's decision 3 ("labels on"; the toggle was removed).
Add one switch, "Show app names", to Appearance (App/AppearanceSettings.vue,
in the avatar menu), default OFF. Store it with the tint in the per-user app
prefs (core/shared/nav/app-prefs.ts: a default is never stored, so `true` is
the only value written; sanitize on read and write; extend
tests/server/app-prefs.test.ts). useAppearance owns it like the tint (device
cache, then the account). Dock.vue: labels off → no label line, the pill is
shorter; the hover tooltip (`dock-item__tip`) still names the app on a
pointer, and every chip keeps its aria-label. The phone dock and its Apps
card follow the same switch for the dock row; the card's grid keeps its
labels (a grid of bare icons is not findable). Check the immersive page pad
and the toast offset still clear the shorter dock (they are fixed values:
measure the pill and adjust, or publish its height like useChromeHeight).

── 3. Responsibilities: focus ────────────────────────────────────────────
Files: app/components/Responsibilities/Map.vue (the holder rail, "lit"
jobs), the register page app/pages/[slug]/admin/responsibilities/index.vue
(Grid | Map, `?view=map`), the owner page app/pages/[slug]/responsibilities/
index.vue, and core/shared/responsibilities/map.ts (mapModel) and views.ts.
Today picking a holder (a person or an office) only highlights their jobs;
everything else stays. Build:
  - Picking a holder FILTERS: only jobs that holder holds (directly or
    through an office they sit in, as the map already resolves) stay, in
    both Map and Grid; a clear "Showing Ana's 6 · Show all" line undoes it.
    The selection is in the URL (`?holder=`), so Grid and Map share it and a
    link reopens it.
  - "Unassigned" is its own toggle (a switch or a segmented "Hide
    unassigned"), independent of the holder filter, default SHOWN for an
    admin on the register (they are the work to do) and HIDDEN on the owner
    page; in the URL too (`?unassigned=0`). The admin's register keeps a
    count of hidden unassigned jobs on the toggle so they are not lost.
  - Pure filtering in core/shared/responsibilities (a function over the
    model, table-tested: by person, by office, through an office, the
    unassigned toggle, both together, nothing matching → an empty state that
    says why and offers Show all).
  - The slider through time keeps working with the filter on.

── 4. The active app in the dock ─────────────────────────────────────────
Dock.vue: today only the label's colour marks the open app, and item 2 hides
labels by default, so the chip itself must say it. Give `.dock-item--active
.dock-item__chip` the accent: a 2 px ring in the ink with a 2 px gap
(box-shadow, like the App Library's old active ring), and a faint tinted
fill; Tint off keeps the ring (neutral ink). Same on the phone dock and in
the Apps card. Contrast: the ring against the pill is a UI-fill pair (3:1);
add it to audit:contrast-pairs if a new token is needed. Reduced motion: no
transition on the ring.

── 5. The callouts, condensed ────────────────────────────────────────────
Build the concept Peter picks. Keep Director/Layer.vue's three rules (never
out-shouts the page; collapses; renders nothing when it has nothing).
Collapsed-or-not is a per-person preference (app prefs, like item 2) or
per-device (localStorage, wrapped in try/catch) — say which and why. The
dashboard's "What needs you" and the hub pages' "Worth a look" should read as
one pattern after this. Check every page that renders DirectorLayer in scope
mode and Home/Stacks on the dashboard, at 375 and 1280.

── Leftovers (do after 1–5, one commit, ask Peter the two decisions) ──────
  - Page roots with their own narrower column, so their left edge differs
    at desktop (Session 13 log): components/pages/CommunityLedgerPage.vue
    (max-w-4xl), pages/account.vue (max-w-4xl), pages/settings/subscription.vue
    (max-w-3xl px-6), pages/[slug]/payments/index.vue (container
    max-w-6xl py-8 px-4). Put each on PageContainer's edge; a reading column
    may stay narrower INSIDE it ([&>*]:max-w-3xl, as the minutes page does).
  - Decide with Peter (in the same question as above, or a second one):
    delete app/components/projects/ProjectTimeline.vue (no users)? Give
    app/components/ui/card/Card.vue the ios-card ground instead of its old
    glass-edge rim?
  - Hydration warnings on Members come from AdminPeopleGlance (AppStatCard
    and AppChartCard render a skeleton on the client but not the server):
    fix if it is a one-line mount guard, otherwise record it.

Rules: a role never sees a control it cannot use; the public landing is
untouched (Org/Landing*, LandingBuilder, Marketing, the public pages); every
colour is a token; never raise an audit baseline (lower any that drop, in
the script and the round 3 table); Reduce Transparency and Increase
Contrast keep working; 44 px touch targets on a phone.

Learned the hard way in earlier sessions:
- The local dev server talks to the LIVE Directus. Test as the demo admin
  (POST /api/demo/login, slug `demo`, is_demo). Never change 1033 Lenox.
  App prefs are per user and shared with anyone using the demo: put them
  back afterwards (Tint on, community swatch, Auto, app names at the
  default).
- The browser pane is often hidden, which pauses animation frames: a
  popover's exit, a sheet's rise and a stagger can look stuck. Wait and read
  the DOM before calling something broken.
- resize_window under 768 emulates a phone; reset it to desktop when done.
- Leaving the admin's member preview on redirects admin routes until Exit
  (the banner's Exit button).
- A scoped `display:` rule beats Tailwind's `sm:hidden`: put display in the
  Tailwind classes. Every CSS `font-size:` counts against type-scale: use
  type-* or Tailwind sizes. `t-bg-accent` with `t-text-accent` is an
  invisible label (theme.css says so); use text-primary-foreground or
  t-icon-chip.
- Shell primitives (Dock, Nav, AccountMenu, AccountMenuBody,
  SegmentedControl, BottomSheet, SlideOverShell, DataTable) are exempt from
  raw-buttons; elsewhere use <Button> / <ActionButton>.
- pnpm audit:all reads tracked files: `git add -N` new files before the gate.

Build, one commit each, gated:
1. Messages (after Peter's answer).
2. App names off by default, and the active chip's accent (items 2 and 4).
3. Responsibilities focus (item 3).
4. The callouts (after Peter's answer).
5. Leftovers.

Local session: work on main, ask before pushing.

Quality gate per commit, run serially: typecheck 0, vitest green, build
green, pnpm audit:all at or under baseline, lint under the warning cap. Run
the typecheck and the build with NODE_OPTIONS=--max-old-space-size=6144.

Check each in the browser as the demo admin at 375 and 1280 px, light and
dark; the responsibilities filter also on the owner page; read state from
the DOM (getBoundingClientRect, computed style), not only screenshots.

When done: update the §7 Status row for Session 18 (shipped) and append to
the Session log (shipped, what each role now sees, deviations, what was not
seen, operator TODOs). Then stop.
```

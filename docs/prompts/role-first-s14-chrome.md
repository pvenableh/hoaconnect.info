# Role-first UX — Session 14 (Phase 4 part 3, the chrome)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. This is a design call that reverses part of a Session 12 rule (section pills and sub-nav were listed as glass), changes how a sticky bar behaves over scrolling content, and touches the one material every page sits under. Session 13 (Sonnet) finished the sweep; this is the last piece of Phase 4.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/role-first-s14-chrome.md and carry out the prompt in its code block exactly: Phase 4 part 3 (the chrome) of docs/plan-role-first-ux.md, on main, asking before you push.

```
Build the third part of Phase 4 (plan §2.4, "Chrome without a bar"): the
in-app navigation under the header loses its full-width background, and the
header's gradient goes. Peter asked on 2026-11-18, after seeing Session 13:

  1. The section navigation that shows below the header (the pill bar:
     app/components/App/SubNav.vue, class `app-subnav glass-bar`, sticky,
     full window width, `border-b`) should have a NEUTRAL background and
     must not run the full width of the window. Perhaps remove the background
     itself.
  2. The header's gradient background looks dated.

No route, no schema, no new setting. Tint (Session 12) stays: the person's
colour still drives the dock, the primary button and the active thumb.

Read, in this order: docs/ux-standards.md, docs/plan-role-first-ux.md §2.4
and the Session 12 and 13 logs in §7. Do not read the rest of the plan.
Then read: app/components/App/SubNav.vue, app/components/App/Nav.vue (the top
bar, `app-nav glass-bar`), app/components/App/HeaderOutlet.vue,
app/components/App/SegmentedControl.vue (the other pill control, and the
sliding thumb both use), core/app/composables/useSlidingThumb.ts, and the
`.glass-bar`, `.glass-active-thumb` and page-backdrop rules in
core/app/assets/css/earnest-ui.css and theme-app.css.

First, look (preview, signed in as the demo admin, 375 and 1280 px, light and
dark, Tint on and off) and write down what "the header gradient" is. There
are two candidates and Peter did not say which:
  a. the top bar's own wash: `.glass-bar` paints
     `linear-gradient(accent / 0.08 * --glass-tint, transparent)` over the
     translucent `--theme-nav-bg`; the sub-nav shares it, so the two bars read
     as one tinted block;
  b. the page backdrop behind everything (the blue-to-grey wash that shows
     through the glass at the top of the dashboard).
Take a screenshot of each, say which you think he means, and ask him once
(AskUserQuestion, with the screenshots described) before building. Same for
the sub-nav: put the two options below in front of him, recommend one.

The two sub-nav options (recommend A):
  A. No bar. The pills sit in ONE compact capsule (the same capsule and
     sliding thumb as AppSegmentedControl: neutral fill, hairline rim, the
     active thumb in the tint), left-aligned on the page's one left edge, the
     capsule only as wide as its pills (it scrolls sideways inside a max
     width when there are too many at 375). Nothing spans the window. The
     bar stays sticky; because there is no longer a ground under it, the
     capsule is a floating control and keeps a glass or solid-neutral fill so
     it reads over scrolling content, and a soft fade (mask) sits above the
     content scrolling beneath. The border-b goes.
  B. A transparent bar: no fill, no border, the pills as bare text with the
     active thumb only. Not sticky (it scrolls away with the header region),
     or sticky with only the fade. Simpler, but the section is no longer
     visible while reading a long page.
Neutral means no accent in the fill or the rim: neutral glass or the card
ground, from tokens (a neutral variant of `--theme-nav-bg`, or
`--theme-card-bg`). The active thumb keeps the tint.

The header (top bar): drop the accent wash from `.glass-bar` (the
`linear-gradient(...)` line), leaving a flat translucent neutral bar and a
hairline, so Tint colours the controls and not the chrome. Check the top bar
over the dashboard in light and dark, and with Reduce Transparency's solid
fallback (`--glass-solid`, `.glass-bar` in the reduce-transparency block).
`--glass-tint` still scales the other glass surfaces (dock, sheets, toasts);
do not remove it, and do not change the dock. If the answer to (a)/(b) is the
page backdrop, change that instead and say what changed; keep it neutral, no
gradient, or a very quiet one that does not read as a colour band.

Then update the rule so the docs match the code:
  - §2.4 "Glass" bullet: section pills and sub-nav are no longer listed as a
    glass bar; say what they are now.
  - docs/ux-standards.md: nothing to add unless an audit changes.
  - If `.glass-bar` is now used only by the top bar, say so in its comment.

Rules: a role never sees a control it cannot use; the public landing is
untouched (Org/Landing*, LandingBuilder, Marketing, the public pages, and the
landing dock's fixed "fresh" ramp); every colour is a token; never raise an
audit baseline (contrast-pairs grades theme-app.css: a neutral nav ground
needs a passing pair for tertiary and primary text on it in light and dark);
Reduce Transparency and Increase Contrast keep working (the capsule gets the
outline in `prefers-contrast: more`, like the other glass).

Check on every page that renders the sub-nav (it shows when the active dock
section has child pages: People, Records, Money, Comms and Setup for an
admin; a board seat's Money) and at least one without it (the dashboard):
  - the first pill and the page title share one left edge
    (getBoundingClientRect().left, do not eyeball), 15 px at 375 and 118.5 px
    at 1280 on the standard container; the wide pages (max-w-7xl) too;
  - no sideways page scroll at 375; the capsule scrolls inside itself;
  - the thumb still slides between pills and fades on a section root;
  - the bar stays usable when content scrolls under it (scroll a long page),
    and the page's own sticky parts (toolbars) do not collide with it; read
    their `top` offsets: anything that sticks under the sub-nav hardcodes its
    height, so grep for it (`top-[`, `--subnav`, `sticky`) before you change
    the bar's height;
  - Tint on (default, Violet, Slate) and off; light and dark; Reduce
    Transparency can't be emulated: read the compiled @media rules.

Learned the hard way in earlier sessions:
- The local dev server talks to the LIVE Directus (DIRECTUS_URL in .env is
  admin.hoaconnect.info). Test as the demo admin (POST /api/demo/login, slug
  `demo`, is_demo). Never change 1033 Lenox. App prefs are per user and
  shared with anyone using the demo: put them back (Tint on, community
  swatch, Auto).
- The browser pane can be hidden, which pauses animation frames: a
  screenshot can catch a stagger or a sheet mid-entry. Read opacity from the
  DOM before calling something broken.
- The pane cannot emulate prefers-reduced-transparency or prefers-contrast.
- resize_window with a width under 768 emulates a phone; reset it to desktop
  when you finish.
- /ui-kit cannot be opened in the preview (a signed-in user is bounced);
  update its specimens anyway and say they were not seen.
- pnpm audit:all reads tracked files: `git add -N` new files before the gate.
- Leaving the admin's "Member" preview on redirects admin routes until Exit.
- A "What's new" dialog may cover the first page after sign-in: Got it.
- SubNav had a top-level await once and took every workspace page to a 500;
  keep it synchronous (see the comment at the top of its script).

Build, one commit each, gated as below:
1. The sub-nav (and the sticky offsets that depend on it), after Peter's answer.
2. The header: the bar's wash, or the backdrop, whichever he names. The
   rules and the comments follow in the same commit.

Local session: work on main, ask before pushing.

Quality gate per commit, run serially: typecheck 0, vitest green, build
green, pnpm audit:all at or under baseline, lint under the warning cap. Run
the typecheck and the build with NODE_OPTIONS=--max-old-space-size=6144.

When done: update the §7 Status row for Session 14 (shipped) and append to
the Session log (shipped, what each role now sees, deviations, what was not
seen, operator TODOs). Then stop.
```

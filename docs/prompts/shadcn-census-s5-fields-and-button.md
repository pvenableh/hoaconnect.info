# shadcn census — Step 5 (Badge, Textarea, Input, Button)

Model: Opus 5.5 (`claude-opus-5-5`), high effort. About 280 call sites, and Button also feeds four other `ui/` primitives through `buttonVariants()`. It's mechanical work, but one wrong class merge changes every button in the app. Steps 1–4 are committed on `main` (`304c2bee`, `5edc7e3b`, `276701c4`, `50a55ebc`), local and unpushed.

Start it with (the prompt itself is the one code block below):

> Read docs/prompts/shadcn-census-s5-fields-and-button.md and carry out the prompt in its code block exactly: Step 5 (Badge, Textarea, Input, Button) of docs/shadcn-census.md, on main, committing each primitive locally and asking before you push.

```
Do Step 5 of docs/shadcn-census.md: put Badge, Textarea, Input and Button in
app/components/ui/ back to stock shadcn-vue, and move HOA Connect's changes
into App* wrappers outside ui/, the way Steps 1–4 did. Peter's rule
(2026-11-19): ui/ stays stock so it can be re-pulled; a project change lives
in a wrapper component that wraps the shadcn one. All orgs are test data.

Read first: docs/ux-standards.md, then docs/shadcn-census.md (the table, "Two
things that decide how the rest goes", and the order). Then read the
wrappers already built, since they are the pattern: app/components/App/Card.vue,
SheetContent.vue, DialogContent.vue, SelectTrigger.vue (restates a layered
material in a scoped style), ToggleGroupItem.vue, Combobox.vue.

What Steps 1–4 learned (don't rediscover it):
- LAYERS decide everything. A project class in @layer components loses to
  the stock Tailwind utilities (utilities layer); an UNLAYERED one beats
  them. `.glass-surface` and `.field-underline` are unlayered, so a class on
  the wrapper is enough. `.glass-field`, `ios-card` and `glass-btn-*` are
  layered (check earnest-ui.css / theme-app.css for each before relying on
  it), so the stock `bg-*`/`border`/`shadow-*` win. In that case either
  restate the material unlayered in the wrapper's scoped <style> (AppCard,
  AppSelectTrigger) or, when the stock utility can be swapped,
  rely on tailwind-merge in `cn()` to replace a conflicting stock class
  (radius, padding, text colour). A stock bg utility CANNOT be removed by
  adding another bg utility without killing a layered material too.
- Overlays and other parts the wrapper can't reach are styled from their
  stock data-slot in earnest-ui.css (Peter's call, Step 2). Prefer a wrapper
  class; use data-slot CSS only when there is no other way.
- AUDITS MATCH TAG NAMES. When a wrapper replaces a stock tag, grep
  scripts/lib/audit-matchers.ts for the old name. Step 4 found overlay-boxes
  silently dropping from 26 to 12 because it didn't know <AppDialogContent>.
  Known for this step: FORM_CONTROL (form-dialogs) lists Input|Textarea, so
  add AppInput|AppTextarea, with a test row in
  tests/scripts/audit-matchers.test.ts. Re-run `pnpm audit:<name>` and make
  sure no count DROPS unexpectedly. A drop is lost coverage, not a win.
- Callers: script the switch (tag rename `<X` → `<AppX`, `</X>` → `</AppX>`,
  drop X from `@/components/ui/...` / `~/components/ui/...` import braces),
  then grep for leftovers and `pnpm exec eslint --fix` the touched files.
  Template types aren't strict, so wrappers declare only `class` and let
  every other prop, v-model and listener fall through (AppCard does this).
  Check v-model on AppInput/AppTextarea really reaches the stock
  defineModel, and that vee-validate `v-bind="componentField"` still works.
- Stock source: diff against each file's first commit
  (`git log --follow --diff-filter=A`, normalising quotes, semicolons and
  indentation; in zsh write `"${c}:path"`, since `$c:a` is a modifier). Where the
  first commit is an older generation, compare with the shadcn-vue registry
  (https://www.shadcn-vue.com/r/styles/new-york-v4/<name>.json, rewrite
  `from "cn"` → `~/lib/utils` and `@/registry/new-york-v4/ui/` →
  `~/components/ui/`). For Button prefer the registry: current upstream has
  the `icon-sm` / `icon-lg` sizes our callers use. Check before relying on it.

Order: one primitive per commit, each committed to main locally once lint,
`pnpm typecheck`, `pnpm audit:all` and the browser check pass. Do not push.
  1. Badge (13 callers): `rounded-full` → <AppBadge>.
  2. Textarea (21): `field-underline` instead of the stock box → <AppTextarea>.
  3. Input (77): same → <AppInput>. ui/date-input/ composes Input (it is
     project-authored and out of scope, but it must keep its look: make it use
     AppInput or confirm it does not need to).
  4. Button (170 files): pill base, glass-btn-primary / -destructive /
     -soft / -soft--tinted variants, destructive-foreground text →
     <AppButton> plus an exported `appButtonVariants` for non-component use.
     Before switching callers, settle the ui/ parts that call
     buttonVariants() internally and will go stock: AlertDialogAction /
     AlertDialogCancel (App/ConfirmDialog uses Cancel), PaginationItem /
     Previous / Next / First / Last (App/Pagination uses them) and the
     calendar nav buttons + CalendarCellTrigger (DateInput uses them). For
     each, either pass the project classes from the wrapper that uses it or
     accept stock, and say which in the census doc. ActionButton.vue
     (project-authored, in ui/) already wears glass-btn-soft; leave it.
     If Button turns out bigger than one session, stop after Input,
     commit, and write docs/prompts/shadcn-census-s5b-button.md.

Verify each in the browser: the preview server (`hoaconnect` in
.claude/launch.json) and /ui-kit, which needs no sign-in and shows every
primitive. Check computed styles (background, border, radius, box-shadow,
focus ring) against the committed version, not only by eye. For Input and
Button also open one real form, e.g. a settings page or a sheet. The console's
`vue-sonner/style.css` 404 is unrelated to this work; ignore it.

When done: tick Step 5 in docs/shadcn-census.md (table rows, Status line, a
closing "Done" note with anything left over, e.g. Calendar's deferred
re-pull and DropdownMenuSubContent's missing wrapper), note in
docs/ux-standards.md's Scope notes that the app uses App* wrappers (the line
is already there; extend the list), and end your reply with the
next-session starter sentence if anything is queued.
```

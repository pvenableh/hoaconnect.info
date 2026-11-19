# shadcn-vue census — what in `app/components/ui/` is no longer stock

_2026-11-19. Follows the rule set that day: the shadcn primitives in `app/components/ui/` stay
at their stock defaults; project changes live in a wrapper outside `ui/`. Session 18 did this for
Card (`ui/card/Card.vue` restored, `<AppCard>` in `app/components/App/Card.vue`, 39 users switched).
This is the census for everything else._

**Status:** all five steps done 2026-11-19. Step 1 left Calendar's re-pull deferred (see below); the leftovers are listed under "Done" at the end.

## How it was counted

- Every tracked file under `ui/` was diffed against its first commit (`git log --follow
  --diff-filter=A`) with quotes, semicolons and indentation normalised away, then every file was
  grepped for project-only tokens (`glass-*`, `chrome-float`, `field-underline`,
  `dialog-overlay-glass`, `<Icon`, `type-*`, comments naming Earnest/HOA).
- The grep matters: Combobox, Pagination, Toggle Group and Calendar were **born customised**
  (ported from Earnest in `f4f33b5c`, Phase 1a), so they have no stock first version to diff.
- Many `--follow` diffs were noise: git paired tiny files from the initial push with Card files
  as "renames" (e.g. `TableRow.vue` "was" `CardAction.vue`). Those are not changes.
- **Users** = `.vue` files outside `ui/` that use the tag. `ui-kit.vue` (the demo page) is counted.
- **Not in scope**, project-authored: `ui/ActionButton.vue`, `ui/BackLink.vue`,
  `ui/PageContainer.vue`, `ui/date-input/`, `ui/loading-overlay/`, `ui/tiptap/` (its
  `TiptapEditor.vue` is +492 lines of our own editor). They should eventually move out of `ui/`
  too, but that is a rename, not a wrapper.

## The table

Risk: **L** = one-to-few call sites, or a wrapper already exists to absorb it.
**M** = a dozen-plus call sites or a portaled surface. **H** = 70+ call sites, or other `ui/`
files depend on the change.

| File(s) | What was changed | Proposed wrapper | Users | Risk |
|---|---|---|---|---|
| `button/index.ts` (+ `Button.vue` import order only) | Pill base (`rounded-full`); variants wear `glass-btn-primary / -destructive / -soft / -soft--tinted` instead of flat fills + `shadow-xs`; `destructive-foreground` text; added `icon-sm`, `icon-lg` sizes | ✅ Stock (new-york-v4 registry: also `xs` / `icon-xs`, `data-variant` / `data-size`). `<AppButton>` + `App/button-variants.ts` (`appButtonClasses` = the additions, `appButtonVariants` = the full list). Primary/destructive glass is a class; outline/secondary's `glass-btn-soft` is restated unlayered as `.app-btn-soft` in earnest-ui.css (focus reverts to the stock ring). Inside `ui/`: ConfirmDialog dresses `AlertDialogCancel`, AppPagination dresses its items; `AlertDialogAction`, `PaginationFirst/Last` (no users) and the calendar nav + cell buttons are stock. 169 callers switched. | 170 | done |
| `input/Input.vue` | Box replaced by `field-underline` (no border, radius, padding-x, shadow, focus ring) | ✅ Stock. `<AppInput>` adds the unlayered `field-underline` and swaps the stock `px-3` for `p-0 py-1`, so theme-app.css's `[class*="px-"]` padding sniff only sees a caller's padding. v-model (and `.number`), vee-validate fields and listeners fall through (pinned by `tests/components/app-field-wrappers.test.ts`). `DateInput` does not compose Input (it is reka's DateField). 77 callers switched. | 77 | done |
| `textarea/Textarea.vue` | Same `field-underline` swap as Input | ✅ Stock. `<AppTextarea>`, the AppInput way (`p-0 py-2`). 21 callers switched. | 21 | done |
| `dialog/DialogContent.vue`, `DialogOverlay.vue` (`DialogScrollContent.vue` ✅ restored, 0 users) | `glass-surface glass-surface--strong rounded-2xl`, no border/shadow; overlay `bg-black/80` → `dialog-overlay-glass` | ✅ Stock. `<AppDialogContent>` adds the glass (unlayered, so a class is enough); the overlay comes from its data-slot. 34 callers switched. | 34 | done |
| `alert-dialog/AlertDialogContent.vue` | Same glass + overlay as Dialog | ✅ Stock again; `App/ConfirmDialog.vue` puts `glass-surface glass-surface--strong rounded-2xl` on it. Overlay via data-slot (below). | 1 | done |
| `command/CommandDialog.vue` | Hides the close X, makes `Command` transparent on the glass pane | ✅ Stock again; `App/Spotlight.vue` composes `Dialog` + `Command` itself with the two changes. | 1 | done |
| `sheet/SheetContent.vue` | Glass surface, `rounded-*-none` per side instead of a border, `DialogOverlay` with `dialog-overlay-glass` | ✅ Stock again (the 2025-12 state: stock plus the `DialogOverlay` fix, which current upstream also has). `<AppSheetContent>` (`App/SheetContent.vue`) adds the glass and squares the screen edge; all 4 callers switched. | 4 | done |
| `popover/PopoverContent.vue` | `glass-surface --strong chrome-float rounded-xl`, no border/shadow | ✅ Stock. `<AppPopoverContent>`. | 3 | done |
| `dropdown-menu/DropdownMenuContent.vue`, `…SubContent.vue` | Same floating-chrome glass as Popover | ✅ Both stock. `<AppDropdownMenuContent>`; SubContent has no users, so no wrapper yet. | 10 (Sub: 0) | done |
| `select/SelectContent.vue` | Glass surface, `rounded-xl` | ✅ Stock. `<AppSelectContent>`. | 12 | done |
| `select/SelectTrigger.vue` | `glass-field rounded-full`, focus/invalid ring and border dropped | ✅ Stock. `<AppSelectTrigger>` restates the layered `glass-field` material and its focus ring unlayered in a scoped style (the AppCard way); `size` falls through. | 12 | done |
| `tooltip/TooltipContent.vue` | Glass instead of `bg-foreground` inverse; arrow removed | ✅ Stock (arrow back). `<AppTooltipContent>` adds the glass and hides the arrow (`[&>span:has(>svg)]:hidden`). | 2 | done |
| `badge/Badge.vue` | `rounded-md` → `rounded-full` | ✅ Re-pulled from the new-york-v4 registry (cva, `Primitive`, `data-slot`; it was a hand-rolled older generation). `<AppBadge>` keeps the workspace look over it: a `<span>`, semibold, `px-2.5`, wraps like text, the lift and the dark destructive fill. 13 callers; /ui-kit has a badge row. | 13 | done |
| `tabs/TabsList.vue`, `TabsTrigger.vue` | Pill track (`rounded-full`, `p-1`, `gap-0.5`), wider trigger padding | ✅ Restored to stock — 0 users (views use `AppSegmentedControl` / `App/TabPanels`). | 0 | done |
| `checkbox/Checkbox.vue` | `lucide-vue-next` `<Check>` → Nuxt `<Icon name="lucide:check">` | ✅ Restored to stock (`lucide-vue-next` `<Check>`). | 7 | done |
| `chart/ChartContainer.vue` | Adds `--vis-axis-tick-label-font-size` / `--vis-axis-label-font-size: 10px` | ✅ Vars moved to the one caller, `AdminActivityPage` (inline `style` on `<ChartContainer>`). | 1 | done |
| `combobox/*` (9 files) | Born as an Earnest port: `glass-field` pill anchor that owns the rim, bare input, glass `ComboboxList`, `type-micro` group label, `helper-text` empty, `<Icon>` glyphs | ✅ Stock (new-york-v4 registry, adds `ComboboxSeparator` / `ComboboxViewport`). `<AppCombobox v-model :options>` composes it; the bare input is reka's, since the stock input is palette-shaped. | 1 (ui-kit) | done |
| `pagination/*` (8 files) | Earnest port: active page wears `glass-active-thumb`; `<Icon>` glyphs | ✅ Stock. `<AppPagination>` composes the whole row (reka root props pass through). | 1 (ui-kit) | done |
| `toggle-group/*` (3 files) | Earnest port: `glass-field` track, `glass-active-thumb` ON state, `glass-btn-soft` outline variant | ✅ Stock, plus the stock `ui/toggle` it now depends on. `<AppToggleGroup>` + `<AppToggleGroupItem>`; the ON background moved out of `@layer` in earnest-ui.css (keyed on the stock data-slot) so it beats the stock `data-[state=on]:bg-accent`. Only the default variant is dressed. | 1 (ui-kit) | done |
| `calendar/*` (13 files) | Earnest port of stock new-york **minus** the month/year `NativeSelect` layouts; no material changes | ✅ Re-pulled with the new `ui/native-select` (adds `layout`). `<AppCalendar>` wraps it; `.app-calendar` in earnest-ui.css keeps the pill nav and day buttons, which the stock builds from `buttonVariants()` inside `ui/`. DateInput uses it. | 1 (DateInput) | done |

**Version drift, not customisation:** ✅ `sheet/*` re-pulled from the registry (data-slots, a separate `SheetOverlay`, an unpadded flex pane); `<AppSheetContent>` pads the pane and `<AppSheetHeader>` / `<AppSheetTitle>` keep the header layout and title size. The rest (`@/lib/utils` vs `~/lib/utils` imports, multi-line `cn(…)` formatting, Avatar/Breadcrumb/Table/Field mis-paired by `--follow`) is cosmetic. `card/*` is stock since Session 18.

## Two things that decide how the rest goes

1. **The layer problem.** `glass-*` / `chrome-float` / `field-underline` live in
   `@layer components`; the stock files' `bg-background`, `border`, `shadow-md`, `rounded-md`
   are utilities and win. Today that works only because the stock classes were deleted. Every
   wrapper therefore restates its material unlayered (as `AppCard` does), or neutralises the
   stock utilities in its `class` (`border-0 shadow-none bg-transparent rounded-xl` — `cn`'s
   tailwind-merge drops the stock ones).
2. **Overlays: decided — data-slot CSS** (Peter, 2026-11-19). **Portaled surfaces have one more option.** Dialog / Sheet / Popover / Dropdown / Select /
   Tooltip content all carry a stock `data-slot` (`dialog-content`, `popover-content`, …). A
   project stylesheet keyed on `[data-slot="popover-content"]` would give the glass with **zero
   call-site changes** and `ui/` left stock. It is not a wrapper component, so it bends the
   rule as written — Peter's call. Wrappers are the safer reading of the rule; the stylesheet is
   far cheaper for the 60-odd floating-chrome call sites.
   **Decision:** the stock Content components render their overlay inside themselves, so no wrapper
   can reach it. `earnest-ui.css` gives `[data-slot='dialog-overlay' | 'alert-dialog-overlay' |
   'sheet-overlay']` the `dialog-overlay-glass` material (light, dark, reduced transparency). Content
   surfaces still get wrapper components.

## Recommendation — order

1. ✅ **Free restorations** (done): Tabs, Checkbox icon, `DialogScrollContent`, ChartContainer
   vars → caller. Calendar re-pull deferred (see table).
2. ✅ **Fold into wrappers that already exist** (done): `AlertDialogContent` → `ConfirmDialog`,
   `CommandDialog` → `Spotlight`, `SheetContent` → the two `*/Sheet.vue` + StorageManager.
   Proves the floating-glass restatement on three callers before the big ones.
3. ✅ **Earnest ports with no app users** (done): Combobox, Pagination, Toggle Group → `App*` wrappers
   over fresh stock. Cheap now; expensive once features adopt them.
4. ✅ **Floating chrome** (done; 53 files switched): decide
   one primitive per commit. Overlays are settled (below); the content surfaces get wrappers.
5. ✅ **Badge**, then **Textarea**, then **Input**, then **Button** last (done; one commit each) — Button touched 170
   files and three other `ui/` primitives.

## Done

All of `ui/` is stock shadcn-vue (current new-york-v4 for Button, Badge, Sheet, Calendar,
Native Select, Combobox, Pagination, Toggle Group; first-commit stock for the rest), and nothing
project-authored lives there. The app uses `App*` wrappers: `AppButton` (+ `appButtonClasses` /
`appButtonVariants`), `AppInput`, `AppTextarea`, `AppBadge`, `AppCard`, `AppCalendar`,
`AppDialogContent`, `AppSheetContent` / `AppSheetHeader` / `AppSheetTitle`, `AppPopoverContent`,
`AppDropdownMenuContent` / `AppDropdownMenuSubContent`, `AppSelectContent`, `AppSelectTrigger`,
`AppTooltipContent`, `AppCombobox`, `AppPagination`, `AppToggleGroup` / `AppToggleGroupItem`.
The tag-matching audits learned the new names as they went (`overlay-boxes` in step 4,
`form-dialogs` in step 5); no count dropped.

After step 5 (2026-11-19):
- DateInput and TiptapEditor were still on stock parts (the caller sweeps skipped `ui/`); fixed.
- `ActionButton`, `BackLink`, `PageContainer`, `DateInput`, `DateTimeInput`, `LoadingOverlay`
  and `TiptapEditor` moved to `app/components/` (same tag names); DateInput's helpers are
  `app/lib/date-input-value.ts`. The audits then saw them for the first time; their findings carry
  `allow-*` reasons, except BackLink (and the header breadcrumb it matches) and the file picker's
  folder glyph, which moved onto `type-micro` / `text-warning`.
- `AppDropdownMenuSubContent` added; the /ui-kit menu has a submenu.
- Badge, Sheet and Calendar re-pulled (see the table).

Still stock with no users, to dress with `appButtonClasses()` from the wrapper that first uses
them: `AlertDialogAction` (ConfirmDialog uses an AppButton so a destructive confirm reads
destructive), `PaginationFirst` / `PaginationLast`. They stay: deleting stock parts would make `ui/` differ
from a re-pull.

Also done: DateInput opens on the `month-and-year` layout (month and year dropdowns over the
pill nav), and the unused `App/Breadcrumbs.vue` (with the `MANAGER_APPS` list only it read) is gone.

# shadcn-vue census — what in `app/components/ui/` is no longer stock

_2026-11-19. Follows the rule set that day: the shadcn primitives in `app/components/ui/` stay
at their stock defaults; project changes live in a wrapper outside `ui/`. Session 18 did this for
Card (`ui/card/Card.vue` restored, `<AppCard>` in `app/components/App/Card.vue`, 39 users switched).
This is the census for everything else._

**Status:** step 1 (free restorations) done 2026-11-19, except Calendar (see below). Step 2 done the same day. Steps 3–5 not started.

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
| `button/index.ts` (+ `Button.vue` import order only) | Pill base (`rounded-full`); variants wear `glass-btn-primary / -destructive / -soft / -soft--tinted` instead of flat fills + `shadow-xs`; `destructive-foreground` text; added `icon-sm`, `icon-lg` sizes | `<AppButton>` (`App/Button.vue`) wrapping `<Button>`, plus an `appButtonVariants` for non-component use | **170** | **H** — also used inside `ui/` via `buttonVariants()`: `AlertDialogAction/Cancel`, `PaginationItem`, calendar nav buttons. Those would go stock unless they are wrapped too. `icon-sm`/`icon-lg` are in current upstream, so they may survive a re-pull. |
| `input/Input.vue` | Box replaced by `field-underline` (no border, radius, padding-x, shadow, focus ring) | `<AppInput>` | **77** | **H** — `defineModel` + vee-validate `componentField` must pass through untouched; `DateInput` composes it. |
| `textarea/Textarea.vue` | Same `field-underline` swap as Input | `<AppTextarea>` | 21 | M |
| `dialog/DialogContent.vue`, `DialogOverlay.vue` (`DialogScrollContent.vue` ✅ restored, 0 users) | `glass-surface glass-surface--strong rounded-2xl`, no border/shadow; overlay `bg-black/80` → `dialog-overlay-glass` | `<AppDialogContent>` (overlay comes along, it is rendered inside Content) | 34 (ScrollContent: 0) | M — portaled; the stock `bg-background` utility beats the layered glass class (the AppCard lesson), so the wrapper restates the material unlayered |
| `alert-dialog/AlertDialogContent.vue` | Same glass + overlay as Dialog | ✅ Stock again; `App/ConfirmDialog.vue` puts `glass-surface glass-surface--strong rounded-2xl` on it. Overlay via data-slot (below). | 1 | done |
| `command/CommandDialog.vue` | Hides the close X, makes `Command` transparent on the glass pane | ✅ Stock again; `App/Spotlight.vue` composes `Dialog` + `Command` itself with the two changes. | 1 | done |
| `sheet/SheetContent.vue` | Glass surface, `rounded-*-none` per side instead of a border, `DialogOverlay` with `dialog-overlay-glass` | ✅ Stock again (the 2025-12 state: stock plus the `DialogOverlay` fix, which current upstream also has). `<AppSheetContent>` (`App/SheetContent.vue`) adds the glass and squares the screen edge; all 4 callers switched. | 4 | done |
| `popover/PopoverContent.vue` | `glass-surface --strong chrome-float rounded-xl`, no border/shadow | `<AppPopoverContent>` | 3 | L |
| `dropdown-menu/DropdownMenuContent.vue`, `…SubContent.vue` | Same floating-chrome glass as Popover | `<AppDropdownMenuContent>` (+ SubContent) | 10 (Sub: 0) | M — portaled |
| `select/SelectContent.vue` | Glass surface, `rounded-xl` | `<AppSelectContent>` | 12 | M |
| `select/SelectTrigger.vue` | `glass-field rounded-full`, focus/invalid ring and border dropped | `<AppSelectTrigger>` | 12 | M — sizes via `data-[size]` must still forward |
| `tooltip/TooltipContent.vue` | Glass instead of `bg-foreground` inverse; arrow removed | `<AppTooltipContent>` | 2 | L |
| `badge/Badge.vue` | `rounded-md` → `rounded-full` | `<AppBadge>` | 13 | L |
| `tabs/TabsList.vue`, `TabsTrigger.vue` | Pill track (`rounded-full`, `p-1`, `gap-0.5`), wider trigger padding | ✅ Restored to stock — 0 users (views use `AppSegmentedControl` / `App/TabPanels`). | 0 | done |
| `checkbox/Checkbox.vue` | `lucide-vue-next` `<Check>` → Nuxt `<Icon name="lucide:check">` | ✅ Restored to stock (`lucide-vue-next` `<Check>`). | 7 | done |
| `chart/ChartContainer.vue` | Adds `--vis-axis-tick-label-font-size` / `--vis-axis-label-font-size: 10px` | ✅ Vars moved to the one caller, `AdminActivityPage` (inline `style` on `<ChartContainer>`). | 1 | done |
| `combobox/*` (9 files) | Born as an Earnest port: `glass-field` pill anchor that owns the rim, bare input, glass `ComboboxList`, `type-micro` group label, `helper-text` empty, `<Icon>` glyphs | `<AppCombobox>` (anchor + input + list composed) over a fresh `shadcn-vue add combobox` | 1 (ui-kit only) | **L** — no app users yet |
| `pagination/*` (8 files) | Earnest port: active page wears `glass-active-thumb`; `<Icon>` glyphs | `<AppPagination>` | 1 (ui-kit only) | **L** |
| `toggle-group/*` (3 files) | Earnest port: `glass-field` track, `glass-active-thumb` ON state, `glass-btn-soft` outline variant | `<AppToggleGroup>` | 1 (ui-kit only) | **L** |
| `calendar/*` (13 files) | Earnest port of stock new-york **minus** the month/year `NativeSelect` layouts; no material changes | Deferred — a re-pull brings the `layout` prop and a new `native-select` primitive from the registry. The material is stock; only an unused feature is missing. Re-pull when someone wants the year dropdown. | 0 (DateInput) | L |

**Version drift, not customisation** (no wrapper; a re-pull just updates them): `sheet/Sheet.vue`,
`SheetClose.vue`, `SheetTrigger.vue` (older generation, no `data-slot`), `@/lib/utils` vs
`~/lib/utils` imports, multi-line `cn(…)` formatting in Alert/Form/Label, Avatar/Breadcrumb/
Table/Field files (stock, mis-paired by `--follow`). `card/*` is stock since Session 18.

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
3. **Earnest ports with no app users**: Combobox, Pagination, Toggle Group → `App*` wrappers
   over fresh stock. Cheap now; expensive once features adopt them.
4. **Floating chrome** (Popover, Tooltip, Dropdown, Select, Dialog — ~60 users): decide
   one primitive per commit. Overlays are settled (below); the content surfaces get wrappers.
5. **Badge**, then **Textarea**, then **Input**, then **Button** last — Button touches 170
   files and three other `ui/` primitives; do it once the pattern is boring.

**Next: step 3**, the Earnest ports with no app users (Combobox, Pagination, Toggle Group).

# UX standards — the one-page digest

_Phase 8 of Earnest Parity Round 3. The short version of `docs/button-type-case-system.md`
(buttons, case, the two-edges rule), adapted to HOA Connect's class names, and the list of
**audits that enforce it**. Earnest's `visual-hierarchy-plan` and `glass-nesting-plan` are the
long-form source; this is what you need while writing a component._

## The rules

| Concern | Do | Don't | Audit |
|---|---|---|---|
| **Cards** | `ios-card` (refracted rim). `glass-edge` on a quieter surface that keeps its own background. `ios-card--thing` for an _object_ (a receipt, a preview). | A hand-rolled `rounded-xl border t-border t-bg-subtle` — it keeps the pre-glass 1px line. | `hairline-surfaces` |
| **Nesting** | An overlay (`AppBottomSheet`, `AppSlideOverShell`, `DialogContent`) **is** the card; a settings tab **is** one surface. Group with spacing, dividers and `t-text-*` hierarchy. | A card in an overlay; a stack of cards per settings section (glass on glass turns to mud). | `overlay-boxes`, `settings-boxes` |
| **Colour** | Theme tokens: `t-text-primary/secondary/muted`, `t-bg-subtle`, `text-destructive`, `bg-success/15`, `text-warning`, `text-info`. In CSS: `var(--theme-*)`, `var(--primary)`. | Palette classes (`text-gray-500`, `bg-emerald-600`, `bg-white`) and `#hex` / `rgb()` in a rule — they ignore dark mode, the org accent and the contrast audit. | `color-literals`, `css-colors`, `contrast-pairs` |
| **Type** | `type-display / section / card / body / meta / label / micro`, or Tailwind's scale. Meta-labels are UPPERCASE via `type-micro`. | `text-[13px]`, `leading-[15px]`, `font-size: 13px`. | `type-scale` |
| **Headings** | `<h1-6>` for the document outline only. | A `<h3 class="text-xs uppercase tracking-wide">` dressed as a label — use `<p class="type-micro">`. | `heading-labels` |
| **Buttons** | `<Button>` (T1 primary / T2 outline) and `<ActionButton>` (T3 28px pill, T4 micro) — they carry focus ring, press state, haptic, disabled. | A bare `<button>` re-doing all of that. | `raw-buttons` |
| **Dialogs** | `useConfirm()` (an options **object**), toasts for notices. | `confirm()` / `alert()` / `prompt()`. | `native-dialogs` |
| **Dates** | The shared `DateInput` / `DateTimeInput` (`app/components/ui/date-input/`). | `<input type="date">` / `datetime-local` / `month` / `week`. | `raw-date-inputs` |
| **Empty states** | `<AppEmptyState title description>` (+ an action). Search "No results" is not an empty state. | A naked `<p>No requests yet</p>`. | `empty-states` |
| **Theme classes** | Only `t-*` / `glass-*` / `ios-*` / `type-*` classes that exist in `core/app/assets/css/`. | A typo or renamed token — Tailwind ignores it and the element renders unstyled. | `dead-theme-classes` |
| **Components** | Nuxt names a component from its path and **de-duplicates a repeated prefix**: `feed/FeedItem.vue` → `<FeedItem>`, not `<FeedFeedItem>`. | A tag that resolves to nothing — Vue renders an unknown element, silently. | `unresolved-components` |
| **Scoped CSS** | `:global(.dark .child)` — the WHOLE selector inside. | `:global(.dark) .child` in `<style scoped>` — the compiler drops everything after `)`. | `vue-global` |
| **Server work** | `await` it. | `void notify(…)`, a floating `.catch()`, a bare `waitUntil(` — Vercel freezes the function when the response is sent. | `detached-promises` |

## Running them

```bash
pnpm audit:all                     # every gate, in parallel, ~10 s — what the hook and CI run
pnpm audit:<name>                  # report mode (always exits 0)
pnpm audit:<name> --list           # every finding with file:line
pnpm audit:<name> --top            # the worst files (ratchets)
pnpm audit:<name> --check          # the gate: exit 1 above the baseline
pnpm lint                          # ESLint (errors fail; warnings are capped by --max-warnings)
```

**Gate at 0** (`raw-date-inputs`, `vue-global`, `hairline-surfaces`, and since Phase 9 `unresolved-components`,
`dead-theme-classes`, `contrast-pairs`, `detached-promises`): any finding fails.
**Ratchet** (the rest): the count may go **down**, never up. The baseline lives in the script's
`BASELINE` constant and in the Phase 8 table of `docs/plan-earnest-parity-round3-gtm.md`.
When you fix findings the audit says _"lower BASELINE to N"_ — do it in the same commit.

> ⚠️ **Never raise a baseline to make a commit pass.** Fix the finding, or tag it.

## The escape hatches — `allow-*:` markers

A marker is a comment on the line or within two lines above it (six for the box audits), and
**must carry a reason** — it is the audit trail for "this one is deliberate".

| Marker | Where | For |
|---|---|---|
| `allow-hairline-surface` | template / `<style>` | A box that genuinely needs its own 1px hairline (a photo well, a mention popup). |
| `allow-native-dialog` | script | A native dialog with no in-app equivalent (none today). |
| `allow-raw-date-input` | template | A date input outside the app shell (a print form). |
| `allow-color-literal` | template | A colour that **is** the content (a brand swatch, a status legend). |
| `allow-css-color` | CSS / `<style>` | A colour that **is** the content (a printed design, a mock of someone else's UI). |
| `allow-dead-class` | template | A theme class applied at runtime and defined elsewhere. |
| `allow-unresolved-component` | template | A component registered at runtime. |
| `allow-heading-label` | template | A heading that is both outline and label. |
| `allow-raw-button` | template | A calendar cell, a drag handle, a table-sort header. |
| `allow-type-px` | template / `<style>` | A pixel size that cannot be on the scale (a glyph-fitted icon label). |
| `allow-bare-empty` | template | An inline "No pets on file" that is a field value, not an empty collection. |
| `allow-nested-box` | template | A card in an overlay / a second settings card that is content. |
| `allow-detached-promise` | script | Deliberate fire-and-forget, with **why it wins its race**. |

Example: `<!-- allow-raw-button: calendar day cell, 42 per month, its own material -->`.

## Scope notes

- **Excluded everywhere**: `app/components/ui/**` (vendored shadcn-vue — it _is_ the primitives).
- **Public surfaces** (`Marketing/`, `Org/Landing*/`, `LandingBuilder/` and the marketing pages)
  keep their own palette; `color-literals` skips them. The public landing is not the workspace.
- **Token definition files** (`theme.css`, `theme-app.css`, `variables.css`, `tailwind.css`):
  `--x: #hex` declarations are definitions, not uses, and are exempt from `css-colors`.
- `contrast-pairs` grades `theme-app.css` — light **and** dark — against WCAG AA (4.5:1 text).
  Change a token there and it re-grades the whole table.
- `unresolved-components` reads `.nuxt/components.d.ts` (written by `pnpm install` →
  `nuxt prepare`); it fails loudly if the file is missing.

## Adding an audit

1. A pure matcher in `scripts/lib/audit-matchers.ts` (source string in → hits out, honouring
   `allow-*`), with a table test in `tests/scripts/audit-matchers.test.ts` (a hit, a near miss,
   the marker).
2. `scripts/audit-<name>.ts` — a dozen lines on `runFileAudit` from `scripts/lib/audit-kit.ts`.
3. **Re-census the regex against this app's spelling** before trusting its count (the hairline
   regex matched nothing until it was rewritten for `t-border`). Prove it red with a deliberate
   violation, remove it.
4. Add the name to `AUDITS` in `scripts/audit-all.ts` and a `pnpm audit:<name>` script.

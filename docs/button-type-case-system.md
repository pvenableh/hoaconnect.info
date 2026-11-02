# Button tiers, type case, and the two-edges rule

_Adopted from Earnest (`docs/button-type-case-system.md`, `docs/glass-nesting-plan.md`) in
Round 3 Phase 1a. One rule for which button a control gets, how its label is cased, and how
many edges sit between the page and a field. When you add or touch a control, match it to its
**role**, not to whatever its nearest sibling happens to do._

## The rule in one line

> **Actions are Title Case. Meta-labels are UPPERCASE. Prose is sentence case.**

An _action_ makes the app do something (create, save, send, invite). A _meta-label_ names or
classifies part of the UI (a section, a column, a field, a status). _Prose_ is a link that
reads as part of a sentence.

## The four tiers

| Tier | Component | Material | Use |
|---|---|---|---|
| **T1** primary | `<Button>` | `glass-btn-primary` (filled accent) | The one thing this view is for. **One filled button per view.** |
| **T1** destructive | `<Button variant="destructive">` | `glass-btn-destructive` | The confirm in a destructive dialog. Never a resting button on a page. |
| **T2** secondary | `<Button variant="outline">` / `variant="secondary"` | `glass-btn-soft` / `--tinted` | Cancel, Export, Add Member beside a primary. |
| **T3** tertiary | `<ActionButton>` | 28px `glass-btn-soft` pill | Inline actions inside a card or row: Reply, Add File, New Task. |
| **T4** micro | `<ActionButton size="xs" title="…">` | no pane — a 24px glyph that grows a hover circle | A banner dismiss ×, a chip's remove ×, a row-hover edit/delete. No label; `title` is the accessible name. |

`<ActionButton :pressed="on">` is the toggle form of T3 — one condition on/off ("Overdue
only"). It wears `glass-active-thumb`, the same ON material as the segmented control and the
toggle group, so a filter row mixing them reads as one family.

Switching between sibling **views** is `AppSegmentedControl`; independent on/off choices in a
toolbar are `ToggleGroup`; neither is a row of buttons.

## Case by role

| Role | Case | Where |
|---|---|---|
| Action button (T1–T3) | Title Case | `Save Changes`, `Add Unit`, `Send Invite` |
| Section / group label, column header, field label, status badge | UPPERCASE | `type-micro` (it carries the tracking) |
| Tab / segment label | write Title Case; the control presents it | `AppSegmentedControl` items |
| Empty-state title, description, steps; dialog title and body | sentence case | `AppEmptyState`, `useConfirm()` |
| Prose / inline link | sentence case | an anchor in running text |

Anti-patterns, fix on sight: an action with `class="uppercase"`; a field label in Title Case
with no `type-micro`; a CSS `text-transform` to "fix" a one-off instead of changing the source
text.

## Two edges, not three

Between the page ground and a field there are **two** edges: the container (the panel itself
in an overlay, or the one settings card on a page) and the field. A group of fields inside
that container is **not** a third box — it is a `.form-section`: a heading, spacing, and a
hairline from the previous group.

```html
<section class="form-section">
  <h3 class="form-section__title type-card">Mailing address</h3>
  <p class="form-section__hint">Where paper notices go.</p>
  …fields…
</section>
```

Only things you **pick or compare** are boxes (plan cards, a template gallery). Secondary
copy under a field or in an empty state is `.helper-text`, not an ad-hoc
`text-xs text-muted-foreground`. Both classes live in `core/app/assets/css/earnest-ui.css`.

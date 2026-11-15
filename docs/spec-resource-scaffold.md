# Spec — resource scaffold (role-first UX, Phase 2)

Plan: `docs/plan-role-first-ux.md` §2.3. Builds on `docs/spec-capability-nav.md`. Written 2026-11-14.

Four pieces make an index page follow §2.3 by construction. `useResource` holds the rows and what the viewer has done to them. `AppResourceIndex` draws the index. A resource entry in the panel registry gives the detail. Three audits stop pages drifting back. Charges (the Charges tab of `/admin/payments`) is the proof.

## useResource

`core/app/composables/useResource.ts`. A page builds its definition in setup, where it can call composables, and passes it in. The result is one `reactive` handle, so a template reads `charges.visible` and binds `v-model="charges.query"` directly.

```ts
interface ResourceDefinition<Row> {
  key: string;                          // cache key, shared by the index and its panel ("charges")
  panel?: string;                       // panel registry type that shows one row ("charge")
  rowKey?: (row: Row) => string;        // default: row.id
  load: (orgId: string) => Promise<Row[]>;              // the one read, through a gated route
  search?: (row: Row) => (string | null | undefined)[]; // the text the search box matches
  statuses?: { value: string; label: string; match?: (row: Row) => boolean }[];
                                        // the one segmented filter; [0] is the default; no match = all
  filters?: Record<string, { initial: string; match: (row: Row, value: string) => boolean }>;
  remove?: { label: string; confirm: (row: Row) => ConfirmOptions; run: (row: Row) => Promise<unknown>; done: string };
}
function useResource<Row>(def: ResourceDefinition<Row>, opts: { orgId: Ref<string | null | undefined>; reuse?: boolean }): ResourceHandle<Row>;
```

| Part | Fields |
|---|---|
| List | `rows` (everything loaded), `visible` (after status, filters and search), `total`, `count`, `pending`, `error`, `refresh()`, `find(id)`, `keyOf(row)` |
| Filters | `query`, `status`, `filters` (by name), `statusItems` (for `AppSegmentedControl`), `isFiltered`, `reset()` |
| Selection | `selected` (ids), `selectedRows`, `isSelected(row)`, `toggle(row)`, `selectAll()` (the visible rows), `clear()`. Ids that leave `rows` drop out |
| Open panel | `openId` (this panel type's id on `?slide=`), `open(row)`, `close()` |
| Remove | `remove(row)`: `useConfirm(def.remove.confirm(row))`, then `run`, a toast, `refresh()`. Resolves false when cancelled |

Rows live in `useState("resource:<key>")` with the org they were loaded for, so the index and its panel share one copy. Loads run on the client only, as the pages' `server: false` reads did, and again when `orgId` changes. With `reuse: true` (a panel) it loads only when nothing is cached for that org, so a panel opened over its index makes no second request. Two loads of one key at once share a promise.

The scaffold reads only through `def.load`. Charges load from `GET /api/org/money/charges` (`requireMoneyRead`). Nothing reads `payment_requests` from Directus on the client, so neither read widens.

## AppResourceIndex

`app/components/App/ResourceIndex.vue`, generic over `Row`.

| Prop | Meaning |
|---|---|
| `resource` | the handle |
| `columns` | `DataTableColumn<Row>[]`, as `AppDataTable` takes them |
| `noun` | `{ one, other }`: "3 charges", and the default empty copy |
| `title`, `description` | render `AppPageHeader` (title, the count in `#meta`, the primary button in `#actions`). Leave out when the index is one view of a page that owns its header; the count then leads the toolbar |
| `canCreate`, `createLabel` | the one primary "New …", in the header and the empty state. `canCreate: false` hides both: a role never sees a control it cannot use |
| `searchPlaceholder`, `emptyTitle`, `emptyDescription`, `emptyIcon`, `rowClass` | as named |

Emits `create`. Slots: `cell-<key>` (handed to `AppDataTable`), `filters` (beside the status control: a `Select`, never pills), `meta` and `actions` (more header content when titled), `bulk` (`{ rows }`; when given, each row gets a checkbox and a bar shows the selection).

It renders, in order: the header when titled. Then the toolbar: the count when headless, search, the status control and `#filters`. Then `AppDataTable` in a card (cards on phones, as it does today). With no rows at all it shows `AppEmptyState` with the create action. With rows but none visible it shows "No matches". Clicking a row opens the panel, and the open row is tinted. Controls inside a cell stop the click.

## Panel registry entry

`app/components/panels/registry.ts`:

```ts
interface PanelEntry {
  load: () => Promise<{ default: Component }>;
  resource?: string; // the useResource key whose rows it shows
  index?: string;    // org-relative index path ("/admin/payments")
  page?: string;     // org-relative full-page route with ":id" ("/admin/payments/charges/:id")
}
```

A panel takes `{ id, mode?, flipFrom?, page? }`. `page` is the index path, set only when the panel renders as a full page. The panel hands it to `AppSlideOverShell`, which then renders `AppPageHeader` with a back link instead of its slide-over header. One component, two presentations:

- From the index: `?slide=<type>:<id>`, a slide-over on desktop. On phones the stack is full width, so there it is the full page.
- Deep links: `recordPath(type, id)` gives the page route, which mounts `AppResourceRecordPage`. That component looks up the entry and renders its component with `page`. The route carries the index's middleware, and a test checks the nav registry gates it exactly as it gates the index.

`getPanelComponent` and `hasPanel` keep their signatures. `request` and `task` take the entry shape with only `load`.

## Charges, converted

Every change a user sees is one §2.3 names:

| Before | After |
|---|---|
| Raw `<h1>` "Finances" | `AppPageHeader`: title in the shell header, the Stripe badge in `#meta`, New charge in `#actions` |
| Tabs as `filter-pill`s | `AppSegmentedControl` |
| Type pills and status pills | The status control (Outstanding · Paid · All), a type `Select`, and search (new) |
| Inline "New charge" card | `PaymentChargeForm` in `AppBottomSheet` |
| Cancel icon beside Mark paid, no confirm | Cancel in the row's overflow menu and the panel's, through `useConfirm` naming the charge, the member and the amount |
| No detail | Row click opens the charge: summary strip (status, amount due, Mark paid), facts, timeline |
| "No matches" when there are no charges | "No charges yet", with New charge for admins |

Unchanged: the Overview, Recurring and Reports tabs, the stats, `DirectorLayer`, the money glance and Manage expenses. `canWrite` (admin) gates New charge, Mark paid, the overflow menus and the empty-state button. A `money:read` holder sees the same rows, filters and panel with no actions. A cancelled charge offers no Undo: reopening it bills the member again, which is its own decision (Session 5 puts cancel behind approval).

Charges have no edit and no discussion thread. The form takes a `record` prop when edit arrives.

## The three audits

Each is a ratchet in the `scripts/lib/audit-kit.ts` shape, wired into `audit:all`. The matchers sit in `audit-matchers.ts` with table tests. Baselines are measured after Charges converted.

| Audit | Finds | Scope | Marker | Census before Charges |
|---|---|---|---|---|
| `page-h1` | `<h1` in a page's template | `app/pages/**`, `app/components/pages/**` | `allow-page-h1` | 48 |
| `form-dialogs` | a `<Dialog>` whose body holds a form control (`form`, `input`, `textarea`, `select`, `Input`, `Textarea`, `Select`, `DateInput`, `DateTimeInput`, `Switch`, `Checkbox`, `RadioGroup`) | `.vue` in `app/**`, `core/app/**`, not `ui/` | `allow-form-dialog` | about 39 |
| `filter-pills` | the `filter-pill` class in a template, once per element (`--active` is not counted) | the same | `allow-filter-pill` | 12 |

The fix lines point at `AppPageHeader`, at `AppBottomSheet` with one form component, and at `AppSegmentedControl` or a `Select`.

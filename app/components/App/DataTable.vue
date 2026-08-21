<script setup lang="ts" generic="Row extends Record<string, any>">
/**
 * The one way to show rows of records.
 *
 * Fourteen pages hand-rolled their own `<table>` with their own header classes,
 * their own "no results" markup, their own idea of what a clickable row looks
 * like. This is a thin wrapper over the table primitives — not a data grid — so
 * it stays easy to read, but it fixes the parts that should never vary: header
 * treatment, empty state, sort affordance, and what happens when you click a row.
 *
 * Row click is the app's standard drill-in: it opens the record without leaving
 * the list. Pass `@row-click` and the row becomes a real button for keyboard and
 * screen-reader users too — a `<tr>` with a click handler is not reachable
 * otherwise, which is how most hand-rolled versions of this shipped.
 *
 * Below `sm` the table collapses to stacked cards, each cell labelled by its
 * column, because a horizontally-scrolling table on a phone is unreadable.
 *
 * Generic over the row type so `#cell-*` slots hand back the caller's own
 * record rather than a bag of `any` — without that, every `@click="edit(row)"`
 * against a typed handler needed a cast at the call site.
 */
export interface DataTableColumn<Row = Record<string, unknown>> {
  /** Key into the row, and the name of the `cell-<key>` slot. */
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  /** Enables the sort affordance on this column. */
  sortable?: boolean;
  /** Hide below `sm` — for columns that are context rather than identity. */
  hideOnMobile?: boolean;
  /** Extra classes for the cell. */
  class?: string;
  /** Pull the value out of a row. Defaults to `row[key]`. */
  value?: (row: Row) => unknown;
}

const props = withDefaults(
  defineProps<{
    columns: DataTableColumn<Row>[];
    rows: Row[];
    /** Unique key per row. A field name, or a function. */
    rowKey?: string | ((row: Row) => string | number);
    loading?: boolean;
    /** Number of skeleton rows while loading. */
    loadingRows?: number;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyIcon?: string;
    /** True when a filter/search is active, so the empty state says so. */
    filtered?: boolean;
    /** Keeps the header visible while the body scrolls. */
    stickyHeader?: boolean;
    /** Per-row classes, for tables where a row's state tints the whole row. */
    rowClass?: (row: Row) => string | undefined;
  }>(),
  {
    rowKey: "id",
    loadingRows: 5,
    emptyTitle: "Nothing here yet",
    emptyIcon: "lucide:inbox",
    loading: false,
    filtered: false,
    stickyHeader: false,
  },
);

const emit = defineEmits<{ "row-click": [row: Row] }>();

const sortKey = ref<string | null>(null);
const sortDir = ref<"asc" | "desc">("asc");

// Sorting reorders the DOM, which the browser cannot transition on its own — so
// rows would silently swap places and the reader would have to re-read the list
// to find the one they were looking at. FLIP animates each row from where it was
// to where it now is, so you can follow your row to its new position.
const tableEl = ref<HTMLElement | null>(null);
const flip = useFlipList(tableEl, { itemSelector: "tbody [data-flip-id]" });

async function toggleSort(col: DataTableColumn<Row>) {
  if (!col.sortable) return;
  flip.capture();
  if (sortKey.value === col.key) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = col.key;
    sortDir.value = "asc";
  }
  await flip.play();
}

const cellValue = (row: Row, col: DataTableColumn<Row>) =>
  col.value ? col.value(row) : row[col.key];

const sortedRows = computed(() => {
  if (!sortKey.value) return props.rows;
  const col = props.columns.find((c) => c.key === sortKey.value);
  if (!col) return props.rows;
  const dir = sortDir.value === "asc" ? 1 : -1;
  // Copy before sorting: mutating the caller's array in place would reorder
  // their source data as a side effect of clicking a header.
  return [...props.rows].sort((a, b) => {
    const av = cellValue(a, col);
    const bv = cellValue(b, col);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // Blanks sort last in both directions.
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
  });
});

const keyFor = (row: Row, i: number) => {
  if (typeof props.rowKey === "function") return props.rowKey(row);
  return row[props.rowKey] ?? i;
};

const clickable = computed(() => !!getCurrentInstance()?.vnode.props?.onRowClick);

const alignClass = (col: DataTableColumn<Row>) =>
  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left";
</script>

<template>
  <div class="data-table">
    <div v-if="$slots.toolbar" class="data-table__toolbar">
      <slot name="toolbar" />
    </div>

    <div
      ref="tableEl"
      class="data-table__scroll"
      :class="{ 'data-table__scroll--sticky': stickyHeader }"
    >
      <Table class="data-table__table">
        <TableHeader>
          <TableRow>
            <TableHead
              v-for="col in columns"
              :key="col.key"
              :class="[alignClass(col), col.hideOnMobile ? 'data-table__col--desktop' : '']"
            >
              <button
                v-if="col.sortable"
                type="button"
                class="data-table__sort type-micro"
                :aria-sort="sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'"
                @click="toggleSort(col)"
              >
                {{ col.label }}
                <Icon
                  :name="
                    sortKey === col.key
                      ? sortDir === 'asc'
                        ? 'lucide:arrow-up'
                        : 'lucide:arrow-down'
                      : 'lucide:chevrons-up-down'
                  "
                  class="size-3"
                  :class="{ 'opacity-40': sortKey !== col.key }"
                />
              </button>
              <span v-else class="type-micro">{{ col.label }}</span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          <!-- Loading: skeleton rows keep the table's shape so the page does
               not jump when the data lands. -->
          <TableRow v-for="n in loading ? loadingRows : 0" :key="`sk-${n}`">
            <TableCell v-for="col in columns" :key="col.key" :class="col.hideOnMobile ? 'data-table__col--desktop' : ''">
              <span class="river-skeleton data-table__skeleton" />
            </TableCell>
          </TableRow>

          <TableRow
            v-for="(row, i) in loading ? [] : sortedRows"
            :key="keyFor(row, i)"
            :data-flip-id="keyFor(row, i)"
            class="data-table__row stagger-item"
            :class="[{ 'data-table__row--clickable': clickable }, rowClass?.(row)]"
            :tabindex="clickable ? 0 : undefined"
            :role="clickable ? 'button' : undefined"
            @click="clickable && emit('row-click', row)"
            @keydown.enter="clickable && emit('row-click', row)"
            @keydown.space.prevent="clickable && emit('row-click', row)"
          >
            <TableCell
              v-for="col in columns"
              :key="col.key"
              :class="[alignClass(col), col.class, col.hideOnMobile ? 'data-table__col--desktop' : '']"
              :data-label="col.label"
            >
              <slot :name="`cell-${col.key}`" :row="row" :value="cellValue(row, col)">
                {{ cellValue(row, col) }}
              </slot>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <div v-if="!loading && !rows.length" class="data-table__empty">
      <slot name="empty">
        <AppEmptyState
          :title="filtered ? 'No matches' : emptyTitle"
          :description="filtered ? 'Try a different search or filter.' : emptyDescription"
          :icon="emptyIcon"
          :variant="filtered ? 'search' : 'empty'"
          compact
        />
      </slot>
    </div>
  </div>
</template>

<style scoped>
/* Every `:deep()` rule below is anchored on `.data-table__scroll`, a plain div
   in this template, and NOT on `.data-table__table`. The table class lands on
   the inner `<table>` of the Table primitive, which is not that component's
   root element and therefore never receives this file's scope attribute — so
   rules written against it compiled to a selector that matched nothing. The
   mobile card collapse, the sticky header and the muted header colour were all
   silently dead until a phone-width pass showed a full table still sitting
   there. Found by looking at computed styles in the browser, not by reading. */
.data-table__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.data-table__scroll {
  overflow-x: auto;
}
.data-table__scroll--sticky :deep(thead) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--theme-card-bg);
}
.data-table__scroll :deep(th) {
  color: var(--theme-text-muted);
}
.data-table__sort {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: inherit;
  cursor: pointer;
}
.data-table__sort:hover {
  color: var(--theme-text-primary);
}
.data-table__skeleton {
  display: block;
  height: 1rem;
  width: 70%;
  border-radius: 999px;
}
.data-table__row--clickable {
  cursor: pointer;
}
.data-table__empty {
  border-top: 1px solid var(--theme-border-light);
}

/* Phones: stack each row into a labelled card. A table that scrolls sideways
   hides the columns that matter and is miserable to read one-handed. */
@media (max-width: 639px) {
  .data-table__col--desktop {
    display: none;
  }
  .data-table__scroll :deep(thead) {
    display: none;
  }
  .data-table__scroll :deep(tbody tr) {
    display: block;
    border-bottom: 1px solid var(--theme-border-light);
    padding: 0.5rem 0;
  }
  .data-table__scroll :deep(tbody td) {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: baseline;
    text-align: right;
    border: 0;
    padding-block: 0.25rem;
  }
  /* A column with no label has nothing to announce, so it skips the label rail
     and takes the full width instead of sitting in a lopsided two-up. */
  .data-table__scroll :deep(tbody td[data-label=""]) {
    justify-content: flex-end;
  }
  .data-table__scroll :deep(tbody td:not([data-label=""]))::before {
    content: attr(data-label);
    font-size: 0.675rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-muted);
    text-align: left;
    flex-shrink: 0;
  }
}
</style>

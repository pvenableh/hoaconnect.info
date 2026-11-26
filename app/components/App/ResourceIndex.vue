<script setup lang="ts" generic="Row extends Record<string, any>">
/**
 * AppResourceIndex — the index moment of plan §2.3, by construction
 * (docs/spec-resource-scaffold.md).
 *
 * One eye path on every resource page: the header (title, count, the one
 * primary "New …"), search, the one segmented status filter, the rows (a table
 * on desktop, labelled cards on phones — `AppDataTable` already does both), and
 * an empty state that offers the create action. Clicking a row opens the
 * resource's panel, so the list stays in view.
 *
 * The rows, the search, the filters, the selection and the open panel all live
 * in the `useResource` handle the page passes in. This component only draws
 * them, so a page cannot drift from the grammar without leaving the scaffold.
 *
 * Two placements:
 *   • With `title`, it renders `AppPageHeader` itself — a page that IS one
 *     resource's index.
 *   • Without, it is one view of a page that owns its header (a tab of a hub),
 *     and the count leads the toolbar instead.
 *
 * `group` and `groups` draw the rows in sections with sticky headers, for every
 * index that has them (docs/spec-resource-scaffold.md).
 *
 * `canCreate: false` hides every create control: a role never sees a control
 * it cannot use. Cell slots (`#cell-<key>`) pass straight to `AppDataTable`;
 * a control inside a cell must stop its click, or it also opens the row.
 */
import type { DataTableColumn } from "./DataTable.vue";
import type { DataTableStack } from "./data-table-stack";
import type { ResourceHandle } from "#core/app/composables/useResource";
import { useAppSlideOver } from "#core/app/composables/useAppSlideOverStack";
import { flipPayloadFrom } from "#core/app/composables/useFlipFromRow";
import { useSharedElement } from "#core/app/composables/useSharedElement";

const props = withDefaults(
  defineProps<{
    resource: ResourceHandle<Row>;
    columns: DataTableColumn<Row>[];
    /** "3 charges"; also the default search placeholder and empty title. */
    noun: { one: string; other: string };
    /** Renders AppPageHeader. Leave out when the page owns its header. */
    title?: string;
    description?: string;
    canCreate?: boolean;
    /** Title Case: "New Charge". */
    createLabel?: string;
    searchPlaceholder?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyIcon?: string;
    rowClass?: (row: Row) => string | undefined;
    /**
     * Group the rows under sticky headers (a row's group key), in the order and
     * with the labels `groups` gives. A grouped index is how a resource with a
     * natural set of sections reads: the register, by category.
     */
    group?: (row: Row) => string | null | undefined;
    groups?: { key: string; label: string }[];
    /**
     * Two lines per record (the primary column and a status on top, the other
     * columns beneath), the same on a phone and a desktop. For an index whose
     * rows carry something long: a list of holders, a sentence.
     */
    stack?: DataTableStack;
    /**
     * With no `#summary` slot, the strip shows one count per status (counting
     * up), and a tap filters the table as the segmented control does; a second
     * tap clears. `false` leaves the strip out.
     */
    summary?: boolean;
  }>(),
  { canCreate: false, emptyIcon: "lucide:inbox", summary: true },
);

const emit = defineEmits<{ create: []; open: [row: Row] }>();
const slots = useSlots();

// The handle is the page's store, and its view fields (search, status) are
// written from here by design: this is the control that edits them, not a
// child changing its owner's data behind its back. The alias says so.
const view = toRef(props, "resource");

// Open and return. The panel flies out of the clicked row (flipFrom, as the
// request and task lists do), and on close focus and the settle go back to that
// same row. `openedFrom` remembers which row opened the panel, so a panel opened
// by a deep link or by another row never settles the wrong one.
const rootEl = ref<HTMLElement | null>(null);
const shared = useSharedElement();
const slide = props.resource.panel ? useAppSlideOver(props.resource.panel) : null;
let lastRowEl: HTMLElement | null = null;
let openedFrom: { key: string; el: HTMLElement } | null = null;

function noteRow(ev: Event) {
  const el = (ev.target as Element | null)?.closest?.(".data-table__row");
  lastRowEl = (el as HTMLElement) ?? null;
}

watch(
  () => props.resource.openId,
  async (now, prev) => {
    if (!prev || now || !openedFrom || openedFrom.key !== prev) return;
    const { el } = openedFrom;
    openedFrom = null;
    await nextTick();
    if (!el.isConnected) return;
    el.focus({ preventScroll: true });
    void shared.grow(el);
  },
);

// The summary's filter writes the same status field as the segmented control.
// `reset()` clears search and filters only, so clearing a summary tap also puts
// the status back on its first item, the one a fresh visit opens on.
const defaultStatus = computed(() => props.resource.statusItems[0]?.value as typeof view.value.status | undefined);
const statusNotDefault = computed(
  () => !!defaultStatus.value && view.value.status !== defaultStatus.value,
);
function setSummaryStatus(v: string | null) {
  view.value.status = v as typeof view.value.status;
}
function clearSummaryStatus() {
  props.resource.reset();
  if (defaultStatus.value) view.value.status = defaultStatus.value;
}

// The default summary: one tile per status once the rows are in.
const showCountStrip = computed(
  () => props.summary && props.resource.statusItems.length > 1 && !(props.resource.pending && !props.resource.total),
);
function tapCount(value: string) {
  if (view.value.status === value && value !== defaultStatus.value) clearSummaryStatus();
  else setSummaryStatus(value);
}

const countLabel = computed(() => {
  // "0 charges" while the first load is in flight would be a false statement.
  if (props.resource.pending && !props.resource.total) return "Loading…";
  const n = props.resource.count;
  return `${n} ${n === 1 ? props.noun.one : props.noun.other}`;
});
const showCreate = computed(() => props.canCreate && !!props.createLabel);
const placeholder = computed(() => props.searchPlaceholder ?? `Search ${props.noun.other}`);
const emptyTitleText = computed(() => props.emptyTitle ?? `No ${props.noun.other} yet`);

// Bulk actions: a `#bulk` slot turns on a leading checkbox column.
const SELECT_SLOT = "cell-__select";
const selectable = computed(() => !!slots.bulk);
const tableColumns = computed<DataTableColumn<Row>[]>(() =>
  selectable.value ? [{ key: "__select", label: "", class: "w-10" }, ...props.columns] : props.columns,
);
const cellSlots = computed(() => Object.keys(slots).filter((n) => n.startsWith("cell-")));

// A row is clickable only when something opens: the resource's panel, or an
// `@open` listener (a page with no panel yet). Otherwise the rows stay plain.
const instance = getCurrentInstance();
const clickable = computed(() => !!props.resource.panel || !!instance?.vnode.props?.onOpen);
function onRowClick(row: Row) {
  if (slide) {
    const key = props.resource.keyOf(row);
    const el = lastRowEl;
    if (el) {
      shared.capture(el);
      openedFrom = { key, el };
    }
    void slide.open(key, { flipFrom: flipPayloadFrom(el) });
  }
  emit("open", row);
}
// camelCase key: `v-on="{…}"` turns it into `onRowClick`, which is the prop
// AppDataTable looks for to make its rows buttons.
const rowListeners = computed(() => (clickable.value ? { rowClick: onRowClick } : {}));

function rowClasses(row: Row) {
  const open = !!props.resource.openId && props.resource.keyOf(row) === props.resource.openId;
  return [props.rowClass?.(row), open ? "resource-index__row--open" : ""].filter(Boolean).join(" ") || undefined;
}
</script>

<template>
  <div ref="rootEl" class="resource-index">
    <AppPageHeader v-if="title" :title="title" :description="description">
      <template #meta>
        <span class="type-meta t-text-muted tabular-nums">{{ countLabel }}</span>
        <slot name="meta" />
      </template>
      <template v-if="showCreate || $slots.actions" #actions>
        <slot name="actions" />
        <AppButton v-if="showCreate" class="rounded-full" @click="emit('create')">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
          {{ createLabel }}
        </AppButton>
      </template>
    </AppPageHeader>

    <!-- Summary strip: a page may draw a chart here whose taps filter the table
         (`select` gives the page the tapped row; `setStatus` writes the same field
         the segmented filter uses). Clear returns the view to its default. -->
    <div
      v-if="!$slots.summary && showCountStrip"
      class="resource-index__summary"
      role="group"
      :aria-label="`${noun.other} by status`"
      data-testid="resource-summary-counts"
    >
      <AppButton
        v-for="s in resource.statusItems"
        :key="s.value"
        variant="ghost"
        class="resource-index__count ios-card h-auto"
        :class="{ 'is-active': view.status === s.value }"
        :aria-pressed="view.status === s.value"
        @click="tapCount(s.value)"
      >
        <span class="text-xl font-semibold leading-tight tabular-nums"><AppCountUp :value="s.count" /></span>
        <span class="text-xs t-text-muted">{{ s.label }}</span>
      </AppButton>
      <AppButton v-if="statusNotDefault" variant="outline" size="sm" class="rounded-full" @click="clearSummaryStatus()">
        Clear filter
      </AppButton>
    </div>
    <div v-if="$slots.summary" class="resource-index__summary">
      <slot
        name="summary"
        :activeStatus="view.status"
        :setStatus="setSummaryStatus"
        :clear="clearSummaryStatus"
        :isFiltered="resource.isFiltered || statusNotDefault"
      />
    </div>

    <div class="resource-index__toolbar">
      <span v-if="!title" class="type-meta t-text-muted tabular-nums" aria-live="polite">{{ countLabel }}</span>
      <div class="resource-index__search">
        <Icon name="lucide:search" class="resource-index__search-icon" aria-hidden="true" />
        <AppInput
          :model-value="view.query"
          type="search"
          :placeholder="placeholder"
          :aria-label="placeholder"
          class="pl-8 rounded-full"
          @update:model-value="(v) => (view.query = String(v ?? ''))"
        />
      </div>
      <AppSegmentedControl
        v-if="resource.statusItems.length"
        :model-value="view.status"
        :items="resource.statusItems"
        size="sm"
        label="Status"
        @update:model-value="(v) => (view.status = v)"
      />
      <slot name="filters" />
    </div>

    <div v-if="selectable && resource.selected.length" class="resource-index__bulk">
      <span class="type-meta t-text tabular-nums">{{ resource.selected.length }} selected</span>
      <AppButton size="sm" variant="ghost" @click="resource.selectAll()">Select All</AppButton>
      <AppButton size="sm" variant="ghost" @click="resource.clear()">Clear</AppButton>
      <div class="resource-index__bulk-actions">
        <slot name="bulk" :rows="resource.selectedRows" />
      </div>
    </div>

    <!-- Grouped, the card clips instead of hiding: `overflow: hidden` makes the card
         a scroll container, and a sticky header then sticks inside the card
         (where nothing scrolls) instead of to the window. -->
    <div
      class="ios-card px-2 pb-2"
      :class="group ? 'overflow-clip' : 'overflow-hidden'"
      @click.capture="noteRow"
      @keydown.capture="noteRow"
    >
      <AppDataTable
        :columns="tableColumns"
        :rows="resource.visible"
        :row-key="resource.keyOf"
        :loading="resource.pending"
        :row-class="rowClasses"
        :group="group"
        :groups="groups"
        :stack="stack"
        v-on="rowListeners"
      >
        <template v-if="selectable" #[SELECT_SLOT]="{ row }">
          <span class="inline-flex" @click.stop @keydown.stop>
            <Checkbox
              :model-value="resource.isSelected(row)"
              :aria-label="resource.isSelected(row) ? 'Deselect row' : 'Select row'"
              @update:model-value="resource.toggle(row)"
            />
          </span>
        </template>
        <template v-for="name in cellSlots" :key="name" #[name]="slotProps">
          <slot :name="name" v-bind="slotProps" />
        </template>
        <template #empty>
          <AppEmptyState
            v-if="resource.error"
            title="Could not load"
            :description="resource.error"
            icon="lucide:cloud-off"
            size="sm"
          >
            <template #actions>
              <AppButton variant="outline" size="sm" @click="resource.refresh()">Try Again</AppButton>
            </template>
          </AppEmptyState>
          <AppEmptyState
            v-else-if="!resource.total"
            :title="emptyTitleText"
            :description="emptyDescription"
            :icon="emptyIcon"
            size="sm"
          >
            <template v-if="showCreate" #actions>
              <AppButton class="rounded-full" @click="emit('create')">
                <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
                {{ createLabel }}
              </AppButton>
            </template>
          </AppEmptyState>
          <AppEmptyState
            v-else
            title="No matches"
            description="Try a different search or filter."
            variant="search"
            size="sm"
          >
            <template v-if="resource.isFiltered" #actions>
              <AppButton variant="outline" size="sm" @click="resource.reset()">Clear Search</AppButton>
            </template>
          </AppEmptyState>
        </template>
      </AppDataTable>
    </div>
  </div>
</template>

<style scoped>
.resource-index {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.resource-index__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}
.resource-index__count {
  display: flex;
  min-width: 6.5rem;
  min-height: 44px;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  padding: 0.5rem 0.875rem;
  text-align: left;
  border-radius: var(--radius-lg, 0.75rem);
}
.resource-index__count.is-active {
  outline: 2px solid var(--color-ring, currentColor);
  outline-offset: 1px;
}
.resource-index__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}
.resource-index__search {
  position: relative;
  flex: 1 1 14rem;
  max-width: 22rem;
}
.resource-index__search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  width: 0.875rem;
  height: 0.875rem;
  color: var(--theme-text-muted);
  pointer-events: none;
}
.resource-index__bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-bg-secondary) 80%, transparent);
}
.resource-index__bulk-actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}
/* The row whose panel is open, so the eye can find its place on the way back. */
.resource-index :deep(.resource-index__row--open) {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}
</style>

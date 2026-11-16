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
import type { ResourceHandle } from "#core/app/composables/useResource";

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
  }>(),
  { canCreate: false, emptyIcon: "lucide:inbox" },
);

const emit = defineEmits<{ create: []; open: [row: Row] }>();
const slots = useSlots();

// The handle is the page's store, and its view fields (search, status) are
// written from here by design: this is the control that edits them, not a
// child changing its owner's data behind its back. The alias says so.
const view = toRef(props, "resource");

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
  if (props.resource.panel) void props.resource.open(row);
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
  <div class="resource-index">
    <AppPageHeader v-if="title" :title="title" :description="description">
      <template #meta>
        <span class="type-meta t-text-muted tabular-nums">{{ countLabel }}</span>
        <slot name="meta" />
      </template>
      <template v-if="showCreate || $slots.actions" #actions>
        <slot name="actions" />
        <Button v-if="showCreate" class="rounded-full" @click="emit('create')">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
          {{ createLabel }}
        </Button>
      </template>
    </AppPageHeader>

    <div class="resource-index__toolbar">
      <span v-if="!title" class="type-meta t-text-muted tabular-nums" aria-live="polite">{{ countLabel }}</span>
      <div class="resource-index__search">
        <Icon name="lucide:search" class="resource-index__search-icon" aria-hidden="true" />
        <Input
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
      <Button size="sm" variant="ghost" @click="resource.selectAll()">Select All</Button>
      <Button size="sm" variant="ghost" @click="resource.clear()">Clear</Button>
      <div class="resource-index__bulk-actions">
        <slot name="bulk" :rows="resource.selectedRows" />
      </div>
    </div>

    <!-- Grouped, the card clips instead of hiding: `overflow: hidden` makes the card
         a scroll container, and a sticky header then sticks inside the card
         (where nothing scrolls) instead of to the window. -->
    <div class="ios-card px-2 pb-2" :class="group ? 'overflow-clip' : 'overflow-hidden'">
      <AppDataTable
        :columns="tableColumns"
        :rows="resource.visible"
        :row-key="resource.keyOf"
        :loading="resource.pending"
        :row-class="rowClasses"
        :group="group"
        :groups="groups"
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
              <Button variant="outline" size="sm" @click="resource.refresh()">Try Again</Button>
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
              <Button class="rounded-full" @click="emit('create')">
                <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
                {{ createLabel }}
              </Button>
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
              <Button variant="outline" size="sm" @click="resource.reset()">Clear Search</Button>
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

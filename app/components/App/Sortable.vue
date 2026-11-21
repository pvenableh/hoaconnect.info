<script setup lang="ts" generic="T extends Record<string, any>">
// AppSortable — reorder a list by drag, by keyboard (Alt + arrows, Home/End) or
// from a "Move to…" menu (slot prop `moveTo`). Every change shows an Undo toast.
// vuedraggable for the drag (Canvas.vue's pattern: a local mirror guarded by a
// `dragging` flag so the parent's prop updates never fight the drag).
import draggable from "vuedraggable";
import { keyboardTarget, moveItem, moveToOptions } from "#core/shared/motion";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue: T[];
    itemKey: string;
    /** What the list is, for the announcement and the toast ("dashboard", "dock"). */
    label?: string;
    orientation?: "vertical" | "horizontal" | "both";
    /** CSS selector of the grab handle; omit to drag the whole item. */
    handle?: string;
    disabled?: boolean;
    /** Press-and-hold before a touch drag starts, so scrolling still works. */
    delay?: number;
    itemClass?: string | ((item: T) => string);
    undo?: boolean;
  }>(),
  { label: "list", orientation: "both", delay: 280, undo: true }
);
const emit = defineEmits<{
  "update:modelValue": [items: T[]];
  reorder: [info: { from: number; to: number; items: T[]; previous: T[] }];
}>();

const dragging = ref(false);
const local = ref([...props.modelValue]) as Ref<T[]>;
watch(
  () => props.modelValue,
  (next) => {
    if (!dragging.value) local.value = [...next] as T[];
  }
);

const live = ref("");
const keyOf = (item: T) => String(item[props.itemKey]);

async function commit(next: T[], previous: T[], from: number, to: number) {
  local.value = next;
  emit("update:modelValue", next);
  emit("reorder", { from, to, items: next, previous });
  const moved = next[to];
  const name = moved ? keyOf(moved) : "item";
  live.value = `Moved ${name} to position ${to + 1} of ${next.length}`;
  if (!props.undo || !import.meta.client) return;
  const { toast } = await import("vue-sonner");
  toast(`Moved to position ${to + 1}`, {
    description: `Your ${props.label} order changed.`,
    action: {
      label: "Undo",
      onClick: () => {
        local.value = previous;
        emit("update:modelValue", previous);
        emit("reorder", { from: to, to: from, items: previous, previous: next });
        live.value = `Restored ${props.label} order`;
      },
    },
  });
}

function moveTo(from: number, to: number) {
  if (props.disabled || from === to) return;
  const previous = [...local.value];
  const next = moveItem(previous, from, to);
  void commit(next, previous, from, Math.max(0, Math.min(previous.length - 1, to)));
}

let startList: T[] = [];
function onStart() {
  dragging.value = true;
  startList = [...props.modelValue] as T[];
}
function onEnd(e: { oldIndex?: number; newIndex?: number }) {
  dragging.value = false;
  const from = e.oldIndex ?? -1;
  const to = e.newIndex ?? -1;
  if (from < 0 || to < 0 || from === to) return;
  // vuedraggable already wrote the new order into `local`.
  void commit([...local.value], startList, from, to);
}

const root = ref<HTMLElement | null>(null);
function onKeydown(e: KeyboardEvent) {
  if (props.disabled || !e.altKey) return;
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-sortable-index]");
  if (!el || !root.value?.contains(el)) return;
  const index = Number(el.dataset.sortableIndex);
  const to = keyboardTarget(e.key, index, local.value.length, props.orientation);
  if (to === null) return;
  e.preventDefault();
  moveTo(index, to);
  // The wrapper re-renders in its new slot; hand focus back to the same control.
  const key = el.dataset.sortableKey;
  nextTick(() => {
    const again = root.value?.querySelector<HTMLElement>(`[data-sortable-key="${CSS.escape(key ?? "")}"]`);
    (again?.querySelector<HTMLElement>("button, a, [tabindex]") ?? again)?.focus();
  });
}

defineExpose({ moveTo });
</script>

<template>
  <div ref="root" class="app-sortable" @keydown="onKeydown">
    <draggable
      v-model="local"
      :item-key="itemKey"
      :handle="handle"
      :disabled="disabled"
      :delay="delay"
      :delay-on-touch-only="true"
      :animation="200"
      ghost-class="app-sortable__ghost"
      chosen-class="app-sortable__chosen"
      v-bind="$attrs"
      @start="onStart"
      @end="onEnd"
    >
      <template #item="{ element, index }">
        <div
          :class="typeof itemClass === 'function' ? itemClass(element) : itemClass"
          :data-sortable-key="keyOf(element)"
          :data-sortable-index="index"
          :aria-roledescription="disabled ? undefined : 'sortable item'"
        >
          <slot
            name="item"
            :element="element"
            :index="index"
            :count="local.length"
            :move-to="(to: number) => moveTo(index, to)"
            :options="moveToOptions(local.length, index)"
          />
        </div>
      </template>
      <template v-if="$slots.footer" #footer><slot name="footer" /></template>
    </draggable>
    <span class="sr-only" aria-live="polite">{{ live }}</span>
  </div>
</template>

<style scoped>
.app-sortable {
  display: contents;
}
.app-sortable__ghost {
  opacity: 0.45;
}
@media (prefers-reduced-motion: reduce) {
  .app-sortable__ghost {
    opacity: 0.6;
  }
}
</style>

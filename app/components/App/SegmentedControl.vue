<script setup lang="ts">
/**
 * The one way to switch between sibling views.
 *
 * This replaces four different tab treatments that had grown up in parallel
 * (hand-rolled underline buttons, shadcn Tabs, the sub-nav pill row, and the
 * communications tabs). They all did the same job and none of them looked or
 * behaved quite like the others, so the control had to be re-learned on every
 * page. One control, one thumb material, one set of keys.
 *
 * Keyboard follows the WAI-ARIA tabs pattern: arrows move AND select (automatic
 * activation), which is correct when switching is instant and cheap. Home/End
 * jump to the ends.
 */


export interface SegmentedItem {
  /** Stable identifier — this is what `modelValue` holds. */
  value: string;
  label: string;
  /** Optional leading icon name (lucide:*). */
  icon?: string;
  /** Optional trailing count. Rendered muted, and hidden when zero. */
  count?: number;
  disabled?: boolean;
}

const props = withDefaults(
  defineProps<{
    items: SegmentedItem[];
    modelValue: string;
    /** `md` is the page-level control; `sm` suits toolbars and card headers. */
    size?: "sm" | "md";
    /** Stretch items to fill the track — for 2-3 items acting as a switch. */
    fill?: boolean;
    /** Accessible name for the tablist. */
    label?: string;
  }>(),
  { size: "md", fill: false, label: "Views" },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const haptic = useHaptic();

const activeIndex = computed(() =>
  props.items.findIndex((i) => i.value === props.modelValue),
);

const { trackEl, setItemRef, thumbStyle } = useSlidingThumb(activeIndex, {
  watchSource: () => props.items.map((i) => i.label + (i.count ?? "")).join("|"),
});

function select(item: SegmentedItem) {
  if (item.disabled || item.value === props.modelValue) return;
  haptic.selection();
  emit("update:modelValue", item.value);
}

/** Move to the next selectable item, wrapping, skipping disabled ones. */
function move(delta: number) {
  const n = props.items.length;
  if (!n) return;
  let i = activeIndex.value;
  for (let step = 0; step < n; step++) {
    i = (i + delta + n) % n;
    const candidate = props.items[i];
    if (!candidate.disabled) {
      select(candidate);
      // Keep focus with the selection so the next arrow press continues from
      // here rather than from wherever the user last clicked.
      nextTick(() => itemButtons.value[i]?.focus());
      return;
    }
  }
}

function jump(to: "first" | "last") {
  const list = to === "first" ? props.items : [...props.items].reverse();
  const item = list.find((i) => !i.disabled);
  if (!item) return;
  select(item);
  nextTick(() => itemButtons.value[props.items.indexOf(item)]?.focus());
}

const itemButtons = ref<HTMLButtonElement[]>([]);
function setButtonRef(index: number) {
  return (el: Element | ComponentPublicInstance | null) => {
    itemButtons.value[index] = el as HTMLButtonElement;
    setItemRef(index)(el);
  };
}
</script>

<template>
  <div
    ref="trackEl"
    role="tablist"
    :aria-label="label"
    class="segmented"
    :class="[`segmented--${size}`, { 'segmented--fill': fill }]"
    @keydown.left.prevent="move(-1)"
    @keydown.right.prevent="move(1)"
    @keydown.home.prevent="jump('first')"
    @keydown.end.prevent="jump('last')"
  >
    <!-- The thumb is a sibling, not a child of the active item, so it can
         travel between items instead of appearing and disappearing. -->
    <span class="segmented__thumb glass-active-thumb" :style="thumbStyle" aria-hidden="true" />

    <button
      v-for="(item, i) in items"
      :key="item.value"
      :ref="setButtonRef(i)"
      type="button"
      role="tab"
      :aria-selected="item.value === modelValue"
      :tabindex="item.value === modelValue ? 0 : -1"
      :disabled="item.disabled"
      class="segmented__item"
      :class="{ 'segmented__item--active': item.value === modelValue }"
      @click="select(item)"
    >
      <Icon v-if="item.icon" :name="item.icon" class="segmented__icon" />
      <span class="segmented__label">{{ item.label }}</span>
      <span v-if="item.count" class="segmented__count">{{ item.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.segmented {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-bg-secondary) 60%, transparent);
  /* Concentric: the inner pill radius is the outer minus the padding. Both are
     fully round here, so this is really about the track hugging its items. */
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}
.segmented::-webkit-scrollbar {
  display: none;
}
.segmented--fill {
  display: flex;
  width: 100%;
}
.segmented--fill .segmented__item {
  flex: 1 1 0;
  justify-content: center;
}

.segmented__thumb {
  position: absolute;
  top: 3px;
  left: 0;
  bottom: 3px;
  border-radius: 999px;
  /* The house iOS spring. Transform + width only — no layout, no paint. */
  transition:
    transform 400ms var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1)),
    width 400ms var(--spring, cubic-bezier(0.36, 0.66, 0.04, 1)),
    opacity 200ms ease;
  pointer-events: none;
}

.segmented__item {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  white-space: nowrap;
  border-radius: 999px;
  color: var(--theme-text-tertiary);
  font-weight: 500;
  transition: color var(--motion-fast, 160ms) ease;
  cursor: pointer;
}
.segmented__item:hover:not(:disabled):not(.segmented__item--active) {
  color: var(--theme-text-secondary);
}
.segmented__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.segmented__item--active {
  color: var(--theme-text-primary);
  font-weight: 600;
}

.segmented--md .segmented__item {
  padding: 0.4375rem 0.875rem;
  font-size: 0.8125rem;
}
.segmented--sm .segmented__item {
  padding: 0.3125rem 0.625rem;
  font-size: 0.75rem;
}

.segmented__icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}
.segmented--sm .segmented__icon {
  width: 0.875rem;
  height: 0.875rem;
}

.segmented__count {
  font-variant-numeric: tabular-nums;
  font-size: 0.6875rem;
  color: var(--theme-text-muted);
}
.segmented__item--active .segmented__count {
  color: var(--theme-text-secondary);
}

@media (prefers-reduced-motion: reduce) {
  .segmented__thumb {
    transition: opacity 120ms ease;
  }
}
</style>

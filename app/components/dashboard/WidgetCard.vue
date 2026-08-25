<script setup lang="ts">
import type { WidgetDef } from "#core/app/composables/useDashboardWidgets";

// Chrome around a single dashboard widget. In normal mode it's an invisible
// layout wrapper (just the grid column span) so the inner content keeps its own
// card styling. In edit mode it gains a drag handle, a remove button, and
// left/right nudge controls (a touch-friendly fallback to drag), and the content
// is made inert so clicks don't fire while rearranging.
const props = defineProps<{
  widget: WidgetDef;
  editing: boolean;
  isFirst: boolean;
  isLast: boolean;
}>();

const emit = defineEmits<{
  hide: [key: string];
  move: [key: string, dir: -1 | 1];
  reorder: [fromKey: string, toKey: string];
}>();

const isDragOver = ref(false);

const spanClass = computed(() => {
  switch (props.widget.span) {
    case "full":
      return "md:col-span-2 lg:col-span-3";
    case "lg":
      return "lg:col-span-2";
    default:
      return "";
  }
});

const onDragStart = (e: DragEvent) => {
  if (!props.editing) return;
  e.dataTransfer?.setData("text/plain", props.widget.key);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
};
const onDragOver = (e: DragEvent) => {
  if (!props.editing) return;
  e.preventDefault();
  isDragOver.value = true;
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
};
const onDrop = (e: DragEvent) => {
  if (!props.editing) return;
  e.preventDefault();
  isDragOver.value = false;
  const fromKey = e.dataTransfer?.getData("text/plain");
  if (fromKey) emit("reorder", fromKey, props.widget.key);
};
</script>

<template>
  <div
    :class="[spanClass, editing && 'dash-widget--editing', isDragOver && 'dash-widget--dragover']"
    :draggable="editing"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @dragleave="isDragOver = false"
    @drop="onDrop"
  >
    <!-- Edit toolbar -->
    <div v-if="editing" class="dash-widget__bar">
      <span class="flex items-center gap-1.5 min-w-0">
        <Icon name="lucide:grip-vertical" class="w-4 h-4 t-text-muted shrink-0 cursor-grab" />
        <Icon :name="'i-lucide-' + widget.icon" class="w-3.5 h-3.5 t-text-muted shrink-0" />
        <span class="text-xs font-medium t-text-secondary truncate">{{ widget.title }}</span>
      </span>
      <span class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          class="dash-widget__btn glass-btn-soft"
          :disabled="isFirst"
          title="Move earlier"
          @click="emit('move', widget.key, -1)"
        >
          <Icon name="lucide:chevron-left" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="dash-widget__btn glass-btn-soft"
          :disabled="isLast"
          title="Move later"
          @click="emit('move', widget.key, 1)"
        >
          <Icon name="lucide:chevron-right" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="dash-widget__btn glass-btn-soft dash-widget__btn--danger"
          title="Remove widget"
          @click="emit('hide', widget.key)"
        >
          <Icon name="lucide:x" class="w-3.5 h-3.5" />
        </button>
      </span>
    </div>

    <div :class="editing && 'pointer-events-none select-none opacity-95'">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.dash-widget--editing {
  position: relative;
  border-radius: 1rem;
  outline: 1.5px dashed hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l) / 0.4);
  outline-offset: 4px;
  cursor: grab;
}
.dash-widget--dragover {
  outline-style: solid;
  outline-color: hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l));
}
.dash-widget__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0.25rem 0.25rem 0.5rem;
}
/* The pill's MATERIAL comes from `.glass-btn-soft` on the element, not from
   here — this rule only sizes it. Deliberately no `background`: a scoped rule is
   unlayered and would beat `.glass-btn-soft` in `@layer components`, putting the
   flat pre-glass fill back on top of the rim. */
.dash-widget__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  color: var(--theme-text-secondary, #6b7280);
  transition: opacity 120ms ease;
}
.dash-widget__btn:hover {
  opacity: 0.8;
}
.dash-widget__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
/* Was a hardcoded `hsl(0 80% 55% / 0.12)` fill with `hsl(0 70% 45%)` ink — a
   fixed red that never followed the theme and sat at roughly 3:1 on the dark
   pill. `--destructive` flips with the mode and is contrast-tested in
   tests/shared/theme-app-tokens.test.ts. The tint is layered OVER the glass
   material rather than replacing it, so the rim survives. */
.dash-widget__btn--danger {
  background-image: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--destructive) 14%, transparent),
    color-mix(in srgb, var(--destructive) 14%, transparent)
  );
  color: var(--destructive);
}
</style>

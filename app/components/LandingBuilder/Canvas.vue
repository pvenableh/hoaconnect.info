<script setup lang="ts">
// The drag-drop section canvas. vuedraggable reorders the blocks (new sections
// are added from the palette); a local mirror guarded by a `dragging` flag keeps
// vuedraggable from fighting the parent's prop updates. One section expands at a
// time (expandedId, v-model). Mirrors EmailBuilder/Canvas.
import draggable from "vuedraggable";
import type { LandingBlock } from "#core/shared/utils/landing";

const props = defineProps<{ blocks: LandingBlock[] }>();
const emit = defineEmits<{
  (e: "remove", id: string): void;
  (e: "move", payload: { id: string; direction: "up" | "down" }): void;
  (e: "duplicate", id: string): void;
  (e: "reorder", blocks: LandingBlock[]): void;
}>();

const expandedId = defineModel<string | null>("expandedId", { default: null });

const dragging = ref(false);
const localBlocks = ref<LandingBlock[]>([...props.blocks]);

watch(
  () => props.blocks,
  (next) => {
    if (!dragging.value) localBlocks.value = [...next];
  },
  { deep: false }
);

function onDragEnd() {
  dragging.value = false;
  emit("reorder", [...localBlocks.value]);
}
function setExpanded(id: string, open: boolean) {
  expandedId.value = open ? id : null;
}
</script>

<template>
  <div class="min-h-full">
    <div
      v-if="!localBlocks.length"
      class="rounded-xl border border-dashed t-border flex flex-col items-center justify-center text-center gap-2 py-14 px-6"
    >
      <span class="t-icon-chip !w-12 !h-12"><Icon name="lucide:layout-list" class="w-6 h-6" /></span>
      <p class="t-text font-medium">No sections yet</p>
      <p class="text-sm t-text-muted max-w-xs">
        Add sections from the palette, or use <strong>Generate with AI</strong> to draft a full site
        you can refine.
      </p>
    </div>

    <draggable
      v-else
      v-model="localBlocks"
      item-key="id"
      handle=".drag-handle"
      ghost-class="builder-ghost"
      animation="200"
      class="space-y-2"
      @start="dragging = true"
      @end="onDragEnd"
    >
      <template #item="{ element, index }">
        <LandingBuilderBlockCard
          :block="element"
          :is-first="index === 0"
          :is-last="index === localBlocks.length - 1"
          :expanded="expandedId === element.id"
          @update:expanded="setExpanded(element.id, $event)"
          @remove="emit('remove', $event)"
          @move="emit('move', $event)"
          @duplicate="emit('duplicate', $event)"
        />
      </template>
    </draggable>
  </div>
</template>

<style scoped>
.builder-ghost {
  opacity: 0.5;
}
</style>

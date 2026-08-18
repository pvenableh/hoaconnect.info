<script setup lang="ts">
// The drag-drop canvas. vuedraggable reorders existing blocks (new blocks are
// added by click from the sidebar, matching Earnest). A local mirror guarded by a
// `dragging` flag keeps vuedraggable from fighting the parent's prop updates.
import draggable from "vuedraggable";
import type { CanvasBlock } from "#core/shared/email/blocks";

const props = defineProps<{ blocks: CanvasBlock[] }>();
const emit = defineEmits<{
  (e: "remove", instanceId: string): void;
  (e: "move", payload: { id: string; direction: "up" | "down" }): void;
  (e: "duplicate", instanceId: string): void;
  (e: "update-vars", payload: { id: string; vars: Record<string, any> }): void;
  (e: "reorder", blocks: CanvasBlock[]): void;
}>();

const dragging = ref(false);
const localBlocks = ref<CanvasBlock[]>([...props.blocks]);

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
</script>

<template>
  <div class="min-h-full">
    <div v-if="!localBlocks.length" class="h-full flex flex-col items-center justify-center text-center gap-2 py-16 px-6">
      <span class="t-icon-chip !w-12 !h-12"><Icon name="lucide:layout-template" class="w-6 h-6" /></span>
      <p class="t-text font-medium">Build your email</p>
      <p class="text-sm t-text-muted max-w-xs">Add blocks from the left, or use <strong>Generate with AI</strong> to draft a full layout you can tweak.</p>
    </div>

    <draggable
      v-else
      v-model="localBlocks"
      item-key="instanceId"
      handle=".drag-handle"
      ghost-class="builder-ghost"
      animation="200"
      class="space-y-2"
      @start="dragging = true"
      @end="onDragEnd"
    >
      <template #item="{ element, index }">
        <EmailBuilderBlockItem
          :canvas-block="element"
          :is-first="index === 0"
          :is-last="index === localBlocks.length - 1"
          @remove="emit('remove', $event)"
          @move="emit('move', $event)"
          @duplicate="emit('duplicate', $event)"
          @update-vars="emit('update-vars', $event)"
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

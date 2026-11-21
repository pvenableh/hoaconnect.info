<script setup lang="ts">
// AppDropTarget — a place something can be dropped (a folder, a status column, a
// person's job). It shows where the drop will land (`is-over`), accepts by data
// type, and hands the payload to `drop`. The keyboard and menu path is the
// caller's: pair it with a "Move to…" action that calls the same handler.
import { acceptsDrop } from "#core/shared/motion";

const props = withDefaults(
  defineProps<{ accepts?: string[]; disabled?: boolean; type?: string }>(),
  { type: "text/plain" }
);
const emit = defineEmits<{
  drop: [payload: string, e: DragEvent];
  files: [files: File[]];
}>();

const over = ref(false);
let depth = 0;
const ok = (e: DragEvent) => !props.disabled && acceptsDrop(props.accepts, Array.from(e.dataTransfer?.types ?? []));

function onEnter(e: DragEvent) {
  if (!ok(e)) return;
  depth++;
  over.value = true;
}
function onOver(e: DragEvent) {
  if (!ok(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
}
function onLeave() {
  depth = Math.max(0, depth - 1);
  if (depth === 0) over.value = false;
}
function onDrop(e: DragEvent) {
  if (!ok(e)) return;
  e.preventDefault();
  depth = 0;
  over.value = false;
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) emit("files", files);
  const payload = e.dataTransfer?.getData(props.type);
  if (payload) emit("drop", payload, e);
}
</script>

<template>
  <div
    class="app-drop-target"
    :class="{ 'is-over': over }"
    :data-drop-over="over || undefined"
    @dragenter="onEnter"
    @dragover="onOver"
    @dragleave="onLeave"
    @drop="onDrop"
  >
    <slot :over="over" />
  </div>
</template>

<style scoped>
.app-drop-target {
  border-radius: inherit;
  transition: box-shadow var(--motion-fast, 160ms) var(--ease-out-expo, ease-out);
}
.app-drop-target.is-over {
  box-shadow: 0 0 0 2px var(--theme-accent-primary);
}
@media (prefers-reduced-motion: reduce) {
  .app-drop-target {
    transition: none;
  }
}
</style>

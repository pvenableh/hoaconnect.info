<script setup lang="ts">
// One block on the builder canvas: drag handle, category badge, move/duplicate/
// remove controls, and a collapsible variable editor. Ported from Earnest's
// CanvasBlockItem. Emits are forwarded up to the canvas → the composable.
import type { CanvasBlock } from "#core/shared/email/blocks";

const props = defineProps<{
  canvasBlock: CanvasBlock;
  isFirst: boolean;
  isLast: boolean;
}>();
const emit = defineEmits<{
  (e: "remove", instanceId: string): void;
  (e: "move", payload: { id: string; direction: "up" | "down" }): void;
  (e: "duplicate", instanceId: string): void;
  (e: "update-vars", payload: { id: string; vars: Record<string, any> }): void;
}>();

const editing = ref(false);

const CATEGORY_TINT: Record<string, string> = {
  header: "text-slate-600 bg-slate-100 dark:bg-slate-500/15",
  hero: "text-violet-600 bg-violet-100 dark:bg-violet-500/15",
  content: "text-blue-600 bg-blue-100 dark:bg-blue-500/15",
  "two-column": "text-blue-600 bg-blue-100 dark:bg-blue-500/15",
  cta: "text-emerald-600 bg-emerald-100 dark:bg-emerald-500/15",
  image: "text-amber-600 bg-amber-100 dark:bg-amber-500/15",
  stats: "text-cyan-600 bg-cyan-100 dark:bg-cyan-500/15",
  quote: "text-rose-600 bg-rose-100 dark:bg-rose-500/15",
  list: "text-indigo-600 bg-indigo-100 dark:bg-indigo-500/15",
  divider: "text-gray-500 bg-gray-100 dark:bg-gray-500/15",
  social: "text-pink-600 bg-pink-100 dark:bg-pink-500/15",
  footer: "text-slate-500 bg-slate-100 dark:bg-slate-500/15",
};
const tint = computed(() => CATEGORY_TINT[String(props.canvasBlock.block.category)] || "t-text-muted t-bg-subtle");

function onVarUpdate(key: string, value: any) {
  emit("update-vars", { id: props.canvasBlock.instanceId, vars: { [key]: value } });
}
</script>

<template>
  <div class="rounded-xl border t-border t-bg overflow-hidden">
    <div class="flex items-center gap-2 px-2.5 py-2">
      <span class="drag-handle cursor-grab active:cursor-grabbing t-text-muted shrink-0" title="Drag to reorder">
        <Icon name="lucide:grip-vertical" class="w-4 h-4" />
      </span>
      <span class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0" :class="tint">
        {{ canvasBlock.block.category }}
      </span>
      <span class="text-sm font-medium t-text truncate flex-1">{{ canvasBlock.block.name }}</span>

      <div class="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          class="p-1.5 rounded-md hover:t-bg-subtle disabled:opacity-30 t-text-secondary"
          :disabled="isFirst"
          title="Move up"
          @click="emit('move', { id: canvasBlock.instanceId, direction: 'up' })"
        >
          <Icon name="lucide:chevron-up" class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="p-1.5 rounded-md hover:t-bg-subtle disabled:opacity-30 t-text-secondary"
          :disabled="isLast"
          title="Move down"
          @click="emit('move', { id: canvasBlock.instanceId, direction: 'down' })"
        >
          <Icon name="lucide:chevron-down" class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="p-1.5 rounded-md hover:t-bg-subtle t-text-secondary"
          title="Duplicate"
          @click="emit('duplicate', canvasBlock.instanceId)"
        >
          <Icon name="lucide:copy" class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="p-1.5 rounded-md hover:t-bg-subtle"
          :class="editing ? 'text-primary' : 't-text-secondary'"
          title="Edit content"
          @click="editing = !editing"
        >
          <Icon name="lucide:pencil" class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 t-text-secondary dark:hover:bg-red-500/10"
          title="Remove"
          @click="emit('remove', canvasBlock.instanceId)"
        >
          <Icon name="lucide:trash-2" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <div v-if="editing" class="border-t t-border px-3 py-3 t-bg-subtle/50">
      <EmailBuilderVariableEditor :block="canvasBlock.block" :variables="canvasBlock.variables" @update="onVarUpdate" />
    </div>
  </div>
</template>

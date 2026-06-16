<!--
  TaskItem — one task row with a completion checkbox, priority dot, assignee
  avatars, and recursive subtasks (depth-capped by the tree builder). Emits
  up so the parent list owns mutations.
-->
<script setup lang="ts">
import type { TaskNode } from "~/composables/useTasks";
import { TASK_PRIORITY_META } from "~/composables/useTasks";

const props = defineProps<{ node: TaskNode }>();
const emit = defineEmits<{
  (e: "toggle", node: TaskNode): void;
  (e: "add-subtask", parentId: string): void;
  (e: "open", node: TaskNode, ev: MouseEvent): void;
}>();

const done = computed(() => props.node.status === "completed");
const priorityTone = computed(() => TASK_PRIORITY_META[(props.node.priority as string) || "medium"]?.tone || "stone");

const toneColor: Record<string, string> = {
  stone: "var(--theme-text-muted)",
  sky: "#0ea5e9",
  amber: "#f59e0b",
  rose: "#f43f5e",
};

const assignees = computed(() =>
  (props.node.assigned_to || [])
    .map((a) => (typeof a.directus_users_id === "object" ? a.directus_users_id : null))
    .filter(Boolean)
    .slice(0, 3) as { id: string; first_name?: string; last_name?: string; avatar?: string | null }[]
);
const initials = (u: { first_name?: string; last_name?: string }) =>
  `${u.first_name?.[0] || ""}${u.last_name?.[0] || ""}`.toUpperCase() || "?";
</script>

<template>
  <div :style="{ marginLeft: `${node.depth * 1.25}rem` }">
    <div class="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:t-bg-subtle transition-colors">
      <button
        type="button"
        class="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
        :style="{
          borderColor: done ? 'var(--theme-accent-primary)' : 'var(--theme-border-secondary)',
          backgroundColor: done ? 'var(--theme-accent-primary)' : 'transparent',
        }"
        :aria-label="done ? 'Mark incomplete' : 'Mark complete'"
        @click.stop="emit('toggle', node)"
      >
        <Icon v-if="done" name="lucide:check" class="w-3 h-3 text-white" />
      </button>

      <span v-if="!done" class="shrink-0 w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: toneColor[priorityTone] }" />

      <button type="button" class="flex-1 text-left min-w-0" @click="emit('open', node, $event)">
        <span class="text-sm t-text truncate" :class="done ? 'line-through t-text-muted' : ''">{{ node.title }}</span>
      </button>

      <div v-if="assignees.length" class="flex -space-x-1.5 shrink-0">
        <span
          v-for="u in assignees"
          :key="u.id"
          class="w-5 h-5 rounded-full ring-2 ring-[var(--theme-bg-elevated)] flex items-center justify-center text-[9px] font-semibold overflow-hidden"
          :style="{ backgroundColor: 'color-mix(in srgb, var(--theme-accent-primary) 16%, transparent)', color: 'var(--theme-accent-primary)' }"
          :title="`${u.first_name || ''} ${u.last_name || ''}`"
        >
          <img v-if="u.avatar" :src="`/api/directus/assets/${u.avatar}?width=40&height=40&fit=cover`" class="w-full h-full object-cover" alt="" />
          <template v-else>{{ initials(u) }}</template>
        </span>
      </div>

      <button
        v-if="node.depth < 2"
        type="button"
        class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:t-bg-subtle"
        aria-label="Add subtask"
        @click.stop="emit('add-subtask', node.id)"
      >
        <Icon name="lucide:plus" class="w-3.5 h-3.5 t-text-muted" />
      </button>
    </div>

    <!-- Recurse into children -->
    <ProjectsTaskItem
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      @toggle="(n) => emit('toggle', n)"
      @add-subtask="(id) => emit('add-subtask', id)"
      @open="(n, ev) => emit('open', n, ev)"
    />
  </div>
</template>

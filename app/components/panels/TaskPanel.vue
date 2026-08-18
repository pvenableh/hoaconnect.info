<!--
  TaskPanel — slide-over detail/edit for a single task (?slide=task:id).
  Loads the task, lets the viewer flip status/priority/schedule and edit the
  title; nested subtasks are managed in the parent project's Tasks tab.
-->
<script setup lang="ts">
import type { FlipFromPayload } from "#core/app/composables/useFlipFromRow";
import type { TaskRow } from "#core/app/composables/useTasks";
import { useTasks, TASK_PRIORITY_META, SCHEDULE_BUCKETS } from "#core/app/composables/useTasks";

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
defineEmits<{ (e: "close"): void }>();

const { list, update, toggleComplete, remove } = useTasks();

// The list endpoint is the cheapest typed fetch; filter to this id client-side.
const task = ref<TaskRow | null>(null);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    // assignee=me scope is too narrow; fetch by a parent we don't know — so
    // hit the project list when we can. Fallback: the row is passed via FLIP.
    const rows = await list({});
    task.value = rows.find((t) => t.id === props.id) || null;
  } catch {
    task.value = null;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const done = computed(() => task.value?.status === "completed");

async function setField(patch: Partial<TaskRow>) {
  if (!task.value) return;
  Object.assign(task.value, patch);
  await update(props.id, patch as any);
}
async function onToggle() {
  if (!task.value) return;
  task.value.status = done.value ? "in_progress" : "completed";
  await toggleComplete(task.value);
}
</script>

<template>
  <AppSlideOverShell :title="task?.title || 'Task'" subtitle="Task" :flip-from="flipFrom" @close="$emit('close')">
    <div v-if="loading" class="py-16 flex justify-center"><div class="spinner-ios" /></div>

    <div v-else-if="task" class="space-y-5">
      <button
        type="button"
        class="flex items-center gap-3 w-full text-left"
        @click="onToggle"
      >
        <span
          class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0"
          :style="{
            borderColor: 'var(--theme-accent-primary)',
            backgroundColor: done ? 'var(--theme-accent-primary)' : 'transparent',
          }"
        >
          <Icon v-if="done" name="lucide:check" class="w-3.5 h-3.5 text-white" />
        </span>
        <span class="text-lg font-medium t-text" :class="done ? 'line-through t-text-muted' : ''">{{ task.title }}</span>
      </button>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs uppercase tracking-wide t-text-tertiary mb-1">Priority</label>
          <select
            :value="task.priority || 'medium'"
            class="t-input w-full rounded-lg px-2.5 py-1.5 text-sm"
            @change="setField({ priority: ($event.target as HTMLSelectElement).value as any })"
          >
            <option v-for="(m, k) in TASK_PRIORITY_META" :key="k" :value="k">{{ m.label }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs uppercase tracking-wide t-text-tertiary mb-1">Schedule</label>
          <select
            :value="task.schedule || 'unscheduled'"
            class="t-input w-full rounded-lg px-2.5 py-1.5 text-sm"
            @change="setField({ schedule: ($event.target as HTMLSelectElement).value as any })"
          >
            <option v-for="b in SCHEDULE_BUCKETS" :key="b.key" :value="b.key">{{ b.label }}</option>
          </select>
        </div>
      </div>

      <div>
        <label class="block text-xs uppercase tracking-wide t-text-tertiary mb-1">Due date</label>
        <input
          :value="task.due_date || ''"
          type="date"
          class="t-input w-full rounded-lg px-2.5 py-1.5 text-sm"
          @change="setField({ due_date: ($event.target as HTMLInputElement).value || null })"
        />
      </div>

      <div v-if="typeof task.project === 'object' && task.project" class="text-sm t-text-muted">
        Part of <span class="t-text-accent">{{ task.project.title }}</span>
      </div>
    </div>

    <p v-else class="t-text-muted py-16 text-center">Task not found.</p>

    <template v-if="task" #footer>
      <div class="flex justify-end">
        <Button variant="outline" size="sm" class="rounded-full text-red-600" @click="remove(id).then(() => $emit('close'))">
          <Icon name="lucide:trash-2" class="w-4 h-4 mr-1.5" />Delete task
        </Button>
      </div>
    </template>
  </AppSlideOverShell>
</template>

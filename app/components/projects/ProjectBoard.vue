<!--
  ProjectBoard — kanban of projects by status with native HTML5 drag-and-drop
  (no extra dependency). Dropping a card into a column persists its new status
  via useProjects().setStatus. Columns: Planning · Active · On Hold · Completed.
-->
<script setup lang="ts">
import type { ProjectRow, ProjectStatus } from "#core/app/composables/useProjects";
import { BOARD_COLUMNS, useProjects } from "#core/app/composables/useProjects";

const props = defineProps<{ projects: ProjectRow[] }>();
const emit = defineEmits<{
  (e: "open", project: ProjectRow, ev: MouseEvent): void;
  (e: "changed"): void;
}>();

const { groupByStatus, setStatus } = useProjects();

// Local working copy so a drop reflects instantly (optimistic), reconciled
// from props whenever the parent refetches.
const columns = ref<Record<string, ProjectRow[]>>(groupByStatus(props.projects));
watch(
  () => props.projects,
  (p) => (columns.value = groupByStatus(p)),
  { deep: true }
);

const dragId = ref<string | null>(null);
const overCol = ref<string | null>(null);

function onDragStart(project: ProjectRow) {
  dragId.value = project.id;
}
function onDragEnd() {
  dragId.value = null;
  overCol.value = null;
}

async function onDrop(colKey: ProjectStatus) {
  overCol.value = null;
  const id = dragId.value;
  dragId.value = null;
  if (!id) return;

  // Find the card and its current column.
  let moved: ProjectRow | undefined;
  let fromKey: string | undefined;
  for (const [key, list] of Object.entries(columns.value)) {
    const idx = list.findIndex((p) => p.id === id);
    if (idx !== -1) {
      moved = list[idx];
      fromKey = key;
      break;
    }
  }
  if (!moved || fromKey === colKey) return;

  // Optimistic move.
  columns.value[fromKey!] = columns.value[fromKey!].filter((p) => p.id !== id);
  moved.status = colKey;
  columns.value[colKey] = [moved, ...(columns.value[colKey] || [])];

  try {
    await setStatus(id, colKey);
    emit("changed");
  } catch {
    emit("changed"); // parent refetch restores truth on failure
  }
}
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <section
      v-for="col in BOARD_COLUMNS"
      :key="col.key"
      class="flex flex-col gap-3 rounded-2xl p-3 transition-colors"
      :class="overCol === col.key ? 't-bg-subtle' : 't-bg-alt'"
      @dragover.prevent="overCol = col.key"
      @dragleave="overCol === col.key && (overCol = null)"
      @drop="onDrop(col.key)"
    >
      <header class="flex items-center justify-between px-1">
        <h2 class="text-sm font-semibold t-text-secondary uppercase tracking-wide">{{ col.label }}</h2>
        <span class="text-xs t-text-muted">{{ columns[col.key]?.length || 0 }}</span>
      </header>

      <div class="flex flex-col gap-2.5 min-h-[60px]">
        <div
          v-for="project in columns[col.key]"
          :key="project.id"
          draggable="true"
          class="transition-opacity"
          :class="dragId === project.id ? 'opacity-40' : ''"
          @dragstart="onDragStart(project)"
          @dragend="onDragEnd"
        >
          <ProjectsProjectCard :project="project" draggable @open="(p, ev) => emit('open', p, ev)" />
        </div>

        <p v-if="!columns[col.key]?.length" class="text-xs t-text-muted text-center py-6">
          Drop projects here
        </p>
      </div>
    </section>
  </div>
</template>

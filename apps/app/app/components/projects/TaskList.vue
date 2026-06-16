<!--
  TaskList — nested task list for a project/event/request with inline add and
  an add-subtask affordance per row. Owns the task data for its scope and
  reconciles after each mutation. Pass exactly one scope id.
-->
<script setup lang="ts">
import type { TaskRow, TaskNode } from "~/composables/useTasks";
import { useTasks } from "~/composables/useTasks";

const props = defineProps<{
  project?: string;
  event?: string;
  request?: string;
  /** read-only members can't add/complete */
  readonly?: boolean;
}>();

const { list, create, toggleComplete, buildTree } = useTasks();

const tasks = ref<TaskRow[]>([]);
const loading = ref(true);
const newTitle = ref("");
const addingFor = ref<string | null>(null);
const subTitle = ref("");

const scope = computed(() => ({
  project: props.project,
  event: props.event,
  request: props.request,
}));

const tree = computed<TaskNode[]>(() => buildTree(tasks.value));

async function load() {
  loading.value = true;
  try {
    tasks.value = await list(scope.value);
  } catch {
    tasks.value = [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(scope, load);

async function addTask() {
  const title = newTitle.value.trim();
  if (!title) return;
  newTitle.value = "";
  await create({ title, ...scope.value, status: "new" });
  await load();
}

async function addSubtask(parentId: string) {
  const title = subTitle.value.trim();
  if (!title) {
    addingFor.value = null;
    return;
  }
  subTitle.value = "";
  const wasFor = addingFor.value;
  addingFor.value = null;
  await create({ title, ...scope.value, parent_task: parentId, status: "new" });
  await load();
  void wasFor;
}

async function onToggle(node: TaskNode) {
  // optimistic
  node.status = node.status === "completed" ? "in_progress" : "completed";
  await toggleComplete(node as TaskRow);
  await load();
}

function beginSubtask(parentId: string) {
  addingFor.value = parentId;
  subTitle.value = "";
  nextTick(() => {
    const el = document.getElementById(`subtask-input-${parentId}`);
    (el as HTMLInputElement | null)?.focus();
  });
}

// Open a task in the slide-over panel (FLIP from its row). Refresh on close so
// inline edits land back in the list.
const slide = useAppSlideOver("task");
const route = useRoute();
function openTask(node: TaskNode, ev: MouseEvent) {
  const row = (ev.currentTarget as HTMLElement)?.closest(".group") as HTMLElement | null;
  slide.open(node.id, { flipFrom: flipPayloadFrom(row || undefined) });
}
watch(
  () => route.query.slide,
  (now, was) => {
    if (was && !now) load();
  }
);
</script>

<template>
  <div class="space-y-1">
    <div v-if="loading" class="py-8 flex justify-center"><div class="spinner-ios" /></div>

    <template v-else>
      <p v-if="!tree.length" class="text-sm t-text-muted py-3 px-2">No tasks yet.</p>

      <template v-for="node in tree" :key="node.id">
        <ProjectsTaskItem
          :node="node"
          @toggle="onToggle"
          @add-subtask="beginSubtask"
          @open="openTask"
        />
        <!-- inline subtask composer under the row it targets -->
        <div v-if="addingFor === node.id" class="ml-7 mb-1 flex items-center gap-2">
          <input
            :id="`subtask-input-${node.id}`"
            v-model="subTitle"
            type="text"
            placeholder="Subtask title…"
            class="t-input flex-1 rounded-lg px-2.5 py-1 text-sm"
            @keydown.enter.prevent="addSubtask(node.id)"
            @keydown.esc="addingFor = null"
            @blur="addSubtask(node.id)"
          />
        </div>
      </template>
    </template>

    <!-- top-level inline add -->
    <div v-if="!readonly" class="flex items-center gap-2 pt-1 px-2">
      <Icon name="lucide:plus" class="w-4 h-4 t-text-muted shrink-0" />
      <input
        v-model="newTitle"
        type="text"
        placeholder="Add a task…"
        class="flex-1 bg-transparent text-sm t-text placeholder:t-text-muted focus:outline-none py-1.5"
        @keydown.enter.prevent="addTask"
      />
    </div>
  </div>
</template>

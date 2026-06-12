<!--
  ProjectForm — create / edit a project. Sub-project + spawn-from-event aware
  (pass parentProject / parentEvent). Teams come from useTeams. Budget +
  member-visibility are board-only fields.
-->
<script setup lang="ts">
import type { ProjectRow } from "~/composables/useProjects";
import { useProjects } from "~/composables/useProjects";

const props = defineProps<{
  project?: ProjectRow | null;
  parentProject?: string | null;
  parentEvent?: string | null;
}>();

const emit = defineEmits<{
  (e: "saved", project: ProjectRow): void;
  (e: "cancel"): void;
}>();

const { create, update } = useProjects();
const { listAllTeams } = useTeams();

const isEdit = computed(() => !!props.project?.id);
const saving = ref(false);

const form = reactive({
  title: props.project?.title || "",
  description: props.project?.description || "",
  status: (props.project?.status as string) || "planning",
  team: typeof props.project?.team === "object" ? props.project?.team?.id : (props.project?.team as string) || "",
  start_date: props.project?.start_date || "",
  due_date: props.project?.due_date || "",
  member_visible: props.project?.member_visible ?? false,
  budget_amount: props.project?.budget_amount != null ? String(props.project.budget_amount) : "",
  color: props.project?.color || "",
});

const teams = ref<{ id: string; name: string }[]>([]);
onMounted(async () => {
  try {
    teams.value = (await listAllTeams()) as any;
  } catch {
    /* teams optional */
  }
});

const STATUS_OPTS = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
];

async function submit() {
  if (!form.title.trim() || saving.value) return;
  saving.value = true;
  try {
    const payload: any = {
      title: form.title.trim(),
      description: form.description || null,
      status: form.status,
      team: form.team || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      member_visible: form.member_visible,
      budget_amount: form.budget_amount ? Number(form.budget_amount) : null,
      color: form.color || null,
    };
    if (props.parentProject) payload.parent_project = props.parentProject;
    if (props.parentEvent) payload.parent_event = props.parentEvent;

    const saved = isEdit.value
      ? await update(props.project!.id, payload)
      : await create(payload);
    emit("saved", saved as ProjectRow);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div>
      <label class="block text-sm font-medium t-text-secondary mb-1">Title</label>
      <input
        v-model="form.title"
        type="text"
        required
        placeholder="e.g. Lobby Renovation"
        class="t-input w-full rounded-xl px-3 py-2"
      />
    </div>

    <div>
      <label class="block text-sm font-medium t-text-secondary mb-1">Description</label>
      <textarea
        v-model="form.description"
        rows="3"
        placeholder="What is this project about?"
        class="t-input w-full rounded-xl px-3 py-2 resize-none"
      />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1">Status</label>
        <select v-model="form.status" class="t-input w-full rounded-xl px-3 py-2">
          <option v-for="o in STATUS_OPTS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1">Committee / Team</label>
        <select v-model="form.team" class="t-input w-full rounded-xl px-3 py-2">
          <option value="">— None —</option>
          <option v-for="t in teams" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1">Start date</label>
        <input v-model="form.start_date" type="date" class="t-input w-full rounded-xl px-3 py-2" />
      </div>
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1">Due date</label>
        <input v-model="form.due_date" type="date" class="t-input w-full rounded-xl px-3 py-2" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-sm font-medium t-text-secondary mb-1">Budget (optional)</label>
        <input v-model="form.budget_amount" type="number" min="0" step="0.01" placeholder="0.00" class="t-input w-full rounded-xl px-3 py-2" />
      </div>
      <div class="flex items-end pb-1">
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="form.member_visible" type="checkbox" class="rounded" />
          <span class="text-sm t-text-secondary">Visible to residents</span>
        </label>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 pt-2">
      <Button type="button" variant="outline" class="rounded-full" @click="emit('cancel')">Cancel</Button>
      <Button type="submit" class="rounded-full" :disabled="saving || !form.title.trim()">
        <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
        {{ isEdit ? "Save changes" : "Create project" }}
      </Button>
    </div>
  </form>
</template>

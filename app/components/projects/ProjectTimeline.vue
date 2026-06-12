<!--
  ProjectTimeline — vertical milestone/phase list for a project with inline
  add. This is the Phase-2 milestone manager; Phase 3 layers the horizontal
  GSAP "subway-map" Gantt on the same data (useProjectEvents).
-->
<script setup lang="ts">
import type { ProjectEventRow } from "~/composables/useProjectEvents";
import { useProjectEvents, EVENT_TYPE_META } from "~/composables/useProjectEvents";

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ (e: "changed"): void }>();

const { list, create, update, remove, previewEndDate } = useProjectEvents();

const events = ref<ProjectEventRow[]>([]);
const loading = ref(true);
const showAdd = ref(false);

const form = reactive({
  title: "",
  type: "phase",
  event_date: "",
  duration_days: "",
  is_milestone: false,
});

const computedEnd = computed(() =>
  form.event_date && form.duration_days ? previewEndDate(form.event_date, Number(form.duration_days)) : null
);

async function load() {
  loading.value = true;
  try {
    events.value = await list(props.projectId);
  } catch {
    events.value = [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function addEvent() {
  if (!form.title.trim()) return;
  await create(props.projectId, {
    title: form.title.trim(),
    type: form.type,
    event_date: form.event_date || null,
    duration_days: form.duration_days ? Number(form.duration_days) : null,
    is_milestone: form.is_milestone,
  });
  Object.assign(form, { title: "", type: "phase", event_date: "", duration_days: "", is_milestone: false });
  showAdd.value = false;
  await load();
  emit("changed");
}

async function toggleDone(ev: ProjectEventRow) {
  const next = ev.status === "completed" ? "active" : "completed";
  ev.status = next;
  await update(ev.id, { status: next });
  emit("changed");
}

async function removeEvent(ev: ProjectEventRow) {
  if (!confirm(`Remove "${ev.title}"?`)) return;
  await remove(ev.id);
  await load();
  emit("changed");
}

const fmt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

const TYPE_OPTS = Object.entries(EVENT_TYPE_META).map(([value, m]) => ({ value, label: m.label }));
</script>

<template>
  <div>
    <div v-if="loading" class="py-8 flex justify-center"><div class="spinner-ios" /></div>

    <template v-else>
      <ol class="relative space-y-1 pl-2">
        <li v-for="(ev, i) in events" :key="ev.id" class="relative pl-6 pb-2">
          <!-- connector line -->
          <span
            v-if="i < events.length - 1"
            class="absolute left-[7px] top-5 bottom-0 w-px"
            style="background: var(--theme-border-secondary)"
          />
          <!-- node -->
          <button
            type="button"
            class="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors"
            :style="{
              borderColor: 'var(--theme-accent-primary)',
              backgroundColor: ev.status === 'completed' ? 'var(--theme-accent-primary)' : 'var(--theme-bg-elevated)',
            }"
            :aria-label="ev.is_milestone ? 'Milestone' : 'Phase'"
            @click="toggleDone(ev)"
          >
            <Icon v-if="ev.status === 'completed'" name="lucide:check" class="w-2 h-2 text-white" />
          </button>

          <div class="group flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <Icon :name="EVENT_TYPE_META[(ev.type as string) || 'phase']?.icon" class="w-3.5 h-3.5 t-text-muted" />
                <span class="text-sm font-medium t-text" :class="ev.status === 'completed' ? 'line-through t-text-muted' : ''">{{ ev.title }}</span>
                <span v-if="ev.is_milestone" class="text-[9px] uppercase font-semibold t-text-accent">Milestone</span>
              </div>
              <p class="text-xs t-text-muted">
                <template v-if="fmt(ev.event_date)">{{ fmt(ev.event_date) }}</template>
                <template v-if="fmt(ev.end_date)"> → {{ fmt(ev.end_date) }}</template>
                <template v-if="ev.duration_days"> · {{ ev.duration_days }}d</template>
                <template v-if="ev.approval === 'needs_approval'"> · <span class="t-text-accent">needs approval</span></template>
              </p>
            </div>
            <button
              type="button"
              class="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:t-bg-subtle shrink-0"
              aria-label="Remove"
              @click="removeEvent(ev)"
            >
              <Icon name="lucide:x" class="w-3.5 h-3.5 t-text-muted" />
            </button>
          </div>
        </li>
      </ol>

      <p v-if="!events.length && !showAdd" class="text-sm t-text-muted py-3 px-2">No milestones yet.</p>

      <!-- Add milestone -->
      <div v-if="showAdd" class="mt-3 ios-card p-4 space-y-3">
        <input v-model="form.title" type="text" placeholder="Milestone / phase title" class="t-input w-full rounded-lg px-3 py-2 text-sm" />
        <div class="grid grid-cols-2 gap-2">
          <select v-model="form.type" class="t-input rounded-lg px-3 py-2 text-sm">
            <option v-for="o in TYPE_OPTS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <label class="flex items-center gap-2 text-sm t-text-secondary px-2">
            <input v-model="form.is_milestone" type="checkbox" class="rounded" /> Milestone marker
          </label>
          <input v-model="form.event_date" type="date" class="t-input rounded-lg px-3 py-2 text-sm" />
          <input v-model="form.duration_days" type="number" min="1" placeholder="Duration (business days)" class="t-input rounded-lg px-3 py-2 text-sm" />
        </div>
        <p v-if="computedEnd" class="text-xs t-text-muted">Ends {{ fmt(computedEnd) }} (business days)</p>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" class="rounded-full" @click="showAdd = false">Cancel</Button>
          <Button type="button" size="sm" class="rounded-full" :disabled="!form.title.trim()" @click="addEvent">Add</Button>
        </div>
      </div>

      <button
        v-else
        type="button"
        class="mt-3 inline-flex items-center gap-1.5 text-sm t-text-accent hover:opacity-80 px-2"
        @click="showAdd = true"
      >
        <Icon name="lucide:plus" class="w-4 h-4" />Add milestone
      </button>
    </template>
  </div>
</template>

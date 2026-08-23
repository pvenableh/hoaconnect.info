<script setup lang="ts">
import type { ProjectRow } from "#core/app/composables/useProjects";
import { useProjects, PROJECT_STATUS_META } from "#core/app/composables/useProjects";
import { projectOpensOnTimeline } from "#core/shared/projects/timeline";

definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const route = useRoute();
const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { getOne, setStatus, remove } = useProjects();

const projectId = computed(() => route.params.id as string);
const tab = ref<"overview" | "tasks" | "timeline" | "files">("overview");
// Set once the person picks a tab themselves, so a background refresh never
// yanks them back to the default.
const tabPicked = ref(false);
const editing = ref(false);

const { data: project, pending, refresh } = await useAsyncData(
  `admin-project-${projectId.value}`,
  () => getOne(projectId.value),
  { watch: [projectId], server: false }
);

/**
 * A project with a real schedule opens ON the schedule. The Gantt has always
 * been the best thing on this page — dependency connectors, drag-to-reschedule,
 * approvals — and it was the third of four tabs, so most people never saw it.
 *
 * Two dated milestones is the bar: one bar on a date axis is a fact, not a
 * timeline, and Overview says it better. Everything else still lands on
 * Overview, and the tab is one click away either way.
 */
watch(
  project,
  (p) => {
    if (!p || tabPicked.value) return;
    tab.value = projectOpensOnTimeline(p as any) ? "timeline" : "overview";
  },
  { immediate: true }
);

// Anchor the AI assistant to this project while the page is open, so it answers
// about THIS project and keeps its own thread for it.
const { setContext, clearContext } = useAiContext();
watch(
  project,
  (p) => {
    if (p) setContext({ entityType: "project", entityId: String(p.id), label: p.title || "Project" });
  },
  { immediate: true }
);
onBeforeUnmount(clearContext);

const statusMeta = computed(() =>
  project.value ? PROJECT_STATUS_META[(project.value.status as string) || "planning"] : null
);
const teamName = computed(() =>
  typeof project.value?.team === "object" ? project.value?.team?.name : null
);

const money = (v: number | string | null | undefined) =>
  v != null && v !== "" ? `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : "—";

// Rolled-up spend: prefer the tagged-expense total, fall back to the manual
// actual_spend field when no expenses are linked.
const rolledSpend = computed(() => {
  const exp = project.value?.expense_total;
  if (exp != null && exp > 0) return exp;
  return Number(project.value?.actual_spend) || 0;
});
const budgetPct = computed(() => {
  const b = Number(project.value?.budget_amount) || 0;
  if (!b) return 0;
  return Math.min(999, Math.round((rolledSpend.value / b) * 100));
});
const overBudget = computed(() => {
  const b = Number(project.value?.budget_amount) || 0;
  return b > 0 && rolledSpend.value > b;
});

const STATUS_OPTS = ["planning", "active", "on_hold", "completed", "archived"];

async function changeStatus(s: string) {
  await setStatus(projectId.value, s as any);
  refresh();
}

async function onDelete() {
  if (!confirm("Delete this project? Its milestones and tasks will be removed.")) return;
  await remove(projectId.value);
  navigateTo(buildOrgPath("/admin/projects"));
}

function onEdited(p: ProjectRow) {
  editing.value = false;
  refresh();
}

const TABS = [
  { key: "overview", label: "Overview", icon: "lucide:layout-panel-left" },
  { key: "tasks", label: "Tasks", icon: "lucide:check-circle" },
  { key: "timeline", label: "Timeline", icon: "lucide:milestone" },
  { key: "files", label: "Files", icon: "lucide:paperclip" },
] as const;
</script>

<template>
  <div class="min-h-screen t-bg t-text accent-violet">
    <PageContainer class="space-y-6">
      <BackLink :to="buildOrgPath('/admin/projects')" label="All projects" />

      <div v-if="pending" class="py-24 flex justify-center"><div class="spinner-ios" /></div>

      <template v-else-if="project">
        <!-- Identity strip -->
        <div class="ios-card p-6">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div class="min-w-0">
              <div class="flex items-center gap-2.5 mb-1">
                <span class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: project.color || 'var(--theme-accent-primary)' }" />
                <h1 class="text-2xl font-semibold tracking-tight t-text truncate">{{ project.title }}</h1>
              </div>
              <div class="flex items-center gap-2 flex-wrap text-sm t-text-muted">
                <span v-if="teamName" class="inline-flex items-center gap-1">
                  <Icon name="lucide:users" class="w-3.5 h-3.5" />{{ teamName }}
                </span>
                <span v-if="project.due_date" class="inline-flex items-center gap-1">
                  <Icon name="lucide:calendar" class="w-3.5 h-3.5" />
                  Due {{ new Date(project.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) }}
                </span>
                <span v-if="project.member_visible" class="inline-flex items-center gap-1 t-text-accent">
                  <Icon name="lucide:eye" class="w-3.5 h-3.5" />Visible to residents
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <select
                :value="project.status"
                class="t-input rounded-full px-3 py-1.5 text-sm font-medium"
                @change="changeStatus(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="s in STATUS_OPTS" :key="s" :value="s" class="capitalize">
                  {{ PROJECT_STATUS_META[s]?.label }}
                </option>
              </select>
              <Button variant="outline" size="icon" class="rounded-full" aria-label="Edit" @click="editing = true">
                <Icon name="lucide:pencil" class="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" class="rounded-full text-red-600" aria-label="Delete" @click="onDelete">
                <Icon name="lucide:trash-2" class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <p v-if="project.description" class="mt-3 t-text-secondary" v-html="project.description" />
        </div>

        <!-- Edit form -->
        <div v-if="editing" class="ios-card p-6 max-w-2xl">
          <h2 class="font-semibold t-text mb-4">Edit project</h2>
          <ProjectsProjectForm :project="project" @saved="onEdited" @cancel="editing = false" />
        </div>

        <!-- Tabs -->
        <div class="inline-flex rounded-full t-bg-alt p-0.5 overflow-x-auto">
          <button
            v-for="t in TABS"
            :key="t.key"
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap"
            :class="tab === t.key ? 't-bg-elevated t-text shadow-sm' : 't-text-muted'"
            @click="tab = t.key; tabPicked = true"
          >
            <Icon :name="t.icon" class="w-4 h-4" />{{ t.label }}
          </button>
        </div>

        <!-- Overview -->
        <div v-if="tab === 'overview'" class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="ios-card p-5">
            <p class="text-xs uppercase tracking-wide t-text-tertiary mb-1">Budget</p>
            <p class="text-2xl font-semibold t-text">{{ money(project.budget_amount) }}</p>
            <p class="text-sm t-text-muted mt-0.5">
              Spent {{ money(rolledSpend) }}
              <span v-if="project.expense_total != null" class="t-text-tertiary">· {{ project.expense_total ? 'from expenses' : 'no expenses tagged' }}</span>
            </p>
            <div v-if="Number(project.budget_amount)" class="mt-3">
              <div class="h-1.5 rounded-full t-bg-subtle overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="overBudget ? 'bg-red-500' : ''"
                  :style="{ width: budgetPct + '%', background: overBudget ? undefined : 'var(--theme-accent-primary)' }"
                />
              </div>
              <p class="text-xs mt-1" :class="overBudget ? 'text-red-600' : 't-text-muted'">
                {{ budgetPct }}% of budget<span v-if="overBudget"> · over by {{ money(rolledSpend - Number(project.budget_amount)) }}</span>
              </p>
            </div>
          </div>
          <div class="ios-card p-5">
            <p class="text-xs uppercase tracking-wide t-text-tertiary mb-1">Milestones</p>
            <p class="text-2xl font-semibold t-text">{{ project.events?.length || 0 }}</p>
          </div>
          <div class="ios-card p-5">
            <p class="text-xs uppercase tracking-wide t-text-tertiary mb-1">Tasks</p>
            <p class="text-2xl font-semibold t-text">{{ project.tasks?.length || 0 }}</p>
          </div>

          <div class="ios-card p-5 lg:col-span-3">
            <ProjectsVendorChips
              :project-id="projectId"
              :vendors="project.vendors"
              :can-write="true"
              @changed="refresh"
            />
          </div>

          <div v-if="project.children?.length" class="ios-card p-5 lg:col-span-3">
            <p class="text-sm font-semibold t-text-secondary mb-2">Sub-projects</p>
            <NuxtLink
              v-for="c in project.children"
              :key="c.id"
              :to="buildOrgPath(`/admin/projects/${c.id}`)"
              class="flex items-center gap-2 py-1.5 hover:t-bg-subtle rounded-lg px-2 -mx-2 transition-colors"
            >
              <Icon name="lucide:git-branch" class="w-4 h-4 t-text-muted" />
              <span class="text-sm t-text flex-1 truncate">{{ c.title }}</span>
              <span class="text-xs t-text-muted capitalize">{{ (c.status as string)?.replace('_', ' ') }}</span>
            </NuxtLink>
          </div>

          <div v-if="project.requests?.length" class="ios-card p-5 lg:col-span-3">
            <p class="text-sm font-semibold t-text-secondary mb-2">Linked requests</p>
            <NuxtLink
              v-for="r in project.requests"
              :key="r.id"
              :to="buildOrgPath(`/admin/requests/${r.id}`)"
              class="flex items-center gap-2 py-1.5 hover:t-bg-subtle rounded-lg px-2 -mx-2 transition-colors"
            >
              <Icon name="lucide:clipboard-list" class="w-4 h-4 t-text-muted" />
              <span class="text-sm t-text flex-1 truncate">{{ r.title }}</span>
              <span class="text-xs t-text-muted capitalize">{{ r.status }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Tasks -->
        <div v-else-if="tab === 'tasks'" class="ios-card p-4">
          <ProjectsTaskList :project="projectId" />
        </div>

        <!-- Timeline — subway-map Gantt with dependency scheduling + approvals -->
        <div v-else-if="tab === 'timeline'">
          <ProjectsProjectGantt :project-id="projectId" :can-write="true" @changed="refresh" />
        </div>

        <!-- Files -->
        <div v-else-if="tab === 'files'" class="ios-card p-6">
          <p v-if="!project.files?.length" class="text-sm t-text-muted text-center py-6">No files attached yet.</p>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <a
              v-for="f in project.files"
              :key="f.id"
              :href="`/api/directus/assets/${f.directus_files_id?.id || f.directus_files_id}`"
              target="_blank"
              class="ios-card p-3 hover:shadow-md transition-shadow flex items-center gap-2"
            >
              <Icon name="lucide:file" class="w-5 h-5 t-text-muted shrink-0" />
              <span class="text-xs t-text truncate">{{ f.directus_files_id?.filename_download || "File" }}</span>
            </a>
          </div>
        </div>
        <AiEntityCard entity-type="project" :label="project.title" />
      </template>

      <p v-else class="t-text-muted py-16 text-center">Project not found.</p>
    </PageContainer>
  </div>
</template>

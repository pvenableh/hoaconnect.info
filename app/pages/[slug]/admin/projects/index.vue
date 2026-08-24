<script setup lang="ts">
import type { ProjectRow } from "#core/app/composables/useProjects";
import { useProjects } from "#core/app/composables/useProjects";
import { listOpensOnTimeline } from "#core/shared/projects/timeline";

definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { buildOrgPath, navigateToOrg } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { list } = useProjects();

const view = ref<"board" | "list" | "timeline">("board");
// Set once the person picks a view themselves, so a refresh never overrides it.
const viewPicked = ref(false);
const statusFilter = ref<string>("active-set");
const showNew = ref(false);

const { data: projects, pending, refresh } = await useAsyncData(
  `admin-projects-${selectedOrgId.value}`,
  () => list({ parent: "none" }),
  { watch: [selectedOrgId], server: false, default: () => [] as ProjectRow[] }
);

/**
 * Land on the timeline when there is a timeline to land on. Two scheduled
 * projects is the bar — one bar on a date axis says less than a board column
 * does, and a community that never fills in dates should keep the board.
 * Archived projects don't count towards it; an archive full of finished work
 * shouldn't decide where today's work opens.
 */
watch(
  projects,
  (rows) => {
    if (viewPicked.value) return;
    view.value = listOpensOnTimeline(rows as any) ? "timeline" : "board";
  },
  { immediate: true }
);

const filtered = computed(() => {
  const rows = projects.value || [];
  if (statusFilter.value === "all") return rows;
  if (statusFilter.value === "archived") return rows.filter((p) => p.status === "archived");
  // active-set = everything except archived
  return rows.filter((p) => p.status !== "archived");
});

function openProject(project: ProjectRow) {
  navigateToOrg(`/admin/projects/${project.id}`);
}

function onSaved(project: ProjectRow) {
  showNew.value = false;
  refresh();
  navigateToOrg(`/admin/projects/${project.id}`);
}

// Accent the projects section indigo (earnest-ui --app-accent system).
useHead({ bodyAttrs: { class: "" } });
</script>

<template>
  <div class="min-h-screen t-bg t-text accent-violet">
    <PageContainer class="space-y-6">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p class="text-xs uppercase tracking-widest t-text-tertiary mb-1">Project Management</p>
          <h1 class="text-3xl font-semibold tracking-tight t-text">Projects</h1>
        </div>
        <Button class="rounded-full" @click="showNew = !showNew">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
          New project
        </Button>
      </div>

      <!-- The assistant's advisory strip: what needs looking at here, and
           anything waiting for a decision. Self-hides when it has nothing. -->
      <DirectorLayer />

      <!-- New project inline -->
      <div v-if="showNew" class="ios-card p-6 max-w-2xl">
        <h2 class="font-semibold t-text mb-4">New project</h2>
        <ProjectsProjectForm @saved="onSaved" @cancel="showNew = false" />
      </div>

      <!-- View switch + filters -->
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="inline-flex rounded-full t-bg-alt p-0.5">
          <button
            v-for="opt in [{ k: 'board', i: 'lucide:columns-3', l: 'Board' }, { k: 'list', i: 'lucide:list', l: 'List' }, { k: 'timeline', i: 'lucide:gantt-chart', l: 'Timeline' }]"
            :key="opt.k"
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors"
            :class="view === opt.k ? 't-bg-elevated t-text shadow-sm' : 't-text-muted'"
            @click="view = opt.k as 'board' | 'list' | 'timeline'; viewPicked = true"
          >
            <Icon :name="opt.i" class="w-4 h-4" />{{ opt.l }}
          </button>
        </div>

        <div v-if="view !== 'timeline'" class="inline-flex gap-1.5">
          <button
            v-for="opt in [{ k: 'active-set', l: 'Active' }, { k: 'all', l: 'All' }, { k: 'archived', l: 'Archived' }]"
            :key="opt.k"
            class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            :class="statusFilter === opt.k ? 't-bg-accent/20 t-text-accent' : 't-bg-alt t-text-muted hover:t-bg-subtle'"
            @click="statusFilter = opt.k"
          >{{ opt.l }}</button>
        </div>
      </div>

      <!-- Org-wide timeline fetches all projects itself -->
      <ProjectsOrgTimeline v-if="view === 'timeline'" @open="navigateToOrg(`/admin/projects/${$event}`)" />

      <div v-else-if="pending" class="py-24 flex justify-center"><div class="spinner-ios" /></div>

      <template v-else>
        <div v-if="!filtered.length" class="ios-card p-12 text-center">
          <div class="w-14 h-14 rounded-full t-bg-subtle flex items-center justify-center mx-auto mb-3">
            <Icon name="lucide:kanban-square" class="w-7 h-7 t-text-muted" />
          </div>
          <p class="t-text-secondary font-medium">No projects yet</p>
          <p class="t-text-muted text-sm mt-1">Create your first project to start tracking work.</p>
        </div>

        <ProjectsProjectBoard
          v-else-if="view === 'board'"
          :projects="filtered"
          @open="openProject"
          @changed="refresh"
        />

        <div v-else class="ios-card divide-y divide-[var(--theme-border-light)]">
          <button
            v-for="p in filtered"
            :key="p.id"
            class="w-full text-left px-4 py-3 hover:t-bg-subtle transition-colors flex items-center gap-3"
            @click="openProject(p)"
          >
            <span
              class="w-2.5 h-2.5 rounded-full shrink-0"
              :style="{ backgroundColor: p.color || 'var(--theme-accent-primary)' }"
            />
            <div class="flex-1 min-w-0">
              <p class="font-medium t-text truncate">{{ p.title }}</p>
              <p class="text-xs t-text-muted capitalize">{{ (p.status as string)?.replace('_', ' ') }}</p>
            </div>
            <Icon name="lucide:chevron-right" class="w-4 h-4 t-text-muted shrink-0" />
          </button>
        </div>
      </template>
    </PageContainer>
  </div>
</template>

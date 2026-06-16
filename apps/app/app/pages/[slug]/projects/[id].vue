<script setup lang="ts">
import { useProjects, PROJECT_STATUS_META } from "#core/app/composables/useProjects";
import { useProjectEvents, EVENT_TYPE_META } from "#core/app/composables/useProjectEvents";
import type { ProjectEventRow } from "#core/app/composables/useProjectEvents";

definePageMeta({ layout: "auth" });

const route = useRoute();
const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { getOne } = useProjects();
const { list: listEvents } = useProjectEvents();
const { rise } = useMotionPresets();

const projectId = computed(() => route.params.id as string);

const { data: project, pending } = await useAsyncData(
  `member-project-${projectId.value}`,
  () => getOne(projectId.value),
  { watch: [projectId], server: false }
);

const { data: events } = await useAsyncData(
  `member-project-events-${projectId.value}`,
  () => listEvents(projectId.value).catch(() => [] as ProjectEventRow[]),
  { watch: [projectId], server: false, default: () => [] as ProjectEventRow[] }
);

const fmt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
</script>

<template>
  <div class="min-h-screen t-bg t-text accent-violet">
    <PageContainer class="space-y-6">
      <BackLink :to="buildOrgPath('/projects')" label="All projects" />

      <div v-if="pending" class="py-24 flex justify-center"><div class="spinner-ios" /></div>

      <template v-else-if="project">
        <div class="ios-card p-6">
          <span class="text-[10px] uppercase font-semibold tracking-wide t-text-accent">
            {{ PROJECT_STATUS_META[(project.status as string) || 'planning']?.label }}
          </span>
          <h1 class="text-2xl font-semibold tracking-tight t-text mt-1">{{ project.title }}</h1>
          <p v-if="project.description" class="mt-2 t-text-secondary" v-html="project.description" />
          <p v-if="fmt(project.due_date)" class="text-sm t-text-muted mt-3 inline-flex items-center gap-1">
            <Icon name="lucide:calendar" class="w-4 h-4" />Target completion {{ fmt(project.due_date) }}
          </p>
        </div>

        <!-- Milestone timeline (read-only) -->
        <div v-if="events.length" class="ios-card p-6">
          <h2 class="font-semibold t-text mb-4">Timeline</h2>
          <ol class="relative space-y-1 pl-2">
            <li
              v-for="(ev, i) in events"
              :key="ev.id"
              v-motion
              v-bind="rise(i, { stagger: 35, y: 8 })"
              class="relative pl-6 pb-3"
            >
              <span
                v-if="i < events.length - 1"
                class="absolute left-[7px] top-5 bottom-0 w-px"
                style="background: var(--theme-border-secondary)"
              />
              <span
                class="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                :style="{
                  borderColor: 'var(--theme-accent-primary)',
                  backgroundColor: ev.status === 'completed' ? 'var(--theme-accent-primary)' : 'var(--theme-bg-elevated)',
                }"
              >
                <Icon v-if="ev.status === 'completed'" name="lucide:check" class="w-2 h-2 text-white" />
              </span>
              <div class="flex items-center gap-1.5 flex-wrap">
                <Icon :name="EVENT_TYPE_META[(ev.type as string) || 'phase']?.icon" class="w-3.5 h-3.5 t-text-muted" />
                <span class="text-sm font-medium t-text">{{ ev.title }}</span>
                <span v-if="ev.is_milestone" class="text-[9px] uppercase font-semibold t-text-accent">Milestone</span>
                <span
                  v-if="ev.approval === 'approved'"
                  class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                >Approved</span>
                <span
                  v-else-if="ev.approval === 'needs_approval'"
                  class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold t-bg-accent t-text-accent"
                >Pending approval</span>
              </div>
              <p v-if="fmt(ev.event_date)" class="text-xs t-text-muted">
                {{ fmt(ev.event_date) }}<template v-if="fmt(ev.end_date) && ev.end_date !== ev.event_date"> → {{ fmt(ev.end_date) }}</template>
              </p>
            </li>
          </ol>
        </div>
      </template>

      <p v-else class="t-text-muted py-16 text-center">Project not found.</p>
    </PageContainer>
  </div>
</template>

<!--
  ProjectCard — compact project summary for the board + list. Shows title,
  team chip, assignee avatars, and milestone/task/request counts. Clicking
  opens the project workspace (or a slide-over when `panel` is set).
-->
<script setup lang="ts">
import type { ProjectRow } from "~/composables/useProjects";
import { PROJECT_STATUS_META } from "~/composables/useProjects";

const props = defineProps<{
  project: ProjectRow;
  draggable?: boolean;
}>();

const emit = defineEmits<{ (e: "open", project: ProjectRow, ev: MouseEvent): void }>();

const teamName = computed(() =>
  typeof props.project.team === "object" && props.project.team ? props.project.team.name : null
);
const teamColor = computed(() =>
  typeof props.project.team === "object" && props.project.team ? props.project.team.color : null
);

const assignees = computed(() => {
  const list = props.project.assigned_to || [];
  return list
    .map((a) => (typeof a.directus_users_id === "object" ? a.directus_users_id : null))
    .filter(Boolean)
    .slice(0, 4) as { id: string; first_name?: string; last_name?: string; avatar?: string | null }[];
});

const counts = computed(() => ({
  events: props.project.events?.length || 0,
  tasks: props.project.tasks?.length || 0,
  requests: props.project.requests?.length || 0,
  children: props.project.children?.length || 0,
}));

const statusMeta = computed(() => PROJECT_STATUS_META[(props.project.status as string) || "planning"]);

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

const initials = (u: { first_name?: string; last_name?: string }) =>
  `${u.first_name?.[0] || ""}${u.last_name?.[0] || ""}`.toUpperCase() || "?";
</script>

<template>
  <article
    class="ios-card p-4 cursor-pointer select-none transition-shadow hover:shadow-lg"
    :class="draggable ? 'active:cursor-grabbing' : ''"
    @click="emit('open', project, $event)"
  >
    <div class="flex items-start justify-between gap-2">
      <h3 class="font-semibold t-text leading-snug line-clamp-2">{{ project.title }}</h3>
      <span
        class="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        :style="{
          backgroundColor: `color-mix(in srgb, var(--theme-accent-primary) 12%, transparent)`,
          color: 'var(--theme-accent-primary)',
        }"
      >
        {{ statusMeta?.label }}
      </span>
    </div>

    <p v-if="project.description" class="mt-1 text-sm t-text-muted line-clamp-2" v-html="project.description" />

    <div v-if="teamName" class="mt-2 flex items-center gap-1.5">
      <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: teamColor || 'var(--theme-accent-primary)' }" />
      <span class="text-xs t-text-secondary">{{ teamName }}</span>
    </div>

    <div class="mt-3 flex items-center justify-between gap-2">
      <!-- counts -->
      <div class="flex items-center gap-3 text-xs t-text-muted">
        <span v-if="counts.events" class="inline-flex items-center gap-1">
          <Icon name="lucide:flag" class="w-3.5 h-3.5" />{{ counts.events }}
        </span>
        <span v-if="counts.tasks" class="inline-flex items-center gap-1">
          <Icon name="lucide:check-circle" class="w-3.5 h-3.5" />{{ counts.tasks }}
        </span>
        <span v-if="counts.requests" class="inline-flex items-center gap-1">
          <Icon name="lucide:clipboard-list" class="w-3.5 h-3.5" />{{ counts.requests }}
        </span>
        <span v-if="counts.children" class="inline-flex items-center gap-1">
          <Icon name="lucide:git-branch" class="w-3.5 h-3.5" />{{ counts.children }}
        </span>
        <span v-if="fmtDate(project.due_date)" class="inline-flex items-center gap-1">
          <Icon name="lucide:calendar" class="w-3.5 h-3.5" />{{ fmtDate(project.due_date) }}
        </span>
      </div>

      <!-- assignees -->
      <div v-if="assignees.length" class="flex -space-x-2">
        <span
          v-for="u in assignees"
          :key="u.id"
          class="w-6 h-6 rounded-full ring-2 ring-[var(--theme-bg-elevated)] flex items-center justify-center text-[10px] font-semibold overflow-hidden"
          :style="{ backgroundColor: 'color-mix(in srgb, var(--theme-accent-primary) 16%, transparent)', color: 'var(--theme-accent-primary)' }"
          :title="`${u.first_name || ''} ${u.last_name || ''}`"
        >
          <img v-if="u.avatar" :src="`/api/directus/assets/${u.avatar}?width=48&height=48&fit=cover`" class="w-full h-full object-cover" alt="" />
          <template v-else>{{ initials(u) }}</template>
        </span>
      </div>
    </div>
  </article>
</template>

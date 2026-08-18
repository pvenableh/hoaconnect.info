<script setup lang="ts">
import type { ProjectRow } from "#core/app/composables/useProjects";
import { useProjects, PROJECT_STATUS_META } from "#core/app/composables/useProjects";

definePageMeta({ layout: "auth" });

const { buildOrgPath, navigateToOrg } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { list } = useProjects();
const { rise } = useMotionPresets();

// Server scopes members to member_visible projects automatically.
const { data: projects, pending } = await useAsyncData(
  `member-projects-${selectedOrgId.value}`,
  () => list({ parent: "none" }),
  { watch: [selectedOrgId], server: false, default: () => [] as ProjectRow[] }
);

const fmt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
</script>

<template>
  <div class="min-h-screen t-bg t-text accent-violet">
    <PageContainer class="space-y-6">
      <div>
        <p class="text-xs uppercase tracking-widest t-text-tertiary mb-1">Community</p>
        <h1 class="text-3xl font-semibold tracking-tight t-text">Projects</h1>
        <p class="t-text-muted mt-1">Capital improvements and initiatives underway in our community.</p>
      </div>

      <div v-if="pending" class="py-24 flex justify-center"><div class="spinner-ios" /></div>

      <template v-else>
        <div v-if="!projects.length" class="ios-card p-12 text-center">
          <Icon name="lucide:kanban-square" class="w-10 h-10 t-text-muted mx-auto mb-2" />
          <p class="t-text-secondary">No published projects at the moment.</p>
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            v-for="(p, i) in projects"
            :key="p.id"
            v-motion
            v-bind="rise(i)"
            class="ios-card p-5 text-left hover:shadow-lg transition-shadow"
            @click="navigateToOrg(`/projects/${p.id}`)"
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: p.color || 'var(--theme-accent-primary)' }" />
              <span class="text-[10px] uppercase font-semibold tracking-wide t-text-accent">
                {{ PROJECT_STATUS_META[(p.status as string) || 'planning']?.label }}
              </span>
            </div>
            <h2 class="font-semibold t-text">{{ p.title }}</h2>
            <p v-if="p.description" class="text-sm t-text-muted mt-1 line-clamp-2" v-html="p.description" />
            <p v-if="fmt(p.due_date)" class="text-xs t-text-muted mt-2 inline-flex items-center gap-1">
              <Icon name="lucide:calendar" class="w-3.5 h-3.5" />Target {{ fmt(p.due_date) }}
            </p>
          </button>
        </div>
      </template>
    </PageContainer>
  </div>
</template>

<script setup lang="ts">
/** HomeTeamGlance — band 2 for a team member: progress Ring and the week's due strip. */
import { teamProgress, weekStrip, type HomeTask } from "#core/shared/home/board-team-home";

const props = defineProps<{ tasks: HomeTask[] }>();
const progress = computed(() => teamProgress(props.tasks));
const week = computed(() => weekStrip(props.tasks, new Date()));
</script>

<template>
  <div class="space-y-3" data-testid="home-team-glance">
    <h2 class="t-eyebrow">At a glance</h2>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <AppCard class="flex items-center gap-4 p-4" data-testid="home-team-ring">
        <AppChartRing :value="progress.done" :max="progress.total || 1" :size="84" label="Tasks done" />
        <div>
          <p class="text-sm font-medium t-text">Tasks done</p>
          <p class="text-xs t-text-muted">{{ progress.done }} of {{ progress.total }}</p>
        </div>
      </AppCard>
      <AppCard class="p-4" data-testid="home-week-strip">
        <p class="mb-2 text-sm font-medium t-text">This week</p>
        <div class="grid grid-cols-7 gap-1 text-center">
          <div v-for="d in week" :key="d.date">
            <p class="text-xs t-text-muted">{{ d.label }}</p>
            <p class="text-sm font-medium" :class="d.due ? 't-text' : 't-text-muted'" :title="`${d.due} due`">{{ d.due || "·" }}</p>
          </div>
        </div>
      </AppCard>
    </div>
  </div>
</template>

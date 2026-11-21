<script setup lang="ts">
/**
 * HomeTeamNeeds — band 1 for a team or committee member: the tasks assigned to
 * them, soonest first. Check one off in place.
 */
import { myOpenTasks, type HomeTask } from "#core/shared/home/board-team-home";

const props = defineProps<{ tasks: HomeTask[] }>();
const emit = defineEmits<{ done: [id: string] }>();
const { buildOrgPath } = useOrgNavigation();
const { toggleComplete } = useTasks();
const taskPanel = useAppSlideOver("task");
const busy = ref<string | null>(null);
const open = computed(() => myOpenTasks(props.tasks).slice(0, 8));

const check = async (t: HomeTask) => {
  busy.value = t.id;
  try {
    await toggleComplete(t as any);
    emit("done", t.id);
  } finally {
    busy.value = null;
  }
};
const due = (d?: string | null) => (d ? `Due ${new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "No due date");
</script>

<template>
  <div class="space-y-3" data-testid="home-team-tasks">
    <h2 class="t-eyebrow">Needs you</h2>
    <AppCard class="overflow-hidden py-0">
      <ul class="divide-y">
        <li v-for="t in open" :key="t.id" class="flex items-center gap-3 px-4 py-3" data-testid="home-task-row">
          <!-- allow-raw-button: a round check-off circle, not a labelled action -->
          <button
            type="button"
            class="h-5 w-5 shrink-0 rounded-full border t-border"
            :disabled="busy === t.id"
            :aria-label="`Mark ${t.title} done`"
            @click="check(t)"
          />
          <NuxtLink :to="buildOrgPath('/projects')" class="min-w-0 flex-1" @click.prevent="taskPanel.open(t.id)">
            <span class="block truncate text-sm font-medium t-text">{{ t.title }}</span>
            <span class="block truncate text-sm t-text-muted">{{ due(t.due_date) }}</span>
          </NuxtLink>
        </li>
        <li v-if="!open.length" class="px-4 py-3 text-sm t-text-muted">No tasks are waiting on you.</li>
      </ul>
    </AppCard>
  </div>
</template>

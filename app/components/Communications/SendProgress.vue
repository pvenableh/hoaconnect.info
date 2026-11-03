<script setup lang="ts">
// The send queue's progress, rendered the same way in the compose page's send
// dialog and on the email detail page: the label (Getting ready → Sending →
// Sent), a bar, a "Waiting" note when a run stopped before sending anything,
// the auto-pause sentence with Resume (Phase 4), and the failures once the send
// is done. Presentational — the caller polls (useSendProgress), passes the
// progress in, and handles `resume`.
import {
  progressLabel,
  progressPercent,
  type SendProgressView,
} from "#core/shared/email/send-progress";

const props = defineProps<{ progress: SendProgressView | null; resuming?: boolean; resumeError?: string | null }>();
defineEmits<{ resume: [] }>();

const label = computed(() => (props.progress ? progressLabel(props.progress) : "Starting…"));
const percent = computed(() => (props.progress ? progressPercent(props.progress) : 0));
const phase = computed(() => props.progress?.phase ?? "preparing");
const failedDone = computed(
  () => phase.value === "done" && (props.progress?.status === "failed" || (props.progress?.sent ?? 0) === 0)
);
</script>

<template>
  <div class="space-y-3" data-testid="send-progress" :data-phase="phase">
    <div class="flex items-center gap-2">
      <Icon
        v-if="phase === 'paused'"
        name="lucide:circle-pause"
        class="w-4 h-4 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <Icon
        v-else-if="phase !== 'done'"
        name="lucide:loader-2"
        class="w-4 h-4 animate-spin text-muted-foreground"
        aria-hidden="true"
      />
      <Icon
        v-else
        :name="failedDone ? 'lucide:circle-x' : 'lucide:circle-check'"
        :class="['w-4 h-4', failedDone ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400']"
        aria-hidden="true"
      />
      <p class="text-sm font-medium" data-testid="send-progress-label" aria-live="polite">{{ label }}</p>
    </div>

    <Progress :model-value="percent" class="h-1.5" :aria-label="label" />

    <div v-if="phase === 'paused'" class="space-y-2" data-testid="send-progress-health">
      <p class="text-xs text-amber-700 dark:text-amber-300">
        {{ progress?.paused?.sentence || "This send is on hold. Nobody else gets it until you resume it." }}
      </p>
      <div class="flex items-center gap-3">
        <Button size="sm" :disabled="resuming" data-testid="send-progress-resume" @click="$emit('resume')">
          <Icon v-if="resuming" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" />
          Resume sending
        </Button>
        <span v-if="resumeError" class="text-xs text-destructive">{{ resumeError }}</span>
      </div>
    </div>

    <p
      v-else-if="progress?.stalled && phase !== 'done'"
      class="text-xs text-amber-700 dark:text-amber-300"
      data-testid="send-progress-paused"
    >
      Waiting: {{ progress.stalled }} It will carry on by itself within a minute of being fixed.
    </p>

    <p v-if="phase === 'done' && (progress?.unknown ?? 0) > 0" class="text-xs text-muted-foreground">
      “Unknown” means the send was interrupted after handing the message to the mail service — it may have
      arrived. It is never resent automatically, so nobody gets it twice.
    </p>

    <ul
      v-if="phase === 'done' && progress?.errors?.length"
      class="max-h-40 overflow-auto rounded-md border border-border/60 divide-y divide-border/60 text-xs"
      data-testid="send-progress-errors"
    >
      <li v-for="(e, i) in progress.errors" :key="i" class="flex justify-between gap-3 px-3 py-1.5">
        <span class="font-medium truncate">{{ e.address || "—" }}</span>
        <span class="text-muted-foreground truncate">{{ e.reason }}</span>
      </li>
    </ul>
  </div>
</template>

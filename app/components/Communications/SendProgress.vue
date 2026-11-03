<script setup lang="ts">
// The send queue's progress, rendered the same way in the compose page's send
// dialog and on the email detail page: the label (Getting ready → Sending →
// Sent), a bar, a "Paused" note when a run stopped before sending anything,
// and the failures once the send is done. Presentational — the caller polls
// (useSendProgress) and passes the progress in.
import {
  progressLabel,
  progressPercent,
  type SendProgressView,
} from "#core/shared/email/send-progress";

const props = defineProps<{ progress: SendProgressView | null }>();

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
        v-if="phase !== 'done'"
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

    <p
      v-if="progress?.stalled && phase !== 'done'"
      class="text-xs text-amber-700 dark:text-amber-300"
      data-testid="send-progress-paused"
    >
      Paused: {{ progress.stalled }} It will carry on by itself within a minute of being fixed.
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

<script setup lang="ts">
import type { Poll, PollVote } from "#core/app/composables/usePolls";

const props = withDefaults(
  defineProps<{
    poll: Poll;
    canManage?: boolean;
  }>(),
  { canManage: false }
);

const emit = defineEmits<{ (e: "changed"): void }>();

const { getVotes, tally, vote, closePoll, reopenPoll } = usePolls();

const votes = ref<PollVote[]>([]);
const loading = ref(true);
const busy = ref(false);

const load = async () => {
  loading.value = true;
  try {
    votes.value = (await getVotes(props.poll.id)) as PollVote[];
  } catch (e) {
    console.error("Failed to load votes:", e);
    votes.value = [];
  } finally {
    loading.value = false;
  }
};
onMounted(load);

const results = computed(() => tally(votes.value));
const isClosed = computed(() => props.poll.status === "closed");
const hasVoted = computed(() => results.value.myOptionIds.length > 0);
const showResults = computed(() => isClosed.value || hasVoted.value);

const pct = (optionId: string) => {
  const t = results.value.total;
  return t ? Math.round(((results.value.counts[optionId] || 0) / t) * 100) : 0;
};
const isMine = (optionId: string) => results.value.myOptionIds.includes(optionId);

const onVote = async (optionId: string) => {
  if (isClosed.value || busy.value) return;
  busy.value = true;
  try {
    await vote(props.poll, optionId, votes.value);
    await load();
  } finally {
    busy.value = false;
  }
};

const onClose = async () => {
  await closePoll(props.poll.id);
  emit("changed");
};
const onReopen = async () => {
  await reopenPoll(props.poll.id);
  emit("changed");
};
</script>

<template>
  <div class="ios-card p-5">
    <div class="flex items-start gap-3">
      <div class="w-10 h-10 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center flex-shrink-0">
        <Icon name="lucide:bar-chart-3" class="w-5 h-5" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium uppercase tracking-wide t-text-muted">Poll</span>
          <span v-if="isClosed" class="text-[10px] font-medium t-text-muted uppercase">Closed</span>
        </div>
        <h3 class="font-semibold t-text mt-0.5">{{ poll.title }}</h3>
        <p v-if="poll.description" class="text-sm t-text-secondary mt-1">{{ poll.description }}</p>
      </div>
      <button
        v-if="canManage"
        type="button"
        class="text-xs t-text-muted hover:text-stone-700 flex-shrink-0"
        @click="isClosed ? onReopen() : onClose()"
      >
        {{ isClosed ? "Reopen" : "Close" }}
      </button>
    </div>

    <!-- Options -->
    <div class="mt-4 space-y-2">
      <button
        v-for="opt in poll.options"
        :key="opt.id"
        type="button"
        :disabled="isClosed || busy"
        class="relative w-full text-left rounded-xl border overflow-hidden transition-colors"
        :class="[
          isMine(opt.id) ? 'border-fuchsia-400' : 't-border',
          isClosed ? 'cursor-default' : 'hover:border-stone-300',
        ]"
        @click="onVote(opt.id)"
      >
        <!-- Result fill -->
        <div
          v-if="showResults"
          class="absolute inset-y-0 left-0 bg-fuchsia-50 transition-all"
          :style="{ width: pct(opt.id) + '%' }"
        />
        <div class="relative flex items-center justify-between px-3 py-2.5">
          <span class="text-sm font-medium t-text flex items-center gap-2">
            <Icon
              v-if="!isClosed"
              :name="isMine(opt.id) ? 'lucide:check-circle-2' : 'lucide:circle'"
              class="w-4 h-4"
              :class="isMine(opt.id) ? 'text-fuchsia-600' : 'text-stone-300'"
            />
            {{ opt.label }}
          </span>
          <span v-if="showResults" class="text-xs font-semibold t-text-muted tabular-nums">
            {{ pct(opt.id) }}%
          </span>
        </div>
      </button>
    </div>

    <!-- Footer -->
    <div class="mt-3 flex items-center justify-between text-xs t-text-muted">
      <span>{{ results.total }} vote{{ results.total === 1 ? "" : "s" }}</span>
      <span v-if="poll.allow_multiple">Multiple choice</span>
      <span v-else-if="!isClosed && hasVoted">Tap again to change your vote</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * HomeVoteSheet — vote on one poll from the home (docs/plan-unified-experience.md
 * §5, owner "vote in the card"). It is the Polls page's own `PollsPollCard`, so
 * the ballot, the results and who may vote are decided in one place.
 */
import type { Poll } from "#core/app/composables/usePolls";

const props = defineProps<{ pollId: string | null }>();
const emit = defineEmits<{ close: []; voted: [] }>();

const { getOne } = usePolls();
const poll = ref<Poll | null>(null);
const failed = ref(false);

watch(
  () => props.pollId,
  async (id) => {
    poll.value = null;
    failed.value = false;
    if (!id) return;
    try {
      poll.value = (await getOne(id)) as Poll;
    } catch {
      failed.value = true;
    }
  },
  { immediate: true },
);

const close = () => {
  emit("voted");
  emit("close");
};
</script>

<template>
  <AppBottomSheet :open="!!pollId" :title="poll?.title ?? 'Vote'" @update:open="(v: boolean) => !v && close()">
    <div data-testid="home-vote-sheet">
      <p v-if="failed" class="text-sm t-text-muted">That poll could not be loaded. Try the Polls page.</p>
      <div v-else-if="!poll" class="flex justify-center py-8"><div class="spinner-ios" /></div>
      <PollsPollCard v-else :poll="poll" @changed="emit('voted')" />
    </div>
  </AppBottomSheet>
</template>

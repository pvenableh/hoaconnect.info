<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    targetCollection: string;
    targetId: string;
    canReact?: boolean;
  }>(),
  { canReact: true }
);

const { aggregated, toggle } = useReactions(
  props.targetCollection,
  () => props.targetId
);

const QUICK_EMOJI = ["👍", "❤️", "🎉", "😂", "👀", "🙏", "✅"];
const showPicker = ref(false);

const onToggle = async (emoji: string) => {
  if (!props.canReact) return;
  showPicker.value = false;
  try {
    await toggle(emoji);
  } catch (e) {
    console.error("Failed to toggle reaction:", e);
  }
};
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <!-- Existing reaction chips -->
    <button
      v-for="r in aggregated"
      :key="r.emoji"
      type="button"
      @click="onToggle(r.emoji)"
      :disabled="!canReact"
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors"
      :class="
        r.reactedByMe
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 't-bg-subtle t-border t-text-secondary hover:t-bg-subtle'
      "
    >
      <span>{{ r.emoji }}</span>
      <span class="tabular-nums">{{ r.count }}</span>
    </button>

    <!-- Add reaction -->
    <div v-if="canReact" class="relative">
      <button
        type="button"
        @click="showPicker = !showPicker"
        class="inline-flex items-center justify-center w-6 h-6 rounded-full border t-border t-text-muted hover:t-bg-subtle hover:t-text-secondary transition-colors"
        aria-label="Add reaction"
      >
        <Icon name="lucide:smile-plus" class="w-3.5 h-3.5" />
      </button>

      <div
        v-if="showPicker"
        class="absolute bottom-full left-0 mb-1 z-20 flex items-center gap-1 p-1.5 rounded-full t-bg-elevated shadow-lg ring-1 ring-[var(--theme-border-primary)]"
      >
        <button
          v-for="emoji in QUICK_EMOJI"
          :key="emoji"
          type="button"
          @click="onToggle(emoji)"
          class="w-7 h-7 rounded-full hover:t-bg-subtle transition-colors text-base"
        >
          {{ emoji }}
        </button>
      </div>
    </div>
  </div>
</template>

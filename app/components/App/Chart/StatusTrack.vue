<script setup lang="ts">
/**
 * Where one request, payment or approval sits in its steps. Steps before the
 * current one are done, the current one is marked, the rest are still ahead.
 * The connecting line fills once on mount. No steps means nothing to track;
 * no current key means the item has not started.
 */
interface TrackStep {
  key: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    steps: TrackStep[];
    /** Key of the step the item is on now. Null before it starts. */
    current: string | null;
    emptyTitle?: string;
  }>(),
  { emptyTitle: "Nothing to track yet" },
);

const drawn = ref(false);
onMounted(() => requestAnimationFrame(() => (drawn.value = true)));

const currentIndex = computed(() => props.steps.findIndex((s) => s.key === props.current));

// Fraction of the connecting line that is done: from the first step to the current one.
const progress = computed(() => {
  const last = props.steps.length - 1;
  if (last <= 0 || currentIndex.value < 0) return 0;
  return currentIndex.value / last;
});

const stateOf = (i: number) => {
  if (currentIndex.value < 0) return "upcoming";
  if (i < currentIndex.value) return "done";
  if (i === currentIndex.value) return "current";
  return "upcoming";
};
</script>

<template>
  <ClientOnly>
    <div v-if="steps.length === 0" class="flex items-center h-16">
      <span class="type-meta t-text-muted">{{ emptyTitle }}</span>
    </div>
    <ol v-else class="relative flex justify-between gap-2" :aria-label="'Progress'">
      <div
        class="track-line absolute left-[10px] right-[10px] top-[9px] h-[2px] rounded-full"
        aria-hidden="true"
        style="background: color-mix(in srgb, var(--theme-text-muted) 22%, transparent)"
      >
        <div
          class="track-fill h-full rounded-full origin-left"
          :style="{ transform: `scaleX(${drawn ? progress : 0})`, background: 'var(--chart-1)' }"
        />
      </div>
      <li
        v-for="(step, i) in steps"
        :key="step.key"
        class="relative z-[1] flex flex-col items-center text-center min-w-0 flex-1"
        :aria-current="stateOf(i) === 'current' ? 'step' : undefined"
      >
        <span
          class="block w-5 h-5 rounded-full border-2"
          :class="{
            'track-dot--done': stateOf(i) === 'done',
            'track-dot--current': stateOf(i) === 'current',
          }"
          :style="{
            borderColor: stateOf(i) === 'upcoming' ? 'var(--theme-border)' : 'var(--chart-1)',
            background: stateOf(i) === 'done' ? 'var(--chart-1)' : 'var(--theme-bg-elevated)',
            boxShadow: stateOf(i) === 'current' ? '0 0 0 4px color-mix(in srgb, var(--chart-1) 22%, transparent)' : 'none',
          }"
        />
        <span
          class="type-micro mt-2 truncate max-w-full"
          :class="stateOf(i) === 'upcoming' ? 't-text-muted' : 't-text'"
        >
          {{ step.label }}
        </span>
      </li>
    </ol>
    <template #fallback>
      <div class="h-16" />
    </template>
  </ClientOnly>
</template>

<style scoped>
.track-fill {
  transition: transform 640ms cubic-bezier(0.22, 1, 0.36, 1);
}
@media (prefers-reduced-motion: reduce) {
  .track-fill {
    transition: none;
  }
}
</style>

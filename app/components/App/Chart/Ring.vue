<script setup lang="ts">
/**
 * Progress toward one number: 7 of 10 inspections done, 82% of dues collected.
 * The ring draws in once on mount and reads --chart-1 over a muted track.
 *
 * `value` null means no reading yet; the ring stays empty and says so.
 */
const props = withDefaults(
  defineProps<{
    value: number | null;
    /** The number that means full. Defaults to 100 so a percent works as-is. */
    max?: number;
    /** Text in the centre. Defaults to the share of `max`, as a percent. */
    format?: (n: number) => string;
    label?: string;
    size?: number;
  }>(),
  { max: 100, size: 120 },
);

const drawn = ref(false);
onMounted(() => requestAnimationFrame(() => (drawn.value = true)));

const ratio = computed(() => {
  if (props.value == null || props.max <= 0) return 0;
  return Math.min(1, Math.max(0, props.value / props.max));
});

const centre = computed(() => {
  if (props.value == null) return "—";
  return props.format ? props.format(props.value) : `${Math.round(ratio.value * 100)}%`;
});

const EMPTY_TEXT = "No reading yet";
const CIRCUMFERENCE = 100; // pathLength="100" on the circle, so dash math is in percent
</script>

<template>
  <ClientOnly>
    <div
      class="relative mx-auto"
      role="meter"
      :aria-label="label ?? 'Progress'"
      :aria-valuemin="0"
      :aria-valuemax="max"
      :aria-valuenow="value ?? undefined"
      :aria-valuetext="value == null ? EMPTY_TEXT : centre"
      :style="{ width: `${size}px`, height: `${size}px` }"
    >
      <svg viewBox="0 0 100 100" class="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--theme-border)" stroke-width="10" />
        <circle
          v-if="value != null"
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="var(--chart-1)"
          stroke-width="10"
          stroke-linecap="round"
          :pathLength="CIRCUMFERENCE"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="drawn ? CIRCUMFERENCE - ratio * CIRCUMFERENCE : CIRCUMFERENCE"
          class="ring-arc"
        />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center">
        <span class="text-xl font-semibold t-text tabular-nums leading-none">{{ centre }}</span>
        <!-- allow-bare-empty: a figure in a card, its note is inline copy, not a page empty state -->
        <span v-if="value == null" class="type-micro t-text-muted mt-1">{{ EMPTY_TEXT }}</span>
      </div>
    </div>
    <template #fallback>
      <div :style="{ width: `${size}px`, height: `${size}px` }" />
    </template>
  </ClientOnly>
</template>

<style scoped>
.ring-arc {
  transition: stroke-dashoffset 720ms var(--ease-out-expo);
}
@media (prefers-reduced-motion: reduce) {
  .ring-arc {
    transition: none;
  }
}
</style>

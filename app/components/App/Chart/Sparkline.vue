<script setup lang="ts">
/**
 * A line with no axes: the shape of a series in a strip of space, beside a
 * number. Dues this month, open requests this week. Draws in once on mount,
 * reads --chart-1, and says so when there are fewer than two points.
 *
 * Client-only with a reserved box, so the row never shifts on hydration.
 */
const props = withDefaults(
  defineProps<{
    values: number[];
    width?: number;
    height?: number;
    /** Accessible name for the line, e.g. "Dues, last 12 months". */
    label?: string;
  }>(),
  { width: 120, height: 32 },
);

const drawn = ref(false);
onMounted(() => requestAnimationFrame(() => (drawn.value = true)));

const points = computed(() => {
  const v = props.values;
  if (v.length < 2) return "";
  const min = Math.min(...v);
  const span = Math.max(...v) - min || 1;
  return v
    .map((n, i) => `${(i / (v.length - 1)) * 100},${100 - ((n - min) / span) * 100}`)
    .join(" ");
});
</script>

<template>
  <ClientOnly>
    <div v-if="values.length < 2" class="flex items-center" :style="{ height: `${height}px`, width: `${width}px` }">
      <!-- allow-bare-empty: a figure beside a number, its note is inline copy, not a page empty state -->
      <span class="type-micro t-text-muted">No trend yet</span>
    </div>
    <svg
      v-else
      role="img"
      :aria-label="label ?? 'Trend'"
      :width="width"
      :height="height"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      class="overflow-visible"
    >
      <polyline
        :points="points"
        fill="none"
        stroke="var(--chart-1)"
        stroke-width="2.5"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
        pathLength="1"
        class="mark-draw"
        :class="{ 'is-drawn': drawn }"
      />
    </svg>
    <template #fallback>
      <div :style="{ height: `${height}px`, width: `${width}px` }" />
    </template>
  </ClientOnly>
</template>

<style scoped>
.mark-draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
}
.mark-draw.is-drawn {
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 640ms var(--ease-out-expo);
}
@media (prefers-reduced-motion: reduce) {
  .mark-draw,
  .mark-draw.is-drawn {
    stroke-dashoffset: 0;
    transition: none;
  }
}
</style>

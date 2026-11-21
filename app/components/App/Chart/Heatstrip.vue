<script setup lang="ts">
/**
 * A year of days as a grid: one cell per day, columns are weeks, Sunday on
 * top. Shows when things happened — work orders, payments, visits. Cells fade
 * in once, left to right. Empty years say so over a faint grid rather than
 * drawing nothing.
 *
 * `values` is keyed by ISO date (YYYY-MM-DD, UTC). Intensity is relative to
 * the largest value passed in.
 */
const props = withDefaults(
  defineProps<{
    year: number;
    values: Record<string, number>;
    label?: string;
  }>(),
  {},
);

const CELL = 11;
const GAP = 2;
const STEP = CELL + GAP;
const ROWS = 7;

const cells = computed(() => {
  const jan1 = new Date(Date.UTC(props.year, 0, 1));
  const next = new Date(Date.UTC(props.year + 1, 0, 1));
  const days = Math.round((next.getTime() - jan1.getTime()) / 864e5);
  const offset = jan1.getUTCDay();
  const out: { key: string; x: number; y: number; value: number; col: number }[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(jan1.getTime() + i * 864e5);
    const slot = offset + i;
    const col = Math.floor(slot / ROWS);
    const row = slot % ROWS;
    const key = day.toISOString().slice(0, 10);
    out.push({ key, x: col * STEP, y: row * STEP, value: props.values[key] ?? 0, col });
  }
  return out;
});

const cols = computed(() => (cells.value.at(-1)?.col ?? 0) + 1);
const width = computed(() => cols.value * STEP - GAP);
const height = ROWS * STEP - GAP;

const max = computed(() => Math.max(0, ...Object.values(props.values)));
const hasData = computed(() => max.value > 0);

const LEVEL_ALPHA = [0, 32, 56, 80, 100];
function fill(value: number): string {
  if (!value || !max.value) return "color-mix(in srgb, var(--theme-text-muted) 14%, transparent)";
  const level = Math.min(4, Math.max(1, Math.ceil((value / max.value) * 4)));
  return `color-mix(in srgb, var(--chart-1) ${LEVEL_ALPHA[level]}%, transparent)`;
}
</script>

<template>
  <ClientOnly>
    <div class="w-full">
      <svg
        role="img"
        :aria-label="label ?? `Activity, ${year}`"
        :viewBox="`0 0 ${width} ${height}`"
        class="w-full h-auto block"
        :style="{ opacity: hasData ? 1 : 0.5 }"
      >
        <rect
          v-for="c in cells"
          :key="c.key"
          :x="c.x"
          :y="c.y"
          :width="CELL"
          :height="CELL"
          rx="2.5"
          :fill="fill(c.value)"
          class="heat-cell"
          :style="{ animationDelay: `${c.col * 14}ms` }"
        >
          <title>{{ c.key }}{{ c.value ? `: ${c.value}` : '' }}</title>
        </rect>
      </svg>
      <p v-if="!hasData" class="type-meta t-text-muted mt-2">No activity recorded for {{ year }} yet.</p>
    </div>
    <template #fallback>
      <div :style="{ height: `${height + 24}px` }" />
    </template>
  </ClientOnly>
</template>

<style scoped>
.heat-cell {
  animation: heat-in 360ms both;
}
@keyframes heat-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .heat-cell {
    animation: none;
  }
}
</style>

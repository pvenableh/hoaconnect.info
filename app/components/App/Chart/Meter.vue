<script setup lang="ts">
/**
 * One value against a limit: budget spent against budget, units used against
 * the cap. Under 80% reads as good, 80–100% as warn, over the limit as bad.
 * The bar fills in once on mount. `value` null means no reading yet.
 */
import { CHART_STATUS_VARS } from "#core/app/composables/useChartColors";

const props = withDefaults(
  defineProps<{
    value: number | null;
    limit: number;
    label?: string;
    format?: (n: number) => string;
  }>(),
  {},
);

const drawn = ref(false);
onMounted(() => requestAnimationFrame(() => (drawn.value = true)));

const EMPTY_TEXT = "No reading yet";

const fmt = (n: number) => (props.format ? props.format(n) : String(n));

const ratio = computed(() => (props.limit > 0 && props.value != null ? props.value / props.limit : 0));

const status = computed<"good" | "warn" | "bad">(() => {
  if (ratio.value > 1) return "bad";
  if (ratio.value >= 0.8) return "warn";
  return "good";
});

const fill = computed(() => `${Math.min(1, ratio.value) * 100}%`);
const fillColor = computed(() => CHART_STATUS_VARS[status.value]);
</script>

<template>
  <ClientOnly>
    <div class="w-full">
      <div class="flex items-baseline justify-between gap-3 mb-1.5">
        <span class="type-meta truncate">{{ label }}</span>
        <span class="type-meta t-text-muted tabular-nums whitespace-nowrap">
          <!-- allow-bare-empty: a figure in a card, its note is inline copy, not a page empty state -->
          <template v-if="value == null">{{ EMPTY_TEXT }}</template>
          <template v-else>{{ fmt(value) }} of {{ fmt(limit) }}</template>
        </span>
      </div>
      <div
        role="meter"
        :aria-label="label ?? 'Usage against limit'"
        :aria-valuemin="0"
        :aria-valuemax="limit"
        :aria-valuenow="value ?? undefined"
        :aria-valuetext="value == null ? EMPTY_TEXT : `${fmt(value)} of ${fmt(limit)}`"
        class="h-2.5 w-full rounded-full overflow-hidden"
        style="background: color-mix(in srgb, var(--theme-text-muted) 16%, transparent)"
      >
        <div
          v-if="value != null"
          class="meter-fill h-full rounded-full"
          :class="{ 'is-drawn': drawn }"
          :style="{ width: drawn ? fill : '0%', background: fillColor }"
        />
      </div>
    </div>
    <template #fallback>
      <div class="h-10" />
    </template>
  </ClientOnly>
</template>

<style scoped>
.meter-fill {
  transition: width 560ms cubic-bezier(0.22, 1, 0.36, 1);
}
@media (prefers-reduced-motion: reduce) {
  .meter-fill {
    transition: none;
  }
}
</style>

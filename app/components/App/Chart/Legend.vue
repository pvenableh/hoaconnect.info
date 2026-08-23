<script setup lang="ts">
/**
 * The swatch row under a chart. Separate from the chart itself because a donut,
 * a bar chart and a trend line all need the same one, and because a legend that
 * can also carry the series' value ("Owners 18") often replaces a tooltip
 * entirely on a small card.
 */
import type { ChartSeries } from "#core/app/composables/useChartColors";

defineProps<{
  series: (ChartSeries & { color: string; value?: string | number })[];
}>();
</script>

<template>
  <div class="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-3">
    <div v-for="s in series" :key="s.key" class="flex items-center gap-1.5">
      <span
        class="w-2.5 h-2.5 rounded-full shrink-0"
        :style="{ backgroundColor: s.color }"
        aria-hidden="true"
      />
      <!-- type-meta, not type-micro: micro is the UPPERCASE metadata role, and
           a legend shouting "OWNER-OCCUPIED" reads as a label for the chart
           rather than as part of it. -->
      <span class="type-meta t-text-secondary">{{ s.label }}</span>
      <span v-if="s.value != null" class="type-meta t-text tabular-nums font-medium">
        {{ s.value }}
      </span>
    </div>
  </div>
</template>

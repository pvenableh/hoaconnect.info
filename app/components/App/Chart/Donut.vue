<script setup lang="ts">
/**
 * A donut with the total in the hole. For a composition question with a small
 * number of parts — owners vs tenants, paid vs outstanding — where the whole is
 * as interesting as the split.
 *
 * Renders nothing on the server: the parent AppChartCard already wraps its
 * default slot in ClientOnly, and every chart in this kit relies on that rather
 * than nesting its own.
 */
import { VisDonut, VisSingleContainer, VisTooltip } from "@unovis/vue";
import { resolveSeries, type ChartSeries } from "#core/app/composables/useChartColors";

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

const props = withDefaults(
  defineProps<{
    series: ChartSeries[];
    /** value per series key */
    values: Record<string, number>;
    /** Big number in the hole. Defaults to the sum. */
    centerValue?: string | number;
    centerLabel?: string;
    height?: number;
    /** Formats a slice's value in the tooltip and legend. */
    format?: (n: number) => string;
  }>(),
  { height: 200 },
);

const fmt = (n: number) => (props.format ? props.format(n) : String(n));

const slices = computed<Slice[]>(() =>
  resolveSeries(props.series).map((s) => ({
    key: s.key,
    label: s.label,
    value: props.values[s.key] ?? 0,
    color: s.color,
  })),
);

const total = computed(() => slices.value.reduce((sum, s) => sum + s.value, 0));

// A zero total would make every share NaN%, so the tooltip asks first.
const share = (v: number) => (total.value ? Math.round((v / total.value) * 100) : 0);

const value = (d: Slice) => d.value;
const color = (d: Slice) => d.color;

const legend = computed(() =>
  slices.value.map((s) => ({ key: s.key, label: s.label, color: s.color, value: fmt(s.value) })),
);
</script>

<template>
  <div>
    <div class="relative mx-auto" :style="{ height: `${height}px`, width: `${height}px` }">
      <VisSingleContainer :data="slices" :height="height">
        <VisDonut :value="value" :color="color" :arcWidth="34" :padAngle="0.02" :cornerRadius="6" />
        <VisTooltip>
          <template #default="{ data: d }">
            <div v-if="d" class="chart-tooltip">
              <div class="font-medium t-text">{{ d.label }}</div>
              <div class="t-text-muted">{{ fmt(d.value) }} · {{ share(d.value) }}%</div>
            </div>
          </template>
        </VisTooltip>
      </VisSingleContainer>

      <!-- The hole. pointer-events-none so it never eats a slice hover. -->
      <div
        class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
      >
        <span class="text-2xl font-semibold t-text tabular-nums leading-none">
          {{ centerValue ?? fmt(total) }}
        </span>
        <span v-if="centerLabel" class="type-micro t-text-muted mt-1">{{ centerLabel }}</span>
      </div>
    </div>

    <AppChartLegend :series="legend" />
  </div>
</template>

<style scoped>
.chart-tooltip {
  background: var(--theme-bg-elevated);
  border: 1px solid var(--theme-border);
  border-radius: 0.625rem;
  padding: 0.5rem 0.625rem;
  font-size: 0.8125rem;
  line-height: 1.35;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
}
</style>

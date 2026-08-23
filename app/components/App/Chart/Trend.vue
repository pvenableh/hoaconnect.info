<script setup lang="ts">
/**
 * A line (optionally filled) over time. For "is this going up or down" —
 * collections by month, email opens by day — where the shape matters more than
 * any single point.
 *
 * The crosshair rather than a plain tooltip: on a trend the reader is asking
 * about a moment in time, not about a mark, and the crosshair answers for the
 * whole x position at once.
 */
import { VisXYContainer, VisLine, VisArea, VisAxis, VisCrosshair, VisTooltip } from "@unovis/vue";
import { resolveSeries, type ChartSeries } from "#core/app/composables/useChartColors";

interface Point {
  label: string;
  [key: string]: string | number;
}

const props = withDefaults(
  defineProps<{
    data: Point[];
    series: ChartSeries[];
    height?: number;
    /** Fill under the line. Off for multi-series, where the fills muddy each other. */
    area?: boolean;
    format?: (n: number) => string;
    hideLegend?: boolean;
  }>(),
  { height: 200 },
);

const fmt = (n: number) => (props.format ? props.format(n) : String(n));

const resolved = computed(() => resolveSeries(props.series));

const x = (_: Point, i: number) => i;
const y = computed(() => resolved.value.map((s) => (d: Point) => Number(d[s.key] ?? 0)));
const color = computed(() => resolved.value.map((s) => s.color));

// One tick per point crowds a 30-day window; cap the count and let unovis pick.
const numTicks = computed(() => Math.min(props.data.length, 7));
const tickFormat = (i: number) => props.data[Math.round(i)]?.label ?? "";

const legend = computed(() =>
  resolved.value.map((s) => ({ key: s.key, label: s.label, color: s.color })),
);
</script>

<template>
  <div>
    <VisXYContainer
      :data="data"
      :height="height"
      :margin="{ top: 8, right: 12, bottom: 24, left: 44 }"
    >
      <VisArea
        v-if="area"
        :x="x"
        :y="y"
        :color="color"
        :opacity="0.12"
        curveType="monotoneX"
      />
      <VisLine :x="x" :y="y" :color="color" :lineWidth="2" curveType="monotoneX" />
      <VisAxis type="x" :tickFormat="tickFormat" :numTicks="numTicks" :gridLine="false" />
      <VisAxis type="y" :tickFormat="(v: number) => fmt(v)" :gridLine="true" :numTicks="4" />
      <VisCrosshair :template="() => ''" />
      <VisTooltip>
        <template #default="{ data: d }">
          <div v-if="d" class="chart-tooltip">
            <div class="font-medium t-text mb-1">{{ d.label }}</div>
            <div v-for="s in resolved" :key="s.key" class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: s.color }" />
              <span class="t-text-secondary">{{ s.label }}</span>
              <span class="t-text tabular-nums ml-auto pl-3">{{ fmt(Number(d[s.key] ?? 0)) }}</span>
            </div>
          </div>
        </template>
      </VisTooltip>
    </VisXYContainer>

    <AppChartLegend v-if="!hideLegend && series.length > 1" :series="legend" />
  </div>
</template>

<style scoped>
.chart-tooltip {
  background: var(--theme-bg-elevated);
  border: 1px solid var(--theme-border);
  border-radius: 0.625rem;
  padding: 0.5rem 0.625rem;
  font-size: 0.8125rem;
  line-height: 1.4;
  min-width: 9rem;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
}
</style>

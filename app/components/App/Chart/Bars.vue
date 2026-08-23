<script setup lang="ts">
/**
 * Bars over a categorical axis — stacked when the parts sum to something a
 * reader cares about (requests by status per type), grouped when they're
 * separate quantities being compared side by side.
 *
 * The x axis is index-based rather than value-based on purpose: the categories
 * are months or labels, not numbers, and letting unovis infer a numeric scale
 * from "Jan" produces an axis that lies.
 */
import { VisXYContainer, VisStackedBar, VisGroupedBar, VisAxis, VisTooltip } from "@unovis/vue";
import { resolveSeries, type ChartSeries } from "#core/app/composables/useChartColors";

interface Row {
  label: string;
  [key: string]: string | number;
}

const props = withDefaults(
  defineProps<{
    data: Row[];
    series: ChartSeries[];
    /** Stack the series instead of putting them side by side. */
    stacked?: boolean;
    height?: number;
    /** Formats a value in the tooltip and on the y axis. */
    format?: (n: number) => string;
    /** Hide the legend when a single series makes it redundant. */
    hideLegend?: boolean;
    /**
     * Colour each BAR instead of each series. Only meaningful with one series,
     * where the category is the x value rather than the stack — an ageing
     * chart, where "90 days +" should be red because of what it means.
     */
    colorByRow?: (row: Row, index: number) => string;
  }>(),
  { height: 200, stacked: true },
);

const fmt = (n: number) => (props.format ? props.format(n) : String(n));

const resolved = computed(() => resolveSeries(props.series));

const x = (_: Row, i: number) => i;
const y = computed(() => resolved.value.map((s) => (d: Row) => Number(d[s.key] ?? 0)));
// One series + colorByRow → a per-datum accessor; otherwise one colour per
// series, which is what unovis expects for a stack.
const color = computed(() =>
  props.colorByRow && resolved.value.length === 1
    ? (d: Row, i: number) => props.colorByRow!(d, i)
    : resolved.value.map((s) => s.color),
);

const tickFormat = (i: number) => props.data[Math.round(i)]?.label ?? "";

const legend = computed(() =>
  resolved.value.map((s) => ({ key: s.key, label: s.label, color: s.color })),
);

// A row's total, for the tooltip header — the thing a stacked bar is actually
// showing and the one number the segments don't give you directly.
const rowTotal = (d: Row) =>
  resolved.value.reduce((sum, s) => sum + Number(d[s.key] ?? 0), 0);
</script>

<template>
  <div>
    <VisXYContainer
      :data="data"
      :height="height"
      :margin="{ top: 8, right: 8, bottom: 24, left: 40 }"
    >
      <VisStackedBar
        v-if="stacked"
        :x="x"
        :y="y"
        :color="color"
        :roundedCorners="4"
        :barPadding="0.25"
      />
      <VisGroupedBar
        v-else
        :x="x"
        :y="y"
        :color="color"
        :roundedCorners="4"
        :barPadding="0.2"
        :groupPadding="0.1"
      />
      <VisAxis type="x" :tickFormat="tickFormat" :numTicks="data.length" :gridLine="false" />
      <VisAxis type="y" :tickFormat="(v: number) => fmt(v)" :gridLine="true" :numTicks="4" />
      <VisTooltip>
        <template #default="{ data: d }">
          <div v-if="d" class="chart-tooltip">
            <div class="font-medium t-text mb-1">
              {{ d.label }}
              <span v-if="series.length > 1" class="t-text-muted font-normal">
                · {{ fmt(rowTotal(d)) }}
              </span>
            </div>
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

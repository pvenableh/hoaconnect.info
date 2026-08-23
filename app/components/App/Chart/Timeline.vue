<script setup lang="ts">
/**
 * A Gantt strip: one bar per item, positioned on a shared time axis, grouped
 * into rows. For "when does this happen relative to that" — a year of meetings,
 * a dues schedule, a set of requests and how long each has been open.
 *
 * This is the GENERIC one. Projects/ProjectGantt.vue stays where it is: it does
 * dependency connectors, drag-to-reschedule with a shift cascade, approvals and
 * project spawning, none of which generalise to "show me the year". Two
 * components, because they answer two different questions.
 *
 * A meeting is a moment, not a span, and a zero-length bar on a 250-day axis
 * draws as a 2px sliver you cannot see or hover. unovis has the answer:
 * `showEmptySegments` floors a segment at one pixel and, with `lineCap`, draws
 * it as a circle of the line's own width. So a moment is a dot and a span is a
 * bar, with no fake duration invented to make the moment visible — which is
 * what `minDurationDays` was doing, and it lied about the dates.
 */
import { VisXYContainer, VisTimeline, VisAxis, VisPlotline, VisTooltip } from "@unovis/vue";
import { Timeline } from "@unovis/ts";

export interface TimelineItem {
  id: string;
  label: string;
  /** Row to sit in. Items sharing a row share a line. Defaults to `label`. */
  row?: string;
  start: string | Date;
  /** Omit for a moment rather than a span. */
  end?: string | Date | null;
  color?: string;
  /** Second line in the tooltip. */
  detail?: string;
}

interface Bar {
  id: string;
  label: string;
  row: string;
  start: number;
  duration: number;
  color: string;
  detail?: string;
  startLabel: string;
  endLabel?: string;
}

const props = withDefaults(
  defineProps<{
    items: TimelineItem[];
    height?: number;
    rowHeight?: number;
    rowLabelWidth?: number;
    /** Draw a dashed line at now. */
    showToday?: boolean;
  }>(),
  { height: 240, rowHeight: 28, rowLabelWidth: 120, showToday: true },
);

const emit = defineEmits<{ (e: "select", id: string): void }>();

const toMs = (v: string | Date | null | undefined): number | null => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

const dateLabel = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const bars = computed<Bar[]>(() =>
  props.items.flatMap((item, i) => {
    const start = toMs(item.start);
    // An item with no readable start has no position on a time axis. Dropping it
    // is the honest move — placing it at epoch would stretch the axis to 1970.
    if (start == null) return [];
    const end = toMs(item.end);
    // Genuinely zero for a moment — showEmptySegments turns that into a dot.
    const span = end != null && end > start ? end - start : 0;
    return [
      {
        id: item.id,
        label: item.label,
        row: item.row ?? item.label,
        start,
        duration: span,
        color: item.color ?? chartColor(i),
        detail: item.detail,
        startLabel: dateLabel(start),
        endLabel: end != null && end > start ? dateLabel(end) : undefined,
      },
    ];
  }),
);

const x = (d: Bar) => d.start;
const lineDuration = (d: Bar) => d.duration;
const lineRow = (d: Bar) => d.row;
const color = (d: Bar) => d.color;

const now = computed(() => Date.now());

// Only mark today when it's actually inside the window — a dashed line pinned to
// the edge of a chart of next year's meetings says nothing.
const todayInRange = computed(() => {
  if (!props.showToday || !bars.value.length) return false;
  const min = Math.min(...bars.value.map((b) => b.start));
  const max = Math.max(...bars.value.map((b) => b.start + b.duration));
  return now.value >= min && now.value <= max;
});

// unovis dispatches on its own hashed selector constants, so the key has to be
// Timeline.selectors.line — a hand-written "timeline-line" silently never fires.
const barEvents = {
  [Timeline.selectors.line]: { click: (d: Bar) => emit("select", d.id) },
};

const axisFormat = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
</script>

<template>
  <VisXYContainer
    :data="bars"
    :height="height"
    :margin="{ top: 4, right: 12, bottom: 24, left: 4 }"
  >
    <VisTimeline
      :x="x"
      :lineDuration="lineDuration"
      :lineRow="lineRow"
      :color="color"
      :lineWidth="10"
      :lineCap="true"
      :showEmptySegments="true"
      :rowHeight="rowHeight"
      :showRowLabels="true"
      :rowMaxLabelWidth="rowLabelWidth"
      :alternatingRowColors="false"
      lineCursor="pointer"
      :events="barEvents"
    />
    <VisPlotline
      v-if="todayInRange"
      axis="x"
      :value="now"
      color="var(--theme-text-muted)"
      :lineWidth="1"
      lineStyle="dashed"
      labelText="Today"
    />
    <VisAxis type="x" :tickFormat="axisFormat" :numTicks="5" :gridLine="true" />
    <VisTooltip>
      <template #default="{ data: d }">
        <div v-if="d" class="chart-tooltip">
          <div class="font-medium t-text">{{ d.label }}</div>
          <div class="t-text-muted">
            {{ d.startLabel }}<template v-if="d.endLabel"> → {{ d.endLabel }}</template>
          </div>
          <div v-if="d.detail" class="t-text-secondary mt-0.5">{{ d.detail }}</div>
        </div>
      </template>
    </VisTooltip>
  </VisXYContainer>
</template>

<style scoped>
.chart-tooltip {
  background: var(--theme-bg-elevated);
  border: 1px solid var(--theme-border);
  border-radius: 0.625rem;
  padding: 0.5rem 0.625rem;
  font-size: 0.8125rem;
  line-height: 1.4;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
}
</style>

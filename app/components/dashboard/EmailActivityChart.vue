<script setup lang="ts">
/**
 * Dashboard widget — sends, deliveries and opens over the last week.
 *
 * Was a raw shadcn <Card> with its own axes, crosshair template and a
 * hand-rolled legend, on the shadcn palette rather than the workspace theme.
 * Now it's AppChartCard + AppChartTrend; the frame owns loading / empty / drawn
 * and the ClientOnly that unovis needs, so none of that is repeated here.
 *
 * No area fill: three overlapping fills muddy each other, and this chart is
 * about the gap BETWEEN the three lines — sent against delivered against
 * opened is a funnel, and a fill hides where it narrows.
 */
interface EmailData {
  date: string;
  sent: number;
  delivered: number;
  opened: number;
}

const props = defineProps<{
  data: EmailData[];
}>();

const SERIES = [
  { key: "sent", label: "Sent", color: "var(--chart-1)" },
  { key: "delivered", label: "Delivered", color: "var(--chart-2)" },
  { key: "opened", label: "Opened", color: "var(--chart-3)" },
];

// The kit's charts key off `label`; the page supplies `date`.
const points = computed(() =>
  (props.data || []).map((d) => ({
    label: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    sent: d.sent,
    delivered: d.delivered,
    opened: d.opened,
  })),
);

// A week of zeroes is not a chart. Say "no mail went out" rather than drawing
// three flat lines along the axis and letting the reader work it out.
const hasAny = computed(() =>
  (props.data || []).some((d) => d.sent || d.delivered || d.opened),
);
</script>

<template>
  <AppChartCard
    title="Email Activity"
    hint="Last 7 days email performance"
    icon="lucide:line-chart"
    :empty="!hasAny"
    empty-title="No mail in the last week"
    empty-hint="Send a broadcast and its delivery shows up here."
    :height="200"
  >
    <AppChartTrend :data="points" :series="SERIES" :height="200" />
  </AppChartCard>
</template>

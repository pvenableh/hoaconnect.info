<script setup lang="ts">
/**
 * The band at the top of Records → Meetings: the community's year on one axis.
 *
 * A list of meetings answers "what is next". It does not answer "have we been
 * meeting", which is the question a board actually gets asked — by an owner, by
 * a lender, by an estoppel request. A twelve-month strip answers it at a
 * glance: the gaps are the point.
 *
 * Rows are meeting TYPE, not individual meetings. Board meetings recur, so one
 * row per meeting would be a staircase forty rows tall; one row per type puts
 * the cadence of each kind on its own line where a missed quarter is visible.
 *
 * Takes the meetings the page already loaded rather than fetching again.
 */
interface MeetingRow {
  id: string;
  title?: string | null;
  type?: string | null;
  status?: string | null;
  meeting_date?: string | null;
  end_date?: string | null;
  minutes?: string | null;
  is_published?: boolean | null;
}

const props = defineProps<{
  meetings: MeetingRow[];
  loading?: boolean;
}>();

const TYPE_LABELS: Record<string, string> = {
  board: "Board",
  annual: "Annual",
  special: "Special",
  committee: "Committee",
};

// Status, not type, drives colour: on a timeline the reader is scanning for
// what already happened versus what is still coming, and the row label already
// carries the type.
const STATUS_COLORS: Record<string, string> = {
  completed: "var(--chart-1)",
  in_progress: "var(--chart-2)",
  scheduled: "var(--chart-3)",
  canceled: CHART_STATUS_VARS.muted,
};

const MS_DAY = 86_400_000;
const WINDOW_DAYS = 365;

const now = Date.now();

// Twelve months back and three forward: enough history to show a cadence,
// enough future to show what's booked, without an axis so wide the bars vanish.
const windowed = computed(() =>
  props.meetings.filter((m) => {
    const t = m.meeting_date ? new Date(m.meeting_date).getTime() : NaN;
    if (!Number.isFinite(t)) return false;
    return t >= now - WINDOW_DAYS * MS_DAY && t <= now + 90 * MS_DAY;
  }),
);

const items = computed(() =>
  windowed.value.map((m) => ({
    id: m.id,
    label: m.title || TYPE_LABELS[m.type || ""] || "Meeting",
    row: TYPE_LABELS[m.type || ""] || "Other",
    start: m.meeting_date!,
    end: m.end_date,
    color: STATUS_COLORS[m.status || ""] || "var(--chart-3)",
    detail: [
      m.status ? m.status.replace("_", " ") : null,
      m.minutes ? "minutes recorded" : null,
      m.is_published === false ? "draft" : null,
    ]
      .filter(Boolean)
      .join(" · "),
  })),
);

// Row count drives the height, or a two-row strip gets 240px of white space.
const timelineHeight = computed(() => {
  const rows = new Set(items.value.map((i) => i.row)).size;
  return Math.max(120, rows * 34 + 40);
});

const upcoming = computed(
  () =>
    props.meetings.filter(
      (m) =>
        m.meeting_date &&
        new Date(m.meeting_date).getTime() >= now &&
        m.status !== "canceled",
    ).length,
);

const heldLastYear = computed(() => windowed.value.filter((m) => m.status === "completed").length);

// Minutes are the record that outlives everyone on the board, so the gap
// between "met" and "wrote it down" is worth its own number.
const minutesPublished = computed(
  () => windowed.value.filter((m) => m.status === "completed" && !!m.minutes).length,
);

const legend = [
  { key: "completed", label: "Held", color: STATUS_COLORS.completed! },
  { key: "scheduled", label: "Scheduled", color: STATUS_COLORS.scheduled! },
  { key: "canceled", label: "Canceled", color: STATUS_COLORS.canceled! },
];
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-3">
      <AppStatCard
        label="Coming up"
        icon="lucide:calendar-clock"
        :value="upcoming"
        :loading="loading"
        description="Scheduled from today"
      />
      <AppStatCard
        label="Held this year"
        icon="lucide:calendar-check"
        :value="heldLastYear"
        :loading="loading"
        description="Completed in the last 12 months"
      />
      <AppStatCard
        label="Minutes on record"
        icon="lucide:file-text"
        :value="`${minutesPublished} / ${heldLastYear}`"
        :loading="loading"
        description="Of the meetings held"
      />
    </div>

    <AppChartCard
      title="The year in meetings"
      hint="Last 12 months and what's booked ahead, by type"
      icon="lucide:gantt-chart"
      :loading="loading"
      :empty="!items.length"
      empty-title="No meetings in the last year"
      empty-hint="Schedule one and the strip fills in — the gaps are the useful part."
      :height="timelineHeight"
    >
      <AppChartTimeline
        :items="items"
        :height="timelineHeight"
        :row-height="26"
        :row-label-width="90"
      />
      <template #footer>
        <AppChartLegend :series="legend" />
      </template>
    </AppChartCard>
  </div>
</template>

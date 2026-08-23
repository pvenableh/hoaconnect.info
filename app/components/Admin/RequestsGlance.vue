<script setup lang="ts">
/**
 * The band at the top of Requests: the health of the queue, not its contents.
 *
 * The list below already says what is in the queue. What it can't say — because
 * you'd have to read every row and do arithmetic — is whether the queue is
 * being worked. Two charts answer that:
 *
 *   by type × status  where the work is, and how much of it has been picked up
 *   by age            whether anything is being left to rot
 *
 * Age is the one that matters. A board can look at "14 open" and feel fine; the
 * same 14 with four of them past a month is a different community. So the 30d+
 * bucket is coloured as a problem rather than off the categorical ramp.
 *
 * Takes the requests the page already loaded.
 */
import type { RequestRow } from "#core/app/composables/useRequests";
import { requestTypeList } from "#core/app/config/requestWorkflows";

const props = defineProps<{
  requests: RequestRow[];
  loading?: boolean;
}>();

const MS_DAY = 86_400_000;
const now = Date.now();

const CLOSED = new Set(["resolved", "closed"]);

const open = computed(() => props.requests.filter((r) => !CLOSED.has(r.status || "")));

const ageDays = (r: RequestRow) => {
  const t = r.date_created ? new Date(r.date_created).getTime() : NaN;
  return Number.isFinite(t) ? (now - t) / MS_DAY : 0;
};

// ---- Chart 1: open work by type, split by whether anyone has started it ----
const BY_TYPE_SERIES = [
  { key: "untouched", label: "Not started", color: "var(--chart-3)" },
  { key: "working", label: "In progress", color: "var(--chart-1)" },
  { key: "waiting", label: "Waiting", color: CHART_STATUS_VARS.muted },
];

const byType = computed(() =>
  requestTypeList
    .map((t) => {
      const rows = open.value.filter((r) => r.type === t.type);
      return {
        label: t.label,
        untouched: rows.filter((r) => (r.status || "open") === "open").length,
        working: rows.filter((r) => r.status === "in_progress").length,
        waiting: rows.filter((r) => r.status === "waiting").length,
      };
    })
    // A type nobody has ever filed clutters the axis with an empty column.
    .filter((row) => row.untouched + row.working + row.waiting > 0),
);

// ---- Chart 2: how long the open ones have been open ----
const AGE_SERIES = [
  { key: "count", label: "Open requests", color: "var(--chart-1)" },
];

const ageBuckets = computed(() => {
  const buckets = [
    { label: "< 7 days", min: 0, max: 7 },
    { label: "7–30 days", min: 7, max: 30 },
    { label: "30–90 days", min: 30, max: 90 },
    { label: "90 days +", min: 90, max: Infinity },
  ];
  return buckets.map((b) => ({
    label: b.label,
    count: open.value.filter((r) => {
      const d = ageDays(r);
      return d >= b.min && d < b.max;
    }).length,
  }));
});

const stale = computed(() => open.value.filter((r) => ageDays(r) >= 30).length);

const overdue = computed(
  () =>
    open.value.filter(
      (r) => r.due_date && new Date(r.due_date).getTime() < now,
    ).length,
);

// "Resolved recently" is the only number here that says work is coming OUT,
// which is what makes the open count readable at all.
const resolvedRecently = computed(
  () =>
    props.requests.filter(
      (r) =>
        CLOSED.has(r.status || "") &&
        r.date_updated &&
        now - new Date(r.date_updated).getTime() < 30 * MS_DAY,
    ).length,
);

const hasOpen = computed(() => open.value.length > 0);
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <AppStatCard
        label="Open"
        icon="lucide:clipboard-list"
        :value="open.length"
        :loading="loading"
        description="Not yet resolved"
      />
      <AppStatCard
        label="Resolved"
        icon="lucide:check-check"
        :value="resolvedRecently"
        :loading="loading"
        description="In the last 30 days"
      />
      <AppStatCard
        label="Open 30 days +"
        icon="lucide:hourglass"
        :value="stale"
        :loading="loading"
        description="Ageing in the queue"
      />
      <AppStatCard
        label="Past due date"
        icon="lucide:alarm-clock"
        :value="overdue"
        :loading="loading"
        description="Where a date was set"
      />
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <AppChartCard
        title="Open work by type"
        hint="And how much of it has been picked up"
        icon="lucide:bar-chart-3"
        :loading="loading"
        :empty="!byType.length"
        empty-title="Nothing open"
        empty-hint="Every request has been resolved or closed."
        :height="200"
      >
        <AppChartBars :data="byType" :series="BY_TYPE_SERIES" stacked :height="200" />
      </AppChartCard>

      <AppChartCard
        title="How long they've been open"
        hint="The right-hand bars are the ones to worry about"
        icon="lucide:hourglass"
        :loading="loading"
        :empty="!hasOpen"
        empty-title="Nothing open"
        empty-hint="An empty queue needs no ageing chart."
        :height="200"
      >
        <AppChartBars :data="ageBuckets" :series="AGE_SERIES" :height="200" hide-legend />
      </AppChartCard>
    </div>
  </div>
</template>

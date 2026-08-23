<script setup lang="ts">
/**
 * Dashboard widget — how long open requests have been open.
 *
 * Deliberately the AGEING chart and not the open count. "14 open" reads the
 * same whether they all arrived this week or four have been sitting for two
 * months, and those are different communities. The count is in the hint line;
 * the chart answers the question the count can't.
 *
 * Fetches its own rows, like the other chart widgets — a widget somebody has
 * switched off should cost nothing.
 */
const { selectedOrgId } = await useSelectedOrg();
const { list } = useDirectusItems("hoa_requests");
const orgId = computed(() => selectedOrgId.value);

const CLOSED = ["resolved", "closed"];

const { data, pending } = await useAsyncData(
  `dash-requests-health-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    return (await list({
      fields: ["id", "status", "date_created"],
      filter: {
        organization: { _eq: orgId.value },
        status: { _nin: CLOSED },
      },
      sort: ["date_created"],
      limit: 500,
    })) as any[];
  },
  { watch: [orgId], server: false, default: () => [] as any[] },
);

const MS_DAY = 86_400_000;
const now = Date.now();

const ageDays = (r: any) => {
  const t = r.date_created ? new Date(r.date_created).getTime() : NaN;
  return Number.isFinite(t) ? (now - t) / MS_DAY : 0;
};

const SERIES = [{ key: "count", label: "Open requests", color: "var(--chart-1)" }];

// The two right-hand buckets are coloured as a problem rather than off the
// categorical ramp — red here means "left to rot", not "the fourth thing".
const BUCKETS = [
  { label: "< 7 days", min: 0, max: 7, color: "var(--chart-1)" },
  { label: "7–30 days", min: 7, max: 30, color: "var(--chart-3)" },
  { label: "30–90 days", min: 30, max: 90, color: CHART_STATUS_VARS.warn },
  { label: "90 days +", min: 90, max: Infinity, color: CHART_STATUS_VARS.bad },
];

const buckets = computed(() =>
  BUCKETS.map((b) => ({
    label: b.label,
    color: b.color,
    count: (data.value || []).filter((r) => {
      const d = ageDays(r);
      return d >= b.min && d < b.max;
    }).length,
  })),
);

const open = computed(() => (data.value || []).length);
const stale = computed(() => (data.value || []).filter((r) => ageDays(r) >= 30).length);

const hint = computed(() => {
  if (!open.value) return "The open queue, by age";
  const s = open.value === 1 ? "" : "s";
  return stale.value
    ? `${open.value} open · ${stale.value} over 30 days`
    : `${open.value} open request${s}, none over 30 days`;
});
</script>

<template>
  <AppChartCard
    title="Requests health"
    :hint="hint"
    icon="lucide:hourglass"
    :loading="pending"
    :empty="!open"
    empty-title="Nothing open"
    empty-hint="Every request has been resolved or closed."
    :height="200"
  >
    <AppChartBars
      :data="buckets"
      :series="SERIES"
      :height="200"
      :color-by-row="(row) => String(row.color)"
      hide-legend
    />
  </AppChartCard>
</template>

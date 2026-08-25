<script setup lang="ts">
/**
 * Dashboard widget — how long open requests have been open.
 *
 * Deliberately the AGEING chart and not the open count. "14 open" reads the
 * same whether they all arrived this week or four have been sitting for two
 * months, and those are different communities. The count is in the hint line;
 * the chart answers the question the count can't.
 *
 * The read and the buckets moved to `useHomeGlances` / `shared/home/glances` in
 * Phase 7 so the stacks home's rails share them rather than re-querying
 * `hoa_requests` — and so a rail bar and this chart can never disagree about
 * what "30–90 days" means or what colour it is.
 */
const { buckets, open, stale, pending } = await useRequestsGlance();

const SERIES = [{ key: "count", label: "Open requests", color: "var(--chart-1)" }];

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

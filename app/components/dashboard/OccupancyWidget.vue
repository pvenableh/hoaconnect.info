<script setup lang="ts">
/**
 * Dashboard widget — homes by occupancy.
 *
 * Counts HOMES, not people. An owner can own a unit they don't live in, so
 * `hoa_units.occupancy` and `hoa_members.member_type` legitimately disagree —
 * the "Owners vs Tenants" widget next to this one is the other question, and
 * showing one under the other's label is how 1033's ownership figure was wrong
 * the first time.
 *
 * Occupancy is null until somebody records it, and an "unknown: 28" donut is
 * worse than no donut, so the card says what to do instead.
 */
const { selectedOrgId } = await useSelectedOrg();
const { list } = useDirectusItems("hoa_units");
const orgId = computed(() => selectedOrgId.value);

const { data, pending } = await useAsyncData(
  `dash-occupancy-${orgId.value}`,
  async () => {
    if (!orgId.value) return {} as Record<string, number>;
    const rows = (await list({
      fields: ["id", "occupancy"],
      filter: { organization: { _eq: orgId.value }, status: { _eq: "active" } },
      limit: -1,
    })) as any[];
    return (rows || []).reduce<Record<string, number>>((acc, u) => {
      const k = u.occupancy || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  },
  { watch: [orgId], server: false, default: () => ({}) as Record<string, number> },
);

const SERIES = [
  { key: "owner", label: "Owner-occupied", color: "var(--chart-1)" },
  { key: "tenant", label: "Tenanted", color: "var(--chart-3)" },
  { key: "vacant", label: "Vacant", color: CHART_STATUS_VARS.muted },
];

const recorded = computed(() => {
  const o = data.value || {};
  return (o.owner || 0) + (o.tenant || 0) + (o.vacant || 0);
});

const ownerPct = computed(() =>
  recorded.value ? Math.round(((data.value?.owner || 0) / recorded.value) * 100) : null,
);
</script>

<template>
  <AppChartCard
    title="Occupancy"
    :hint="ownerPct == null ? 'Who lives in the homes' : `${ownerPct}% owner-occupied`"
    icon="lucide:house"
    :loading="pending"
    :empty="!recorded"
    empty-title="Occupancy not recorded"
    empty-hint="Set owner, tenant, or vacant on a unit and this chart appears."
    :height="200"
  >
    <AppChartDonut
      :series="SERIES"
      :values="data ?? {}"
      :height="200"
      center-label="homes"
    />
  </AppChartCard>
</template>

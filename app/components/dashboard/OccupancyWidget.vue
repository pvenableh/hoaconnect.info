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
 *
 * The read moved to `useHomeGlances` in Phase 7 — one `hoa_units` query now
 * serves this donut, the dashboard's Units stat and both home rails. The
 * active-only narrowing that this chart depends on happens in
 * `summariseOccupancy`, so the split it shows is unchanged.
 */
const { selectedOrgId } = await useSelectedOrg();
const { occupancy, recorded, ownerPct, pending } = await useUnitsGlance(selectedOrgId);

const SERIES = [
  { key: "owner", label: "Owner-occupied", color: "var(--chart-1)" },
  { key: "tenant", label: "Tenanted", color: "var(--chart-3)" },
  { key: "vacant", label: "Vacant", color: CHART_STATUS_VARS.muted },
];
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
      :values="occupancy"
      :height="200"
      center-label="homes"
    />
  </AppChartCard>
</template>

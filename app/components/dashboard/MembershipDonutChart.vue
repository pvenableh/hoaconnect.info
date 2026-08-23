<script setup lang="ts">
/**
 * Dashboard widget — owners vs tenants.
 *
 * Was a raw shadcn <Card> with text-muted-foreground and a hand-rolled legend,
 * which is the shadcn palette rather than the workspace theme, so it didn't
 * follow light/dark with the rest of the app. Now it's AppChartCard like every
 * other chart, and the donut, the legend, the tooltip and the empty state all
 * come from the kit.
 *
 * Counts PEOPLE. The Occupancy widget counts HOMES, and an owner can own a unit
 * they don't live in, so the two legitimately disagree.
 */
const props = defineProps<{
  owners: number;
  tenants: number;
}>();

const SERIES = [
  { key: "owners", label: "Owners", color: "var(--chart-1)" },
  { key: "tenants", label: "Tenants", color: "var(--chart-2)" },
];

const values = computed(() => ({ owners: props.owners, tenants: props.tenants }));
const total = computed(() => props.owners + props.tenants);
</script>

<template>
  <AppChartCard
    title="Owners vs Tenants"
    hint="Community composition"
    icon="lucide:pie-chart"
    :empty="!total"
    empty-title="No members yet"
    empty-hint="Add or invite residents and this fills in."
    :height="200"
  >
    <AppChartDonut
      :series="SERIES"
      :values="values"
      :height="200"
      center-label="members"
    />
  </AppChartCard>
</template>

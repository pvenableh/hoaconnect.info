<script setup lang="ts">
/**
 * Dashboard widget — what happened in the community, by day.
 *
 * Was a raw shadcn <Card> with its own axes and a hand-rolled legend on the
 * shadcn palette rather than the workspace theme. Now it's AppChartCard +
 * AppChartBars, stacked: the three counts are parts of "how busy was Tuesday",
 * and the total is the thing worth reading.
 */
interface ActivityData {
  date: string;
  documents: number;
  emails: number;
  members: number;
}

const props = defineProps<{
  data: ActivityData[];
}>();

const SERIES = [
  { key: "documents", label: "Documents", color: "var(--chart-1)" },
  { key: "emails", label: "Emails", color: "var(--chart-2)" },
  { key: "members", label: "New Members", color: "var(--chart-3)" },
];

const rows = computed(() =>
  (props.data || []).map((d) => ({
    label: new Date(d.date).toLocaleDateString("en-US", { weekday: "short" }),
    documents: d.documents,
    emails: d.emails,
    members: d.members,
  })),
);

const hasAny = computed(() =>
  (props.data || []).some((d) => d.documents || d.emails || d.members),
);
</script>

<template>
  <AppChartCard
    title="Weekly Activity"
    hint="Activity breakdown by day"
    icon="lucide:activity"
    :empty="!hasAny"
    empty-title="A quiet week"
    empty-hint="Documents, mail and new members show up here as they happen."
    :height="200"
  >
    <AppChartBars :data="rows" :series="SERIES" stacked :height="200" />
  </AppChartCard>
</template>

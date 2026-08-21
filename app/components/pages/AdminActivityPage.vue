<script setup lang="ts">
import { VisXYContainer, VisLine, VisAxis, VisArea } from "@unovis/vue";
import { ChartContainer, type ChartConfig } from "~/components/ui/chart";
import {
  summarizeActivity,
  dailySeries,
  memberLabel,
  type ActivityRow,
} from "#core/shared/activity/summary";

const { selectedOrgId } = await useSelectedOrg();
const orgId = computed(() => selectedOrgId.value);

// Both filters are segmented controls now, so both carry string values (and no
// `as const` — the control's items prop is mutable). The window converts to a
// number at the two places that do date maths.
const RANGES = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

const TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "page_view", label: "Page views" },
  { value: "download", label: "Downloads" },
  { value: "session_start", label: "Logins" },
];

const range = ref("30");
const rangeDays = computed(() => Number(range.value));
const eventType = ref<string>("");
const loading = ref(true);
const accessDenied = ref(false);
const rows = ref<ActivityRow[]>([]);

const EVENT_LABELS: Record<string, string> = {
  page_view: "Page view",
  download: "Download",
  doc_view: "Doc view",
  session_start: "Login",
  login: "Login",
  logout: "Logout",
  payment: "Payment",
  request: "Request",
  profile_update: "Profile",
  upload: "Upload",
  search: "Search",
};

const load = async () => {
  if (!orgId.value) return;
  loading.value = true;
  accessDenied.value = false;
  try {
    const from = new Date(Date.now() - rangeDays.value * 86400000).toISOString();
    const res = await $fetch<{ activity: ActivityRow[]; scope: "all" | "own" }>(
      "/api/org/activity",
      { query: { orgId: orgId.value, from, limit: 500, ...(eventType.value ? { eventType: eventType.value } : {}) } }
    );
    // This is the admin overview — members (scope "own") don't belong here.
    if (res.scope !== "all") {
      accessDenied.value = true;
      rows.value = [];
    } else {
      rows.value = res.activity || [];
    }
  } catch (err: any) {
    if (err?.statusCode === 403 || err?.response?.status === 403) accessDenied.value = true;
    rows.value = [];
  } finally {
    loading.value = false;
  }
};

onMounted(load);
watch([range, eventType], load);

const summary = computed(() => summarizeActivity(rows.value));
const series = computed(() =>
  dailySeries(summary.value.byDay, new Date().toISOString().slice(0, 10), rangeDays.value)
);

const stats = computed(() => [
  { label: "Total events", value: summary.value.total, icon: "lucide:activity" },
  { label: "Page views", value: summary.value.pageViews, icon: "lucide:eye" },
  { label: "Downloads", value: summary.value.downloads, icon: "lucide:download" },
  { label: "Active residents", value: summary.value.activeMembers, icon: "lucide:users-round" },
]);

const chartConfig: ChartConfig = { count: { label: "Events", color: "var(--chart-1)" } };
const x = (_: { date: string; count: number }, i: number) => i;
const y = (d: { date: string; count: number }) => d.count;
const tickFormat = (i: number) => {
  const item = series.value[i];
  if (!item) return "";
  return new Date(item.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const fmtTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
</script>

<template>
  <div class="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
    <AppPageHeader
      eyebrow="Reporting"
      title="Activity"
      description="Resident page views, downloads, and logins across the community."
    >
      <template #actions>
        <AppSegmentedControl v-model="range" :items="RANGES" size="sm" label="Time range" />
      </template>
    </AppPageHeader>

    <div v-if="accessDenied" class="rounded-xl border t-border">
      <AppEmptyState
        icon="lucide:lock"
        title="You don't have access to community activity"
        description="Activity covers every resident, so it sits behind the “View activity” permission. Ask an org admin to grant it."
      />
    </div>

    <template v-else>
      <!-- Stat cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AppStatCard
          v-for="s in stats"
          :key="s.label"
          :label="s.label"
          :value="s.value.toLocaleString()"
          :icon="s.icon"
          :loading="loading"
        />
      </div>

      <!-- Trend chart -->
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base">Activity over time</CardTitle>
          <CardDescription>Events per day, last {{ rangeDays }} days</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientOnly>
            <ChartContainer :config="chartConfig" class="h-[200px] w-full">
              <VisXYContainer :data="series" :margin="{ top: 8, right: 12, bottom: 24, left: 32 }">
                <VisArea :x="x" :y="y" color="var(--chart-1)" :opacity="0.1" />
                <VisLine :x="x" :y="y" color="var(--chart-1)" :lineWidth="2" />
                <VisAxis type="x" :tickFormat="tickFormat" :numTicks="6" :gridLine="false" />
                <VisAxis type="y" :gridLine="true" />
              </VisXYContainer>
            </ChartContainer>
            <template #fallback><div class="h-[200px] w-full" /></template>
          </ClientOnly>
        </CardContent>
      </Card>

      <!-- Type filter -->
      <AppSegmentedControl v-model="eventType" :items="TYPE_FILTERS" size="sm" label="Event type" />

      <!-- Top lists -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader class="pb-2"><CardTitle class="text-sm">Top documents</CardTitle></CardHeader>
          <CardContent class="space-y-2">
            <AppEmptyState
              v-if="!summary.topTargets.length"
              compact
              icon="lucide:download"
              title="No downloads yet"
              description="Documents residents open get counted here."
            />
            <div v-for="t in summary.topTargets" :key="t.key" class="flex items-center justify-between gap-2 text-sm">
              <span class="truncate t-text">{{ t.label }}</span>
              <span class="t-text-muted tabular-nums">{{ t.count }}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2"><CardTitle class="text-sm">Top pages</CardTitle></CardHeader>
          <CardContent class="space-y-2">
            <AppEmptyState
              v-if="!summary.topPaths.length"
              compact
              icon="lucide:eye"
              title="No page views yet"
              description="The pages residents visit get counted here."
            />
            <div v-for="p in summary.topPaths" :key="p.key" class="flex items-center justify-between gap-2 text-sm">
              <span class="truncate t-text-secondary">{{ p.label }}</span>
              <span class="t-text-muted tabular-nums">{{ p.count }}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2"><CardTitle class="text-sm">Most active residents</CardTitle></CardHeader>
          <CardContent class="space-y-2">
            <AppEmptyState
              v-if="!summary.topMembers.length"
              compact
              icon="lucide:users-round"
              title="Nobody active yet"
              description="Residents appear here once they use the portal."
            />
            <div v-for="m in summary.topMembers" :key="m.key" class="flex items-center justify-between gap-2 text-sm">
              <span class="truncate t-text">{{ m.label }}</span>
              <span class="t-text-muted tabular-nums">{{ m.count }}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Timeline -->
      <Card>
        <CardHeader class="pb-2"><CardTitle class="text-base">Recent activity</CardTitle></CardHeader>
        <CardContent class="p-0">
          <WidgetRowSkeleton v-if="loading" :rows="8" :lines="1" class="p-2" />
          <AppEmptyState
            v-else-if="!rows.length"
            compact
            icon="lucide:activity"
            title="No activity in this period"
            :description="eventType ? 'Nothing of this type was recorded — try All, or a longer window.' : 'Try a longer window.'"
            :variant="eventType ? 'search' : 'empty'"
          />
          <ul v-else class="divide-y t-border-divider">
            <li v-for="row in rows.slice(0, 100)" :key="row.id" class="flex items-center gap-3 px-4 py-2.5">
              <span class="inline-flex items-center rounded-full t-bg-accent/15 t-text-accent px-2 py-0.5 text-[11px] font-medium shrink-0">
                {{ EVENT_LABELS[row.event_type || ""] || row.event_type }}
              </span>
              <span class="text-sm t-text truncate">{{ memberLabel(row.member) }}</span>
              <span class="text-sm t-text-muted truncate flex-1">{{ row.label || row.path || "" }}</span>
              <span class="text-xs t-text-muted shrink-0">{{ fmtTime(row.date_created) }}</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </template>
  </div>
</template>

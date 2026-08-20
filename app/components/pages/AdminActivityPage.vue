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

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
] as const;

const TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "page_view", label: "Page views" },
  { value: "download", label: "Downloads" },
  { value: "session_start", label: "Logins" },
] as const;

const range = ref<number>(30);
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
    const from = new Date(Date.now() - range.value * 86400000).toISOString();
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
  dailySeries(summary.value.byDay, new Date().toISOString().slice(0, 10), range.value)
);

const stats = computed(() => [
  { label: "Total events", value: summary.value.total, icon: "i-lucide-activity" },
  { label: "Page views", value: summary.value.pageViews, icon: "i-lucide-eye" },
  { label: "Downloads", value: summary.value.downloads, icon: "i-lucide-download" },
  { label: "Active residents", value: summary.value.activeMembers, icon: "i-lucide-users-round" },
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
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-ultra-wide t-text-muted">Reporting</p>
        <h1 class="text-2xl font-semibold t-text">Activity</h1>
        <p class="text-sm t-text-secondary">Resident page views, downloads, and logins across the community.</p>
      </div>
      <div class="flex items-center gap-1 rounded-lg t-bg-subtle p-1">
        <button
          v-for="r in RANGES"
          :key="r.days"
          class="px-3 py-1 text-sm rounded-md transition-colors"
          :class="range === r.days ? 'bg-white shadow-sm t-text dark:bg-white/10' : 't-text-secondary hover:t-text'"
          @click="range = r.days"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <div v-if="accessDenied" class="rounded-xl border t-border p-8 text-center">
      <Icon name="i-lucide-lock" class="w-8 h-8 mx-auto mb-2 t-text-muted" />
      <p class="t-text font-medium">You don't have access to community activity</p>
      <p class="text-sm t-text-muted">Ask an org admin to grant you the "View activity" permission.</p>
    </div>

    <template v-else>
      <!-- Stat cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card v-for="s in stats" :key="s.label">
          <CardContent class="p-4">
            <div class="flex items-center gap-2 t-text-muted">
              <Icon :name="s.icon" class="w-4 h-4" />
              <span class="text-xs">{{ s.label }}</span>
            </div>
            <div class="mt-1 text-2xl font-semibold t-text">
              {{ loading ? "—" : s.value.toLocaleString() }}
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Trend chart -->
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base">Activity over time</CardTitle>
          <CardDescription>Events per day, last {{ range }} days</CardDescription>
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
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="t in TYPE_FILTERS"
          :key="t.value"
          class="px-3 py-1 text-xs font-medium rounded-full transition-colors"
          :class="eventType === t.value ? 'bg-primary text-primary-foreground' : 't-bg-subtle t-text-secondary hover:t-bg'"
          @click="eventType = t.value"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- Top lists -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader class="pb-2"><CardTitle class="text-sm">Top documents</CardTitle></CardHeader>
          <CardContent class="space-y-2">
            <p v-if="!summary.topTargets.length" class="text-sm t-text-muted">No downloads yet.</p>
            <div v-for="t in summary.topTargets" :key="t.key" class="flex items-center justify-between gap-2 text-sm">
              <span class="truncate t-text">{{ t.label }}</span>
              <span class="t-text-muted tabular-nums">{{ t.count }}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2"><CardTitle class="text-sm">Top pages</CardTitle></CardHeader>
          <CardContent class="space-y-2">
            <p v-if="!summary.topPaths.length" class="text-sm t-text-muted">No page views yet.</p>
            <div v-for="p in summary.topPaths" :key="p.key" class="flex items-center justify-between gap-2 text-sm">
              <span class="truncate t-text-secondary">{{ p.label }}</span>
              <span class="t-text-muted tabular-nums">{{ p.count }}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2"><CardTitle class="text-sm">Most active residents</CardTitle></CardHeader>
          <CardContent class="space-y-2">
            <p v-if="!summary.topMembers.length" class="text-sm t-text-muted">No activity yet.</p>
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
          <div v-else-if="!rows.length" class="p-6 text-sm t-text-muted">No activity in this period.</div>
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

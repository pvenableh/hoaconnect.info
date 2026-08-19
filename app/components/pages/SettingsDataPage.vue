<script setup lang="ts">
// Settings → Your data. The board's own "take it anytime" button (VISION
// Pillar A). Requesting an export queues a job; the archive is built by a
// background worker, so this page polls rather than waits — a full export of a
// large community takes minutes, and nobody should have to sit on the tab.
import { toast } from "vue-sonner";

const { selectedOrgId, currentOrg } = await useSelectedOrg();
const orgId = computed(() => selectedOrgId.value);

// Name the community on the page. An admin who sits on two boards has two of
// these pages, and the archive is every member's contact details — "export"
// should never be ambiguous about whose data is leaving.
const orgName = computed(
  () => (currentOrg.value?.organization as any)?.name || "this community"
);

type ExportTier = "full" | "shareable";

interface ExportSummary {
  rows: number;
  collections: number;
  files: { count: number; bytes: number } | null;
}

interface ExportRow {
  id: string;
  status: "queued" | "running" | "ready" | "failed" | "expired";
  tier: ExportTier;
  includeFiles: boolean;
  sizeBytes: number | null;
  error: string | null;
  dateCreated: string | null;
  dateCompleted: string | null;
  expiresAt: string | null;
  requestedBy: string | null;
  summary: ExportSummary | null;
}

const tier = ref<ExportTier>("full");
const includeFiles = ref(false);
const requesting = ref(false);
const loading = ref(true);
const rows = ref<ExportRow[]>([]);

const inFlight = computed(() =>
  rows.value.some((r) => r.status === "queued" || r.status === "running")
);

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Days until an archive is purged — the number the board actually cares about. */
function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

const STATUS_VISUAL: Record<ExportRow["status"], { label: string; icon: string; class: string }> = {
  queued: { label: "Queued", icon: "lucide:clock", class: "text-muted-foreground" },
  running: { label: "Preparing", icon: "lucide:loader-2", class: "text-muted-foreground" },
  ready: { label: "Ready", icon: "lucide:check-circle-2", class: "text-green-600" },
  failed: { label: "Failed", icon: "lucide:alert-circle", class: "text-destructive" },
  expired: { label: "Expired", icon: "lucide:archive-x", class: "text-muted-foreground" },
};

async function load() {
  if (!orgId.value) return;
  try {
    const res = await $fetch<{ exports: ExportRow[] }>("/api/org/export", {
      query: { orgId: orgId.value },
    });
    rows.value = res.exports;
  } catch (e: any) {
    toast.error(e?.statusMessage || "Could not load your exports.");
  } finally {
    loading.value = false;
  }
}

async function requestExport() {
  if (!orgId.value || requesting.value) return;
  requesting.value = true;
  try {
    await $fetch("/api/org/export", {
      method: "POST",
      body: { orgId: orgId.value, tier: tier.value, includeFiles: includeFiles.value },
    });
    toast.success("Export queued. We'll have it ready shortly.");
    await load();
  } catch (e: any) {
    toast.error(e?.statusMessage || e?.data?.statusMessage || "Could not start the export.");
  } finally {
    requesting.value = false;
  }
}

// Poll only while something is actually in flight, and only on the client.
let timer: ReturnType<typeof setInterval> | null = null;
watch(inFlight, (active) => {
  if (active && !timer) {
    timer = setInterval(load, 5000);
  } else if (!active && timer) {
    clearInterval(timer);
    timer = null;
  }
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div>
      <p class="text-xs uppercase tracking-widest text-muted-foreground">Admin</p>
      <h1 class="text-2xl font-semibold">Your data</h1>
      <p class="text-sm text-muted-foreground mt-1 max-w-2xl">
        Everything your community creates here belongs to your community. Export
        it whenever you want — to keep a copy, to move to another provider, or to
        hand to a new manager. No approval, no waiting on us.
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <Icon name="lucide:download" class="h-5 w-5" />
          Export your data
        </CardTitle>
        <CardDescription>
          You'll get a zip containing every record for
          <strong>{{ orgName }}</strong> as JSON, the key lists as
          spreadsheets, and a plain-English guide to what's inside.
        </CardDescription>
      </CardHeader>

      <CardContent class="space-y-5">
        <div class="space-y-3">
          <p class="text-sm font-medium">What to include</p>

          <label
            class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
            :class="tier === 'full' ? 'border-primary bg-muted/40' : 'hover:bg-muted/20'"
          >
            <input v-model="tier" type="radio" value="full" class="mt-1" />
            <span>
              <span class="block text-sm font-medium">Everything</span>
              <span class="block text-sm text-muted-foreground">
                The complete record, including your board's private discussion,
                comments and AI history. For your own files.
              </span>
            </span>
          </label>

          <label
            class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
            :class="tier === 'shareable' ? 'border-primary bg-muted/40' : 'hover:bg-muted/20'"
          >
            <input v-model="tier" type="radio" value="shareable" class="mt-1" />
            <span>
              <span class="block text-sm font-medium">Shareable</span>
              <span class="block text-sm text-muted-foreground">
                The full operational record — members, units, finances,
                delinquency, requests, documents and governance — without your
                board's private discussion. Safe to hand to an incoming manager.
              </span>
            </span>
          </label>
        </div>

        <label class="flex items-start gap-3 cursor-pointer">
          <input v-model="includeFiles" type="checkbox" class="mt-1" />
          <span>
            <span class="block text-sm font-medium">Include documents and photos</span>
            <span class="block text-sm text-muted-foreground">
              Adds every uploaded file to the archive. Much larger, and takes
              longer to prepare.
            </span>
          </span>
        </label>

        <div class="flex items-center justify-between gap-4 pt-1">
          <p v-if="inFlight" class="text-sm text-muted-foreground">
            An export is being prepared. You can close this page — we'll keep going.
          </p>
          <span v-else />
          <Button :disabled="requesting || inFlight" @click="requestExport">
            <Icon
              v-if="requesting"
              name="lucide:loader-2"
              class="mr-2 h-4 w-4 animate-spin"
            />
            Request export
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">Recent exports</CardTitle>
        <CardDescription>
          Archives stay available for 7 days, then they're deleted. Request a new
          one any time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p v-if="loading" class="text-sm text-muted-foreground">Loading…</p>
        <p v-else-if="rows.length === 0" class="text-sm text-muted-foreground">
          You haven't exported anything yet.
        </p>

        <ul v-else class="divide-y">
          <li v-for="row in rows" :key="row.id" class="py-3 flex items-center gap-4">
            <Icon
              :name="STATUS_VISUAL[row.status].icon"
              class="h-5 w-5 shrink-0"
              :class="[
                STATUS_VISUAL[row.status].class,
                row.status === 'running' ? 'animate-spin' : '',
              ]"
            />

            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">
                {{ row.tier === "full" ? "Everything" : "Shareable" }}
                <span v-if="row.includeFiles" class="text-muted-foreground">
                  · with files
                </span>
              </p>
              <p class="text-xs text-muted-foreground">
                {{ formatDate(row.dateCreated) }}
                <template v-if="row.requestedBy"> · {{ row.requestedBy }}</template>
                <template v-if="row.summary">
                  · {{ row.summary.rows.toLocaleString() }} records
                </template>
                <template v-if="row.sizeBytes"> · {{ formatBytes(row.sizeBytes) }}</template>
              </p>
              <p v-if="row.status === 'failed' && row.error" class="text-xs text-destructive mt-0.5">
                {{ row.error }}
              </p>
            </div>

            <div class="shrink-0 flex items-center gap-3">
              <span
                v-if="row.status === 'ready' && daysLeft(row.expiresAt) !== null"
                class="text-xs text-muted-foreground hidden sm:inline"
              >
                {{ daysLeft(row.expiresAt) }}d left
              </span>
              <Button
                v-if="row.status === 'ready'"
                as="a"
                :href="`/api/org/export/${row.id}/download`"
                size="sm"
                variant="outline"
              >
                <Icon name="lucide:download" class="mr-2 h-4 w-4" />
                Download
              </Button>
              <span v-else class="text-xs text-muted-foreground">
                {{ STATUS_VISUAL[row.status].label }}
              </span>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>

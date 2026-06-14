<script setup lang="ts">
import type { CommentReport } from "~/composables/useModeration";

const { listReports, dismiss, actionHide } = useModeration();

const reports = ref<CommentReport[]>([]);
const loading = ref(true);
const filter = ref<"open" | "all">("open");
const busyId = ref<string | null>(null);

const REASON_LABELS: Record<string, string> = {
  vulgar: "Vulgar / offensive",
  harassment: "Harassment",
  spam: "Spam",
  off_topic: "Off-topic",
  other: "Other",
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
  reviewed: "bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200",
  dismissed: "t-bg-subtle t-text-muted",
  actioned: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
};

const load = async () => {
  loading.value = true;
  try {
    reports.value = (await listReports(filter.value)) as CommentReport[];
  } catch (e) {
    console.error("Failed to load reports:", e);
    reports.value = [];
  } finally {
    loading.value = false;
  }
};

watch(filter, load);
onMounted(load);

const stripHtml = (html?: string | null) => (html ? html.replace(/<[^>]*>/g, "").trim() : "");

const reporterName = (r: CommentReport) => {
  const p = r.reporter;
  if (!p || typeof p === "string") return "A member";
  return `${p.first_name || ""} ${p.last_name || ""}`.trim() || "A member";
};

const authorName = (r: CommentReport) => {
  const c = typeof r.comment === "object" ? r.comment : null;
  const a = c?.user_created;
  if (!a || typeof a === "string") return "Unknown";
  return `${a.first_name || ""} ${a.last_name || ""}`.trim() || "Unknown";
};

const commentBody = (r: CommentReport) =>
  typeof r.comment === "object" ? stripHtml(r.comment?.body) : "";

const isHidden = (r: CommentReport) =>
  typeof r.comment === "object" ? !!r.comment?.is_hidden : false;

const onDismiss = async (r: CommentReport) => {
  busyId.value = r.id;
  try {
    await dismiss(r);
    await load();
  } finally {
    busyId.value = null;
  }
};

const onHide = async (r: CommentReport) => {
  busyId.value = r.id;
  try {
    await actionHide(r);
    await load();
  } finally {
    busyId.value = null;
  }
};

const formatDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
</script>

<template>
  <div class="space-y-4">
    <!-- Filter -->
    <div class="flex gap-1.5">
      <button
        v-for="opt in [{ key: 'open', label: 'Open' }, { key: 'all', label: 'All' }]"
        :key="opt.key"
        @click="filter = opt.key as 'open' | 'all'"
        class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
        :class="filter === opt.key ? 'bg-stone-900 text-white' : 't-bg-subtle t-text-secondary hover:bg-stone-200'"
      >{{ opt.label }}</button>
    </div>

    <div v-if="loading" class="py-16 flex justify-center"><div class="spinner-ios" /></div>

    <div v-else-if="!reports.length" class="py-20 text-center">
      <div class="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
        <Icon name="lucide:shield-check" class="w-7 h-7 text-emerald-500" />
      </div>
      <p class="t-text-muted">
        {{ filter === "open" ? "No open reports — all clear." : "No reports." }}
      </p>
    </div>

    <div v-else class="space-y-3">
      <div v-for="r in reports" :key="r.id" class="ios-card p-5">
        <div class="flex items-center gap-2 mb-2 flex-wrap">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-200">
            <Icon name="lucide:flag" class="w-3 h-3" />
            {{ REASON_LABELS[r.reason] || r.reason }}
          </span>
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium" :class="STATUS_STYLE[r.status]">
            {{ r.status }}
          </span>
          <span v-if="isHidden(r)" class="inline-flex items-center gap-1 text-[11px] t-text-muted">
            <Icon name="lucide:eye-off" class="w-3 h-3" /> comment hidden
          </span>
          <span class="text-xs t-text-muted ml-auto">{{ formatDate(r.date_created) }}</span>
        </div>

        <p class="text-sm t-text-muted">
          Reported by <span class="font-medium t-text-secondary">{{ reporterName(r) }}</span>
        </p>
        <p v-if="r.details" class="text-sm t-text-secondary mt-1 italic">"{{ r.details }}"</p>

        <!-- Reported comment preview -->
        <div class="mt-3 p-3 rounded-xl t-bg-subtle ring-1 ring-stone-100">
          <p class="text-xs t-text-muted mb-1">
            Comment by <span class="font-medium t-text-secondary">{{ authorName(r) }}</span>
          </p>
          <p class="text-sm t-text-secondary line-clamp-4">{{ commentBody(r) || "(no text)" }}</p>
        </div>

        <!-- Actions -->
        <div v-if="r.status === 'open'" class="flex justify-end gap-2 mt-3">
          <Button variant="ghost" size="sm" class="rounded-full" :disabled="busyId === r.id" @click="onDismiss(r)">
            Dismiss
          </Button>
          <Button
            v-if="!isHidden(r)"
            variant="destructive"
            size="sm"
            class="rounded-full"
            :disabled="busyId === r.id"
            @click="onHide(r)"
          >
            <Icon v-if="busyId === r.id" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
            Hide comment
          </Button>
          <Button v-else variant="outline" size="sm" class="rounded-full" :disabled="busyId === r.id" @click="onDismiss(r)">
            Mark handled
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

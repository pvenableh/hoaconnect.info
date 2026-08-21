<script setup lang="ts">
// Admins-only AI credit spend overview. Reads GET /api/org/ai-spend (which
// hard-gates to admins) and shows the wallet balance, total spend over a
// window, a per-feature breakdown, and a per-user table. Oversight only — there
// are no per-user caps at launch. Mirrors AdminActivityPage's shell.
import { CREDITS_PER_DOLLAR } from "#core/shared/ai/credits";

const { selectedOrgId } = await useSelectedOrg();
const orgId = computed(() => selectedOrgId.value);

interface SpendUser {
  userId: string | null;
  name: string;
  email: string | null;
  credits: number;
  calls: number;
}
interface SpendResponse {
  scope: "all";
  days: number;
  wallet: { balanceCredits: number; allowanceCredits: number; purchasedCredits: number };
  totals: { credits: number; calls: number };
  byFeature: Record<string, number>;
  users: SpendUser[];
}

// The window is a segmented control, so its value is a string like every other
// one in the app; the API wants a number, converted at the single call site.
const RANGES = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

const FEATURE_LABELS: Record<string, string> = {
  draft: "Drafts",
  rewrite: "Rewrites",
  chat: "Assistant chat",
  ask: "Q&A",
  summarize: "Summaries",
  embed: "Document indexing",
  other: "Other",
};

const range = ref("30");
const loading = ref(true);
const accessDenied = ref(false);
const data = ref<SpendResponse | null>(null);

const fmtCredits = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtUsd = (credits: number) =>
  `$${(credits / CREDITS_PER_DOLLAR).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const load = async () => {
  if (!orgId.value) return;
  loading.value = true;
  accessDenied.value = false;
  try {
    data.value = await $fetch<SpendResponse>("/api/org/ai-spend", {
      query: { orgId: orgId.value, days: Number(range.value) },
    });
  } catch (err: any) {
    if (err?.statusCode === 403 || err?.response?.status === 403) accessDenied.value = true;
    data.value = null;
  } finally {
    loading.value = false;
  }
};

onMounted(load);
watch(range, load);

const stats = computed(() => {
  const d = data.value;
  return [
    { label: "Spent this period", value: d ? fmtCredits(d.totals.credits) : "—", sub: d ? fmtUsd(d.totals.credits) : "", icon: "lucide:sparkles" },
    { label: "Assistant + AI calls", value: d ? fmtCredits(d.totals.calls) : "—", sub: "", icon: "lucide:bot" },
    { label: "Balance remaining", value: d ? fmtCredits(d.wallet.balanceCredits) : "—", sub: d ? fmtUsd(d.wallet.balanceCredits) : "", icon: "lucide:wallet" },
    { label: "People using AI", value: d ? fmtCredits(d.users.length) : "—", sub: "", icon: "lucide:users-round" },
  ];
});

const features = computed(() => {
  const d = data.value;
  if (!d) return [];
  return Object.entries(d.byFeature)
    .map(([key, credits]) => ({ key, label: FEATURE_LABELS[key] || key, credits }))
    .sort((a, b) => b.credits - a.credits);
});

// Name stays on the phone; the rest is context you only need on a wide screen.
const userColumns = [
  { key: "person", label: "Person", sortable: true, value: (r: any) => r.name },
  { key: "calls", label: "Calls", align: "right" as const, sortable: true, hideOnMobile: true },
  { key: "credits", label: "Credits", align: "right" as const, sortable: true },
  { key: "cost", label: "\u2248 Cost", align: "right" as const, hideOnMobile: true, value: (r: any) => r.credits },
];
</script>

<template>
  <div class="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
    <AppPageHeader
      eyebrow="Reporting"
      title="AI spend"
      description="How the assistant and AI features are using the organization's shared credit wallet."
    >
      <template #actions>
        <AppSegmentedControl v-model="range" :items="RANGES" size="sm" label="Time range" />
      </template>
    </AppPageHeader>

    <div v-if="accessDenied" class="rounded-xl border t-border">
      <AppEmptyState
        icon="lucide:lock"
        title="AI spend is admin-only"
        description="Spend covers the whole organization's wallet, so it's kept to admins. Ask one of yours if you need visibility."
      />
    </div>

    <template v-else>
      <!-- Stat cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AppStatCard
          v-for="s in stats"
          :key="s.label"
          :label="s.label"
          :value="s.value"
          :description="s.sub || undefined"
          :icon="s.icon"
          :loading="loading"
        />
      </div>

      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="spinner-ios" />
      </div>

      <template v-else-if="data">
        <!-- Per-feature breakdown -->
        <div v-if="features.length" class="rounded-xl border t-border t-bg p-4">
          <h2 class="type-card mb-3">By feature</h2>
          <ul class="space-y-2">
            <li v-for="f in features" :key="f.key" class="flex items-center justify-between text-sm">
              <span class="t-text-secondary">{{ f.label }}</span>
              <span class="t-text font-medium">{{ fmtCredits(f.credits) }} <span class="t-text-muted">credits</span></span>
            </li>
          </ul>
        </div>

        <!-- Per-user table -->
        <div class="rounded-xl border t-border t-bg overflow-hidden">
          <div class="px-4 py-3 border-b t-border">
            <h2 class="type-card">By person</h2>
            <p class="type-meta">Credits used in the last {{ data.days }} days. For oversight — there are no per-person limits.</p>
          </div>
          <AppDataTable
            class="px-2 pb-2"
            :columns="userColumns"
            :rows="data.users"
            :row-key="(r: any) => r.userId || r.name"
            empty-title="No AI usage yet"
            empty-description="Nobody has spent credits in this period."
            empty-icon="lucide:sparkles"
          >
            <template #cell-person="{ row }">
              <div class="t-text">{{ row.name }}</div>
              <div v-if="row.email" class="type-micro t-text-muted normal-case tracking-normal">{{ row.email }}</div>
            </template>
            <template #cell-calls="{ value }">{{ fmtCredits(value as number) }}</template>
            <template #cell-credits="{ value }">
              <span class="t-text font-medium">{{ fmtCredits(value as number) }}</span>
            </template>
            <template #cell-cost="{ value }">{{ fmtUsd(value as number) }}</template>
          </AppDataTable>
        </div>
      </template>
    </template>
  </div>
</template>

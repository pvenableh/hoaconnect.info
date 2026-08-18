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

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
] as const;

const FEATURE_LABELS: Record<string, string> = {
  draft: "Drafts",
  rewrite: "Rewrites",
  chat: "Assistant chat",
  ask: "Q&A",
  summarize: "Summaries",
  embed: "Document indexing",
  other: "Other",
};

const range = ref<number>(30);
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
      query: { orgId: orgId.value, days: range.value },
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
    { label: "Spent this period", value: d ? fmtCredits(d.totals.credits) : "—", sub: d ? fmtUsd(d.totals.credits) : "", icon: "i-lucide-sparkles" },
    { label: "Assistant + AI calls", value: d ? fmtCredits(d.totals.calls) : "—", sub: "", icon: "i-lucide-bot" },
    { label: "Balance remaining", value: d ? fmtCredits(d.wallet.balanceCredits) : "—", sub: d ? fmtUsd(d.wallet.balanceCredits) : "", icon: "i-lucide-wallet" },
    { label: "People using AI", value: d ? fmtCredits(d.users.length) : "—", sub: "", icon: "i-lucide-users-round" },
  ];
});

const features = computed(() => {
  const d = data.value;
  if (!d) return [];
  return Object.entries(d.byFeature)
    .map(([key, credits]) => ({ key, label: FEATURE_LABELS[key] || key, credits }))
    .sort((a, b) => b.credits - a.credits);
});
</script>

<template>
  <div class="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="t-eyebrow">Reporting</p>
        <h1 class="text-2xl font-semibold t-text t-heading">AI spend</h1>
        <p class="text-sm t-text-secondary">
          How the assistant and AI features are using the organization's shared credit wallet.
        </p>
      </div>
      <div class="flex items-center gap-1 rounded-full t-bg-subtle p-1">
        <button
          v-for="r in RANGES"
          :key="r.days"
          class="px-3 py-1 text-sm rounded-full transition-colors"
          :class="range === r.days ? 'bg-white shadow-sm t-text dark:bg-white/10' : 't-text-secondary hover:t-text'"
          @click="range = r.days"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <div v-if="accessDenied" class="rounded-xl border t-border p-8 text-center">
      <Icon name="i-lucide-lock" class="w-8 h-8 mx-auto mb-2 t-text-muted" />
      <p class="t-text font-medium">AI spend is admin-only</p>
      <p class="text-sm t-text-muted">Ask an organization admin if you need spend visibility.</p>
    </div>

    <template v-else>
      <!-- Stat cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div v-for="s in stats" :key="s.label" class="rounded-xl border t-border t-bg p-4">
          <div class="flex items-center gap-2 t-text-muted">
            <span class="t-icon-chip"><Icon :name="s.icon" class="w-4 h-4" /></span>
            <span class="text-xs">{{ s.label }}</span>
          </div>
          <p class="mt-2 text-2xl font-semibold t-text">{{ s.value }}</p>
          <p v-if="s.sub" class="text-xs t-text-muted">{{ s.sub }}</p>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="spinner-ios" />
      </div>

      <template v-else-if="data">
        <!-- Per-feature breakdown -->
        <div v-if="features.length" class="rounded-xl border t-border t-bg p-4">
          <h2 class="text-sm font-semibold t-text mb-3">By feature</h2>
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
            <h2 class="text-sm font-semibold t-text">By person</h2>
            <p class="text-xs t-text-muted">Credits used in the last {{ data.days }} days. For oversight — there are no per-person limits.</p>
          </div>
          <div v-if="!data.users.length" class="p-8 text-center text-sm t-text-muted">
            No AI usage in this period yet.
          </div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="text-left t-text-muted">
                <th class="px-4 py-2 font-medium">Person</th>
                <th class="px-4 py-2 font-medium text-right">Calls</th>
                <th class="px-4 py-2 font-medium text-right">Credits</th>
                <th class="px-4 py-2 font-medium text-right">≈ Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in data.users" :key="u.userId || u.name" class="border-t t-border">
                <td class="px-4 py-2">
                  <div class="t-text">{{ u.name }}</div>
                  <div v-if="u.email" class="text-xs t-text-muted">{{ u.email }}</div>
                </td>
                <td class="px-4 py-2 text-right t-text-secondary">{{ fmtCredits(u.calls) }}</td>
                <td class="px-4 py-2 text-right t-text font-medium">{{ fmtCredits(u.credits) }}</td>
                <td class="px-4 py-2 text-right t-text-secondary">{{ fmtUsd(u.credits) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </div>
</template>

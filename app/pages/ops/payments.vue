<script setup lang="ts">
// Operator console: payments feed (plan §5, Phase 1). HOA Connect's own
// charges, refunds and failures, newest first; residents' dues on their own tab,
// by community and amount only.
import { money, shortDate } from "#core/shared/ops/format";

definePageMeta({ middleware: ["auth"], layout: "auth" });
useHead({ title: "Payments · Operations" });

const route = useRoute();
const router = useRouter();
const kind = computed(() => (route.query.kind === "dues" ? "dues" : "platform"));
const days = computed(() => String(route.query.days ?? "30"));

const { data, pending, error } = await useFetch<any>("/api/ops/payments", {
  query: computed(() => ({ kind: kind.value, days: days.value })),
});

const kinds = [
  { value: "platform", label: "HOA Connect", icon: "lucide:receipt" },
  { value: "dues", label: "Resident dues", icon: "lucide:home" },
];
const windows = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];
function set(next: Record<string, string>) {
  void router.replace({ query: { ...route.query, ...next } });
}

const columns = computed(() => [
  { key: "created", label: "Date" },
  { key: "community", label: "Community" },
  { key: "amount", label: "Amount", align: "right" as const },
  { key: "status", label: "Status" },
  ...(kind.value === "platform" ? [{ key: "description", label: "Description", hideOnMobile: true }] : []),
]);
</script>

<template>
  <OpsShell title="Payments" description="Charges, refunds and failures, newest first.">
    <div class="flex flex-wrap items-center gap-2">
      <AppSegmentedControl :items="kinds" :model-value="kind" size="sm" label="Payment kind" @update:model-value="(v: string) => set({ kind: v })" />
      <AppSegmentedControl :items="windows" :model-value="days" size="sm" label="Window" @update:model-value="(v: string) => set({ days: v })" />
    </div>

    <div v-if="error" class="py-10">
      <AppEmptyState title="Couldn't load payments" :description="error.statusMessage || error.message" icon="lucide:triangle-alert" />
    </div>

    <template v-else>
      <div v-if="data" class="mt-4 grid grid-cols-3 gap-2">
        <div class="ios-card p-3"><p class="type-section tabular-nums text-success">{{ money(data.totals.succeededCents) }}</p><p class="type-micro t-text-muted">collected</p></div>
        <div class="ios-card p-3"><p class="type-section tabular-nums text-warning">{{ money(data.totals.refundedCents) }}</p><p class="type-micro t-text-muted">refunded</p></div>
        <div class="ios-card p-3"><p class="type-section tabular-nums text-destructive">{{ data.totals.failed }}</p><p class="type-micro t-text-muted">failed</p></div>
      </div>
      <p v-if="data?.truncated" class="mt-2 type-micro text-warning">Showing the newest 500 charges in this window.</p>

      <div class="mt-4">
        <AppDataTable
          :columns="columns"
          :rows="data?.rows ?? []"
          :loading="pending && !data"
          empty-title="No payments in this window"
          empty-icon="lucide:receipt"
          @row-click="(row: any) => navigateTo(row.stripeUrl, { external: true, open: { target: '_blank' } })"
        >
          <template #cell-created="{ row }">{{ shortDate(row.created) }}</template>
          <template #cell-community="{ row }">
            <NuxtLink v-if="row.community" :to="`/ops/communities/${row.community.id}`" class="t-text hover:underline" @click.stop>{{ row.community.name }}</NuxtLink>
            <span v-else-if="row.billingAccount" class="t-text">{{ row.billingAccount.name }}</span>
            <span v-else class="t-text-muted">—</span>
          </template>
          <template #cell-amount="{ row }">
            <span class="tabular-nums">{{ money(row.amount, row.currency) }}</span>
            <span v-if="row.amountRefunded" class="block type-micro text-warning">−{{ money(row.amountRefunded, row.currency) }}</span>
          </template>
          <template #cell-status="{ row }">
            <OpsStatusPill :status="row.status" />
            <span v-if="row.failureMessage" class="block type-micro text-destructive">{{ row.failureMessage }}</span>
          </template>
          <template #cell-description="{ row }"><span class="type-meta t-text-muted">{{ row.description || "—" }}</span></template>
        </AppDataTable>
      </div>
    </template>
  </OpsShell>
</template>

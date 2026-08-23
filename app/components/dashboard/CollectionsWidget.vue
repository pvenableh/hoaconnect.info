<script setup lang="ts">
/**
 * Dashboard widget — money in, by month.
 *
 * Fetches its own charges rather than taking them from DashboardPage. The
 * dashboard is a widget grid where any card can be switched off, and a hidden
 * widget should cost nothing: pushing the query up to the page would make every
 * admin pay for a chart most of them have turned off.
 *
 * MONEY IS A STRING HERE. Directus returns decimals as strings ("600.75"), so
 * amounts go through num() before arithmetic — `+` on two of those concatenates
 * and the widget silently reports $0. That has bitten this codebase before.
 */
const { selectedOrgId } = await useSelectedOrg();
const { list } = useDirectusItems("payment_requests");
const orgId = computed(() => selectedOrgId.value);

const MONTHS_BACK = 12;

const { data, pending } = await useAsyncData(
  `dash-collections-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    return (await list({
      fields: ["id", "amount_paid", "paid_at"],
      filter: { organization: { _eq: orgId.value }, paid_at: { _nnull: true } },
      sort: ["-paid_at"],
      limit: 500,
    })) as any[];
  },
  { watch: [orgId], server: false, default: () => [] as any[] },
);

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n as number) ? (n as number) : 0;
};

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

const SERIES = [{ key: "collected", label: "Collected", color: "var(--chart-1)" }];

const months = computed(() => {
  const now = new Date();
  const byKey = new Map<string, { label: string; collected: number }>();
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    byKey.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, {
      label: d.toLocaleDateString("en-US", { month: "short" }),
      collected: 0,
    });
  }
  for (const c of data.value || []) {
    const d = new Date(c.paid_at);
    if (Number.isNaN(d.getTime())) continue;
    const bucket = byKey.get(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
    if (bucket) bucket.collected += num(c.amount_paid);
  }
  return [...byKey.values()];
});

const total = computed(() => months.value.reduce((s, m) => s + m.collected, 0));
const hasAny = computed(() => total.value > 0);
</script>

<template>
  <AppChartCard
    title="Collections"
    :hint="hasAny ? `${currency(total)} collected over 12 months` : 'Money in, by month'"
    icon="lucide:trending-up"
    :loading="pending"
    :empty="!hasAny"
    empty-title="No payments recorded"
    empty-hint="Once a charge is paid, the months fill in."
    :height="200"
  >
    <AppChartTrend
      :data="months"
      :series="SERIES"
      area
      :height="200"
      :format="currency"
      hide-legend
    />
  </AppChartCard>
</template>

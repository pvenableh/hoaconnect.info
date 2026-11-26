<script setup lang="ts">
/**
 * HomeBoardGlance — band 2 for a board member: arrears against what is
 * outstanding (`Meter`), the collections trend (`Sparkline`) and the year's
 * vendor end dates (`Heatstrip`). Money reads need money:read; without it they
 * stay empty.
 */
import { vendorEndDays } from "#core/shared/home/board-team-home";

const orgId = useState<string | null>("selectedOrgId", () => null);
const fmtMoney = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const money = await useMoneyGlance(orgId);
const year = new Date().getFullYear();

const vendorsApi = useDirectusItems("hoa_vendors");
const { data: vendors } = useAsyncData(
  () => `board-home-vendors-${orgId.value}`,
  async () =>
    orgId.value
      ? await vendorsApi.list({ fields: ["id", "status", "contract_end", "active_until"], filter: { organization: { _eq: orgId.value } }, limit: 200 }).catch(() => [])
      : [],
  { watch: [orgId], server: false, default: () => [] as any[] },
);
const endDays = computed(() => vendorEndDays(vendors.value ?? [], year));
const trend = computed(() => money.months.value.map((m) => m.collected));
</script>

<template>
  <div class="space-y-3" data-testid="home-board-glance">
    <h2 class="t-eyebrow">At a glance</h2>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <AppCard class="p-4" data-testid="home-arrears-meter">
        <AppChartMeter :value="money.hasOutstanding.value ? money.pastDueTotal.value : null" :limit="Math.max(money.outstanding.value, 1)" label="Past due of outstanding" :format="fmtMoney" />
      </AppCard>
      <AppCard class="p-4" data-testid="home-collections-trend">
        <p class="text-sm font-medium t-text">Collected, last 12 months</p>
        <AppChartSparkline v-if="money.hasCollections.value" :values="trend" :width="220" :height="40" label="Collected, last 12 months" />
        <p v-else class="text-sm t-text-muted">Nothing collected yet.</p>
      </AppCard>
      <AppCard class="p-4 sm:col-span-2" data-testid="home-contracts-heatstrip">
        <p class="mb-2 text-sm font-medium t-text">Vendor end dates, {{ year }}</p>
        <AppChartHeatstrip :year="year" :values="endDays" label="Vendor end dates this year" />
      </AppCard>
    </div>
  </div>
</template>

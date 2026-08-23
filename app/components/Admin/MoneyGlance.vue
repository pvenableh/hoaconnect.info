<script setup lang="ts">
/**
 * The band at the top of Money: the two questions a treasurer is actually
 * asked, neither of which the two existing total cards can answer.
 *
 *   Cash in and out by month — is the community living within its dues?
 *   Outstanding by age       — who hasn't paid, and for how long?
 *
 * The ageing chart is the one worth building. "Outstanding: $4,200" reads the
 * same whether it's this month's dues not yet due or a unit ninety days behind,
 * and those are completely different facts about a community. Buckets past due
 * are coloured as a problem rather than off the categorical ramp — that is the
 * chart telling you something, which is the whole point of drawing it.
 *
 * Both take data the page already loaded.
 *
 * MONEY IS A STRING HERE. Directus returns decimals as strings ("600.75"), so
 * every amount goes through num() before arithmetic — `+` on two of those
 * concatenates and the page silently reports $0.00 or a nonsense total. That
 * has bitten this codebase before.
 */
interface ChargeRow {
  id: string;
  status?: string | null;
  amount?: number | string | null;
  amount_paid?: number | string | null;
  amount_remaining?: number | string | null;
  due_date?: string | null;
  paid_at?: string | null;
}

interface ExpenseRow {
  id: string;
  amount?: number | string | null;
  expense_date?: string | null;
  paid_date?: string | null;
}

const props = defineProps<{
  charges: ChargeRow[];
  expenses: ExpenseRow[];
  loading?: boolean;
}>();

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n as number) ? (n as number) : 0;
};

const MS_DAY = 86_400_000;
const now = new Date();

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

// ---- Chart 1: cash in and out, by month ----
const MONTHS_BACK = 12;

const monthKeys = computed(() => {
  const out: { key: string; label: string }[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short" }),
    });
  }
  return out;
});

const monthOf = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const CASHFLOW_SERIES = [
  { key: "collected", label: "Collected", color: "var(--chart-1)" },
  { key: "spent", label: "Spent", color: "var(--chart-5)" },
];

const cashflow = computed(() => {
  const byMonth = new Map(monthKeys.value.map((m) => [m.key, { collected: 0, spent: 0 }]));
  for (const c of props.charges) {
    const k = monthOf(c.paid_at);
    const bucket = k ? byMonth.get(k) : null;
    if (bucket) bucket.collected += num(c.amount_paid);
  }
  for (const e of props.expenses) {
    // paid_date when it exists — an approved-but-unpaid bill hasn't left the
    // account yet, and this chart is about cash, not accruals.
    const k = monthOf(e.paid_date || e.expense_date);
    const bucket = k ? byMonth.get(k) : null;
    if (bucket) bucket.spent += num(e.amount);
  }
  return monthKeys.value.map((m) => ({ label: m.label, ...byMonth.get(m.key)! }));
});

const hasCashflow = computed(() =>
  cashflow.value.some((m) => m.collected > 0 || m.spent > 0),
);

// ---- Chart 2: outstanding, by how overdue ----
const AGEING_SERIES = [
  { key: "amount", label: "Outstanding", color: "var(--chart-1)" },
];

const outstandingRows = computed(() =>
  props.charges.filter(
    (c) => !["paid", "canceled"].includes(String(c.status)) && owed(c) > 0,
  ),
);

function owed(c: ChargeRow): number {
  // amount_remaining is authoritative when set; a partially paid charge that
  // fell back to `amount` would overstate the debt by whatever was already paid.
  const remaining = num(c.amount_remaining);
  if (remaining > 0) return remaining;
  return Math.max(0, num(c.amount) - num(c.amount_paid));
}

const daysOverdue = (c: ChargeRow): number => {
  if (!c.due_date) return 0;
  const t = new Date(c.due_date).getTime();
  if (!Number.isFinite(t)) return 0;
  return (now.getTime() - t) / MS_DAY;
};

const AGE_BUCKETS = [
  { label: "Not yet due", min: -Infinity, max: 0, color: CHART_STATUS_VARS.muted },
  { label: "1–30 days", min: 0, max: 30, color: "var(--chart-3)" },
  { label: "31–60 days", min: 30, max: 60, color: CHART_STATUS_VARS.warn },
  { label: "61–90 days", min: 60, max: 90, color: CHART_STATUS_VARS.severe },
  { label: "90 days +", min: 90, max: Infinity, color: CHART_STATUS_VARS.bad },
];

const ageing = computed(() =>
  AGE_BUCKETS.map((b) => ({
    label: b.label,
    color: b.color,
    amount: outstandingRows.value
      .filter((c) => {
        const d = daysOverdue(c);
        return d > b.min && d <= (b.max === Infinity ? Infinity : b.max);
      })
      .reduce((sum, c) => sum + owed(c), 0),
  })),
);

const pastDueTotal = computed(() =>
  outstandingRows.value
    .filter((c) => daysOverdue(c) > 0)
    .reduce((sum, c) => sum + owed(c), 0),
);

const pastDueCount = computed(
  () => outstandingRows.value.filter((c) => daysOverdue(c) > 0).length,
);

const hasOutstanding = computed(() => outstandingRows.value.length > 0);

const collectedLast30 = computed(() =>
  props.charges
    .filter(
      (c) => c.paid_at && now.getTime() - new Date(c.paid_at).getTime() < 30 * MS_DAY,
    )
    .reduce((sum, c) => sum + num(c.amount_paid), 0),
);
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <AppStatCard
        label="Collected"
        icon="lucide:trending-up"
        :value="currency(collectedLast30)"
        :loading="loading"
        description="In the last 30 days"
      />
      <AppStatCard
        label="Past due"
        icon="lucide:alert-circle"
        :value="currency(pastDueTotal)"
        :loading="loading"
        :description="`${pastDueCount} charge${pastDueCount === 1 ? '' : 's'} overdue`"
      />
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <AppChartCard
        title="Cash in and out"
        hint="Collected against spent, by month"
        icon="lucide:bar-chart-3"
        :loading="loading"
        :empty="!hasCashflow"
        empty-title="No money has moved yet"
        empty-hint="Once a charge is paid or an expense recorded, the months fill in."
        :height="200"
      >
        <AppChartBars
          :data="cashflow"
          :series="CASHFLOW_SERIES"
          :stacked="false"
          :height="200"
          :format="currency"
        />
      </AppChartCard>

      <AppChartCard
        title="Outstanding by age"
        hint="How long the money has been owed"
        icon="lucide:hourglass"
        :loading="loading"
        :empty="!hasOutstanding"
        empty-title="Nothing outstanding"
        empty-hint="Every charge on the books has been paid."
        :height="200"
      >
        <!--
          One series, five bars, five colours: the bucket IS the category here,
          so the bar takes its colour from the row rather than from the series.
          Past-due buckets are on the status tokens, not the categorical ramp —
          red here means overdue, not "the fifth thing".
        -->
        <AppChartBars
          :data="ageing"
          :series="AGEING_SERIES"
          :height="200"
          :format="currency"
          :color-by-row="(row) => String(row.color)"
          hide-legend
        />
      </AppChartCard>
    </div>
  </div>
</template>

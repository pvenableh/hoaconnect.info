<script setup lang="ts">
// Financial reports tab for the Finances page. Pure aggregation lives in
// #core/shared/reporting/ledger (unit-tested); this component just adapts the
// already-loaded rows, renders the tables, and handles CSV export.
import type { PaymentRequest, PaymentExpense, HoaMember, HoaOrganization } from "#core/types/directus";
import {
  incomeEntriesFromRequests,
  expenseEntriesFromExpenses,
  summarize,
  monthlySeries,
  byCategory,
  delinquencyAging,
  openingBalanceFromOrg,
  toCsv,
} from "#core/shared/reporting/ledger";

const props = defineProps<{
  requests: PaymentRequest[];
  expenses: PaymentExpense[];
  members: HoaMember[];
  /** Carries opening_balance + opening_balance_date (Settings → Payments). */
  organization?: Pick<HoaOrganization, "opening_balance" | "opening_balance_date"> | null;
}>();

// "as of" for aging — captured once on mount so the report is stable while open.
const asOf = ref(new Date().toISOString());

const range = ref<"12mo" | "all">("12mo");

// Cut-off month key for the 12-month window (inclusive of the current month).
const cutoffMonth = computed(() => {
  const d = new Date(asOf.value);
  d.setUTCMonth(d.getUTCMonth() - 11);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
});

const entries = computed(() => [
  ...incomeEntriesFromRequests(props.requests || []),
  ...expenseEntriesFromExpenses(props.expenses || []),
]);

// Where the running balance starts. Unset → 0, i.e. the pre-existing behaviour.
const opening = computed(() => openingBalanceFromOrg(props.organization));
const hasOpening = computed(
  () => !!opening.value.openingBalance || !!opening.value.openingBalanceAsOf
);

const summary = computed(() => summarize(entries.value, opening.value));

const series = computed(() => {
  const all = monthlySeries(entries.value, opening.value);
  if (range.value === "all") return all;
  return all.filter((m) => m.month >= cutoffMonth.value);
});

const incomeCats = computed(() => byCategory(entries.value, "in"));
const expenseCats = computed(() => byCategory(entries.value, "out"));

// --- Delinquency --------------------------------------------------------
const memberIndex = computed(() => {
  const map = new Map<string, string>();
  for (const m of props.members || []) {
    map.set(m.id, [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "—");
  }
  return map;
});

const resolveMember = (member: unknown): { id: string; name: string } => {
  if (member && typeof member === "object") {
    const m = member as Partial<HoaMember>;
    const id = String(m.id ?? "");
    const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || memberIndex.value.get(id) || "—";
    return { id, name };
  }
  const id = String(member ?? "");
  return { id, name: memberIndex.value.get(id) || "—" };
};

const aging = computed(() => delinquencyAging(props.requests || [], asOf.value, resolveMember));

// --- Formatting ---------------------------------------------------------
const currency = (v?: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, (m! - 1), 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};
const CAT_LABEL: Record<string, string> = {
  monthly_dues: "Monthly Dues", assessment: "Assessment", late_fee: "Late Fee",
  maintenance: "Maintenance", utilities: "Utilities", insurance: "Insurance",
  landscaping: "Landscaping", admin: "Admin", other: "Other",
};
const catLabel = (c: string) => CAT_LABEL[c] || c;
// UTC, like monthLabel: Directus date-only values ("2026-01-01") parse as UTC
// midnight, so formatting them locally renders the day before west of GMT.
const fdate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

// --- CSV export ---------------------------------------------------------
const download = (filename: string, csv: string) => {
  if (!import.meta.client) return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const exportMonthly = () => {
  const csv = toCsv(
    ["Month", "Income", "Expense", "Net", "Running balance"],
    [
      // Lead with the opening balance so the CSV reconciles on its own.
      ...(hasOpening.value
        ? [[`Opening balance${opening.value.openingBalanceAsOf ? ` (${fdate(opening.value.openingBalanceAsOf)})` : ""}`, "", "", "", opening.value.openingBalance] as Array<string | number>]
        : []),
      ...series.value.map((m) => [monthLabel(m.month), m.income, m.expense, m.net, m.runningBalance]),
    ]
  );
  download("financial-summary.csv", csv);
};

const exportDelinquency = () => {
  const csv = toCsv(
    ["Member", "Current", "1–30", "31–60", "61–90", "90+", "Outstanding", "Oldest due"],
    aging.value.rows.map((r) => [
      r.memberName, r.current, r.d1_30, r.d31_60, r.d61_90, r.d90_plus, r.outstanding, r.oldestDueDate || "",
    ])
  );
  download("delinquency-aging.csv", csv);
};

const AGING_COLS = [
  { key: "current", label: "Current" },
  { key: "d1_30", label: "1–30" },
  { key: "d31_60", label: "31–60" },
  { key: "d61_90", label: "61–90" },
  { key: "d90_plus", label: "90+" },
] as const;
</script>

<template>
  <div class="space-y-6">
    <!-- Summary -->
    <div class="grid grid-cols-2 gap-4" :class="hasOpening ? 'md:grid-cols-5' : 'md:grid-cols-4'">
      <div class="ios-card p-5">
        <p class="text-xs uppercase tracking-wide t-text-muted">Income</p>
        <p class="text-2xl font-semibold tabular-nums text-emerald-600 mt-1">{{ currency(summary.totalIncome) }}</p>
      </div>
      <div class="ios-card p-5">
        <p class="text-xs uppercase tracking-wide t-text-muted">Expenses</p>
        <p class="text-2xl font-semibold tabular-nums text-red-600 mt-1">{{ currency(summary.totalExpense) }}</p>
      </div>
      <div class="ios-card p-5">
        <p class="text-xs uppercase tracking-wide t-text-muted">Net</p>
        <p class="text-2xl font-semibold tabular-nums mt-1" :class="summary.net >= 0 ? 'text-emerald-600' : 'text-red-600'">
          {{ currency(summary.net) }}
        </p>
      </div>
      <div v-if="hasOpening" class="ios-card p-5">
        <p class="text-xs uppercase tracking-wide t-text-muted">Balance</p>
        <p class="text-2xl font-semibold tabular-nums mt-1" :class="summary.closingBalance >= 0 ? 't-text' : 'text-red-600'">
          {{ currency(summary.closingBalance) }}
        </p>
        <p class="text-[11px] t-text-muted mt-0.5">Opening {{ currency(summary.openingBalance) }}</p>
      </div>
      <div class="ios-card p-5">
        <p class="text-xs uppercase tracking-wide t-text-muted">Outstanding</p>
        <p class="text-2xl font-semibold tabular-nums t-text mt-1">{{ currency(aging.totals.outstanding) }}</p>
      </div>
    </div>

    <!-- Monthly summary -->
    <div class="ios-card overflow-hidden">
      <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08]">
        <h3 class="font-semibold t-text">Monthly summary</h3>
        <div class="flex items-center gap-1.5">
          <div class="flex gap-1.5">
            <button
              v-for="opt in [{ key: '12mo', label: 'Last 12 mo' }, { key: 'all', label: 'All time' }]"
              :key="opt.key"
              @click="range = opt.key as any"
              class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
              :class="range === opt.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            >{{ opt.label }}</button>
          </div>
          <Button variant="outline" size="sm" class="rounded-full" :disabled="!series.length" @click="exportMonthly">
            <Icon name="lucide:download" class="w-3.5 h-3.5 mr-1" /> CSV
          </Button>
        </div>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-black/[0.06] dark:border-white/[0.08]">
            <th class="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Month</th>
            <th class="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Income</th>
            <th class="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Expense</th>
            <th class="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Net</th>
            <th class="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="hasOpening" class="border-b border-black/[0.04] dark:border-white/[0.05] bg-black/[0.02] dark:bg-white/[0.03]">
            <td class="py-2.5 px-4 t-text-muted">
              Opening balance
              <span v-if="opening.openingBalanceAsOf" class="text-xs">· {{ fdate(opening.openingBalanceAsOf) }}</span>
            </td>
            <td class="py-2.5 px-4 text-right t-text-muted">—</td>
            <td class="py-2.5 px-4 text-right t-text-muted">—</td>
            <td class="py-2.5 px-4 text-right t-text-muted">—</td>
            <td class="py-2.5 px-4 text-right tabular-nums font-semibold t-text">{{ currency(summary.openingBalance) }}</td>
          </tr>
          <tr v-if="!series.length">
            <td colspan="5" class="py-10 text-center t-text-muted">No financial activity in this range.</td>
          </tr>
          <tr v-for="m in series" :key="m.month" class="border-b border-black/[0.04] dark:border-white/[0.05] last:border-0">
            <td class="py-2.5 px-4 t-text">{{ monthLabel(m.month) }}</td>
            <td class="py-2.5 px-4 text-right tabular-nums text-emerald-600">{{ currency(m.income) }}</td>
            <td class="py-2.5 px-4 text-right tabular-nums text-red-600">{{ currency(m.expense) }}</td>
            <td class="py-2.5 px-4 text-right tabular-nums font-medium" :class="m.net >= 0 ? 'text-emerald-600' : 'text-red-600'">{{ currency(m.net) }}</td>
            <td class="py-2.5 px-4 text-right tabular-nums font-semibold t-text">{{ currency(m.runningBalance) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Category breakdowns -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="ios-card p-5 space-y-3">
        <h3 class="font-semibold t-text">Income by type</h3>
        <p v-if="!incomeCats.length" class="text-sm t-text-muted py-4">No income recorded yet.</p>
        <div v-for="c in incomeCats" :key="c.category" class="space-y-1">
          <div class="flex justify-between text-sm">
            <span class="t-text-muted">{{ catLabel(c.category) }}</span>
            <span class="font-medium tabular-nums t-text">{{ currency(c.total) }}</span>
          </div>
          <div class="w-full bg-black/[0.05] dark:bg-white/[0.06] rounded-full h-1.5">
            <div class="bg-emerald-500 h-1.5 rounded-full" :style="{ width: `${Math.round(c.share * 100)}%` }" />
          </div>
        </div>
      </div>
      <div class="ios-card p-5 space-y-3">
        <h3 class="font-semibold t-text">Expenses by category</h3>
        <p v-if="!expenseCats.length" class="text-sm t-text-muted py-4">No expenses recorded yet.</p>
        <div v-for="c in expenseCats" :key="c.category" class="space-y-1">
          <div class="flex justify-between text-sm">
            <span class="t-text-muted">{{ catLabel(c.category) }}</span>
            <span class="font-medium tabular-nums t-text">{{ currency(c.total) }}</span>
          </div>
          <div class="w-full bg-black/[0.05] dark:bg-white/[0.06] rounded-full h-1.5">
            <div class="bg-red-500 h-1.5 rounded-full" :style="{ width: `${Math.round(c.share * 100)}%` }" />
          </div>
        </div>
      </div>
    </div>

    <!-- Delinquency aging -->
    <div class="ios-card overflow-hidden">
      <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div>
          <h3 class="font-semibold t-text">Delinquency aging</h3>
          <p class="text-xs t-text-muted">Unpaid charges by days past due, as of {{ fdate(asOf) }}.</p>
        </div>
        <Button variant="outline" size="sm" class="rounded-full" :disabled="!aging.rows.length" @click="exportDelinquency">
          <Icon name="lucide:download" class="w-3.5 h-3.5 mr-1" /> CSV
        </Button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-black/[0.06] dark:border-white/[0.08]">
              <th class="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Member</th>
              <th v-for="col in AGING_COLS" :key="col.key" class="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">{{ col.label }}</th>
              <th class="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!aging.rows.length">
              <td :colspan="AGING_COLS.length + 2" class="py-10 text-center t-text-muted">No outstanding balances. 🎉</td>
            </tr>
            <tr v-for="r in aging.rows" :key="r.memberId" class="border-b border-black/[0.04] dark:border-white/[0.05] last:border-0">
              <td class="py-2.5 px-4 t-text whitespace-nowrap">{{ r.memberName }}</td>
              <td
                v-for="col in AGING_COLS"
                :key="col.key"
                class="py-2.5 px-4 text-right tabular-nums"
                :class="col.key === 'd90_plus' && r[col.key] > 0 ? 'text-red-600 font-medium' : 't-text-muted'"
              >{{ r[col.key] ? currency(r[col.key]) : "—" }}</td>
              <td class="py-2.5 px-4 text-right tabular-nums font-semibold t-text">{{ currency(r.outstanding) }}</td>
            </tr>
          </tbody>
          <tfoot v-if="aging.rows.length">
            <tr class="border-t border-black/[0.08] dark:border-white/[0.1]">
              <td class="py-2.5 px-4 font-medium t-text">Total</td>
              <td v-for="col in AGING_COLS" :key="col.key" class="py-2.5 px-4 text-right tabular-nums font-medium t-text">{{ currency(aging.totals[col.key]) }}</td>
              <td class="py-2.5 px-4 text-right tabular-nums font-bold t-text">{{ currency(aging.totals.outstanding) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PaymentRequest, PaymentSchedule, PaymentTransaction, HoaMember } from "#core/types/directus";
import { toast } from "vue-sonner";

definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { selectedOrgId } = await useSelectedOrg();
const { list: listRequests, create: createRequest, update: updateRequest } =
  useDirectusItems<PaymentRequest>("payment_requests");
const { list: listSchedules, create: createSchedule, update: updateSchedule } =
  useDirectusItems<PaymentSchedule>("payment_schedules");
const { create: createTransaction } = useDirectusItems<PaymentTransaction>("payment_transactions");
const { list: listMembers } = useDirectusItems<HoaMember>("hoa_members");
const { list: listExpenses } = useExpenses();
const { buildOrgPath } = useOrgNavigation();

const tab = ref<"overview" | "charges" | "recurring">("overview");

// --- Data ---------------------------------------------------------------
const { data: requests, pending, refresh } = await useAsyncData(
  `admin-payments-${selectedOrgId.value}`,
  async () => {
    if (!selectedOrgId.value) return [];
    const rows = await listRequests({
      fields: [
        "id", "title", "status", "request_type", "amount", "amount_paid",
        "amount_remaining", "due_date", "paid_at",
        "member.id", "member.first_name", "member.last_name",
      ],
      filter: { organization: { _eq: selectedOrgId.value } },
      sort: ["-date_created"],
      limit: 200,
    });
    return (rows || []) as PaymentRequest[];
  },
  { watch: [selectedOrgId], server: false }
);

const { data: schedules, refresh: refreshSchedules } = await useAsyncData(
  `admin-schedules-${selectedOrgId.value}`,
  async () => {
    if (!selectedOrgId.value) return [];
    const rows = await listSchedules({
      fields: [
        "id", "title", "status", "amount", "frequency", "start_date",
        "next_payment_date", "total_payments_generated",
        "member.id", "member.first_name", "member.last_name",
      ],
      filter: { organization: { _eq: selectedOrgId.value } },
      sort: ["-date_created"],
      limit: 200,
    });
    return (rows || []) as PaymentSchedule[];
  },
  { watch: [selectedOrgId], server: false }
);

const { data: members } = await useAsyncData(
  `admin-payments-members-${selectedOrgId.value}`,
  async () => {
    if (!selectedOrgId.value) return [];
    const rows = await listMembers({
      fields: ["id", "first_name", "last_name", "email"],
      filter: { organization: { _eq: selectedOrgId.value }, status: { _in: ["active", "inactive"] } },
      sort: ["first_name", "last_name"],
      limit: 500,
    });
    return (rows || []) as HoaMember[];
  },
  { watch: [selectedOrgId], server: false }
);

const { data: expenses } = await useAsyncData(
  `admin-payments-expenses-${selectedOrgId.value}`,
  () => listExpenses(selectedOrgId.value || undefined),
  { watch: [selectedOrgId], server: false }
);

const memberName = (m: any) => {
  const mm = typeof m === "object" ? m : null;
  if (!mm) return "—";
  return [mm.first_name, mm.last_name].filter(Boolean).join(" ") || mm.email || "—";
};

// --- Filters ------------------------------------------------------------
const statusFilter = ref<"outstanding" | "paid" | "all">("outstanding");
const typeFilter = ref<string>("all");

const filtered = computed(() => {
  let rows = requests.value || [];
  if (statusFilter.value === "outstanding") rows = rows.filter((r) => !["paid", "canceled"].includes(r.status as string));
  else if (statusFilter.value === "paid") rows = rows.filter((r) => r.status === "paid");
  if (typeFilter.value !== "all") rows = rows.filter((r) => r.request_type === typeFilter.value);
  return rows;
});

// --- Stats --------------------------------------------------------------
const totalOutstanding = computed(() =>
  (requests.value || [])
    .filter((r) => !["paid", "canceled"].includes(r.status as string))
    .reduce((s, r) => s + (r.amount_remaining ?? r.amount ?? 0), 0)
);
const totalCollected = computed(() =>
  (requests.value || []).reduce((s, r) => s + (r.amount_paid ?? 0), 0)
);

// --- Financials overview ------------------------------------------------
const totalExpenses = computed(() =>
  (expenses.value || []).reduce((s, e) => s + (e.amount || 0), 0)
);
const net = computed(() => totalCollected.value - totalExpenses.value);
// Bar widths relative to the larger of income/expenses.
const maxFlow = computed(() => Math.max(totalCollected.value, totalExpenses.value, 1));
const incomePct = computed(() => (totalCollected.value / maxFlow.value) * 100);
const expensePct = computed(() => (totalExpenses.value / maxFlow.value) * 100);

// Recent activity: most recent paid charges + expenses, merged by date.
const recentActivity = computed(() => {
  const income = (requests.value || [])
    .filter((r) => r.status === "paid" && r.paid_at)
    .map((r) => ({ kind: "in" as const, label: r.title, member: memberName(r.member), amount: r.amount_paid ?? r.amount ?? 0, date: r.paid_at as string }));
  const out = (expenses.value || [])
    .map((e) => ({ kind: "out" as const, label: e.title, member: e.vendor || "—", amount: e.amount || 0, date: (e.expense_date || e.date_created) as string }));
  return [...income, ...out]
    .filter((x) => x.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);
});

// --- New charge form ----------------------------------------------------
const showNew = ref(false);
const recurring = ref(false);
const saving = ref(false);
const form = ref({
  memberId: "",
  request_type: "monthly_dues" as PaymentRequest["request_type"],
  title: "",
  amount: null as number | null,
  due_date: "",
  description: "",
  frequency: "monthly" as PaymentSchedule["frequency"],
  start_date: "",
});

const resetForm = () => {
  form.value = {
    memberId: "", request_type: "monthly_dues", title: "", amount: null,
    due_date: "", description: "", frequency: "monthly", start_date: "",
  };
  recurring.value = false;
};

const canSave = computed(() =>
  !!form.value.memberId && !!form.value.title.trim() && (form.value.amount || 0) > 0 &&
  (!recurring.value || !!form.value.start_date)
);

const saveCharge = async () => {
  if (!canSave.value || !selectedOrgId.value) return;
  saving.value = true;
  try {
    if (recurring.value) {
      await createSchedule({
        organization: selectedOrgId.value,
        member: form.value.memberId,
        title: form.value.title.trim(),
        amount: form.value.amount,
        frequency: form.value.frequency,
        start_date: form.value.start_date,
        next_payment_date: form.value.start_date,
        status: "active",
      } as Partial<PaymentSchedule>);
      toast.success("Recurring charge created");
      await refreshSchedules();
      tab.value = "recurring";
    } else {
      await createRequest({
        organization: selectedOrgId.value,
        member: form.value.memberId,
        request_type: form.value.request_type,
        title: form.value.title.trim(),
        amount: form.value.amount,
        amount_paid: 0,
        amount_remaining: form.value.amount,
        due_date: form.value.due_date || null,
        description: form.value.description || null,
        status: "active",
      } as Partial<PaymentRequest>);
      toast.success("Charge created");
      await refresh();
    }
    showNew.value = false;
    resetForm();
  } catch (e: any) {
    console.error("Failed to create charge:", e);
    toast.error(e?.message || "Failed to create charge");
  } finally {
    saving.value = false;
  }
};

// --- Row actions --------------------------------------------------------
const markingId = ref<string | null>(null);

const markPaid = async (r: PaymentRequest) => {
  if (markingId.value) return;
  markingId.value = r.id;
  try {
    const amount = r.amount_remaining ?? r.amount ?? 0;
    const memberId = typeof r.member === "object" ? (r.member as any)?.id : r.member;
    // Record an offline/manual transaction so history + receipts stay consistent.
    await createTransaction({
      organization: selectedOrgId.value,
      member: memberId,
      payment_request: r.id,
      amount,
      currency: "usd",
      status: "succeeded",
      description: `Manual payment — ${r.title}`,
      stripe_payment_intent_id: `manual_${r.id}`,
      notes: "Recorded manually by an admin (offline payment).",
    } as Partial<PaymentTransaction>);
    await updateRequest(r.id, {
      status: "paid",
      amount_paid: r.amount ?? amount,
      amount_remaining: 0,
      paid_at: new Date().toISOString(),
    } as Partial<PaymentRequest>);
    toast.success("Marked as paid");
    await refresh();
  } catch (e: any) {
    console.error("Failed to mark paid:", e);
    toast.error(e?.message || "Failed to mark paid");
  } finally {
    markingId.value = null;
  }
};

const cancelCharge = async (r: PaymentRequest) => {
  try {
    await updateRequest(r.id, { status: "canceled" } as Partial<PaymentRequest>);
    toast.success("Charge canceled");
    await refresh();
  } catch (e: any) {
    toast.error(e?.message || "Failed to cancel");
  }
};

const setScheduleStatus = async (s: PaymentSchedule, status: PaymentSchedule["status"]) => {
  try {
    await updateSchedule(s.id, { status } as Partial<PaymentSchedule>);
    await refreshSchedules();
  } catch (e: any) {
    toast.error(e?.message || "Failed to update schedule");
  }
};

// --- Formatting ---------------------------------------------------------
const currency = (v?: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
const fdate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const TYPE_LABEL: Record<string, string> = {
  monthly_dues: "Monthly Dues", assessment: "Assessment", late_fee: "Late Fee", other: "Other",
};
const STATUS_CLASS: Record<string, string> = {
  active: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  partially_paid: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  canceled: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  draft: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
};
const TYPE_FILTERS = [
  { key: "all", label: "All types" },
  { key: "monthly_dues", label: "Monthly Dues" },
  { key: "assessment", label: "Assessment" },
  { key: "late_fee", label: "Late Fee" },
  { key: "other", label: "Other" },
];
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-2xl font-semibold t-text">Finances</h1>
        <Button class="rounded-full" @click="showNew = !showNew">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
          New charge
        </Button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 gap-4">
        <div class="ios-card p-5">
          <p class="text-xs uppercase tracking-wide t-text-muted">Outstanding</p>
          <p class="text-2xl font-semibold tabular-nums t-text mt-1">{{ currency(totalOutstanding) }}</p>
        </div>
        <div class="ios-card p-5">
          <p class="text-xs uppercase tracking-wide t-text-muted">Collected</p>
          <p class="text-2xl font-semibold tabular-nums text-emerald-600 mt-1">{{ currency(totalCollected) }}</p>
        </div>
      </div>

      <!-- New charge form -->
      <div v-if="showNew" class="ios-card p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold t-text">New charge</h2>
          <label class="flex items-center gap-2 text-sm t-text-muted">
            Recurring
            <Switch v-model="recurring" />
          </label>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <Label>Member</Label>
            <select v-model="form.memberId" class="w-full px-3 py-2 border rounded-md bg-background">
              <option value="" disabled>Select a member…</option>
              <option v-for="m in members" :key="m.id" :value="m.id">{{ memberName(m) }}</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <Label>{{ recurring ? "Description" : "Type" }}</Label>
            <select v-if="!recurring" v-model="form.request_type" class="w-full px-3 py-2 border rounded-md bg-background">
              <option value="monthly_dues">Monthly Dues</option>
              <option value="assessment">Assessment</option>
              <option value="late_fee">Late Fee</option>
              <option value="other">Other</option>
            </select>
            <select v-else v-model="form.frequency" class="w-full px-3 py-2 border rounded-md bg-background">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          </div>

          <div class="space-y-1.5 md:col-span-2">
            <Label>Title</Label>
            <Input v-model="form.title" placeholder="e.g. October Dues" />
          </div>

          <div class="space-y-1.5">
            <Label>Amount</Label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 t-text-muted">$</span>
              <Input v-model.number="form.amount" type="number" min="0" step="0.01" placeholder="0.00" class="pl-7" />
            </div>
          </div>

          <div class="space-y-1.5">
            <Label>{{ recurring ? "Start date" : "Due date" }}</Label>
            <Input v-if="recurring" v-model="form.start_date" type="date" />
            <Input v-else v-model="form.due_date" type="date" />
          </div>

          <div v-if="!recurring" class="space-y-1.5 md:col-span-2">
            <Label>Description (optional)</Label>
            <Input v-model="form.description" placeholder="Add a note for the member…" />
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <Button variant="outline" class="rounded-full" @click="showNew = false; resetForm()">Cancel</Button>
          <Button class="rounded-full" :disabled="!canSave || saving" @click="saveCharge">
            <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
            {{ recurring ? "Create recurring charge" : "Create charge" }}
          </Button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-1.5">
        <button
          v-for="t in [{ key: 'overview', label: 'Overview' }, { key: 'charges', label: 'Charges' }, { key: 'recurring', label: 'Recurring' }]"
          :key="t.key"
          @click="tab = t.key as any"
          class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
          :class="tab === t.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
        >{{ t.label }}</button>
        <NuxtLink :to="buildOrgPath('/admin/expenses')" class="ml-auto">
          <Button variant="outline" class="rounded-full">
            <Icon name="lucide:receipt" class="w-4 h-4 mr-1.5" /> Manage expenses
          </Button>
        </NuxtLink>
      </div>

      <!-- Overview tab -->
      <template v-if="tab === 'overview'">
        <div class="ios-card p-6 space-y-5">
          <div class="flex items-baseline justify-between">
            <h2 class="font-semibold t-text">Income vs Expenses</h2>
            <span class="text-sm t-text-muted">all time</span>
          </div>

          <div class="space-y-3">
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="t-text-muted">Income (collected)</span>
                <span class="font-medium tabular-nums text-emerald-600">{{ currency(totalCollected) }}</span>
              </div>
              <div class="w-full bg-black/[0.05] dark:bg-white/[0.06] rounded-full h-2.5">
                <div class="bg-emerald-500 h-2.5 rounded-full transition-all" :style="{ width: `${incomePct}%` }" />
              </div>
            </div>
            <div>
              <div class="flex justify-between text-sm mb-1">
                <span class="t-text-muted">Expenses</span>
                <span class="font-medium tabular-nums text-red-600">{{ currency(totalExpenses) }}</span>
              </div>
              <div class="w-full bg-black/[0.05] dark:bg-white/[0.06] rounded-full h-2.5">
                <div class="bg-red-500 h-2.5 rounded-full transition-all" :style="{ width: `${expensePct}%` }" />
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
            <span class="font-semibold t-text">Net</span>
            <span class="text-xl font-bold tabular-nums" :class="net >= 0 ? 'text-emerald-600' : 'text-red-600'">
              {{ currency(net) }}
            </span>
          </div>
        </div>

        <div class="ios-card overflow-hidden">
          <div class="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08]">
            <h3 class="font-semibold t-text">Recent activity</h3>
          </div>
          <table class="w-full text-sm">
            <tbody>
              <tr v-if="!recentActivity.length">
                <td class="py-8 text-center t-text-muted">No activity yet.</td>
              </tr>
              <tr
                v-for="(a, i) in recentActivity"
                :key="i"
                class="border-b border-black/[0.04] dark:border-white/[0.05] last:border-0"
              >
                <td class="py-2.5 px-4 w-10">
                  <span
                    class="inline-flex items-center justify-center w-8 h-8 rounded-full"
                    :class="a.kind === 'in' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'"
                  >
                    <Icon :name="a.kind === 'in' ? 'lucide:arrow-down-left' : 'lucide:arrow-up-right'" class="w-4 h-4" />
                  </span>
                </td>
                <td class="py-2.5 px-2">
                  <span class="t-text">{{ a.label }}</span>
                  <span class="t-text-muted text-xs ml-2">{{ a.member }}</span>
                </td>
                <td class="py-2.5 px-4 t-text-muted whitespace-nowrap">{{ fdate(a.date) }}</td>
                <td class="py-2.5 px-4 text-right font-medium tabular-nums" :class="a.kind === 'in' ? 'text-emerald-600' : 'text-red-600'">
                  {{ a.kind === 'in' ? '+' : '−' }}{{ currency(a.amount) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- Charges tab -->
      <template v-if="tab === 'charges'">
        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex gap-1.5 overflow-x-auto">
            <button
              v-for="opt in TYPE_FILTERS"
              :key="opt.key"
              @click="typeFilter = opt.key"
              class="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              :class="typeFilter === opt.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            >{{ opt.label }}</button>
          </div>
          <div class="flex gap-1.5 ml-auto">
            <button
              v-for="opt in [{ key: 'outstanding', label: 'Outstanding' }, { key: 'paid', label: 'Paid' }, { key: 'all', label: 'All' }]"
              :key="opt.key"
              @click="statusFilter = opt.key as any"
              class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              :class="statusFilter === opt.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'"
            >{{ opt.label }}</button>
          </div>
        </div>

        <div class="ios-card overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-black/[0.06] dark:border-white/[0.08]">
                <th class="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Member</th>
                <th class="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Charge</th>
                <th class="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Due</th>
                <th class="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Amount</th>
                <th class="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Status</th>
                <th class="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="pending">
                <td colspan="6" class="py-10 text-center"><span class="spinner-ios" /></td>
              </tr>
              <tr v-else-if="!filtered.length">
                <td colspan="6" class="py-10 text-center t-text-muted">No charges found.</td>
              </tr>
              <tr
                v-for="r in filtered"
                :key="r.id"
                class="border-b border-black/[0.04] dark:border-white/[0.05] last:border-0"
              >
                <td class="py-2.5 px-4 t-text">{{ memberName(r.member) }}</td>
                <td class="py-2.5 px-4">
                  <span class="t-text">{{ r.title }}</span>
                  <span class="t-text-muted text-xs ml-2">{{ TYPE_LABEL[r.request_type as string] }}</span>
                </td>
                <td class="py-2.5 px-4 t-text-muted">{{ fdate(r.due_date) }}</td>
                <td class="py-2.5 px-4 text-right font-medium tabular-nums t-text">{{ currency(r.amount) }}</td>
                <td class="py-2.5 px-4">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" :class="STATUS_CLASS[r.status as string]">
                    {{ r.status }}
                  </span>
                </td>
                <td class="py-2.5 px-4">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      v-if="!['paid','canceled'].includes(r.status as string)"
                      @click="markPaid(r)"
                      :disabled="markingId === r.id"
                      title="Mark as paid"
                      class="inline-flex items-center justify-center w-9 h-9 rounded-full t-bg-subtle hover:opacity-80 transition-opacity"
                    >
                      <Icon v-if="markingId === r.id" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
                      <Icon v-else name="lucide:check" class="w-4 h-4" />
                    </button>
                    <button
                      v-if="!['paid','canceled'].includes(r.status as string)"
                      @click="cancelCharge(r)"
                      title="Cancel charge"
                      class="inline-flex items-center justify-center w-9 h-9 rounded-full t-bg-subtle hover:opacity-80 transition-opacity"
                    >
                      <Icon name="lucide:x" class="w-4 h-4" />
                    </button>
                    <span v-if="['paid','canceled'].includes(r.status as string)" class="t-text-muted text-xs px-2">—</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- Recurring tab -->
      <template v-else-if="tab === 'recurring'">
        <div class="ios-card overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-black/[0.06] dark:border-white/[0.08]">
                <th class="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Member</th>
                <th class="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Title</th>
                <th class="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Frequency</th>
                <th class="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Next</th>
                <th class="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Amount</th>
                <th class="text-left py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Status</th>
                <th class="text-right py-2.5 px-4 text-xs font-medium uppercase tracking-wide t-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!schedules?.length">
                <td colspan="7" class="py-10 text-center t-text-muted">No recurring charges.</td>
              </tr>
              <tr
                v-for="s in schedules"
                :key="s.id"
                class="border-b border-black/[0.04] dark:border-white/[0.05] last:border-0"
              >
                <td class="py-2.5 px-4 t-text">{{ memberName(s.member) }}</td>
                <td class="py-2.5 px-4 t-text">{{ s.title }}</td>
                <td class="py-2.5 px-4 t-text-muted capitalize">{{ s.frequency }}</td>
                <td class="py-2.5 px-4 t-text-muted">{{ fdate(s.next_payment_date) }}</td>
                <td class="py-2.5 px-4 text-right font-medium tabular-nums t-text">{{ currency(s.amount) }}</td>
                <td class="py-2.5 px-4 t-text-muted capitalize">{{ s.status }}</td>
                <td class="py-2.5 px-4">
                  <div class="flex items-center justify-end gap-2">
                    <button
                      v-if="s.status === 'active'"
                      @click="setScheduleStatus(s, 'paused')"
                      title="Pause"
                      class="inline-flex items-center justify-center w-9 h-9 rounded-full t-bg-subtle hover:opacity-80 transition-opacity"
                    >
                      <Icon name="lucide:pause" class="w-4 h-4" />
                    </button>
                    <button
                      v-else-if="s.status === 'paused'"
                      @click="setScheduleStatus(s, 'active')"
                      title="Resume"
                      class="inline-flex items-center justify-center w-9 h-9 rounded-full t-bg-subtle hover:opacity-80 transition-opacity"
                    >
                      <Icon name="lucide:play" class="w-4 h-4" />
                    </button>
                    <button
                      v-if="s.status !== 'canceled'"
                      @click="setScheduleStatus(s, 'canceled')"
                      title="Cancel"
                      class="inline-flex items-center justify-center w-9 h-9 rounded-full t-bg-subtle hover:opacity-80 transition-opacity"
                    >
                      <Icon name="lucide:x" class="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </PageContainer>
  </div>
</template>

<script setup lang="ts">
import type {
  PaymentRequest,
  PaymentSchedule,
  HoaMember,
  HoaOrganization,
} from "#core/types/directus";
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
const { list: listMembers } = useDirectusItems<HoaMember>("hoa_members");
const { get: getOrganization } = useDirectusItems<HoaOrganization>("hoa_organizations");
const { list: listExpenses } = useExpenses();
const { buildOrgPath } = useOrgNavigation();

const tab = ref<"overview" | "charges" | "recurring" | "reports">("overview");

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

// Opening balance (Settings → Payments) — seeds the running balance in Reports.
// Fetched here rather than off useSelectedOrg's membership payload, which
// carries a fixed field list shared by every page.
const { data: orgBalance } = await useAsyncData(
  `admin-payments-opening-balance-${selectedOrgId.value}`,
  async () => {
    if (!selectedOrgId.value) return null;
    return (await getOrganization(selectedOrgId.value, {
      fields: ["id", "opening_balance", "opening_balance_date"],
    })) as HoaOrganization;
  },
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
    // The offline transaction, the charge's status, and the community's
    // permanent record of the payment all happen in one place —
    // core/server/api/org/payments/record.post.ts. An offline payment is the
    // one that later gets disputed, which is exactly why it needs the record.
    await $fetch("/api/org/payments/record", {
      method: "POST",
      body: { orgId: selectedOrgId.value, paymentRequestId: r.id },
    });
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
// Status is meaning, not decoration, so it rides the status tokens rather than
// a hand-picked palette pair per mode — one definition that is already proven
// against both grounds.
const STATUS_CLASS: Record<string, string> = {
  active: "bg-warning/15 text-warning",
  overdue: "bg-destructive/15 text-destructive",
  partially_paid: "bg-info/15 text-info",
  paid: "bg-success/15 text-success",
  canceled: "t-bg-subtle t-text-muted",
  draft: "t-bg-subtle t-text-muted",
};
// Columns. The identity column (who, or what happened) stays on the phone; the
// rest is context and folds away, so a charge is still readable one-handed.
const activityColumns = [
  { key: "kind", label: "", class: "w-10" },
  { key: "label", label: "Activity" },
  { key: "date", label: "Date", hideOnMobile: true, class: "whitespace-nowrap" },
  { key: "amount", label: "Amount", align: "right" as const, class: "tabular-nums" },
];

const chargeColumns = [
  { key: "member", label: "Member", sortable: true, value: (r: any) => memberName(r.member) },
  { key: "title", label: "Charge", sortable: true },
  { key: "due_date", label: "Due", sortable: true, hideOnMobile: true },
  { key: "amount", label: "Amount", align: "right" as const, sortable: true, class: "tabular-nums" },
  { key: "status", label: "Status", sortable: true },
  { key: "actions", label: "Actions", align: "right" as const },
];

const scheduleColumns = [
  { key: "member", label: "Member", sortable: true, value: (r: any) => memberName(r.member) },
  { key: "title", label: "Title", sortable: true },
  { key: "frequency", label: "Frequency", hideOnMobile: true },
  { key: "next_payment_date", label: "Next", sortable: true, hideOnMobile: true },
  { key: "amount", label: "Amount", align: "right" as const, sortable: true, class: "tabular-nums" },
  { key: "status", label: "Status", hideOnMobile: true },
  { key: "actions", label: "Actions", align: "right" as const },
];

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
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-semibold t-text">Finances</h1>
          <PaymentStripeModeBadge />
        </div>
        <Button class="rounded-full" @click="showNew = !showNew">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
          New charge
        </Button>
      </div>

      <!-- The assistant's advisory strip: what needs looking at here, and
           anything waiting for a decision. Self-hides when it has nothing. -->
      <DirectorLayer />

      <!-- Stats -->
      <div class="grid grid-cols-2 gap-4">
        <div class="ios-card p-5">
          <p class="text-xs uppercase tracking-wide t-text-muted">Outstanding</p>
          <p class="text-2xl font-semibold tabular-nums t-text mt-1">{{ currency(totalOutstanding) }}</p>
        </div>
        <div class="ios-card p-5">
          <p class="text-xs uppercase tracking-wide t-text-muted">Collected</p>
          <!-- Status colour from the theme, not a raw palette class, so it
               follows light/dark like every other positive figure. -->
          <p class="text-2xl font-semibold tabular-nums mt-1" style="color: var(--success)">
            {{ currency(totalCollected) }}
          </p>
        </div>
      </div>

      <!--
        The two totals above say HOW MUCH. These say whether that is a healthy
        number: cash in against cash out over the year, and — the one a
        treasurer is actually asked — how long the outstanding money has been
        outstanding. $4,200 not yet due and $4,200 ninety days late read
        identically as a total and are completely different communities.
      -->
      <AdminMoneyGlance
        :charges="(requests as any[]) || []"
        :expenses="(expenses as any[]) || []"
        :loading="pending"
      />

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
          v-for="t in [{ key: 'overview', label: 'Overview' }, { key: 'charges', label: 'Charges' }, { key: 'recurring', label: 'Recurring' }, { key: 'reports', label: 'Reports' }]"
          :key="t.key"
          @click="tab = t.key as any"
          class="filter-pill"
          :class="{ 'filter-pill--active': tab === t.key }"
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
          <AppDataTable
            class="px-2 pb-2"
            :columns="activityColumns"
            :rows="recentActivity"
            :row-key="(a: any) => `${a.kind}-${a.date}-${a.label}`"
            empty-title="No activity yet"
            empty-description="Money in and out will appear here as it happens."
            empty-icon="lucide:arrow-left-right"
          >
            <template #cell-kind="{ row }">
              <span
                class="inline-flex items-center justify-center w-8 h-8 rounded-full"
                :class="row.kind === 'in' ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'"
              >
                <Icon :name="row.kind === 'in' ? 'lucide:arrow-down-left' : 'lucide:arrow-up-right'" class="w-4 h-4" />
              </span>
            </template>
            <template #cell-label="{ row }">
              <span class="t-text">{{ row.label }}</span>
              <span class="t-text-muted text-xs ml-2">{{ row.member }}</span>
            </template>
            <template #cell-date="{ value }">
              <span class="t-text-muted">{{ fdate(value as string) }}</span>
            </template>
            <template #cell-amount="{ row }">
              <span class="font-medium" :class="row.kind === 'in' ? 'text-success' : 'text-destructive'">
                {{ row.kind === 'in' ? '+' : '−' }}{{ currency(row.amount) }}
              </span>
            </template>
          </AppDataTable>
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
              class="filter-pill flex-shrink-0"
              :class="{ 'filter-pill--active': typeFilter === opt.key }"
            >{{ opt.label }}</button>
          </div>
          <div class="flex gap-1.5 ml-auto">
            <button
              v-for="opt in [{ key: 'outstanding', label: 'Outstanding' }, { key: 'paid', label: 'Paid' }, { key: 'all', label: 'All' }]"
              :key="opt.key"
              @click="statusFilter = opt.key as any"
              class="filter-pill"
              :class="{ 'filter-pill--active': statusFilter === opt.key }"
            >{{ opt.label }}</button>
          </div>
        </div>

        <div class="ios-card overflow-hidden px-2 pb-2">
          <AppDataTable
            :columns="chargeColumns"
            :rows="filtered"
            :loading="pending"
            :filtered="statusFilter !== 'all' || typeFilter !== 'all'"
            empty-title="No charges yet"
            empty-description="Create a charge to bill a member for dues, an assessment, or a fee."
            empty-icon="lucide:receipt"
          >
            <template #cell-member="{ value }">
              <span class="t-text">{{ value }}</span>
            </template>
            <template #cell-title="{ row }">
              <span class="t-text">{{ row.title }}</span>
              <span class="t-text-muted text-xs ml-2">{{ TYPE_LABEL[row.request_type as string] }}</span>
            </template>
            <template #cell-due_date="{ value }">
              <span class="t-text-muted">{{ fdate(value as string) }}</span>
            </template>
            <template #cell-amount="{ value }">
              <span class="font-medium t-text">{{ currency(value as number) }}</span>
            </template>
            <template #cell-status="{ value }">
              <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize" :class="STATUS_CLASS[value as string]">
                {{ value }}
              </span>
            </template>
            <template #cell-actions="{ row }">
              <div class="flex items-center justify-end gap-2">
                <template v-if="!['paid', 'canceled'].includes(row.status as string)">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    :disabled="markingId === row.id"
                    aria-label="Mark as paid"
                    title="Mark as paid"
                    @click="markPaid(row)"
                  >
                    <Icon v-if="markingId === row.id" name="lucide:loader-2" class="animate-spin" />
                    <Icon v-else name="lucide:check" />
                  </Button>
                  <Button variant="outline" size="icon-sm" aria-label="Cancel charge" title="Cancel charge" @click="cancelCharge(row)">
                    <Icon name="lucide:x" />
                  </Button>
                </template>
                <span v-else class="t-text-muted text-xs px-2">—</span>
              </div>
            </template>
          </AppDataTable>
        </div>
      </template>

      <!-- Recurring tab -->
      <template v-else-if="tab === 'recurring'">
        <div class="ios-card overflow-hidden px-2 pb-2">
          <AppDataTable
            :columns="scheduleColumns"
            :rows="schedules || []"
            empty-title="No recurring charges"
            empty-description="Set a charge to repeat and it will bill on its own from here."
            empty-icon="lucide:repeat"
          >
            <template #cell-member="{ value }">
              <span class="t-text">{{ value }}</span>
            </template>
            <template #cell-title="{ value }">
              <span class="t-text">{{ value }}</span>
            </template>
            <template #cell-frequency="{ value }">
              <span class="t-text-muted capitalize">{{ value }}</span>
            </template>
            <template #cell-next_payment_date="{ value }">
              <span class="t-text-muted">{{ fdate(value as string) }}</span>
            </template>
            <template #cell-amount="{ value }">
              <span class="font-medium t-text">{{ currency(value as number) }}</span>
            </template>
            <template #cell-status="{ value }">
              <span class="t-text-muted capitalize">{{ value }}</span>
            </template>
            <template #cell-actions="{ row }">
              <div class="flex items-center justify-end gap-2">
                <Button
                  v-if="row.status === 'active'"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Pause"
                  title="Pause"
                  @click="setScheduleStatus(row, 'paused')"
                >
                  <Icon name="lucide:pause" />
                </Button>
                <Button
                  v-else-if="row.status === 'paused'"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Resume"
                  title="Resume"
                  @click="setScheduleStatus(row, 'active')"
                >
                  <Icon name="lucide:play" />
                </Button>
                <Button
                  v-if="row.status !== 'canceled'"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Cancel"
                  title="Cancel"
                  @click="setScheduleStatus(row, 'canceled')"
                >
                  <Icon name="lucide:x" />
                </Button>
              </div>
            </template>
          </AppDataTable>
        </div>
      </template>

      <!-- Reports tab -->
      <template v-else-if="tab === 'reports'">
        <PaymentFinancialsReport
          :requests="requests || []"
          :expenses="expenses || []"
          :members="members || []"
          :organization="orgBalance || null"
        />
      </template>
    </PageContainer>
  </div>
</template>

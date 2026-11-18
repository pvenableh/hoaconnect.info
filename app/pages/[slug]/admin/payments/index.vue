<script setup lang="ts">
import type { HoaMember, HoaOrganization, PaymentRequest, PaymentSchedule } from "#core/types/directus";
import { isCountedExpense } from "#core/shared/expenses/expense-writes";
import { toast } from "vue-sonner";
import { formatCalendarDay } from "#core/shared/calendar-day";
import type { ChargeRow } from "#core/app/composables/useMoneyReads";
import type { ChargeSheetMode } from "#core/app/composables/useChargesResource";

// nav-gate: admins, and every board seat (money:read).
// New charges, recurring charges and Mark paid are admin-only on the server,
// so `canWrite` hides them. Nobody cancels a charge directly: Ask to waive
// (money:enter: admins and every board seat) sends it to the board for
// approval, like spending (docs/spec-money-approvals.md). Corrections
// (docs/spec-charge-corrections.md): Edit and Withdraw are an admin's
// (`canCorrect`); Ask to Waive part of it, and Move, go to the board.
definePageMeta({
  middleware: ["nav-gate", "subscription"],
  layout: "auth",
});
const { isAdminOfCurrentDomain: canWrite } = useCurrentDomainAccess();

const { selectedOrgId } = await useSelectedOrg();
// Reads come from the server (admin or money:read); writes stay admin-only.
const { update: updateSchedule } = useDirectusItems<PaymentSchedule>("payment_schedules");
const money = useMoneyReads();
const { list: listMembers } = useDirectusItems<HoaMember>("hoa_members");
const { get: getOrganization } = useDirectusItems<HoaOrganization>("hoa_organizations");
const { list: listExpenses } = useExpenses();
const { buildOrgPath } = useOrgNavigation();

const tab = ref<"overview" | "charges" | "recurring" | "reports">("overview");
const TABS = [
  { value: "overview", label: "Overview" },
  { value: "charges", label: "Charges" },
  { value: "recurring", label: "Recurring" },
  { value: "reports", label: "Reports" },
];

// --- Data ---------------------------------------------------------------
// Charges are a resource (docs/spec-resource-scaffold.md): the index below and
// the charge panel share these rows, read through /api/org/money/charges.
const { resource: charges, markPaid, markingId, withdraw, waivingId, canEnter, canCorrect } = useChargesResource(selectedOrgId);
// One correction sheet (Edit, Ask to Waive, Move), opened from a row's menu.
const sheet = ref<{ open: boolean; mode: ChargeSheetMode; charge: ChargeRow | null }>({ open: false, mode: "edit", charge: null });
const openSheet = (mode: ChargeSheetMode, charge: ChargeRow) => (sheet.value = { open: true, mode, charge });
const requests = computed(() => charges.rows);

const { data: schedules, refresh: refreshSchedules } = await useAsyncData(
  `admin-schedules-${selectedOrgId.value}`,
  async () => {
    if (!selectedOrgId.value) return [];
    return money.listSchedules(selectedOrgId.value, { limit: 200 });
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

const { data: allExpenses } = await useAsyncData(
  `admin-payments-expenses-${selectedOrgId.value}`,
  () => listExpenses(selectedOrgId.value || undefined),
  { watch: [selectedOrgId], server: false }
);
// What went out or is committed, as the Expenses page totals it: a draft, a
// rejection or a void is not money spent.
const expenses = computed(() => (allExpenses.value || []).filter(isCountedExpense));

// Opening balance (Settings → Payments) — seeds the running balance in Reports.
// Fetched here rather than off useSelectedOrg's membership payload, which
// carries a fixed field list shared by every page.
const { data: orgBalance } = await useAsyncData(
  `admin-payments-opening-balance-${selectedOrgId.value}`,
  async () => {
    if (!selectedOrgId.value) return null;
    return (await getOrganization(selectedOrgId.value, {
      fields: ["id", "name", "opening_balance", "opening_balance_date"],
    })) as HoaOrganization;
  },
  { watch: [selectedOrgId], server: false }
);

const memberName = chargeMemberName;

// --- Stats --------------------------------------------------------------
const totalOutstanding = computed(() =>
  requests.value
    .filter((r) => isOpenCharge(r))
    .reduce((s, r) => s + (r.amount_remaining ?? r.amount ?? 0), 0)
);
const totalCollected = computed(() =>
  requests.value.reduce((s, r) => s + (r.amount_paid ?? 0), 0)
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
  const income = requests.value
    .filter((r) => r.status === "paid" && r.paid_at)
    .map((r) => ({ kind: "in" as const, label: r.title, member: memberName(r.member), amount: r.amount_paid ?? r.amount ?? 0, date: r.paid_at as string }));
  const out = (expenses.value || [])
    .map((e) => ({ kind: "out" as const, label: e.title, member: e.vendor || "—", amount: e.amount || 0, date: (e.expense_date || e.date_created) as string }));
  return [...income, ...out]
    .filter((x) => x.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);
});

// --- New charge ---------------------------------------------------------
const showNew = ref(false);
const openNew = () => {
  if (!canWrite.value) return;
  showNew.value = true;
};
// "+ New → New Charge" and Spotlight land here with ?new=charge.
useCreateIntent("charge", openNew);

const onSaved = async (kind: "charge" | "schedule") => {
  showNew.value = false;
  if (kind === "schedule") {
    await refreshSchedules();
    tab.value = "recurring";
  } else {
    await charges.refresh();
  }
};

// --- Row actions --------------------------------------------------------
const setScheduleStatus = async (s: PaymentSchedule, status: PaymentSchedule["status"]) => {
  try {
    await updateSchedule(s.id, { status } as Partial<PaymentSchedule>);
    await refreshSchedules();
  } catch (e: any) {
    toast.error(e?.message || "Failed to update schedule");
  }
};

// --- Formatting ---------------------------------------------------------
const currency = chargeCurrency;
// A due date is a calendar day, not a moment: shown as written, never a day
// early west of UTC (core/shared/calendar-day.ts). Timestamps stay local.
const fdate = (d?: string | null) => formatCalendarDay(d);

// Columns. The identity column (who, or what happened) stays on the phone; the
// rest is context and folds away, so a charge is still readable one-handed.
const activityColumns = [
  { key: "kind", label: "", class: "w-10" },
  { key: "label", label: "Activity" },
  { key: "date", label: "Date", hideOnMobile: true, class: "whitespace-nowrap" },
  { key: "amount", label: "Amount", align: "right" as const, class: "tabular-nums" },
];

const chargeColumns = [
  { key: "member", label: "Member", sortable: true, value: (r: PaymentRequest) => memberName(r.member) },
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
  { value: "all", label: "All types" },
  { value: "monthly_dues", label: "Monthly Dues" },
  { value: "assessment", label: "Assessment" },
  { value: "late_fee", label: "Late Fee" },
  { value: "other", label: "Other" },
];
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <AppPageHeader title="Finances">
        <template #meta>
          <PaymentStripeModeBadge />
        </template>
        <template v-if="canWrite" #actions>
          <Button class="rounded-full" @click="openNew">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
            New charge
          </Button>
        </template>
      </AppPageHeader>

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
        :charges="(requests as any[])"
        :expenses="(expenses as any[]) || []"
        :loading="charges.pending"
      />

      <!-- Views -->
      <div class="flex flex-wrap items-center gap-2">
        <AppSegmentedControl v-model="tab" :items="TABS" label="Finances views" />
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

      <!-- Charges tab: the resource index (plan §2.3). -->
      <AppResourceIndex
        v-else-if="tab === 'charges'"
        :resource="charges"
        :columns="chargeColumns"
        :noun="{ one: 'charge', other: 'charges' }"
        :can-create="canWrite"
        create-label="New charge"
        search-placeholder="Search member or charge"
        empty-title="No charges yet"
        empty-description="Create a charge to bill a member for dues, an assessment, or a fee."
        empty-icon="lucide:receipt"
        @create="openNew"
      >
        <template #filters>
          <Select v-model="charges.filters.type">
            <SelectTrigger class="w-40 rounded-full" aria-label="Charge type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in TYPE_FILTERS" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
            </SelectContent>
          </Select>
        </template>
        <template #cell-member="{ value }">
          <span class="t-text">{{ value }}</span>
        </template>
        <template #cell-title="{ row }">
          <span class="t-text">{{ row.title }}</span>
          <span class="t-text-muted text-xs ml-2">{{ CHARGE_TYPE_LABEL[row.request_type as string] }}</span>
        </template>
        <template #cell-due_date="{ value }">
          <span class="t-text-muted">{{ fdate(value as string) }}</span>
        </template>
        <template #cell-amount="{ value }">
          <span class="font-medium t-text">{{ currency(value as number) }}</span>
        </template>
        <template #cell-status="{ row }">
          <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize" :class="CHARGE_STATUS_CLASS[chargeStatusOf(row)]">
            {{ chargeStatusOf(row) }}
          </span>
        </template>
        <template #cell-actions="{ row }">
          <!-- A control here must not also open the row. -->
          <div class="flex items-center justify-end gap-2" @click.stop @keydown.stop>
            <span v-if="pendingLabel(row)" class="text-xs t-text-muted px-2">{{ pendingLabel(row) }}</span>
            <Button
              v-if="canWrite && isOpenCharge(row)"
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
            <DropdownMenu v-if="hasChargeMenu(row, canEnter, canCorrect)">
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon-sm" aria-label="More actions" title="More actions">
                  <Icon name="lucide:more-horizontal" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem v-if="canEditCharge(row, canCorrect)" @click="openSheet('edit', row)">
                  <Icon name="lucide:pencil" class="w-4 h-4 mr-2" />
                  Edit Charge
                </DropdownMenuItem>
                <DropdownMenuItem v-if="canAskToWaive(row, canEnter)" :disabled="waivingId === row.id" @click="openSheet('waive', row)">
                  <Icon name="lucide:hand-coins" class="w-4 h-4 mr-2" />
                  Ask to Waive
                </DropdownMenuItem>
                <DropdownMenuItem v-if="canMoveCharge(row, canEnter)" :disabled="waivingId === row.id" @click="openSheet('move', row)">
                  <Icon name="lucide:arrow-right-left" class="w-4 h-4 mr-2" />
                  Move to Another Household
                </DropdownMenuItem>
                <DropdownMenuItem v-if="canWithdrawCharge(row, canCorrect)" :disabled="waivingId === row.id" class="text-destructive" @click="withdraw(row)">
                  <Icon name="lucide:undo-2" class="w-4 h-4 mr-2" />
                  Withdraw Charge
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span
              v-if="!pendingLabel(row) && !(canWrite && isOpenCharge(row)) && !hasChargeMenu(row, canEnter, canCorrect)"
              class="t-text-muted text-xs px-2"
            >—</span>
          </div>
        </template>
      </AppResourceIndex>

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
              <div v-if="canWrite" class="flex items-center justify-end gap-2">
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
          :requests="requests"
          :expenses="expenses || []"
          :members="members || []"
          :organization="orgBalance || null"
        />
      </template>
    </PageContainer>

    <PaymentChargeCorrectionSheet v-model:open="sheet.open" :mode="sheet.mode" :charge="sheet.charge" :org-id="selectedOrgId" />

    <AppBottomSheet v-if="canWrite" v-model:open="showNew" title="New charge" size="lg">
      <PaymentChargeForm :org-id="selectedOrgId" :members="members || []" @saved="onSaved" @cancel="showNew = false" />
    </AppBottomSheet>
  </div>
</template>

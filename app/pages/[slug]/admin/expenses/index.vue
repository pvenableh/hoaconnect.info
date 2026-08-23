<script setup lang="ts">
import type { PaymentExpense } from "#core/types/directus";
import type { ProjectRow } from "#core/app/composables/useProjects";
import { toast } from "vue-sonner";

definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { selectedOrgId } = await useSelectedOrg();
const { list, create, update, remove, uploadReceipt, EXPENSE_CATEGORIES, EXPENSE_STATUSES } = useExpenses();
const { getUrl } = useDirectusFiles();
const { list: listProjects } = useProjects();

// Projects available to tag an expense against (for the budget rollup).
const { data: projectOptions } = await useAsyncData(
  `expense-projects-${selectedOrgId.value}`,
  () => listProjects().catch(() => [] as ProjectRow[]),
  { watch: [selectedOrgId], server: false, default: () => [] as ProjectRow[] }
);
const projectName = (id: string | null | undefined) =>
  projectOptions.value?.find((p) => p.id === id)?.title || null;

const { data: expenses, pending, refresh } = await useAsyncData(
  `admin-expenses-${selectedOrgId.value}`,
  () => list(selectedOrgId.value || undefined),
  { watch: [selectedOrgId], server: false }
);

// --- Filters ------------------------------------------------------------
const categoryFilter = ref<string>("all");
const filtered = computed(() => {
  let rows = expenses.value || [];
  if (categoryFilter.value !== "all") rows = rows.filter((e) => e.category === categoryFilter.value);
  return rows;
});

const total = computed(() => filtered.value.reduce((s, e) => s + (e.amount || 0), 0));

// --- Form (create / edit) ----------------------------------------------
const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const receiptFile = ref<File | null>(null);

const blank = () => ({
  title: "", vendor: "", category: "other" as PaymentExpense["category"],
  status: "draft" as PaymentExpense["status"], amount: null as number | null,
  expense_date: "", paid_date: "", description: "", notes: "",
  receipt: null as string | null, project: "" as string,
});
const form = ref(blank());

// The status the row had when the form was opened. `paid` is the one status
// this screen does not write itself — see the save handler below.
const originalStatus = ref<PaymentExpense["status"] | null>(null);

const openCreate = () => { editingId.value = null; originalStatus.value = null; form.value = blank(); receiptFile.value = null; showForm.value = true; };
const openEdit = (e: PaymentExpense) => {
  editingId.value = e.id;
  originalStatus.value = e.status || "draft";
  form.value = {
    title: e.title || "", vendor: e.vendor || "", category: e.category || "other",
    status: e.status || "draft", amount: e.amount ?? null,
    expense_date: e.expense_date ? e.expense_date.slice(0, 10) : "",
    paid_date: e.paid_date ? e.paid_date.slice(0, 10) : "",
    description: e.description || "", notes: e.notes || "",
    receipt: typeof e.receipt === "object" ? (e.receipt as any)?.id : (e.receipt as string) || null,
    project: (typeof e.project === "object" ? (e.project as any)?.id : (e.project as string)) || "",
  };
  receiptFile.value = null;
  showForm.value = true;
};

const canSave = computed(() => !!form.value.title.trim() && (form.value.amount || 0) > 0);

const save = async () => {
  if (!canSave.value || !selectedOrgId.value) return;
  saving.value = true;
  try {
    let receiptId = form.value.receipt;
    if (receiptFile.value) {
      receiptId = await uploadReceipt(receiptFile.value);
    }
    // Marking an expense paid is the outcome the Community Ledger records, and
    // core/server/api/org/expenses/record.post.ts owns that transition. The form
    // saves everything else and hands the row over as `approved`; the route
    // makes it paid and writes the entry. An expense that was ALREADY paid keeps
    // its status here, so editing a typo does not spend the money twice.
    const wasPaid = originalStatus.value === "paid";
    const becomingPaid = form.value.status === "paid" && !wasPaid;

    const payload: Partial<PaymentExpense> = {
      title: form.value.title.trim(),
      vendor: form.value.vendor || null,
      category: form.value.category,
      status: becomingPaid ? "approved" : form.value.status,
      amount: form.value.amount,
      expense_date: form.value.expense_date || null,
      paid_date: form.value.paid_date || null,
      description: form.value.description || null,
      notes: form.value.notes || null,
      receipt: receiptId || null,
      project: form.value.project || null,
    };
    let expenseId = editingId.value;
    if (editingId.value) {
      await update(editingId.value, payload);
    } else {
      const created = (await create(payload, selectedOrgId.value)) as any;
      expenseId = created?.id ?? null;
    }

    if (becomingPaid && expenseId) {
      await $fetch("/api/org/expenses/record", {
        method: "POST",
        body: {
          orgId: selectedOrgId.value,
          expenseId,
          paidDate: form.value.paid_date || null,
        },
      });
    }
    toast.success(editingId.value ? "Expense updated" : "Expense added");
    showForm.value = false;
    await refresh();
  } catch (e: any) {
    console.error("Failed to save expense:", e);
    toast.error(e?.message || "Failed to save expense");
  } finally {
    saving.value = false;
  }
};

const removeExpense = async (e: PaymentExpense) => {
  try {
    await remove(e.id);
    toast.success("Expense deleted");
    await refresh();
  } catch (err: any) {
    toast.error(err?.message || "Failed to delete");
  }
};

const onFile = (ev: Event) => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  receiptFile.value = f || null;
};

const receiptUrl = (e: PaymentExpense) => {
  const id = typeof e.receipt === "object" ? (e.receipt as any)?.id : e.receipt;
  return id ? getUrl(id) : null;
};

// --- Formatting ---------------------------------------------------------
const currency = (v?: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
const fdate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const CAT_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]));
const STATUS_CLASS: Record<string, string> = {
  draft: "t-bg-subtle t-text-muted",
  approved: "bg-info/15 text-info",
  paid: "bg-success/15 text-success",
};

// What the expense was stays on the phone; category, date and status are the
// kind of context you only read on a wide screen.
const expenseColumns = [
  { key: "title", label: "Expense", sortable: true },
  { key: "category", label: "Category", sortable: true, hideOnMobile: true },
  { key: "expense_date", label: "Date", sortable: true, hideOnMobile: true },
  { key: "amount", label: "Amount", align: "right" as const, sortable: true, class: "tabular-nums" },
  { key: "status", label: "Status", sortable: true },
  { key: "actions", label: "Actions", align: "right" as const },
];
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-2xl font-semibold t-text">Expenses</h1>
        <Button class="rounded-full" @click="openCreate">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
          Add expense
        </Button>
      </div>

      <div class="ios-card p-5">
        <p class="text-xs uppercase tracking-wide t-text-muted">{{ categoryFilter === 'all' ? 'Total' : CAT_LABEL[categoryFilter] }}</p>
        <p class="text-2xl font-semibold tabular-nums t-text mt-1">{{ currency(total) }}</p>
      </div>

      <!-- Form -->
      <div v-if="showForm" class="ios-card p-6 space-y-4">
        <h2 class="font-semibold t-text">{{ editingId ? "Edit expense" : "Add expense" }}</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5 md:col-span-2">
            <Label>Title</Label>
            <Input v-model="form.title" placeholder="e.g. Landscaping — October" />
          </div>
          <div class="space-y-1.5">
            <Label>Vendor</Label>
            <Input v-model="form.vendor" placeholder="Payee" />
          </div>
          <div class="space-y-1.5">
            <Label>Amount</Label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 t-text-muted">$</span>
              <Input v-model.number="form.amount" type="number" min="0" step="0.01" placeholder="0.00" class="pl-7" />
            </div>
          </div>
          <div class="space-y-1.5">
            <Label>Category</Label>
            <select v-model="form.category" class="w-full px-3 py-2 border rounded-md bg-background">
              <option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label>Status</Label>
            <select v-model="form.status" class="w-full px-3 py-2 border rounded-md bg-background">
              <option v-for="s in EXPENSE_STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label>Expense date</Label>
            <Input v-model="form.expense_date" type="date" />
          </div>
          <div class="space-y-1.5">
            <Label>Paid date</Label>
            <Input v-model="form.paid_date" type="date" />
          </div>
          <div v-if="projectOptions?.length" class="space-y-1.5 md:col-span-2">
            <Label>Project <span class="t-text-muted font-normal">(optional — rolls into the project's budget)</span></Label>
            <select v-model="form.project" class="w-full px-3 py-2 border rounded-md bg-background">
              <option value="">No project</option>
              <option v-for="p in projectOptions" :key="p.id" :value="p.id">{{ p.title }}</option>
            </select>
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <Label>Description</Label>
            <Input v-model="form.description" placeholder="What was this for?" />
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <Label>Receipt / invoice</Label>
            <input type="file" accept="image/*,application/pdf" class="block w-full text-sm t-text-muted" @change="onFile" />
            <p v-if="form.receipt && !receiptFile" class="text-xs t-text-muted">A receipt is already attached. Choosing a new file replaces it.</p>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="outline" class="rounded-full" @click="showForm = false">Cancel</Button>
          <Button class="rounded-full" :disabled="!canSave || saving" @click="save">
            <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
            {{ editingId ? "Save changes" : "Add expense" }}
          </Button>
        </div>
      </div>

      <!-- Category filter -->
      <div class="flex gap-1.5 overflow-x-auto">
        <button
          v-for="opt in [{ value: 'all', label: 'All' }, ...EXPENSE_CATEGORIES]"
          :key="opt.value"
          @click="categoryFilter = opt.value"
          class="filter-pill flex-shrink-0"
          :class="{ 'filter-pill--active': categoryFilter === opt.value }"
        >{{ opt.label }}</button>
      </div>

      <!-- Table -->
      <div class="ios-card overflow-hidden px-2 pb-2">
        <AppDataTable
          :columns="expenseColumns"
          :rows="filtered"
          :loading="pending"
          :filtered="categoryFilter !== 'all'"
          empty-title="No expenses yet"
          empty-description="Record what the association spends and it shows up here and in Reports."
          empty-icon="lucide:receipt"
        >
          <template #cell-title="{ row }">
            <span class="t-text">{{ row.title }}</span>
            <span v-if="row.vendor" class="t-text-muted text-xs ml-2">{{ row.vendor }}</span>
            <span
              v-if="projectName(typeof row.project === 'object' ? (row.project as any)?.id : (row.project as string))"
              class="inline-flex items-center gap-1 t-bg-subtle rounded-full px-1.5 py-0.5 text-[10px] t-text-accent ml-2 align-middle"
            >
              <Icon name="lucide:rocket" class="w-2.5 h-2.5" />{{ projectName(typeof row.project === 'object' ? (row.project as any)?.id : (row.project as string)) }}
            </span>
          </template>
          <template #cell-category="{ value }">
            <span class="t-text-muted">{{ CAT_LABEL[value as string] }}</span>
          </template>
          <template #cell-expense_date="{ value }">
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
              <Button
                v-if="receiptUrl(row)"
                as="a"
                variant="outline"
                size="icon-sm"
                :href="receiptUrl(row)!"
                target="_blank"
                rel="noopener"
                aria-label="View receipt"
                title="View receipt"
              >
                <Icon name="lucide:paperclip" />
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Edit expense" title="Edit" @click="openEdit(row)">
                <Icon name="lucide:pencil" />
              </Button>
              <Button variant="destructive" size="icon-sm" aria-label="Delete expense" title="Delete" @click="removeExpense(row)">
                <Icon name="lucide:trash-2" />
              </Button>
            </div>
          </template>
        </AppDataTable>
      </div>
    </PageContainer>
  </div>
</template>

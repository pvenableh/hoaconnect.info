<script setup lang="ts">
import type { PaymentExpense } from "#core/types/directus";
import type { ProjectRow } from "#core/app/composables/useProjects";
import type { ExpenseRow } from "#core/app/composables/useExpenses";
import { isCountedExpense } from "#core/shared/expenses/expense-writes";
import { toast } from "vue-sonner";

// nav-gate: admins and every board seat (money:read). What anyone may DO to a
// row comes from the server (`row.actions`, docs/spec-money-approvals.md):
// every money:enter holder (admins, board seats, a manager with Projects)
// enters, submits, records paid and asks for voids. Approving is on the
// Approvals page, for the people the rule waits on. Nobody else sees a control.
definePageMeta({
  middleware: ["nav-gate", "subscription"],
  layout: "auth",
});

const { selectedOrgId } = await useSelectedOrg();
const { listWithViewer, create, update, remove, submit, voidExpense, uploadReceipt, attachReceipt, receiptHref, EXPENSE_CATEGORIES, EXPENSE_STATUSES } = useExpenses();
const { list: listProjects } = useProjects();
const { confirm, prompt } = useConfirm();

// Projects available to tag an expense against (for the budget rollup).
const { data: projectOptions } = await useAsyncData(
  `expense-projects-${selectedOrgId.value}`,
  () => listProjects().catch(() => [] as ProjectRow[]),
  { watch: [selectedOrgId], server: false, default: () => [] as ProjectRow[] }
);
const projectName = (id: string | null | undefined) =>
  projectOptions.value?.find((p) => p.id === id)?.title || null;

const { data, pending, refresh } = await useAsyncData(
  `admin-expenses-${selectedOrgId.value}`,
  () => listWithViewer(selectedOrgId.value || undefined),
  { watch: [selectedOrgId], server: false }
);
const expenses = computed<ExpenseRow[]>(() => data.value?.expenses ?? []);
const canEnter = computed(() => data.value?.canEnter === true);

// --- Filters ------------------------------------------------------------
const categoryFilter = ref<string>("all");
const filtered = computed(() => {
  let rows = expenses.value;
  if (categoryFilter.value !== "all") rows = rows.filter((e) => e.category === categoryFilter.value);
  return rows;
});

// What went out or is committed: not drafts, rejections or voids.
const total = computed(() => filtered.value.filter(isCountedExpense).reduce((s, e) => s + (e.amount || 0), 0));

// --- Form (create / edit) ----------------------------------------------
const showForm = ref(false);
const editing = ref<ExpenseRow | null>(null);
const saving = ref(false);
const receiptFile = ref<File | null>(null);

const blank = () => ({
  title: "", vendor: "", category: "other" as PaymentExpense["category"],
  amount: null as number | null, expense_date: "", description: "", notes: "",
  receipt: null as string | null, project: "" as string,
});
const form = ref(blank());

const openCreate = () => {
  if (!canEnter.value) return;
  editing.value = null;
  form.value = blank();
  receiptFile.value = null;
  showForm.value = true;
};
// "+ New → Log Expense" and Spotlight land here with ?new=expense.
useCreateIntent("expense", openCreate);
const idOf = (v: unknown): string | null => (v && typeof v === "object" ? (v as { id?: string }).id ?? null : (v as string | null)) || null;
const openEdit = (e: ExpenseRow) => {
  editing.value = e;
  form.value = {
    title: e.title || "", vendor: e.vendor || "", category: e.category || "other",
    amount: e.amount ?? null,
    expense_date: e.expense_date ? e.expense_date.slice(0, 10) : "",
    description: e.description || "", notes: e.notes || "",
    receipt: idOf(e.receipt), project: idOf(e.project) || "",
  };
  receiptFile.value = null;
  showForm.value = true;
};

/** A paid expense changes only its notes and receipt; the server refuses the rest. */
const paidLocked = computed(() => editing.value?.status === "paid");
/** Once it is with the board, these reshape it and start a new round. */
const withBoard = computed(() => ["submitted", "approved", "rejected"].includes(String(editing.value?.status)));
const isDraft = computed(() => !editing.value || editing.value.status === "draft");

const canSave = computed(() => !!form.value.title.trim() && (form.value.amount || 0) > 0);

const payload = async () => {
  let receiptId = form.value.receipt;
  // A saved expense takes its receipt straight away; a new one names it on create.
  if (receiptFile.value) {
    receiptId = editing.value
      ? await attachReceipt(editing.value.id, receiptFile.value, selectedOrgId.value || undefined)
      : await uploadReceipt(receiptFile.value);
  }
  if (paidLocked.value) return { notes: form.value.notes || null, receipt: receiptId || null };
  return {
    title: form.value.title.trim(),
    vendor: form.value.vendor || null,
    category: form.value.category,
    amount: form.value.amount ?? undefined,
    expense_date: form.value.expense_date || null,
    description: form.value.description || null,
    notes: form.value.notes || null,
    receipt: receiptId || null,
    project: form.value.project || null,
  };
};

/** Save Draft, Submit for Approval, or (once with the board) Save Changes. */
const save = async (andSubmit: boolean) => {
  if (!canSave.value || !selectedOrgId.value) return;
  saving.value = true;
  try {
    const body = await payload();
    if (!editing.value) {
      await create(body, { submit: andSubmit, orgId: selectedOrgId.value });
      toast.success(andSubmit ? "Sent to the board for approval" : "Draft saved");
    } else {
      const was = editing.value.status;
      const res = (await update(editing.value.id, body, selectedOrgId.value)) as { status?: string } | null;
      if (andSubmit && res?.status !== "submitted") await submit(editing.value.id, selectedOrgId.value);
      toast.success(
        andSubmit
          ? "Sent to the board for approval"
          : res?.status === "submitted" && was !== "draft"
            ? "Saved. It changed, so it goes back to the board."
            : "Expense updated"
      );
    }
    showForm.value = false;
    await refresh();
  } catch (e: any) {
    console.error("Failed to save expense:", e);
    toast.error(e?.data?.message || e?.message || "Failed to save expense");
  } finally {
    saving.value = false;
  }
};

// --- Row actions (only the ones `row.actions` names) --------------------
const can = (row: ExpenseRow, action: string) => (row.actions as string[] | undefined)?.includes(action) === true;
const busy = ref<string | null>(null);

const run = async (row: ExpenseRow, fn: () => Promise<unknown>, done: string) => {
  busy.value = row.id;
  try {
    await fn();
    toast.success(done);
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "That didn't work");
  } finally {
    busy.value = null;
  }
};

const submitRow = (row: ExpenseRow) => run(row, () => submit(row.id, selectedOrgId.value || undefined), "Sent to the board for approval");

const deleteRow = async (row: ExpenseRow) => {
  const ok = await confirm({ title: `Delete the draft “${row.title}”?`, body: "Only drafts can be deleted.", destructive: true });
  if (ok) await run(row, () => remove(row.id, selectedOrgId.value || undefined), "Draft deleted");
};

const voidRow = async (row: ExpenseRow) => {
  const atOnce = can(row, "void");
  const reason = await prompt({
    title: atOnce ? `Void “${row.title}”?` : `Ask the board to void “${row.title}”?`,
    body: atOnce
      ? "It stays on record as void."
      : "Voiding an approved or paid expense needs the board's approval, like spending does. You can't approve your own request.",
    label: "Why",
    multiline: true,
    required: true,
    maxLength: 1000,
    confirmLabel: atOnce ? "Void" : "Ask to Void",
    destructive: true,
  });
  if (reason === null) return;
  await run(row, () => voidExpense(row.id, reason, selectedOrgId.value || undefined), atOnce ? "Expense voided" : "Void sent to the board");
};

const paying = ref<ExpenseRow | null>(null);

// What /api/org/expenses/receipt takes (expense-receipts.ts).
const RECEIPT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const RECEIPT_MAX_BYTES = 4 * 1024 * 1024;

const onFile = (ev: Event) => {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0] || null;
  if (f && !RECEIPT_TYPES.includes(f.type)) {
    toast.error("A receipt has to be a PDF or a photo (JPEG, PNG or WebP).");
    input.value = "";
    receiptFile.value = null;
    return;
  }
  if (f && f.size > RECEIPT_MAX_BYTES) {
    toast.error("That file is over 4 MB. Save a smaller copy and try again.");
    input.value = "";
    receiptFile.value = null;
    return;
  }
  receiptFile.value = f;
};

// Through the server, by the expense (GET /api/org/expenses/[id]/receipt):
// it checks who reads the books, so every board seat and admin on this page
// opens it, and a receipt is never every member's.
const receiptUrl = (e: ExpenseRow) => (idOf(e.receipt) ? receiptHref(e.id, selectedOrgId.value || undefined) : null);

// --- Formatting ---------------------------------------------------------
const currency = (v?: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
const fdate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const CAT_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]));
const STATUS_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_STATUSES.map((s) => [s.value, s.label]));
const STATUS_CLASS: Record<string, string> = {
  draft: "t-bg-subtle t-text-muted",
  submitted: "bg-info/15 text-info",
  approved: "bg-info/15 text-info",
  rejected: "bg-destructive/15 text-destructive",
  paid: "bg-success/15 text-success",
  void: "t-bg-subtle t-text-muted line-through",
};

/** The approval line under the status: progress while open, or why it stalls. */
const approvalLine = (row: ExpenseRow): string | null => {
  const a = row.approval_summary;
  if (!a) return null;
  if (a.state === "pending") return a.progress;
  if (a.state === "cannot_approve") return "Cannot be approved";
  if (a.state === "rejected" && row.status === "paid") return "Rejected after payment";
  if (a.state === "approved" && row.status === "paid" && row.paid_without_approval) return "Approved after payment";
  return null;
};

const asRow = (r: unknown) => r as ExpenseRow;

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
      <AppPageHeader title="Expenses">
        <template #actions>
          <Button v-if="canEnter" class="rounded-full" @click="openCreate">
            <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
            Add Expense
          </Button>
        </template>
      </AppPageHeader>

      <div class="ios-card p-5">
        <p class="text-xs uppercase tracking-wide t-text-muted">{{ categoryFilter === 'all' ? 'Total' : CAT_LABEL[categoryFilter] }}</p>
        <p class="text-2xl font-semibold tabular-nums t-text mt-1">{{ currency(total) }}</p>
        <p class="text-xs t-text-muted mt-1">Submitted, approved and paid. Drafts, rejections and voids are left out.</p>
      </div>

      <!-- Form -->
      <div v-if="showForm && canEnter" class="ios-card p-6 space-y-4">
        <h2 class="font-semibold t-text">{{ editing ? "Edit expense" : "Add expense" }}</h2>
        <p v-if="withBoard" class="text-sm t-text-muted">
          Changing the amount, vendor or title sends it back to the board for a new round of approval, and you can't
          approve that round.
        </p>
        <p v-if="paidLocked" class="text-sm t-text-muted">
          A paid expense keeps its amount and details. You can change its notes and receipt. To correct it, void it and
          enter it again.
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5 md:col-span-2">
            <Label for="expense-title">Title</Label>
            <Input id="expense-title" v-model="form.title" :disabled="paidLocked" placeholder="e.g. Landscaping — October" />
          </div>
          <div class="space-y-1.5">
            <Label for="expense-vendor">Vendor</Label>
            <Input id="expense-vendor" v-model="form.vendor" :disabled="paidLocked" placeholder="Who is paid" />
          </div>
          <div class="space-y-1.5">
            <Label for="expense-amount">Amount</Label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 t-text-muted">$</span>
              <Input id="expense-amount" v-model.number="form.amount" :disabled="paidLocked" type="number" min="0" step="0.01" placeholder="0.00" class="pl-7" />
            </div>
          </div>
          <div class="space-y-1.5">
            <Label for="expense-category">Category</Label>
            <select id="expense-category" v-model="form.category" :disabled="paidLocked" class="w-full px-3 py-2 border rounded-md bg-background">
              <option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label for="expense-date">Expense date</Label>
            <DateInput id="expense-date" v-model="form.expense_date" :disabled="paidLocked" />
          </div>
          <div v-if="projectOptions?.length" class="space-y-1.5 md:col-span-2">
            <Label for="expense-project">Project <span class="t-text-muted font-normal">(optional — rolls into the project's budget)</span></Label>
            <select id="expense-project" v-model="form.project" :disabled="paidLocked" class="w-full px-3 py-2 border rounded-md bg-background">
              <option value="">No project</option>
              <option v-for="p in projectOptions" :key="p.id" :value="p.id">{{ p.title }}</option>
            </select>
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <Label for="expense-description">Description</Label>
            <Input id="expense-description" v-model="form.description" :disabled="paidLocked" placeholder="What is this for?" />
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <Label for="expense-notes">Notes</Label>
            <Input id="expense-notes" v-model="form.notes" placeholder="Invoice number, anything the board should know" />
          </div>
          <div class="space-y-1.5 md:col-span-2">
            <Label>Receipt / invoice</Label>
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" class="block w-full text-sm t-text-muted" @change="onFile" />
            <p v-if="form.receipt && !receiptFile" class="text-xs t-text-muted">A receipt is already attached. Choosing a new file replaces it.</p>
          </div>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <Button variant="outline" class="rounded-full" @click="showForm = false">Cancel</Button>
          <template v-if="isDraft">
            <Button variant="outline" class="rounded-full" :disabled="!canSave || saving" @click="save(false)">Save Draft</Button>
            <Button class="rounded-full" :disabled="!canSave || saving" @click="save(true)">
              <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
              Submit for Approval
            </Button>
          </template>
          <Button v-else class="rounded-full" :disabled="!canSave || saving" @click="save(false)">
            <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
            Save Changes
          </Button>
        </div>
      </div>

      <!-- Category filter: a Select, as plan §2.3 asks of any filter but the one status filter -->
      <div>
        <Select v-model="categoryFilter">
          <SelectTrigger class="w-44 rounded-full" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in [{ value: 'all', label: 'All categories' }, ...EXPENSE_CATEGORIES]" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Table -->
      <div class="ios-card overflow-hidden px-2 pb-2">
        <AppDataTable
          :columns="expenseColumns"
          :rows="filtered"
          :loading="pending"
          :filtered="categoryFilter !== 'all'"
          empty-title="No expenses yet"
          empty-description="Record what the association spends. The board approves it, and it shows up here and in Reports."
          empty-icon="lucide:receipt"
        >
          <template #cell-title="{ row }">
            <span class="t-text">{{ row.title }}</span>
            <span v-if="row.vendor" class="t-text-muted text-xs ml-2">{{ row.vendor }}</span>
            <span
              v-if="projectName(idOf(row.project))"
              class="inline-flex items-center gap-1 t-bg-subtle rounded-full px-1.5 py-0.5 type-micro t-text-accent ml-2 align-middle"
            >
              <Icon name="lucide:rocket" class="w-2.5 h-2.5" />{{ projectName(idOf(row.project)) }}
            </span>
            <span v-if="row.paid_without_approval" class="inline-flex items-center gap-1 bg-warning/15 text-warning rounded-full px-2 py-0.5 text-xs font-medium ml-2 align-middle">
              <Icon name="lucide:alert-triangle" class="w-3 h-3" />Paid before approval
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
          <template #cell-status="{ row }">
            <div class="flex flex-col items-start gap-0.5">
              <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" :class="STATUS_CLASS[row.status as string]">
                {{ STATUS_LABEL[row.status as string] ?? row.status }}
              </span>
              <span v-if="approvalLine(asRow(row))" class="text-xs t-text-muted">{{ approvalLine(asRow(row)) }}</span>
              <span v-if="asRow(row).void_pending" class="text-xs t-text-muted">Void awaiting approval</span>
            </div>
          </template>
          <template #cell-actions="{ row }">
            <div class="flex flex-wrap items-center justify-end gap-2">
              <Button v-if="can(asRow(row), 'submit')" size="sm" variant="outline" :disabled="busy === row.id" @click="submitRow(asRow(row))">Submit</Button>
              <Button v-if="can(asRow(row), 'pay')" size="sm" variant="outline" :disabled="busy === row.id" @click="paying = asRow(row)">Record Paid</Button>
              <Button
                v-if="receiptUrl(asRow(row))"
                as="a"
                variant="outline"
                size="icon-sm"
                :href="receiptUrl(asRow(row))!"
                target="_blank"
                rel="noopener"
                aria-label="View receipt"
                title="View receipt"
              >
                <Icon name="lucide:paperclip" />
              </Button>
              <Button v-if="can(asRow(row), 'edit')" variant="outline" size="icon-sm" aria-label="Edit expense" title="Edit" @click="openEdit(asRow(row))">
                <Icon name="lucide:pencil" />
              </Button>
              <Button
                v-if="can(asRow(row), 'void') || can(asRow(row), 'ask_void')"
                variant="outline"
                size="icon-sm"
                :aria-label="can(asRow(row), 'void') ? 'Void expense' : 'Ask to void'"
                :title="can(asRow(row), 'void') ? 'Void' : 'Ask to void'"
                :disabled="busy === row.id"
                @click="voidRow(asRow(row))"
              >
                <Icon name="lucide:ban" />
              </Button>
              <Button v-if="can(asRow(row), 'delete')" variant="destructive" size="icon-sm" aria-label="Delete draft" title="Delete draft" :disabled="busy === row.id" @click="deleteRow(asRow(row))">
                <Icon name="lucide:trash-2" />
              </Button>
            </div>
          </template>
        </AppDataTable>
      </div>
    </PageContainer>

    <ExpensesPaySheet v-if="selectedOrgId" v-model:expense="paying" :org-id="selectedOrgId" @saved="refresh()" />
  </div>
</template>

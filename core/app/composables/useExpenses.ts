// useExpenses — the community's expenses (money out), through the server
// only (docs/spec-money-approvals.md). Reads: GET /api/org/expenses (admins and
// every board seat, money:read), with each row's approval progress and the
// actions the caller may take. Writes: money:enter (every board seat, an
// admin, a manager with the projects grant), one route per step of the
// lifecycle. No policy writes payment_expenses, and approving is not here: it
// is the Approvals page's, for the people the rule waits on.

import type { PaymentExpense } from "#core/types/directus";
import type { ExpenseAction } from "#core/shared/expenses/expense-writes";

export const EXPENSE_CATEGORIES = [
  { value: "maintenance", label: "Maintenance" },
  { value: "utilities", label: "Utilities" },
  { value: "insurance", label: "Insurance" },
  { value: "landscaping", label: "Landscaping" },
  { value: "admin", label: "Admin" },
  { value: "other", label: "Other" },
] as const;

export const EXPENSE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Awaiting approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
] as const;

export interface ExpenseApprovalSummary {
  id: string;
  state: "pending" | "approved" | "rejected" | "cannot_approve" | "superseded";
  round: number;
  mode: "committee" | "majority";
  needed: number;
  approvals: number;
  rejections: number;
  progress: string;
}

/** A row as GET /api/org/expenses sends it: the expense, its approval now, and what the caller may do. */
export interface ExpenseRow extends PaymentExpense {
  approval_summary: ExpenseApprovalSummary | null;
  void_pending: boolean;
  actions: ExpenseAction[];
  entered_by_name: string | null;
  paid_by_name: string | null;
}

/** The editable fields; status moves only through submit, pay, void and the board's decisions. */
export type ExpenseInput = Partial<
  Pick<PaymentExpense, "title" | "vendor" | "category" | "amount" | "expense_date" | "description" | "notes">
> & { receipt?: string | null; project?: string | null };

export function useExpenses() {
  const { selectedOrgId } = useSelectedOrgState();
  const org = (orgId?: string) => orgId || selectedOrgId.value || "";

  /** The org's expenses, newest first, and whether the caller may enter them. */
  const listWithViewer = async (orgId?: string): Promise<{ expenses: ExpenseRow[]; canEnter: boolean }> => {
    const id = org(orgId);
    if (!id) return { expenses: [], canEnter: false };
    const res = await $fetch<{ expenses: ExpenseRow[]; viewer?: { canEnter?: boolean } }>("/api/org/expenses", { query: { orgId: id } });
    return { expenses: res?.expenses ?? [], canEnter: res?.viewer?.canEnter === true };
  };

  /** The org's expenses, newest first (the Charges page's overview reads these). */
  const list = async (orgId?: string): Promise<ExpenseRow[]> => (await listWithViewer(orgId)).expenses;

  /** A new expense: a draft, or submitted for approval at once. */
  const create = (data: ExpenseInput, opts: { submit?: boolean; orgId?: string } = {}) =>
    $fetch<PaymentExpense>("/api/org/expenses", {
      method: "POST",
      body: { orgId: org(opts.orgId), expense: data, ...(opts.submit ? { submit: true } : {}) },
    });

  /** A change. Once submitted, a new amount, vendor or title starts a new approval round. */
  const update = (id: string, data: ExpenseInput, orgId?: string) =>
    $fetch<PaymentExpense>(`/api/org/expenses/${id}`, { method: "PATCH", body: { orgId: org(orgId), patch: data } });

  /** A draft only. */
  const remove = (id: string, orgId?: string) =>
    $fetch(`/api/org/expenses/${id}`, { method: "DELETE", query: { orgId: org(orgId) } });

  /** Send a draft (or a rejected expense) to the board for approval. */
  const submit = (id: string, orgId?: string) =>
    $fetch(`/api/org/expenses/${id}/submit`, { method: "POST", body: { orgId: org(orgId) } });

  /** Record that the money went out. Before approval it is flagged for good and the board is told. */
  const pay = (id: string, paid: { paidDate: string; reference: string }, orgId?: string) =>
    $fetch<{ paidWithoutApproval: boolean; recorded: boolean; recordError: string | null }>(`/api/org/expenses/${id}/pay`, {
      method: "POST",
      body: { orgId: org(orgId), ...paid },
    });

  /** Void it at once, or ask the board to (the server says which). */
  const voidExpense = (id: string, reason: string, orgId?: string) =>
    $fetch<{ voided: boolean }>(`/api/org/expenses/${id}/void`, { method: "POST", body: { orgId: org(orgId), reason } });

  /**
   * Store a receipt and return its file id: a PDF or a photo, 4 MB at most,
   * in the community's Records › Expense receipts folder
   * (core/server/api/org/expenses/receipt.post.ts). Throws with
   * the server's reason when it is refused.
   */
  const uploadReceipt = async (file: File): Promise<string> => {
    const form = new FormData();
    form.append("orgId", selectedOrgId.value || "");
    form.append("file", file, file.name);
    const res = await $fetch<{ id: string }>("/api/org/expenses/receipt", { method: "POST", body: form });
    return res.id;
  };

  /** Attach a receipt to a saved expense (POST /api/org/expenses/[id]/receipt). Returns the file's id. */
  const attachReceipt = async (id: string, file: File, orgId?: string): Promise<string> => {
    const form = new FormData();
    form.append("orgId", org(orgId) || "");
    form.append("file", file, file.name);
    const res = await $fetch<{ id: string }>(`/api/org/expenses/${id}/receipt`, { method: "POST", body: form });
    return res.id;
  };

  /**
   * Where a saved expense's receipt opens: through the server, which checks
   * money:read (every board seat, admins) and the community, never the file.
   */
  const receiptHref = (id: string, orgId?: string) => `/api/org/expenses/${id}/receipt?orgId=${encodeURIComponent(org(orgId) || "")}`;

  return { list, listWithViewer, create, update, remove, submit, pay, voidExpense, uploadReceipt, attachReceipt, receiptHref, EXPENSE_CATEGORIES, EXPENSE_STATUSES };
}

// useSelectedOrg is async (it awaits membership data); inside a composable we only
// need the reactive selected-org id, which is shared useState — read it directly
// to avoid awaiting here.
function useSelectedOrgState() {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  return { selectedOrgId: computed(() => selectedOrgId.value) };
}

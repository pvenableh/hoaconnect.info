// useExpenses — org-scoped CRUD for payment_expenses (Phase 7b, Track A).
// Money OUT: vendor bills, maintenance, utilities, etc. Reads go through the
// server (/api/org/expenses: admins and every board seat, money:read); writes
// are admin-only, through Directus (members have no access to the collection),
// plus a receipt-upload helper (useDirectusFiles).

import type { PaymentExpense } from "#core/types/directus";

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
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
] as const;

export function useExpenses() {
  const { selectedOrgId } = useSelectedOrgState();
  const items = useDirectusItems<PaymentExpense>("payment_expenses");
  const { upload } = useDirectusFiles();

  const money = useMoneyReads();

  /** The org's expenses, newest first, from the server (admin or money:read). */
  const list = async (orgId?: string): Promise<PaymentExpense[]> => {
    const org = orgId || selectedOrgId.value;
    if (!org) return [];
    return money.listExpenses(org);
  };

  const create = (data: Partial<PaymentExpense>, orgId?: string) =>
    items.create({ organization: orgId || selectedOrgId.value, ...data } as Partial<PaymentExpense>);

  const update = (id: string, data: Partial<PaymentExpense>) =>
    items.update(id, data as Partial<PaymentExpense>);

  const remove = (id: string) => items.remove(id);

  /** Upload a receipt file and return its Directus file id. */
  const uploadReceipt = async (file: File): Promise<string | null> => {
    const result: any = await upload(file, { title: file.name, tags: ["expense", "receipt"] });
    return result?.id ?? result?.data?.id ?? null;
  };

  return { list, create, update, remove, uploadReceipt, EXPENSE_CATEGORIES, EXPENSE_STATUSES };
}

// useSelectedOrg is async (it awaits membership data); inside a composable we only
// need the reactive selected-org id, which is shared useState — read it directly
// to avoid awaiting here.
function useSelectedOrgState() {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  return { selectedOrgId: computed(() => selectedOrgId.value) };
}

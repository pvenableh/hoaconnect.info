/**
 * useMoneyReads — the community's books, read through the server
 * (/api/org/money/*, /api/org/expenses), which admits admins and every board
 * seat (`money:read`, plan decision 16). Org-wide money is never read from
 * Directus on the client, so the Member policy can narrow to a member's own
 * charges. Writes are not here: they stay admin-only.
 */
import type { PaymentExpense, PaymentRequest, PaymentSchedule } from "#core/types/directus";

export function useMoneyReads() {
  const listCharges = async (orgId: string, opts: { limit?: number; view?: "glance" } = {}): Promise<PaymentRequest[]> => {
    const res = await $fetch<{ charges: PaymentRequest[] }>("/api/org/money/charges", {
      query: { orgId, ...opts },
    });
    return res?.charges ?? [];
  };

  const listSchedules = async (orgId: string, opts: { limit?: number } = {}): Promise<PaymentSchedule[]> => {
    const res = await $fetch<{ schedules: PaymentSchedule[] }>("/api/org/money/schedules", {
      query: { orgId, ...opts },
    });
    return res?.schedules ?? [];
  };

  const listExpenses = async (orgId: string, opts: { limit?: number } = {}): Promise<PaymentExpense[]> => {
    const res = await $fetch<{ expenses: PaymentExpense[] }>("/api/org/expenses", { query: { orgId, ...opts } });
    return res?.expenses ?? [];
  };

  return { listCharges, listSchedules, listExpenses };
}

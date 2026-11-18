/**
 * useMoneyReads — the community's books, read through the server
 * (/api/org/money/*, /api/org/expenses), which admits admins and every board
 * seat (`money:read`, plan decision 16). Org-wide money is never read from
 * Directus on the client, so the Member policy can narrow to a member's own
 * charges. Writes are not here: each is a route of its own.
 */
import type { PaymentExpense, PaymentRequest, PaymentSchedule } from "#core/types/directus";

/** A charge as the Charges page reads it: whether a waiver of it awaits approval. */
/**
 * A charge as the Charges read returns it: with what may be done to it now
 * (docs/spec-charge-corrections.md), decided on the server.
 */
export type ChargeRow = PaymentRequest & {
  waiver_pending?: boolean;
  /** A waive (with its cut, or null for all) or a move awaiting the board. */
  approval_pending?: { kind: "waive" | "move"; amount: number | null } | null;
  /** What its unpaid late fees come to. */
  late_fees_open?: number;
  /** Inside the 24-hour withdraw window. */
  withdrawable?: boolean;
  /** Nothing paid on it or its late fees, nothing waiting. */
  movable?: boolean;
  /** Why its due date cannot change now, or null. */
  due_date_lock?: string | null;
  withdrawn_by_name?: string | null;
};

export function useMoneyReads() {
  const listCharges = async (orgId: string, opts: { limit?: number; view?: "glance" } = {}): Promise<PaymentRequest[]> => {
    const res = await $fetch<{ charges: PaymentRequest[] }>("/api/org/money/charges", {
      query: { orgId, ...opts },
    });
    return res?.charges ?? [];
  };

  /**
   * The charges, whether the caller may ask to waive or move one
   * (money:enter), and whether they may edit or withdraw one (admins).
   */
  const listChargesWithViewer = async (
    orgId: string,
    opts: { limit?: number } = {}
  ): Promise<{ charges: ChargeRow[]; canEnter: boolean; canCorrect: boolean }> => {
    const res = await $fetch<{ charges: ChargeRow[]; viewer?: { canEnter?: boolean; canCorrect?: boolean } }>("/api/org/money/charges", {
      query: { orgId, ...opts },
    });
    return { charges: res?.charges ?? [], canEnter: res?.viewer?.canEnter === true, canCorrect: res?.viewer?.canCorrect === true };
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

  return { listCharges, listChargesWithViewer, listSchedules, listExpenses };
}

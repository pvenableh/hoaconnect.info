// useChargesResource — owner charges (`payment_requests`) as a resource
// (docs/spec-resource-scaffold.md): the definition `useResource` runs on, and
// its actions: Mark paid, Ask to waive, and the corrections
// (docs/spec-charge-corrections.md): Edit, Withdraw, Move.
//
// Reads go through GET /api/org/money/charges (admins and every board seat,
// `money:read`); nothing here reads or writes `payment_requests` through
// Directus. Mark paid is the server's (admins; pages hide it behind
// `canWrite`). Nobody cancels a charge directly: cancelling gives up income,
// so it is a waiver the board approves like spending
// (docs/spec-money-approvals.md). Ask to waive is for money:enter holders,
// which the read says (`canEnter`); a charge whose waiver awaits approval
// shows that instead.
//
// Corrections: an admin (`canCorrect`) edits the words, raises the amount or
// moves a due date before it is due (PATCH), and withdraws a fresh mistake
// within 24 hours. Lowering a charge is a partial waiver; the wrong household
// is a move. Both go to the board, asked by money:enter holders. Each row
// carries what the server would accept (`withdrawable`, `movable`,
// `due_date_lock`, `approval_pending`), so no control shows that would fail.
//
// Shared by the Charges index (`/admin/payments`) and its panel, which passes
// `reuse: true` so opening a charge over the index makes no second request.
import type { ChargeRow } from "./useMoneyReads";
import type { ResourceDefinition } from "./useResource";
import { useResource } from "./useResource";
import { useConfirm } from "./useConfirm";

export const CHARGE_TYPE_LABEL: Record<string, string> = {
  monthly_dues: "Monthly Dues",
  assessment: "Assessment",
  late_fee: "Late Fee",
  other: "Other",
};

// Status is meaning, not decoration, so it rides the status tokens rather than
// a hand-picked palette pair per mode — one definition that is already proven
// against both grounds.
export const CHARGE_STATUS_CLASS: Record<string, string> = {
  active: "bg-warning/15 text-warning",
  overdue: "bg-destructive/15 text-destructive",
  partially_paid: "bg-info/15 text-info",
  paid: "bg-success/15 text-success",
  canceled: "t-bg-subtle t-text-muted",
  withdrawn: "t-bg-subtle t-text-muted",
  draft: "t-bg-subtle t-text-muted",
};

/** The status a row shows: a withdrawn charge reads "withdrawn", not "canceled". */
export const chargeStatusOf = (r: Pick<ChargeRow, "status" | "withdrawn_at">) => (r.withdrawn_at ? "withdrawn" : String(r.status ?? ""));

/** A charge that still asks the member for money. */
export const isOpenCharge = (r: Pick<ChargeRow, "status">) => !["paid", "canceled"].includes(r.status as string);

/** A waiver or move of it awaits the board. */
export const hasPendingApproval = (r: ChargeRow) => !!r.approval_pending || !!r.waiver_pending;

/** What a row shows while the board decides: "Waiver of $50.00 awaiting approval". */
export function pendingLabel(r: ChargeRow): string | null {
  if (!isOpenCharge(r) || !hasPendingApproval(r)) return null;
  const p = r.approval_pending;
  if (p?.kind === "move") return "Move awaiting approval";
  return p?.amount != null ? `Waiver of ${chargeCurrency(p.amount)} awaiting approval` : "Waiver awaiting approval";
}

/** Ask to waive is offered: the caller may enter money, it is open, and nothing of it is waiting. */
export const canAskToWaive = (r: ChargeRow, canEnter: boolean) => canEnter && isOpenCharge(r) && !hasPendingApproval(r);

/** Move is offered: money:enter, open, nothing paid, nothing waiting (the server's `movable`). */
export const canMoveCharge = (r: ChargeRow, canEnter: boolean) => canEnter && isOpenCharge(r) && r.movable === true;

/** Edit is offered: an admin, on an open charge (the words stay free while the board decides). */
export const canEditCharge = (r: ChargeRow, canCorrect: boolean) => canCorrect && isOpenCharge(r);

/** Withdraw is offered: an admin, inside the 24-hour window (the server's `withdrawable`). */
export const canWithdrawCharge = (r: ChargeRow, canCorrect: boolean) => canCorrect && r.withdrawable === true;

/** The row's overflow menu has something in it. */
export const hasChargeMenu = (r: ChargeRow, canEnter: boolean, canCorrect: boolean) =>
  canEditCharge(r, canCorrect) || canWithdrawCharge(r, canCorrect) || canAskToWaive(r, canEnter) || canMoveCharge(r, canEnter);

export type ChargeSheetMode = "edit" | "waive" | "move";

export function chargeMemberName(m: unknown): string {
  const mm = m && typeof m === "object" ? (m as { first_name?: string; last_name?: string; email?: string }) : null;
  if (!mm) return "—";
  return [mm.first_name, mm.last_name].filter(Boolean).join(" ") || mm.email || "—";
}

export const chargeCurrency = (v?: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);

export function useChargesResource(orgId: Ref<string | null | undefined>, opts: { reuse?: boolean } = {}) {
  const money = useMoneyReads();
  // Shared with the panel (`reuse: true`), which makes no read of its own.
  const canEnter = useState<boolean>("charges:canEnter", () => false);
  const canCorrect = useState<boolean>("charges:canCorrect", () => false);

  const def: ResourceDefinition<ChargeRow> = {
    key: "charges",
    panel: "charge",
    load: async (id) => {
      const res = await money.listChargesWithViewer(id, { limit: 200 });
      canEnter.value = res.canEnter;
      canCorrect.value = res.canCorrect === true;
      return res.charges;
    },
    search: (r) => [chargeMemberName(r.member), r.title, CHARGE_TYPE_LABEL[r.request_type as string]],
    statuses: [
      { value: "outstanding", label: "Outstanding", match: isOpenCharge },
      { value: "paid", label: "Paid", match: (r) => r.status === "paid" },
      { value: "all", label: "All" },
    ],
    filters: {
      type: { initial: "all", match: (r, v) => r.request_type === v },
    },
  };

  const resource = useResource(def, { orgId, reuse: opts.reuse });

  // One id at a time, shared by the row and the panel, so a double click (or a
  // click in both) records one payment.
  const markingId = useState<string | null>("charges:marking", () => null);

  async function markPaid(r: ChargeRow) {
    if (markingId.value) return;
    markingId.value = r.id;
    const { toast } = await import("vue-sonner");
    try {
      // The offline transaction, the charge's status, and the community's
      // permanent record of the payment all happen in one place —
      // core/server/api/org/payments/record.post.ts. An offline payment is the
      // one that later gets disputed, which is exactly why it needs the record.
      await $fetch("/api/org/payments/record", {
        method: "POST",
        body: { orgId: orgId.value, paymentRequestId: r.id },
      });
      toast.success("Marked as paid");
      await resource.refresh();
    } catch (e) {
      console.error("Failed to mark paid:", e);
      toast.error((e as { message?: string })?.message || "Failed to mark paid");
    } finally {
      markingId.value = null;
    }
  }

  // One correction in flight at a time, shared by the row, the panel and the sheet.
  const waivingId = useState<string | null>("charges:waiving", () => null);
  const { prompt } = useConfirm();

  /** Run one write against a charge; toast the server's message on failure. True when it went through. */
  async function send(r: ChargeRow, url: string, method: "POST" | "PATCH", body: Record<string, unknown>, done: string): Promise<boolean> {
    if (waivingId.value) return false;
    waivingId.value = r.id;
    const { toast } = await import("vue-sonner");
    try {
      await $fetch(url, { method, body: { orgId: orgId.value, ...body } });
      toast.success(done);
      await resource.refresh();
      return true;
    } catch (e) {
      console.error(`Failed: ${method} ${url}`, e);
      toast.error((e as { data?: { message?: string } })?.data?.message || "That didn't go through. Try again.");
      return false;
    } finally {
      waivingId.value = null;
    }
  }

  /**
   * Ask the board to waive a charge, all that remains or part of it (an
   * `amount`), with a reason (required). Nothing changes on the charge until
   * the approval is met.
   */
  async function askWaive(r: ChargeRow, input: { reason: string; amount?: number | null }): Promise<boolean> {
    const reason = input.reason?.trim();
    if (!reason || !canAskToWaive(r, canEnter.value)) return false;
    const body: Record<string, unknown> = { reason };
    if (input.amount != null) body.amount = input.amount;
    return send(r, `/api/org/money/charges/${r.id}/waive`, "POST", body, "Sent to the board for approval");
  }

  /** Ask the board to move a charge to the household it belongs to. */
  async function askMove(r: ChargeRow, input: { member: string; reason: string }): Promise<boolean> {
    const reason = input.reason?.trim();
    if (!reason || !input.member || !canMoveCharge(r, canEnter.value)) return false;
    return send(r, `/api/org/money/charges/${r.id}/move`, "POST", { member: input.member, reason }, "Sent to the board for approval");
  }

  /** An admin's correction: only the fields given, and only those that differ, are sent. */
  async function saveCorrection(
    r: ChargeRow,
    input: { title?: string; description?: string | null; notes?: string | null; amount?: number; due_date?: string }
  ): Promise<boolean> {
    if (!canEditCharge(r, canCorrect.value)) return false;
    return send(r, `/api/org/money/charges/${r.id}`, "PATCH", input, "Charge updated");
  }

  /** Withdraw a fresh mistake, with a reason (required). */
  async function withdraw(r: ChargeRow): Promise<boolean> {
    if (waivingId.value || !canWithdrawCharge(r, canCorrect.value)) return false;
    const reason = await prompt({
      title: `Withdraw “${r.title}”?`,
      body: `${chargeMemberName(r.member)} will no longer owe ${chargeCurrency(r.amount_remaining ?? r.amount)}. You can withdraw a charge only within 24 hours of entering it, before anything is paid or reminded. It stays on record as withdrawn.`,
      label: "Why",
      multiline: true,
      required: true,
      maxLength: 1000,
      confirmLabel: "Withdraw Charge",
    });
    if (!reason?.trim()) return false;
    return send(r, `/api/org/money/charges/${r.id}/withdraw`, "POST", { reason: reason.trim() }, "Charge withdrawn");
  }

  return { resource, markPaid, markingId, askWaive, askMove, saveCorrection, withdraw, waivingId, canEnter, canCorrect };
}

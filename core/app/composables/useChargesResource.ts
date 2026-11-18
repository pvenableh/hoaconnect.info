// useChargesResource — owner charges (`payment_requests`) as a resource
// (docs/spec-resource-scaffold.md): the definition `useResource` runs on, and
// its two actions, Mark paid and Ask to waive.
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
  draft: "t-bg-subtle t-text-muted",
};

/** A charge that still asks the member for money. */
export const isOpenCharge = (r: Pick<ChargeRow, "status">) => !["paid", "canceled"].includes(r.status as string);

/** Ask to waive is offered: the caller may enter money, it is open, and no waiver of it is waiting. */
export const canAskToWaive = (r: ChargeRow, canEnter: boolean) => canEnter && isOpenCharge(r) && !r.waiver_pending;

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

  const def: ResourceDefinition<ChargeRow> = {
    key: "charges",
    panel: "charge",
    load: async (id) => {
      const res = await money.listChargesWithViewer(id, { limit: 200 });
      canEnter.value = res.canEnter;
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

  const waivingId = useState<string | null>("charges:waiving", () => null);
  const { prompt } = useConfirm();

  /**
   * Ask the board to waive a charge, with a reason (required). Nothing changes
   * on the charge until the approval is met; then the server cancels it.
   */
  async function askWaive(r: ChargeRow) {
    if (waivingId.value || !canAskToWaive(r, canEnter.value)) return;
    const reason = await prompt({
      title: `Ask to waive “${r.title}”?`,
      body: `${chargeMemberName(r.member)} would no longer owe ${chargeCurrency(r.amount_remaining ?? r.amount)}. Waiving gives up income the community is owed, so the board approves it like spending. You can't approve your own request.`,
      label: "Why",
      multiline: true,
      required: true,
      maxLength: 1000,
      confirmLabel: "Ask to Waive",
    });
    if (!reason?.trim()) return;
    waivingId.value = r.id;
    const { toast } = await import("vue-sonner");
    try {
      await $fetch(`/api/org/money/charges/${r.id}/waive`, {
        method: "POST",
        body: { orgId: orgId.value, reason: reason.trim() },
      });
      toast.success("Sent to the board for approval");
      await resource.refresh();
    } catch (e) {
      console.error("Failed to ask for a waiver:", e);
      toast.error((e as { data?: { message?: string } })?.data?.message || "Failed to ask for a waiver");
    } finally {
      waivingId.value = null;
    }
  }

  return { resource, markPaid, markingId, askWaive, waivingId, canEnter };
}

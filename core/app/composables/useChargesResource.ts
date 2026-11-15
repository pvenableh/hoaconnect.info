// useChargesResource — owner charges (`payment_requests`) as a resource
// (docs/spec-resource-scaffold.md): the definition `useResource` runs on, and
// the one next action, Mark paid.
//
// Reads go through GET /api/org/money/charges (admins and every board seat,
// `money:read`); nothing here reads `payment_requests` from Directus. Writes
// stay admin-only, as they were on the page: the server records a payment,
// Directus cancels a charge. Pages hide both behind `canWrite`.
//
// Shared by the Charges index (`/admin/payments`) and its panel, which passes
// `reuse: true` so opening a charge over the index makes no second request.
import type { PaymentRequest } from "#core/types/directus";
import type { ResourceDefinition } from "./useResource";
import { useResource } from "./useResource";

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
export const isOpenCharge = (r: Pick<PaymentRequest, "status">) => !["paid", "canceled"].includes(r.status as string);

export function chargeMemberName(m: unknown): string {
  const mm = m && typeof m === "object" ? (m as { first_name?: string; last_name?: string; email?: string }) : null;
  if (!mm) return "—";
  return [mm.first_name, mm.last_name].filter(Boolean).join(" ") || mm.email || "—";
}

export const chargeCurrency = (v?: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);

export function useChargesResource(orgId: Ref<string | null | undefined>, opts: { reuse?: boolean } = {}) {
  const money = useMoneyReads();
  const { update } = useDirectusItems<PaymentRequest>("payment_requests");

  const def: ResourceDefinition<PaymentRequest> = {
    key: "charges",
    panel: "charge",
    load: (id) => money.listCharges(id, { limit: 200 }),
    search: (r) => [chargeMemberName(r.member), r.title, CHARGE_TYPE_LABEL[r.request_type as string]],
    statuses: [
      { value: "outstanding", label: "Outstanding", match: isOpenCharge },
      { value: "paid", label: "Paid", match: (r) => r.status === "paid" },
      { value: "all", label: "All" },
    ],
    filters: {
      type: { initial: "all", match: (r, v) => r.request_type === v },
    },
    remove: {
      label: "Cancel Charge",
      confirm: (r) => ({
        title: `Cancel “${r.title}”?`,
        body: `${chargeMemberName(r.member)} will no longer owe ${chargeCurrency(r.amount_remaining ?? r.amount)}. The charge stays on record as canceled.`,
        confirmLabel: "Cancel Charge",
        cancelLabel: "Keep Charge",
        destructive: true,
      }),
      run: (r) => update(r.id, { status: "canceled" } as Partial<PaymentRequest>),
      done: "Charge canceled",
    },
  };

  const resource = useResource(def, { orgId, reuse: opts.reuse });

  // One id at a time, shared by the row and the panel, so a double click (or a
  // click in both) records one payment.
  const markingId = useState<string | null>("charges:marking", () => null);

  async function markPaid(r: PaymentRequest) {
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

  return { resource, markPaid, markingId };
}

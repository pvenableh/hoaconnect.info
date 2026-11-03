/**
 * "Payment received" (Earnest parity round 3, Phase 5b): the receipt a member
 * sees in their bell, and as a push, the moment a payment lands — online (the
 * Stripe webhook, autopay included) or recorded by an admin (an offline check).
 * Bell and push only: Stripe already emails its own receipt for online payments.
 *
 * Best-effort and silent about its own failure, like `recordPaymentInLedger`:
 * the payment is already booked, and a webhook that threw here would be one
 * Stripe retries for a step that is not the payment. A member with no app
 * account has nobody to tell.
 *
 * Callers are already exactly-once (the webhook's PaymentIntent guard; the
 * manual route's `paid` check), so this needs no key of its own.
 */
import { readItems } from "@directus/sdk";
import { notifyUsers } from "./notify";

const usd = (amount: number, currency: string | null | undefined) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
};

export function paymentReceivedMessage(amount: number, currency: string | null | undefined, label: string | null | undefined): string {
  const what = String(label ?? "").trim();
  return `We received your payment of ${usd(amount, currency)}${what && what.length <= 80 ? ` for ${what}` : ""}. Thank you.`;
}

export async function notifyPaymentReceived(
  directus: { request: (op: any) => Promise<any> },
  input: {
    organizationId: string | null;
    /** The `hoa_members` row that paid. */
    memberId: string | null;
    amount: number;
    currency?: string | null;
    /** What it was for ("November dues"). */
    label?: string | null;
  }
): Promise<boolean> {
  if (!input.organizationId || !input.memberId || !(input.amount > 0)) return false;
  try {
    const rows = (await directus.request(
      // Untyped: `directus` is whatever client the caller holds (the webhook's typed one, a test's fake).
      (readItems as any)("hoa_members", {
        filter: { id: { _eq: input.memberId }, organization: { _eq: input.organizationId } },
        fields: ["user"],
        limit: 1,
      })
    )) as Array<{ user?: string | { id?: string } | null }>;
    const raw = rows?.[0]?.user;
    const userId = typeof raw === "string" ? raw : raw?.id ? String(raw.id) : null;
    if (!userId) return false;

    await notifyUsers({
      organizationId: input.organizationId,
      recipientUserIds: [userId],
      category: "payment",
      subject: "Payment received",
      message: paymentReceivedMessage(input.amount, input.currency, input.label),
      path: "/payments",
      origin: (useRuntimeConfig().public.appUrl as string) || null,
    });
    return true;
  } catch (e) {
    console.warn("[payments] receipt notification failed:", (e as Error).message);
    return false;
  }
}

// GET /api/ops/payments — HOA Connect's charges, newest first. App Admin and Platform Support.
//
// Query: kind = "platform" (subscriptions, AI credit packs: what communities pay
// HOA Connect) or "dues" (residents paying their community through Connect);
// days = 7–90 (default 30).
//
// The Stripe account is Hue's and shared, so a charge shows only if it is ours:
// tagged, or on a customer the app has on record. Dues rows carry the community
// and the amount, never the resident's name, email or card (plan §3).
import type Stripe from "stripe";
import { requireOpsPermission } from "#core/server/utils/admin-auth";
import {
  loadOpsCommunities,
  opsCharges,
  opsSubscriptions,
  ourCustomerIds,
  stripeDashboardUrl,
} from "#core/server/utils/ops-data";
import { getStripe } from "#core/server/utils/stripe";
import { isDuesCharge, isOurStripeObject } from "#core/shared/ops/metrics";

export default defineEventHandler(async (event) => {
  await requireOpsPermission(event, "billing.read");
  const query = getQuery(event);
  const kind = query.kind === "dues" ? "dues" : "platform";
  const days = Math.min(90, Math.max(7, Math.floor(Number(query.days) || 30)));

  const { orgs, accounts } = await loadOpsCommunities();
  const stripe = getStripe();
  let subs: Awaited<ReturnType<typeof opsSubscriptions>>["subs"];
  let charges: Stripe.Charge[];
  let truncated: boolean;
  try {
    [{ subs }, { items: charges, truncated }] = await Promise.all([opsSubscriptions(stripe), opsCharges(days, stripe)]);
  } catch (e: any) {
    console.error("[ops/payments] Stripe read failed:", e?.message ?? e);
    throw createError({ statusCode: 502, message: "Stripe couldn't be read just now." });
  }

  const customers = ourCustomerIds(orgs, accounts.values(), subs);
  const orgByCustomer = new Map<string, { id: string; name: string }>();
  const orgByConnect = new Map<string, { id: string; name: string }>();
  const orgById = new Map<string, { id: string; name: string }>();
  for (const o of orgs) {
    const ref = { id: o.id, name: o.name || o.slug };
    orgById.set(o.id, ref);
    if (o.stripe_customer_id) orgByCustomer.set(o.stripe_customer_id, ref);
    if (o.stripe_connect_account_id) orgByConnect.set(o.stripe_connect_account_id, ref);
  }
  const accountByCustomer = new Map<string, { id: string; name: string }>();
  for (const a of accounts.values()) if (a.stripe_customer_id) accountByCustomer.set(a.stripe_customer_id, { id: a.id, name: a.name });

  const idOf = (v: unknown) => (v && typeof v === "object" ? (v as { id: string }).id : (v as string | null)) ?? null;

  const rows = charges
    .filter((c) => {
      const dues = isDuesCharge(c);
      if (kind === "dues") {
        const dest = idOf(c.transfer_data?.destination);
        return dues && (isOurStripeObject(c, customers) || (!!dest && orgByConnect.has(dest)));
      }
      return !dues && isOurStripeObject(c, customers);
    })
    .sort((a, b) => b.created - a.created)
    .map((c) => {
      const customer = idOf(c.customer);
      const dest = idOf(c.transfer_data?.destination);
      const metaOrg = typeof c.metadata?.organization_id === "string" ? orgById.get(c.metadata.organization_id) : undefined;
      const community =
        metaOrg ?? (dest ? orgByConnect.get(dest) : undefined) ?? (customer ? orgByCustomer.get(customer) : undefined) ?? null;
      const status = c.refunded ? "refunded" : c.amount_refunded ? "partially_refunded" : c.status;
      return {
        id: c.id,
        created: new Date(c.created * 1000).toISOString(),
        amount: c.amount,
        amountRefunded: c.amount_refunded ?? 0,
        currency: c.currency,
        status,
        failureMessage: c.status === "failed" ? c.failure_message ?? null : null,
        description: kind === "platform" ? c.description ?? null : null,
        community,
        billingAccount: kind === "platform" && customer ? accountByCustomer.get(customer) ?? null : null,
        stripeUrl: stripeDashboardUrl(`payments/${idOf(c.payment_intent) ?? c.id}`),
      };
    });

  const sum = (s: string) => rows.filter((r) => r.status === s).reduce((n, r) => n + r.amount, 0);
  return {
    kind,
    days,
    rows,
    truncated,
    totals: {
      count: rows.length,
      succeededCents: sum("succeeded") + sum("partially_refunded"),
      refundedCents: rows.reduce((n, r) => n + r.amountRefunded, 0),
      failed: rows.filter((r) => r.status === "failed").length,
    },
  };
});

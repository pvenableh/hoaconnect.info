// POST /api/ops/communities/:id/billing-contact — change who Stripe sends this
// community's invoices and receipts to (plan §5, Phase 2): the Stripe
// customer's email and name. App Admin (`billing.write`). For an agency-billed
// community it is the billing account's customer.
// Body: reason, requestId, confirmed, email, name?.
import { z } from "zod";
import { beginOpsAction, loadOpsCommunityBilling, opsStripeError, runOpsAction } from "#core/server/utils/ops-actions";
import { invalidateOpsCache } from "#core/server/utils/ops-data";
import { getStripe } from "#core/server/utils/stripe";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter an email address.").max(254),
  name: z.string().trim().max(200).optional(),
});

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, schema);
  const id = getRouterParam(event, "id") ?? "";

  return runOpsAction<{ email: string; name: string | null }>({
    actor,
    action: "billing_contact",
    targetId: id,
    body,
    perform: async (idempotencyKey) => {
      const c = await loadOpsCommunityBilling(id);
      if (!c.customerId) throw createError({ statusCode: 409, message: "There's no Stripe customer on record." });
      const stripe = getStripe();
      const customer = (await stripe.customers.retrieve(c.customerId).catch(opsStripeError)) as any;
      if (customer?.deleted) throw createError({ statusCode: 409, message: "That Stripe customer was deleted." });
      const before = { email: customer.email ?? null, name: customer.name ?? null };
      const name = body.name ? body.name : before.name;
      if (before.email === body.email && before.name === name) {
        return { result: { email: body.email, name }, unchanged: true as const };
      }
      await stripe.customers
        .update(c.customerId, { email: body.email, ...(body.name ? { name: body.name } : {}) }, { idempotencyKey })
        .catch(opsStripeError);
      invalidateOpsCache(`customer:${c.customerId}`);
      const whose = c.account ? `${c.account.name} (agency billing, includes ${c.org.name})` : c.org.name;
      return {
        result: { email: body.email, name },
        audit: {
          summary: `Changed ${whose}'s billing contact to ${body.email}.`,
          organization: c.org.id,
          organizationName: c.org.name,
          billingAccount: c.account?.id ?? null,
          stripe: { customer: c.customerId },
          before,
          after: { email: body.email, name },
        },
      };
    },
  });
});

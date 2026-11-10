// POST /api/ops/charges/:id/receipt — have Stripe email the receipt for an HOA
// Connect charge again (plan §5, Phase 2). Setting a charge's `receipt_email`
// makes Stripe send its receipt to that address (live mode; test mode sends
// none). App Admin (`billing.write`). Body: reason, requestId, confirmed,
// email? (default: the charge's receipt address, else the customer's email).
// Not for dues: a resident's receipt is the community's.
import { z } from "zod";
import { isHoaConnectObject } from "#core/shared/billing/stripe-app";
import { money } from "#core/shared/ops/format";
import { isDuesCharge } from "#core/shared/ops/metrics";
import { beginOpsAction, opsIdOf, opsStripeError, ownerOfCustomer, runOpsAction } from "#core/server/utils/ops-actions";
import { getStripe } from "#core/server/utils/stripe";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter an email address.").max(254).optional() });

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, schema);
  const chargeId = getRouterParam(event, "id") ?? "";
  if (!/^(ch|py)_[A-Za-z0-9]+$/.test(chargeId)) throw createError({ statusCode: 400, message: "Not a charge id." });

  return runOpsAction<{ sentTo: string }>({
    actor,
    action: "send_receipt",
    targetId: chargeId,
    body,
    perform: async (idempotencyKey) => {
      const stripe = getStripe();
      const charge = (await stripe.charges.retrieve(chargeId).catch(opsStripeError)) as any;
      if (isDuesCharge(charge)) throw createError({ statusCode: 409, message: "This is a resident's dues payment; its receipt is the community's." });
      const customerId = opsIdOf(charge.customer);
      const owner = customerId ? await ownerOfCustomer(customerId) : null;
      if (!owner && !isHoaConnectObject(charge.metadata)) throw createError({ statusCode: 404, message: "That isn't an HOA Connect charge." });
      if (charge.status !== "succeeded") throw createError({ statusCode: 409, message: "Only a successful charge has a receipt." });

      let to = body.email ?? charge.receipt_email ?? null;
      if (!to && customerId) {
        const customer = (await stripe.customers.retrieve(customerId).catch(opsStripeError)) as any;
        to = customer?.email ?? null;
      }
      if (!to) throw createError({ statusCode: 409, message: "There's no email address to send it to. Enter one." });

      await stripe.charges.update(chargeId, { receipt_email: to }, { idempotencyKey }).catch(opsStripeError);
      return {
        result: { sentTo: to },
        audit: {
          summary: `Emailed the receipt for a ${money(charge.amount, charge.currency)} charge to ${to}.`,
          organization: owner?.organization ?? null,
          organizationName: owner?.organization ? owner.name : null,
          billingAccount: owner?.billingAccount ?? null,
          stripe: { charge: chargeId, customer: customerId },
          amountCents: charge.amount,
          currency: charge.currency,
          after: { receipt_email: to },
        },
      };
    },
  });
});

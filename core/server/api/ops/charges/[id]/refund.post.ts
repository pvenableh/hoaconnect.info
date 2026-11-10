// POST /api/ops/charges/:id/refund — refund an HOA Connect charge, in full or in part.
// App Admin only (`billing.write`); Platform Support is refused before Stripe is called.
//
// Body: reason, requestId, confirmed, and optionally amountCents (default: all
// that's left) and typedAmount (required above $500, and must match).
//
// Only what communities pay HOA Connect: a resident's dues go to the community's
// own Connect account, and the community refunds those itself.
import { z } from "zod";
import { appMetadata, isHoaConnectObject } from "#core/shared/billing/stripe-app";
import { refundProblem } from "#core/shared/ops/actions";
import { money } from "#core/shared/ops/format";
import { isDuesCharge } from "#core/shared/ops/metrics";
import {
  beginOpsAction,
  opsIdOf,
  opsStripeError,
  ownerOfCustomer,
  runOpsAction,
} from "#core/server/utils/ops-actions";
import { getStripe } from "#core/server/utils/stripe";

const schema = z.object({
  amountCents: z.number().int("Enter whole cents.").positive("Enter an amount to refund.").optional(),
  typedAmount: z.string().max(32).optional(),
});

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, schema);
  const chargeId = getRouterParam(event, "id") ?? "";
  if (!/^(ch|py)_[A-Za-z0-9]+$/.test(chargeId)) throw createError({ statusCode: 400, message: "Not a charge id." });

  return runOpsAction({
    actor,
    action: "refund",
    targetId: chargeId,
    body,
    perform: async (idempotencyKey) => {
      const stripe = getStripe();
      const charge = await stripe.charges.retrieve(chargeId).catch(opsStripeError);
      if (isDuesCharge(charge)) {
        throw createError({
          statusCode: 409,
          message: "This is a resident's dues payment. The community refunds dues itself.",
        });
      }
      const customerId = opsIdOf(charge.customer);
      const owner = customerId ? await ownerOfCustomer(customerId) : null;
      if (!owner && !isHoaConnectObject(charge.metadata)) {
        throw createError({ statusCode: 404, message: "That isn't an HOA Connect charge." });
      }
      if (charge.status !== "succeeded") {
        throw createError({ statusCode: 409, message: "Only a successful charge can be refunded." });
      }

      const already = charge.amount_refunded ?? 0;
      const remaining = charge.amount - already;
      const amount = body.amountCents ?? remaining;
      const problem = refundProblem({ amountCents: amount, remainingCents: remaining, typedAmount: body.typedAmount });
      if (problem) throw createError({ statusCode: 400, message: problem });

      const refund = await stripe.refunds
        .create(
          { charge: chargeId, amount, metadata: appMetadata({ source: "ops", ops_actor: actor.userId, ops_reason: body.reason }) },
          { idempotencyKey }
        )
        .catch(opsStripeError);

      const orgFromCharge = typeof charge.metadata?.organization_id === "string" ? charge.metadata.organization_id : null;
      const who = owner?.name ?? customerId ?? "an HOA Connect customer";
      return {
        result: { refundId: refund.id, status: refund.status, amountCents: amount, currency: charge.currency },
        invalidate: ["charges:", ...(customerId ? [`charges-of:${customerId}`, `invoices:${customerId}`] : [])],
        audit: {
          summary: `Refunded ${money(amount, charge.currency)} of a ${money(charge.amount, charge.currency)} charge to ${who}.`,
          organization: owner?.organization ?? orgFromCharge,
          organizationName: owner?.organization ? owner.name : null,
          billingAccount: owner?.billingAccount ?? null,
          stripe: {
            charge: charge.id,
            refund: refund.id,
            customer: customerId,
            payment_intent: opsIdOf(charge.payment_intent),
          },
          amountCents: amount,
          currency: charge.currency,
          before: { amount_refunded: already },
          after: { amount_refunded: already + amount, refund_status: refund.status },
        },
      };
    },
  });
});

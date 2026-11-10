// POST /api/ops/communities/:id/resume — undo "cancel at period end" on the
// subscription that bills this community. App Admin only (`billing.write`).
//
// Body: reason, requestId, confirmed. A subscription that has already ended
// can't be resumed; the community subscribes again.
import { z } from "zod";
import {
  beginOpsAction,
  loadOpsCommunityBilling,
  opsStripeError,
  opsSubscriptionState,
  runOpsAction,
} from "#core/server/utils/ops-actions";
import { getStripe } from "#core/server/utils/stripe";

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, z.object({}));
  const id = getRouterParam(event, "id") ?? "";

  return runOpsAction({
    actor,
    action: "resume",
    targetId: id,
    body,
    perform: async (idempotencyKey) => {
      const c = await loadOpsCommunityBilling(id);
      if (!c.subscriptionId) throw createError({ statusCode: 409, message: "There's no Stripe subscription on record." });
      const stripe = getStripe();
      const sub = (await stripe.subscriptions.retrieve(c.subscriptionId).catch(opsStripeError)) as any;
      const before = opsSubscriptionState(sub);
      if (sub.status === "canceled") {
        throw createError({
          statusCode: 409,
          message: "That subscription has already ended and can't be resumed. The community subscribes again.",
        });
      }
      if (!sub.cancel_at_period_end) return { result: before, unchanged: true as const };

      const updated = await stripe.subscriptions
        .update(sub.id, { cancel_at_period_end: false }, { idempotencyKey })
        .catch(opsStripeError);
      const after = opsSubscriptionState(updated);
      const whose = c.account ? `${c.account.name}'s subscription (agency billing, includes ${c.org.name})` : `${c.org.name}'s subscription`;
      return {
        result: after,
        invalidate: ["subscriptions", `sub:${sub.id}`],
        audit: {
          summary: `Resumed ${whose}; it no longer cancels at the end of the period.`,
          organization: c.org.id,
          organizationName: c.org.name,
          billingAccount: c.account?.id ?? null,
          stripe: { subscription: sub.id, customer: c.customerId },
          before,
          after,
        },
      };
    },
  });
});

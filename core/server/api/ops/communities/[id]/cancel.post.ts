// POST /api/ops/communities/:id/cancel — cancel the subscription that bills this
// community, now or at the end of the period. App Admin only (`billing.write`).
//
// Body: reason, requestId, confirmed, when = "now" | "period_end".
//
// Stripe only. The webhook moves the community's status, as it does when an
// HOA Admin cancels in the portal; nothing here writes Directus. Cancelling now
// refunds nothing: refund the last charge separately if that's owed. For an
// agency-billed community this is the billing account's subscription, which
// covers all of its communities.
import { z } from "zod";
import {
  beginOpsAction,
  loadOpsCommunityBilling,
  opsStripeError,
  opsSubscriptionState,
  runOpsAction,
} from "#core/server/utils/ops-actions";
import { getStripe } from "#core/server/utils/stripe";

const schema = z.object({ when: z.enum(["now", "period_end"], { message: "Choose now or at period end." }) });

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, schema);
  const id = getRouterParam(event, "id") ?? "";
  const action = body.when === "now" ? "cancel_now" : "cancel_at_period_end";

  return runOpsAction({
    actor,
    action,
    targetId: id,
    body,
    perform: async (idempotencyKey) => {
      const c = await loadOpsCommunityBilling(id);
      if (!c.subscriptionId) throw createError({ statusCode: 409, message: "There's no Stripe subscription on record." });
      const stripe = getStripe();
      const sub = (await stripe.subscriptions.retrieve(c.subscriptionId).catch(opsStripeError)) as any;
      const before = opsSubscriptionState(sub);

      if (sub.status === "canceled") {
        if (action === "cancel_now") return { result: before, unchanged: true as const };
        throw createError({ statusCode: 409, message: "That subscription is already canceled." });
      }
      if (action === "cancel_at_period_end" && sub.cancel_at_period_end) return { result: before, unchanged: true as const };

      const updated = (
        action === "cancel_now"
          ? await stripe.subscriptions.cancel(sub.id, {}, { idempotencyKey }).catch(opsStripeError)
          : await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true }, { idempotencyKey }).catch(opsStripeError)
      ) as any;
      const after = opsSubscriptionState(updated);

      const whose = c.account ? `${c.account.name}'s subscription (agency billing, includes ${c.org.name})` : `${c.org.name}'s subscription`;
      return {
        result: after,
        invalidate: ["subscriptions", `sub:${sub.id}`],
        audit: {
          summary:
            action === "cancel_now"
              ? `Canceled ${whose} immediately.`
              : `Set ${whose} to cancel at the end of the period${after.current_period_end ? ` (${after.current_period_end.slice(0, 10)})` : ""}.`,
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

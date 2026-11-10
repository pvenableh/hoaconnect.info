// POST /api/ops/codes/:id/deactivate — stop a discount code being used at signup.
// App Admin only (`billing.write`). Body: reason, requestId, confirmed.
//
// Only HOA Connect's codes (tagged on the code or its coupon): Hue's other
// products share the account and their codes answer 404 here. Communities
// that already redeemed the code keep their discount.
import { z } from "zod";
import { isHoaConnectObject } from "#core/shared/billing/stripe-app";
import { beginOpsAction, opsIdOf, opsStripeError, runOpsAction } from "#core/server/utils/ops-actions";
import { getStripe } from "#core/server/utils/stripe";

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, z.object({}));
  const id = getRouterParam(event, "id") ?? "";
  if (!/^promo_[A-Za-z0-9]+$/.test(id)) throw createError({ statusCode: 400, message: "Not a discount code id." });

  return runOpsAction({
    actor,
    action: "code_deactivate",
    targetId: id,
    body,
    perform: async (idempotencyKey) => {
      const stripe = getStripe();
      const promo = (await stripe.promotionCodes.retrieve(id).catch(opsStripeError)) as any;
      if (!isHoaConnectObject(promo.metadata) && !isHoaConnectObject(promo.coupon?.metadata)) {
        throw createError({ statusCode: 404, message: "That isn't an HOA Connect discount code." });
      }
      if (!promo.active) return { result: { id, code: promo.code, active: false }, unchanged: true as const };

      await stripe.promotionCodes.update(id, { active: false }, { idempotencyKey }).catch(opsStripeError);
      return {
        result: { id, code: promo.code, active: false },
        invalidate: ["promotion-codes"],
        audit: {
          summary: `Deactivated discount code ${promo.code} (redeemed ${promo.times_redeemed ?? 0} times).`,
          stripe: { promotion_code: id, coupon: opsIdOf(promo.coupon) },
          before: { active: true, times_redeemed: promo.times_redeemed ?? 0 },
          after: { active: false },
        },
      };
    },
  });
});

// POST /api/ops/codes — create a discount code for signup. App Admin only (`billing.write`).
//
// Body: reason, requestId, confirmed, code, percentOff | amountOffCents,
// duration ("once" | "repeating" | "forever"), durationInMonths (repeating
// only), and optionally maxRedemptions and expiresOn ("YYYY-MM-DD").
//
// A Stripe coupon plus its promotion code, both tagged `app = hoaconnect`
// (`appMetadata`), so signup's `checkPromotionCode` accepts it and Hue's other
// products never see it. Codes are unique among the account's ACTIVE codes,
// Hue's included, so a taken code is refused before anything is created.
import { z } from "zod";
import { appMetadata } from "#core/shared/billing/stripe-app";
import { describePromo } from "#core/shared/billing/promotion";
import { CODE_PATTERN } from "#core/shared/ops/actions";
import { beginOpsAction, opsStripeError, runOpsAction } from "#core/server/utils/ops-actions";
import { getStripe } from "#core/server/utils/stripe";

const schema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase())
      .refine((s) => CODE_PATTERN.test(s), "Use 3 to 30 letters, digits, dashes or underscores."),
    percentOff: z.number().min(1, "Between 1% and 100%.").max(100, "Between 1% and 100%.").optional(),
    amountOffCents: z.number().int().min(100, "At least $1.").max(1_000_000, "At most $10,000.").optional(),
    duration: z.enum(["once", "repeating", "forever"], { message: "Choose how long it applies." }),
    durationInMonths: z.number().int().min(1).max(36).optional(),
    maxRedemptions: z.number().int().min(1).max(10_000).optional(),
    expiresOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((b) => (b.percentOff == null) !== (b.amountOffCents == null), "Give a percentage or an amount off, not both.")
  .refine((b) => (b.duration === "repeating") === (b.durationInMonths != null), "Give the number of months for a repeating code, and only then.");

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, schema);

  return runOpsAction({
    actor,
    action: "code_create",
    targetId: "new",
    body,
    perform: async (idempotencyKey) => {
      const stripe = getStripe();
      const expiresAt = body.expiresOn ? Math.floor(new Date(`${body.expiresOn}T23:59:59.000Z`).getTime() / 1000) : undefined;
      if (expiresAt != null && (Number.isNaN(expiresAt) || expiresAt * 1000 <= Date.now())) {
        throw createError({ statusCode: 400, message: "Pick an expiry date after today." });
      }

      const taken = await stripe.promotionCodes.list({ code: body.code, active: true, limit: 1 }).catch(opsStripeError);
      if (taken.data.length) {
        throw createError({ statusCode: 409, message: `${body.code} is already an active code on the Stripe account.` });
      }

      const terms = {
        percent_off: body.percentOff ?? null,
        amount_off: body.amountOffCents ?? null,
        duration: body.duration,
        duration_in_months: body.durationInMonths ?? null,
      };
      const tag = appMetadata({ source: "ops", ops_actor: actor.userId });
      const coupon = await stripe.coupons
        .create(
          {
            name: body.code,
            duration: body.duration,
            ...(body.percentOff != null ? { percent_off: body.percentOff } : { amount_off: body.amountOffCents, currency: "usd" }),
            ...(body.durationInMonths != null ? { duration_in_months: body.durationInMonths } : {}),
            metadata: tag,
          },
          { idempotencyKey: `${idempotencyKey}:coupon` }
        )
        .catch(opsStripeError);

      // Acacia shape: the coupon goes on the code itself.
      const promo = await stripe.promotionCodes
        .create(
          {
            coupon: coupon.id,
            code: body.code,
            ...(body.maxRedemptions ? { max_redemptions: body.maxRedemptions } : {}),
            ...(expiresAt ? { expires_at: expiresAt } : {}),
            metadata: tag,
          } as any,
          { idempotencyKey: `${idempotencyKey}:promo` }
        )
        .catch(async (e) => {
          // Don't leave a coupon no code points at.
          await stripe.coupons.del(coupon.id).catch(() => null);
          return opsStripeError(e);
        });

      const label = describePromo(terms);
      return {
        result: { id: promo.id, code: promo.code, label },
        invalidate: ["promotion-codes"],
        audit: {
          summary: `Created discount code ${promo.code}: ${label}.`,
          stripe: { coupon: coupon.id, promotion_code: promo.id },
          after: {
            code: promo.code,
            ...terms,
            max_redemptions: body.maxRedemptions ?? null,
            expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
          },
        },
      };
    },
  });
});

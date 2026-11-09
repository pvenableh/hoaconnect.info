import type Stripe from "stripe";
import { isHoaConnectObject } from "#core/shared/billing/stripe-app";
import {
  MIN_CHARGE_CENTS,
  describePromo,
  discountFirstInvoice,
  formatCents,
  type PromoTerms,
} from "#core/shared/billing/promotion";

/**
 * Promotion code shape at the pinned acacia API version: the coupon sits on the
 * code itself (the v20 clover types moved it under `promotion`).
 */
export type AcaciaPromotionCode = Stripe.PromotionCode & { coupon?: Stripe.Coupon | null };

export type PromotionCheck =
  | {
      ok: true;
      promotionCodeId: string;
      /** The code as Stripe stores it, whatever case the customer typed. */
      code: string;
      label: string;
      subtotalCents: number;
      discountCents: number;
      totalCents: number;
    }
  | { ok: false; message: string };

const INVALID = "That code isn't valid.";

/**
 * Check a discount code against the first invoice it would be used on, so the
 * quote shows what Stripe will charge and nothing is refused only at payment.
 *
 * Hue's Stripe account is shared, so a code counts only when it or its coupon is
 * tagged as HOA Connect's (`metadata.app = "hoaconnect"`). A code restricted to
 * other products would go through with nothing off, so it is refused here. So is
 * one that leaves less than Stripe's minimum charge: the card form takes payments,
 * not card setups, so a fully free first invoice can't be completed yet.
 */
export async function checkPromotionCode(
  stripe: Stripe,
  input: {
    code: string;
    /** The first invoice's lines in cents (`firstInvoiceLines`). */
    lineCents: number[];
    /** The band's recurring price: its product decides product-restricted codes. */
    bandPriceId: string;
    bandName?: string | null;
    /** The org's Stripe customer, if it has one already. */
    customerId?: string | null;
  }
): Promise<PromotionCheck> {
  const code = input.code.trim();
  if (!code) return { ok: false, message: INVALID };

  // `code` matches case-insensitively.
  const found = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 10,
    expand: ["data.coupon.applies_to"],
  });
  const promo = (found.data as AcaciaPromotionCode[]).find(
    (p) => isHoaConnectObject(p.metadata) || isHoaConnectObject(p.coupon?.metadata)
  );
  const coupon = promo?.coupon;
  if (!promo || !coupon) return { ok: false, message: INVALID };

  const now = Math.floor(Date.now() / 1000);
  if (!coupon.valid || (promo.expires_at && promo.expires_at <= now)) {
    return { ok: false, message: "That code has expired." };
  }
  if (promo.max_redemptions && promo.times_redeemed >= promo.max_redemptions) {
    return { ok: false, message: "That code has already been used." };
  }
  const forCustomer = typeof promo.customer === "string" ? promo.customer : promo.customer?.id;
  if (forCustomer && forCustomer !== input.customerId) return { ok: false, message: INVALID };
  if (coupon.amount_off && (coupon.currency ?? "usd").toLowerCase() !== "usd") return { ok: false, message: INVALID };

  const products = coupon.applies_to?.products ?? [];
  if (products.length > 0) {
    const price = await stripe.prices.retrieve(input.bandPriceId);
    const productId = typeof price.product === "string" ? price.product : price.product?.id;
    if (!productId || !products.includes(productId)) {
      return { ok: false, message: `That code isn't valid for the ${input.bandName || "selected"} plan.` };
    }
  }

  const terms: PromoTerms = {
    percent_off: coupon.percent_off ?? null,
    amount_off: coupon.amount_off ?? null,
    duration: coupon.duration,
    duration_in_months: coupon.duration_in_months ?? null,
  };
  const amounts = discountFirstInvoice(input.lineCents, terms);

  const minimum = promo.restrictions?.minimum_amount;
  if (minimum && amounts.subtotalCents < minimum) {
    return { ok: false, message: `That code needs a first invoice of at least ${formatCents(minimum)}.` };
  }
  if (amounts.discountCents <= 0) return { ok: false, message: INVALID };
  if (amounts.totalCents < MIN_CHARGE_CENTS) {
    return {
      ok: false,
      message: "That code covers the whole first invoice, which signup can't take yet. Contact support@hoaconnect.info.",
    };
  }

  return { ok: true, promotionCodeId: promo.id, code: promo.code, label: describePromo(terms), ...amounts };
}

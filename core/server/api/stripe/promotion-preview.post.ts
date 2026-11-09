import { z } from "zod";
import { isCheckoutRefusal, planBandCheckout } from "#core/shared/billing/band-checkout";
import { firstInvoiceLines } from "#core/shared/billing/promotion";
import { getStripe } from "#core/server/utils/stripe";
import { checkPromotionCode } from "#core/server/utils/promotion-code";

// POST /api/stripe/promotion-preview — what a discount code does to the signup quote.
//
// Public: a new board has no account yet when it types a code on the price step.
// It runs the same band selection and the same code check as subscribe-band, so
// the quote matches the charge. Rate-limited per IP to blunt code guessing.

const schema = z.object({
  code: z.string().trim().min(1, "Enter a code").max(100),
  units: z.number().int().min(1).max(1_000_000),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
});

export default defineEventHandler(async (event) => {
  if (!rateLimit(`promotion-preview:${clientIp(event)}`, 20, 10 * 60_000)) {
    throw createError({ statusCode: 429, message: "Too many tries. Wait a few minutes and try again." });
  }

  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.errors.map((e) => e.message).join(", ") });
  }
  const { code, units, interval } = parsed.data;

  const stripe = getStripe();
  const band = await bandWithModePrices(await selectBandForUnits(units), stripe);
  const plan = planBandCheckout(band as any, interval, "standard");
  if (isCheckoutRefusal(plan)) throw createError({ statusCode: plan.status, message: plan.message });

  return checkPromotionCode(stripe, {
    code,
    lineCents: firstInvoiceLines(plan),
    bandPriceId: plan.recurringPriceId,
    bandName: band?.name,
  });
});

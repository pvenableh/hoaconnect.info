/**
 * Signup discount codes: the first-invoice arithmetic, and which Stripe promotion
 * codes HOA Connect accepts. Stripe is a stand-in; its discount behaviour (a code
 * covers onboarding too, fixed amounts spread across lines) was proved in test
 * mode and is what the arithmetic mirrors.
 */
import { describe, it, expect, vi } from "vitest";
import { checkPromotionCode } from "#core/server/utils/promotion-code";
import {
  describePromo,
  discountFirstInvoice,
  firstInvoiceLines,
  formatCents,
} from "#core/shared/billing/promotion";

/** Boutique monthly + onboarding, in cents. */
const LINES = [24900, 150000];

const promoCode = (over: Record<string, any> = {}, coupon: Record<string, any> = {}) => ({
  id: "promo_1",
  code: "SPRING",
  active: true,
  metadata: { app: "hoaconnect" },
  expires_at: null,
  max_redemptions: null,
  times_redeemed: 0,
  customer: null,
  restrictions: { first_time_transaction: false, minimum_amount: null },
  coupon: {
    id: "co_1",
    valid: true,
    percent_off: 50,
    amount_off: null,
    currency: null,
    duration: "once",
    duration_in_months: null,
    metadata: {},
    applies_to: null,
    ...coupon,
  },
  ...over,
});

const fakeStripe = (codes: any[], productOfBandPrice = "prod_band") =>
  ({
    promotionCodes: { list: vi.fn(async () => ({ data: codes })) },
    prices: { retrieve: vi.fn(async () => ({ id: "price_band", product: productOfBandPrice })) },
  }) as any;

const check = (stripe: any, over: Record<string, any> = {}) =>
  checkPromotionCode(stripe, { code: " spring ", lineCents: LINES, bandPriceId: "price_band", bandName: "Boutique", ...over });

describe("first-invoice arithmetic", () => {
  it("lists the period price, then onboarding when there is one", () => {
    expect(firstInvoiceLines({ periodAmount: 249, onboardingAmount: 1500 })).toEqual([24900, 150000]);
    expect(firstInvoiceLines({ periodAmount: 249, onboardingAmount: 0 })).toEqual([24900]);
  });

  it("takes a percent off every line, onboarding included", () => {
    expect(discountFirstInvoice(LINES, { percent_off: 50, amount_off: null, duration: "once", duration_in_months: null }))
      .toEqual({ subtotalCents: 174900, discountCents: 87450, totalCents: 87450 });
  });

  it("takes a fixed amount off the whole invoice, never below zero", () => {
    const off = (amount_off: number) =>
      discountFirstInvoice(LINES, { percent_off: null, amount_off, duration: "once", duration_in_months: null });
    expect(off(174700).totalCents).toBe(200);
    expect(off(500000)).toEqual({ subtotalCents: 174900, discountCents: 174900, totalCents: 0 });
  });

  it("describes what a code does in plain words", () => {
    expect(describePromo({ percent_off: 50, amount_off: null, duration: "once", duration_in_months: null })).toBe("50% off the first invoice");
    expect(describePromo({ percent_off: null, amount_off: 10000, duration: "repeating", duration_in_months: 3 })).toBe("$100 off for 3 months");
    expect(describePromo({ percent_off: 20, amount_off: null, duration: "repeating", duration_in_months: 1 })).toBe("20% off for 1 month");
    expect(describePromo({ percent_off: 20, amount_off: null, duration: "forever", duration_in_months: null })).toBe("20% off every invoice");
  });

  it("shows cents only when there are some", () => {
    expect(formatCents(200)).toBe("$2");
    expect(formatCents(87450)).toBe("$874.50");
  });
});

describe("checkPromotionCode", () => {
  it("accepts an HOA Connect code typed in any case, and prices the first invoice", async () => {
    const stripe = fakeStripe([promoCode()]);
    const res = await check(stripe);
    expect(stripe.promotionCodes.list).toHaveBeenCalledWith(expect.objectContaining({ code: "spring", active: true }));
    expect(res).toEqual({
      ok: true,
      promotionCodeId: "promo_1",
      code: "SPRING",
      label: "50% off the first invoice",
      subtotalCents: 174900,
      discountCents: 87450,
      totalCents: 87450,
    });
  });

  it("accepts a code whose coupon carries the tag", async () => {
    const res = await check(fakeStripe([promoCode({ metadata: {} }, { metadata: { app: "hoaconnect" } })]));
    expect(res.ok).toBe(true);
  });

  it("refuses another Hue product's code with the same text", async () => {
    const res = await check(fakeStripe([promoCode({ metadata: { app: "other" } })]));
    expect(res).toEqual({ ok: false, message: "That code isn't valid." });
  });

  it("refuses an unknown code", async () => {
    expect(await check(fakeStripe([]))).toEqual({ ok: false, message: "That code isn't valid." });
  });

  it("refuses an expired code, by its coupon or its own end date", async () => {
    expect(await check(fakeStripe([promoCode({}, { valid: false })]))).toMatchObject({ ok: false, message: "That code has expired." });
    expect(await check(fakeStripe([promoCode({ expires_at: 1 })]))).toMatchObject({ ok: false, message: "That code has expired." });
  });

  it("refuses a code that has been used up", async () => {
    const res = await check(fakeStripe([promoCode({ max_redemptions: 1, times_redeemed: 1 })]));
    expect(res).toMatchObject({ ok: false, message: "That code has already been used." });
  });

  it("takes a customer-specific code only from that customer", async () => {
    const stripe = fakeStripe([promoCode({ customer: "cus_board" })]);
    expect((await check(stripe)).ok).toBe(false);
    expect((await check(stripe, { customerId: "cus_board" })).ok).toBe(true);
  });

  it("takes a product-restricted code only on that band", async () => {
    const restricted = promoCode({}, { applies_to: { products: ["prod_band"] } });
    expect((await check(fakeStripe([restricted], "prod_band"))).ok).toBe(true);
    expect(await check(fakeStripe([restricted], "prod_other_band"))).toEqual({
      ok: false,
      message: "That code isn't valid for the Boutique plan.",
    });
  });

  it("refuses a code whose minimum the first invoice doesn't reach", async () => {
    const res = await check(fakeStripe([promoCode({ restrictions: { minimum_amount: 200000 } })]));
    expect(res).toEqual({ ok: false, message: "That code needs a first invoice of at least $2,000." });
  });

  it("allows a code that leaves $2 to pay, but not one that leaves under Stripe's minimum", async () => {
    const amountOff = (amount_off: number) =>
      promoCode({}, { percent_off: null, amount_off, currency: "usd" });
    expect(await check(fakeStripe([amountOff(174700)]))).toMatchObject({ ok: true, totalCents: 200 });
    expect((await check(fakeStripe([amountOff(174880)]))).ok).toBe(false);
    expect((await check(fakeStripe([promoCode({}, { percent_off: 100 })]))).ok).toBe(false);
  });

  it("refuses a fixed-amount code in another currency", async () => {
    const res = await check(fakeStripe([promoCode({}, { percent_off: null, amount_off: 1000, currency: "eur" })]));
    expect(res.ok).toBe(false);
  });
});

/**
 * Signup discount codes: the arithmetic and wording shared by the quote preview
 * and the charge.
 *
 * Codes are Stripe promotion codes. A code on a subscription discounts every line
 * of each invoice it covers, the onboarding fee included, so the first invoice is
 * discounted as a whole. A fixed-amount code is spread across the lines and a
 * percent code is taken per line. (Proved in test mode on 2026-11-09 against the
 * Boutique prices at API version 2024-11-20.acacia.)
 */

/** Stripe won't charge less than this, so a code may not leave less to pay. */
export const MIN_CHARGE_CENTS = 50;

/** The parts of a Stripe coupon that decide what a code takes off. */
export interface PromoTerms {
  percent_off: number | null;
  /** Cents. */
  amount_off: number | null;
  duration: "once" | "repeating" | "forever";
  duration_in_months: number | null;
}

export interface DiscountedInvoice {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

/** The first invoice's lines in cents: the band's period price, then onboarding if any. */
export function firstInvoiceLines(plan: { periodAmount: number; onboardingAmount: number }): number[] {
  return [plan.periodAmount, plan.onboardingAmount].map((d) => Math.round(d * 100)).filter((c) => c > 0);
}

/** What the first invoice comes to once the code is applied. */
export function discountFirstInvoice(lineCents: number[], terms: PromoTerms): DiscountedInvoice {
  const subtotalCents = lineCents.reduce((sum, c) => sum + c, 0);
  let discountCents = 0;
  if (terms.percent_off) {
    discountCents = lineCents.reduce((sum, c) => sum + Math.round((c * terms.percent_off!) / 100), 0);
  } else if (terms.amount_off) {
    discountCents = terms.amount_off;
  }
  discountCents = Math.min(Math.max(discountCents, 0), subtotalCents);
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

/** Dollars from cents, with cents shown only when there are some: $2, $874.50. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "50% off the first invoice", "$100 off for 3 months", "20% off every invoice". */
export function describePromo(terms: PromoTerms): string {
  const off = terms.percent_off ? `${terms.percent_off}% off` : `${formatCents(terms.amount_off ?? 0)} off`;
  if (terms.duration === "forever") return `${off} every invoice`;
  if (terms.duration === "repeating" && terms.duration_in_months) {
    const n = terms.duration_in_months;
    return `${off} for ${n} ${n === 1 ? "month" : "months"}`;
  }
  return `${off} the first invoice`;
}

// GET /api/org/billing/band?organizationId=…  (org admins)
//
// The subscription page's quote: the band this building falls into by its unit
// count, what each interval costs, the onboarding line, and whether self-serve
// checkout is possible. Computed by the same `planBandCheckout` the subscribe
// route charges with, so the page can't show a price the route won't charge.
// Also returns the full band ladder so the board sees where it sits.

import { isCheckoutRefusal, planBandCheckout } from "#core/shared/billing/band-checkout";

export default defineEventHandler(async (event) => {
  const organizationId = String(getQuery(event).organizationId || "");
  if (!organizationId) throw createError({ statusCode: 400, message: "organizationId is required" });
  await requireAdminAccess(event, organizationId);

  const [{ units, band }, bands] = await Promise.all([resolveBandForOrg(organizationId), getActiveBands()]);

  const quote = (interval: "monthly" | "annual") => {
    const plan = planBandCheckout(band as any, interval, "standard");
    if (isCheckoutRefusal(plan)) return { available: false as const, reason: plan.reason, message: plan.message };
    return {
      available: true as const,
      periodAmount: plan.periodAmount,
      onboardingAmount: plan.onboardingAmount,
      firstInvoiceCents: plan.firstInvoiceCents,
    };
  };

  return {
    units,
    band: band
      ? {
          slug: band.slug ?? null,
          name: band.name ?? null,
          minUnits: (band as any).min_units ?? null,
          maxUnits: (band as any).max_units ?? null,
          contactOnly: !!(band as any).is_contact_only || band.price_monthly == null,
        }
      : null,
    monthly: quote("monthly"),
    annual: quote("annual"),
    ladder: bands.map((b: any) => ({
      slug: b.slug ?? null,
      name: b.name ?? null,
      minUnits: b.min_units ?? null,
      maxUnits: b.max_units ?? null,
      priceMonthly: b.price_monthly ?? null,
      priceYearly: b.price_yearly ?? null,
      contactOnly: !!b.is_contact_only || b.price_monthly == null,
      current: !!band && b.slug === band.slug,
    })),
  };
});

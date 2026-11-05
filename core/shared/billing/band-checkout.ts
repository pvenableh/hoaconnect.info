// The pure half of an org's flat-per-building checkout: given the band the
// building falls into, which Stripe Prices go on the subscription and what the
// board is told it will pay. No I/O — `subscribe-band.post.ts` (the charge) and
// `org/billing/band.get.ts` (the quote the subscription page shows) both use it,
// so the page can never show a price the route won't charge.

import { isContactOnly, type PlanBand } from "./bands";

export type BillingInterval = "monthly" | "annual";
export type OnboardingChoice = "standard" | "none";

export interface CheckoutBand extends PlanBand {
  name?: string | null;
  slug?: string | null;
  price_yearly?: number | null;
  onboarding_fee?: number | null;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_yearly?: string | null;
  stripe_price_id_onboarding?: string | null;
}

export type CheckoutRefusal =
  | { ok: false; reason: "no_band"; status: 404; message: string }
  | { ok: false; reason: "contact_only"; status: 409; message: string }
  | { ok: false; reason: "no_price"; status: 503; message: string };

export interface CheckoutPlan {
  ok: true;
  /** The recurring Price the subscription is created on. */
  recurringPriceId: string;
  /** The one-time onboarding Price added to the first invoice, if any. */
  onboardingPriceId: string | null;
  /** Dollars per period (the band's flat fee for the interval). */
  periodAmount: number;
  /** Dollars charged once, on the first invoice. */
  onboardingAmount: number;
  /** What the first invoice comes to, in cents — the checkout overlay's total. */
  firstInvoiceCents: number;
}

/**
 * Decide what a checkout for `band` charges. A band with no self-serve price
 * (contact-only, or a Price not yet created in Stripe) is refused with the
 * status the route should answer — never silently charged on another band.
 */
export function planBandCheckout(
  band: CheckoutBand | null | undefined,
  interval: BillingInterval,
  onboarding: OnboardingChoice
): CheckoutPlan | CheckoutRefusal {
  if (!band) {
    return { ok: false, reason: "no_band", status: 404, message: "No subscription band covers this building." };
  }
  const name = band.name || band.slug || "this";
  if (isContactOnly(band)) {
    return {
      ok: false,
      reason: "contact_only",
      status: 409,
      message: `The ${name} tier is contact-only — no self-serve checkout.`,
    };
  }

  const recurringPriceId = interval === "annual" ? band.stripe_price_id_yearly : band.stripe_price_id_monthly;
  if (!recurringPriceId) {
    return {
      ok: false,
      reason: "no_price",
      status: 503,
      message: `No Stripe ${interval} price configured for the ${name} band. Run pnpm stripe:subscription-prices.`,
    };
  }

  const fee = Number(band.onboarding_fee) || 0;
  let onboardingPriceId: string | null = null;
  if (onboarding === "standard" && fee > 0) {
    if (!band.stripe_price_id_onboarding) {
      return {
        ok: false,
        reason: "no_price",
        status: 503,
        message: `No Stripe onboarding price configured for the ${name} band. Run pnpm stripe:subscription-prices.`,
      };
    }
    onboardingPriceId = band.stripe_price_id_onboarding;
  }

  const periodAmount = Number(interval === "annual" ? band.price_yearly : band.price_monthly) || 0;
  const onboardingAmount = onboardingPriceId ? fee : 0;
  return {
    ok: true,
    recurringPriceId,
    onboardingPriceId,
    periodAmount,
    onboardingAmount,
    firstInvoiceCents: Math.round((periodAmount + onboardingAmount) * 100),
  };
}

/** Narrowing that holds without `strictNullChecks` (a boolean `ok` doesn't discriminate there). */
export function isCheckoutRefusal(p: CheckoutPlan | CheckoutRefusal): p is CheckoutRefusal {
  return p.ok === false;
}

// ── Prices by lookup key ────────────────────────────────────────────────────
// A band's Stripe Prices are found by a deterministic `lookup_key`, which is the
// SAME string in test and live mode — so the app always charges the price of
// the mode it is running in. The ids stored on `subscription_plans` are a record
// of the script's last run (one mode only) and are never read to charge.

export type BandPriceKind = "monthly" | "annual" | "onboarding";
export const BAND_PRICE_KINDS: readonly BandPriceKind[] = ["monthly", "annual", "onboarding"];

/** `hoa_<slug>_<kind>` — written by scripts/create-stripe-subscription-prices.ts. */
export function bandLookupKey(slug: string, kind: BandPriceKind): string {
  return `hoa_${slug}_${kind}`;
}

export interface BandPriceIds {
  monthly: string | null;
  annual: string | null;
  onboarding: string | null;
}

/** Pick a band's three price ids out of a `prices.list({ lookup_keys })` result. */
export function bandPricesFromLookup(
  slug: string,
  prices: ReadonlyArray<{ id: string; lookup_key?: string | null; active?: boolean }>
): BandPriceIds {
  const pick = (kind: BandPriceKind) =>
    prices.find((p) => p.lookup_key === bandLookupKey(slug, kind) && p.active !== false)?.id ?? null;
  return { monthly: pick("monthly"), annual: pick("annual"), onboarding: pick("onboarding") };
}

/** The band with its price ids replaced by this mode's — the only ids checkout uses. */
export function withBandPrices<T extends CheckoutBand>(band: T, ids: BandPriceIds): T {
  return {
    ...band,
    stripe_price_id_monthly: ids.monthly,
    stripe_price_id_yearly: ids.annual,
    stripe_price_id_onboarding: ids.onboarding,
  };
}

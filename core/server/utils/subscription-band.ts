// Server-side flat-per-building band entitlement. Thin DB layer over the pure
// selector in shared/billing/bands.ts: load the active published plans, count a
// building's units, and resolve which flat-price band it falls into.
//
// The band's price_monthly is the FLAT per-building fee — unit count only
// selects the band, it never multiplies the price.
//
// getTypedDirectus (admin client) is auto-imported from server/utils/directus.ts.

import { readItems, aggregate } from "@directus/sdk";
import { selectBand, type PlanBand } from "#core/shared/billing/bands";
import type { SubscriptionPlan } from "#core/types/directus";
import type Stripe from "stripe";
import {
  BAND_PRICE_KINDS,
  bandLookupKey,
  bandPricesFromLookup,
  withBandPrices,
  type BandPriceIds,
} from "#core/shared/billing/band-checkout";
import { getStripe, isStripeLiveMode } from "./stripe";

/** Fields needed to render/select a band. */
const BAND_FIELDS = [
  "id",
  "slug",
  "name",
  "min_units",
  "max_units",
  "price_monthly",
  "price_yearly",
  "onboarding_fee",
  "stripe_price_id_monthly",
  "stripe_price_id_yearly",
  "stripe_price_id_onboarding",
  "included_credits",
  "is_contact_only",
  "is_featured",
  "billing_unit",
  "sort",
] as const;

/** Load active, published subscription bands in display order. */
export async function getActiveBands(): Promise<SubscriptionPlan[]> {
  const rows = (await getTypedDirectus().request(
    readItems("subscription_plans", {
      filter: { status: { _eq: "published" }, is_active: { _eq: true } },
      sort: ["sort"],
      // @ts-expect-error — SDK field-literal typing is over-narrow for this list.
      fields: BAND_FIELDS as unknown as string[],
      limit: -1,
    })
  )) as SubscriptionPlan[];
  return rows ?? [];
}

/** Count a building's units (the band selector input). */
export async function countOrgUnits(orgId: string): Promise<number> {
  try {
    const res = (await getTypedDirectus().request(
      aggregate("hoa_units", {
        aggregate: { count: "*" },
        query: { filter: { organization: { _eq: orgId } } },
      })
    )) as { count: number | string }[];
    return Number(res?.[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

/** Resolve the flat-price band for a given unit count from the live plans. */
export async function selectBandForUnits(units: number): Promise<SubscriptionPlan | null> {
  const bands = await getActiveBands();
  return selectBand(units, bands as unknown as PlanBand[]) as SubscriptionPlan | null;
}

/** Resolve the band for an org by counting its units. */
export async function resolveBandForOrg(orgId: string): Promise<{
  units: number;
  band: SubscriptionPlan | null;
}> {
  const units = await countOrgUnits(orgId);
  const band = await selectBandForUnits(units);
  return { units, band };
}

// ── This mode's prices, by lookup key ───────────────────────────────────────

const PRICE_TTL_MS = 5 * 60_000;
const priceCache = new Map<string, { at: number; ids: BandPriceIds }>();

/**
 * A band's Stripe Price ids in the mode the app is running in, found by lookup
 * key (`hoa_<slug>_<kind>`, the same in test and live). Cached per mode for
 * five minutes so the subscription page doesn't hit Stripe on every view.
 * Missing prices come back null — `planBandCheckout` turns that into a 503
 * that names the script to run. A Stripe failure throws.
 */
export async function resolveBandPrices(slug: string, stripe: Stripe = getStripe()): Promise<BandPriceIds> {
  const key = `${isStripeLiveMode() ? "live" : "test"}:${slug}`;
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.ids;
  const found = await stripe.prices.list({
    lookup_keys: BAND_PRICE_KINDS.map((k) => bandLookupKey(slug, k)),
    active: true,
    limit: BAND_PRICE_KINDS.length,
  });
  const ids = bandPricesFromLookup(slug, found.data);
  priceCache.set(key, { at: Date.now(), ids });
  return ids;
}

/** The band with this mode's price ids (never the ids stored in Directus). */
export async function bandWithModePrices<T extends SubscriptionPlan | null>(band: T, stripe?: Stripe): Promise<T> {
  if (!band?.slug) return band;
  return withBandPrices(band as any, await resolveBandPrices(band.slug, stripe)) as T;
}

/** Tests only. */
export function _resetBandPriceCache(): void {
  priceCache.clear();
}

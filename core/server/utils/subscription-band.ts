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

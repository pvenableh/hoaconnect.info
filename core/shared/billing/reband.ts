// Automatic re-banding (launch-followups Session 3), decided 2026-11-10 by Peter:
//  - A higher band applies at the next renewal, with no proration.
//  - A band never goes down on its own; a board asks and HOA Connect moves it.
//  - The board and HOA Connect are emailed when the move is scheduled.
//  - Onboarding isn't charged again on moving up.
//  - Crossing into the contact-only band (Enterprise) notifies HOA Connect and
//    leaves Stripe alone.
//
// Pure: what to do for one community, given its units and its current band.
import { isContactOnly, selectBand, type PlanBand } from "./bands";

export type RebandDecision =
  | { kind: "none"; reason: "same_band" | "lower_band_kept" | "no_band" }
  /** Same band, but the unit count on the subscription is out of date. */
  | { kind: "units"; units: number }
  | { kind: "up"; from: string | null; to: string; units: number }
  | { kind: "enterprise"; from: string | null; to: string; units: number };

const rank = (bands: PlanBand[], slug: string | null | undefined): number => {
  const sorted = [...bands].sort((a, b) => (a.min_units ?? 0) - (b.min_units ?? 0));
  return sorted.findIndex((b) => b.slug === slug);
};

export function planReband(input: {
  units: number;
  /** The band it pays for now (subscription metadata, else the org's plan). */
  currentSlug: string | null;
  /** `subscription.metadata.units` as Stripe holds it. */
  metadataUnits: string | null | undefined;
  bands: PlanBand[];
}): RebandDecision {
  const target = selectBand(input.units, input.bands);
  if (!target?.slug) return { kind: "none", reason: "no_band" };
  const from = rank(input.bands, input.currentSlug);
  const to = rank(input.bands, target.slug);
  const unitsStale = String(input.units) !== String(input.metadataUnits ?? "");

  if (from === -1 || to > from) {
    return isContactOnly(target)
      ? { kind: "enterprise", from: input.currentSlug, to: target.slug, units: input.units }
      : { kind: "up", from: input.currentSlug, to: target.slug, units: input.units };
  }
  // Same band, or fewer units than the band it pays for: the band stays.
  if (unitsStale) return { kind: "units", units: input.units };
  return { kind: "none", reason: to < from ? "lower_band_kept" : "same_band" };
}

/** A Stripe Price lookup key that is a band's recurring price, e.g. `hoa_mid_monthly`. */
export function bandSlugFromLookupKey(key: string | null | undefined): { slug: string; interval: "monthly" | "annual" } | null {
  const m = /^hoa_([a-z0-9-]+)_(monthly|annual)$/.exec(key ?? "");
  return m ? { slug: m[1]!, interval: m[2] as "monthly" | "annual" } : null;
}

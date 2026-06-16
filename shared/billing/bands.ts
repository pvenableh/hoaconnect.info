// Pure flat-per-building band selection. A building's UNIT COUNT only SELECTS a
// size band — it never multiplies the price. The band's `price_monthly` is the
// flat fee billed per building. Framework-free + Directus-free so the checkout
// server route and unit tests share ONE source of truth.
//
// See docs (pricing) and scripts/add-subscription-tier-fields.ts for the canon
// tier definitions. Mirrors the marketing fallback in
// ~/Sites/hoaconnect-marketing/app/config/pricing.ts.

/** Billing is always per building. Never "unit". */
export const BILLED_PER = "building" as const;

/** The minimal shape of a plan row needed to pick a band. */
export interface PlanBand {
  slug?: string | null;
  /** Band lower bound (units), inclusive. */
  min_units?: number | null;
  /** Band upper bound (units), inclusive. Null = no cap (Enterprise). */
  max_units?: number | null;
  /** Flat monthly fee per building (null for contact-only). */
  price_monthly?: number | null;
  /** Hide price, show "Contact us" (Enterprise). */
  is_contact_only?: boolean | null;
}

/**
 * Pick the subscription band for a building of `units` units.
 *
 * Bands are matched on `[min_units, max_units]` inclusive; a null `max_units`
 * is an open upper bound (Enterprise). Plans are considered in ascending
 * `min_units` order so the tightest matching band wins. A unit count at or
 * below the smallest band's floor falls into that smallest band; a count above
 * every capped band falls into the open-ended (Enterprise) band if present.
 *
 * Returns null only when no band matches (e.g. empty plan list).
 */
export function selectBand<T extends PlanBand>(units: number, plans: T[]): T | null {
  const u = Number.isFinite(units) ? Math.max(0, Math.floor(units)) : 0;

  const banded = plans
    .filter((p) => p.min_units != null)
    .slice()
    .sort((a, b) => (a.min_units ?? 0) - (b.min_units ?? 0));
  if (banded.length === 0) return null;

  // Below the smallest floor → smallest band.
  const smallest = banded[0]!;
  if (u < (smallest.min_units ?? 0)) return smallest;

  for (const p of banded) {
    const min = p.min_units ?? 0;
    const max = p.max_units;
    if (u >= min && (max == null || u <= max)) return p;
  }

  // Above every capped band but no open band matched — fall back to the
  // open-ended band if one exists, else the largest capped band.
  const open = banded.find((p) => p.max_units == null);
  return open ?? banded[banded.length - 1]!;
}

/** Slug-only convenience over selectBand. */
export function selectBandSlug<T extends PlanBand>(units: number, plans: T[]): string | null {
  return selectBand(units, plans)?.slug ?? null;
}

/** True when a band requires a sales conversation rather than self-serve checkout. */
export function isContactOnly(plan: PlanBand | null | undefined): boolean {
  if (!plan) return false;
  return !!plan.is_contact_only || plan.price_monthly == null;
}

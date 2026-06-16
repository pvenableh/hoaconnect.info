import { describe, it, expect } from "vitest";
import {
  BILLED_PER,
  selectBand,
  selectBandSlug,
  isContactOnly,
  type PlanBand,
} from "#core/shared/billing/bands";

// Mirrors the seeded flat-per-building tiers (scripts/add-subscription-tier-fields.ts).
const BANDS: PlanBand[] = [
  { slug: "boutique", min_units: 1, max_units: 30, price_monthly: 249 },
  { slug: "mid", min_units: 31, max_units: 60, price_monthly: 449 },
  { slug: "larger", min_units: 61, max_units: 100, price_monthly: 699 },
  { slug: "grand", min_units: 101, max_units: 200, price_monthly: 999 },
  { slug: "enterprise", min_units: 201, max_units: null, price_monthly: null, is_contact_only: true },
];

describe("flat-per-building band selection", () => {
  it("bills per building, never per unit", () => {
    expect(BILLED_PER).toBe("building");
  });

  it("selects the correct band at boundaries", () => {
    expect(selectBandSlug(1, BANDS)).toBe("boutique");
    expect(selectBandSlug(30, BANDS)).toBe("boutique");
    expect(selectBandSlug(31, BANDS)).toBe("mid");
    expect(selectBandSlug(45, BANDS)).toBe("mid"); // the worked example
    expect(selectBandSlug(60, BANDS)).toBe("mid");
    expect(selectBandSlug(61, BANDS)).toBe("larger");
    expect(selectBandSlug(100, BANDS)).toBe("larger");
    expect(selectBandSlug(101, BANDS)).toBe("grand");
    expect(selectBandSlug(200, BANDS)).toBe("grand");
    expect(selectBandSlug(201, BANDS)).toBe("enterprise");
    expect(selectBandSlug(5000, BANDS)).toBe("enterprise");
  });

  it("the price is flat per band — unit count only selects the band", () => {
    // A 45-unit and a 60-unit building pay the SAME flat Mid price.
    expect(selectBand(45, BANDS)?.price_monthly).toBe(449);
    expect(selectBand(60, BANDS)?.price_monthly).toBe(449);
    expect(selectBand(45, BANDS)?.price_monthly).toBe(selectBand(60, BANDS)?.price_monthly);
  });

  it("falls into the smallest band below the floor and clamps junk input", () => {
    expect(selectBandSlug(0, BANDS)).toBe("boutique");
    expect(selectBandSlug(-5, BANDS)).toBe("boutique");
    expect(selectBandSlug(NaN, BANDS)).toBe("boutique");
  });

  it("returns null when there are no bands", () => {
    expect(selectBand(50, [])).toBeNull();
    expect(selectBandSlug(50, [])).toBeNull();
  });

  it("flags contact-only / unpriced bands", () => {
    expect(isContactOnly(BANDS.find((b) => b.slug === "enterprise"))).toBe(true);
    expect(isContactOnly(BANDS.find((b) => b.slug === "mid"))).toBe(false);
    expect(isContactOnly(null)).toBe(false);
    expect(isContactOnly({ slug: "x", price_monthly: null })).toBe(true);
  });
});

/**
 * Band prices by lookup key (2026-11-05): the app charges the price of the
 * Stripe mode it runs in, found by `hoa_<slug>_<kind>` — never the ids on
 * `subscription_plans`, which hold whichever mode the prices script ran last.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bandAmounts,
  bandLookupKey,
  bandPricesFromLookup,
  planBandCheckout,
  withBandPrices,
} from "#core/shared/billing/band-checkout";

const h = vi.hoisted(() => ({ live: false }));
vi.mock("#core/server/utils/stripe", () => ({
  getStripe: () => {
    throw new Error("pass a stripe");
  },
  isStripeLiveMode: () => h.live,
}));
vi.mock("@directus/sdk", () => ({ readItems: () => ({}), aggregate: () => ({}) }));

const { resolveBandPrices, bandWithModePrices, _resetBandPriceCache } = await import("#core/server/utils/subscription-band");

/** A Stripe whose catalog differs by mode, as Hue's does. */
const fakeStripe = (catalog: Record<"test" | "live", Array<{ id: string; lookup_key: string; active?: boolean }>>) => {
  const list = vi.fn(async ({ lookup_keys }: { lookup_keys: string[] }) => ({
    data: catalog[h.live ? "live" : "test"].filter((p) => lookup_keys.includes(p.lookup_key)),
  }));
  return { stripe: { prices: { list } } as any, list };
};

const CATALOG = {
  test: [
    { id: "price_test_m", lookup_key: "hoa_boutique_monthly" },
    { id: "price_test_a", lookup_key: "hoa_boutique_annual" },
    { id: "price_test_o", lookup_key: "hoa_boutique_onboarding" },
  ],
  live: [
    { id: "price_live_m", lookup_key: "hoa_boutique_monthly" },
    { id: "price_live_a", lookup_key: "hoa_boutique_annual" },
    { id: "price_live_o", lookup_key: "hoa_boutique_onboarding" },
  ],
};

const STORED = {
  slug: "boutique",
  name: "Boutique",
  price_monthly: 249,
  price_yearly: 2490,
  onboarding_fee: 1500,
  // What Directus holds after the LIVE run.
  stripe_price_id_monthly: "price_live_m",
  stripe_price_id_yearly: "price_live_a",
  stripe_price_id_onboarding: "price_live_o",
} as any;

beforeEach(() => {
  h.live = false;
  _resetBandPriceCache();
});

describe("pure helpers", () => {
  it("the lookup key is the same string the script writes, in both modes", () => {
    expect(bandLookupKey("boutique", "monthly")).toBe("hoa_boutique_monthly");
    expect(bandLookupKey("grand", "onboarding")).toBe("hoa_grand_onboarding");
  });

  it("picks this band's active prices and nothing else", () => {
    expect(
      bandPricesFromLookup("mid", [
        { id: "p1", lookup_key: "hoa_mid_monthly" },
        { id: "p2", lookup_key: "hoa_mid_annual", active: false },
        { id: "p3", lookup_key: "hoa_boutique_annual" },
        { id: "p4", lookup_key: null },
      ])
    ).toEqual({ monthly: "p1", annual: null, onboarding: null });
  });

  it("withBandPrices replaces the stored ids — a missing price is null, never the stored one", () => {
    const b = withBandPrices(STORED, { monthly: "price_test_m", annual: null, onboarding: "price_test_o" });
    expect(b).toMatchObject({ stripe_price_id_monthly: "price_test_m", stripe_price_id_yearly: null, stripe_price_id_onboarding: "price_test_o" });
    expect(planBandCheckout(b, "annual", "standard")).toMatchObject({ ok: false, reason: "no_price", status: 503 });
  });
});

describe("bandAmounts", () => {
  // Directus returns decimals as strings ("249.00").
  const band = { ...STORED, price_monthly: "249.00", price_yearly: "2490.00", onboarding_fee: "1500.00" };

  it("the signup quote matches what checkout charges, for both intervals", () => {
    const priced = withBandPrices(band, { monthly: "m", annual: "a", onboarding: "o" });
    for (const interval of ["monthly", "annual"] as const) {
      const { recurringPriceId: _r, onboardingPriceId: _o, ok: _k, ...charged } = planBandCheckout(priced, interval, "standard") as any;
      expect(bandAmounts(band, interval, true)).toEqual(charged);
    }
  });

  it("adds onboarding once, and only when asked", () => {
    expect(bandAmounts(band, "annual", true)).toEqual({ periodAmount: 2490, onboardingAmount: 1500, firstInvoiceCents: 399000 });
    expect(bandAmounts(band, "monthly", false)).toEqual({ periodAmount: 249, onboardingAmount: 0, firstInvoiceCents: 24900 });
  });
});

describe("resolveBandPrices", () => {
  it("TEST mode charges test prices even though Directus holds the live ids", async () => {
    const { stripe } = fakeStripe(CATALOG);
    const band = await bandWithModePrices(STORED, stripe);
    expect(planBandCheckout(band, "monthly", "standard")).toMatchObject({
      ok: true,
      recurringPriceId: "price_test_m",
      onboardingPriceId: "price_test_o",
      firstInvoiceCents: 174900,
    });
  });

  it("LIVE mode charges live prices", async () => {
    h.live = true;
    const { stripe } = fakeStripe(CATALOG);
    expect(await resolveBandPrices("boutique", stripe)).toEqual({ monthly: "price_live_m", annual: "price_live_a", onboarding: "price_live_o" });
  });

  it("asks for all three keys in one call, and caches per mode", async () => {
    const { stripe, list } = fakeStripe(CATALOG);
    await resolveBandPrices("boutique", stripe);
    await resolveBandPrices("boutique", stripe);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0]![0]).toMatchObject({
      lookup_keys: ["hoa_boutique_monthly", "hoa_boutique_annual", "hoa_boutique_onboarding"],
      active: true,
    });
    h.live = true;
    expect((await resolveBandPrices("boutique", stripe)).monthly).toBe("price_live_m");
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("a mode whose script never ran gets nulls — checkout refuses with a 503, it doesn't borrow the other mode", async () => {
    const { stripe } = fakeStripe({ test: [], live: CATALOG.live });
    const band = await bandWithModePrices(STORED, stripe);
    expect(planBandCheckout(band, "monthly", "standard")).toMatchObject({ ok: false, reason: "no_price", status: 503 });
  });

  it("no band, or a band with no slug, passes through untouched", async () => {
    const { stripe, list } = fakeStripe(CATALOG);
    expect(await bandWithModePrices(null, stripe)).toBeNull();
    expect(await bandWithModePrices({ ...STORED, slug: null }, stripe)).toMatchObject({ stripe_price_id_monthly: "price_live_m" });
    expect(list).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from "vitest";
import {
  GB,
  ADDONS,
  ADDON_LIST,
  hasAddon,
  addonStorageBytes,
  addonPriceForInterval,
  subscriptionInterval,
  activeAddonsFromPrices,
} from "#core/shared/billing/addons";

describe("billing/addons", () => {
  it("GB is one binary gigabyte", () => {
    expect(GB).toBe(1024 ** 3);
  });

  it("registers the extra_storage_100 add-on with +100 GB", () => {
    expect(ADDONS.extra_storage_100.storageBytes).toBe(100 * GB);
    expect(ADDONS.extra_storage_100.monthlyPrice).toBe(10);
    expect(ADDON_LIST.map((a) => a.key)).toContain("extra_storage_100");
  });

  describe("hasAddon", () => {
    it("is true only when the key is truthy in the map", () => {
      expect(hasAddon({ extra_storage_100: true }, "extra_storage_100")).toBe(true);
      expect(hasAddon({ extra_storage_100: false }, "extra_storage_100")).toBe(false);
      expect(hasAddon({}, "extra_storage_100")).toBe(false);
    });

    it("is safe on null / non-object input", () => {
      expect(hasAddon(null, "extra_storage_100")).toBe(false);
      expect(hasAddon(undefined, "extra_storage_100")).toBe(false);
      expect(hasAddon("nope" as unknown, "extra_storage_100")).toBe(false);
    });
  });

  describe("addonStorageBytes", () => {
    it("sums the storage granted by active storage add-ons", () => {
      expect(addonStorageBytes({ extra_storage_100: true })).toBe(100 * GB);
    });

    it("grants nothing when no storage add-on is active", () => {
      expect(addonStorageBytes({})).toBe(0);
      expect(addonStorageBytes(null)).toBe(0);
      expect(addonStorageBytes({ extra_storage_100: false })).toBe(0);
    });
  });
});

describe("billing/addons — monthly and yearly prices", () => {
  const prices = { month: "price_m", year: "price_y" };
  const item = (id: string, interval: string) => ({ price: { id, recurring: { interval } } });

  it("Extra Storage is $10 a month or $100 a year", () => {
    expect(ADDONS.extra_storage_100.yearlyPrice).toBe(100);
  });

  it("picks the add-on's price for the subscription's interval, and none for another", () => {
    expect(addonPriceForInterval(prices, "month")).toBe("price_m");
    expect(addonPriceForInterval(prices, "year")).toBe("price_y");
    expect(addonPriceForInterval(prices, "week")).toBeUndefined();
    expect(addonPriceForInterval(prices, null)).toBeUndefined();
    expect(addonPriceForInterval({ month: "price_m" }, "year")).toBeUndefined();
  });

  it("reads the interval from the plan's item, not an add-on's", () => {
    const addonIds = new Set(["price_m", "price_y"]);
    expect(subscriptionInterval([item("price_y", "year"), item("band_month", "month")], addonIds)).toBe("month");
    expect(subscriptionInterval([item("band_year", "year")], addonIds)).toBe("year");
    expect(subscriptionInterval([item("price_m", "month")], addonIds)).toBe("month");
    expect(subscriptionInterval([], addonIds)).toBeNull();
  });

  it("an add-on is active when either of its prices is an item", () => {
    const byAddon = { extra_storage_100: prices };
    expect(activeAddonsFromPrices(["band", "price_y"], byAddon)).toEqual({ extra_storage_100: true });
    expect(activeAddonsFromPrices(["band", "price_m"], byAddon)).toEqual({ extra_storage_100: true });
    expect(activeAddonsFromPrices(["band", null], byAddon)).toEqual({});
    expect(activeAddonsFromPrices(["band"], { extra_storage_100: {} })).toEqual({});
  });
});

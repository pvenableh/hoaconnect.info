import { describe, it, expect } from "vitest";
import {
  GB,
  ADDONS,
  ADDON_LIST,
  hasAddon,
  addonStorageBytes,
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

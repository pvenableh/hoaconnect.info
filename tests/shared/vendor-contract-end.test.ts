import { describe, expect, it } from "vitest";
import { vendorEndsOn } from "#core/shared/vendors/contract-end";
import { vendorNoticesOf } from "#core/server/utils/ai-notices";

describe("vendorEndsOn", () => {
  it("prefers the contract date, falls back to active_until, else null", () => {
    expect(vendorEndsOn({ contract_end: "2026-06-30", active_until: "2026-12-31" })).toBe("2026-06-30");
    expect(vendorEndsOn({ active_until: "2026-12-31T00:00:00" })).toBe("2026-12-31");
    expect(vendorEndsOn({})).toBeNull();
    expect(vendorEndsOn(null)).toBeNull();
  });

  it("an AI notice reads the contract date", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const lapsed = vendorNoticesOf({ status: "active", company: "Acme", contract_end: "2026-11-01", active_until: null }, "v1", now);
    expect(lapsed.length).toBeGreaterThan(0);
    expect(JSON.stringify(lapsed)).toContain("2026-11-01");
    expect(vendorNoticesOf({ status: "active", company: "Acme", contract_end: null, active_until: null }, "v1", now)).toEqual([]);
  });
});

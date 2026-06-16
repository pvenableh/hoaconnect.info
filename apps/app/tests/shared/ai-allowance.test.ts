import { describe, it, expect } from "vitest";
import { shouldResetAllowance, nextResetISO } from "~~/shared/ai/allowance";

describe("shouldResetAllowance", () => {
  const now = new Date("2026-06-13T12:00:00Z");

  it("resets when never provisioned (null / undefined)", () => {
    expect(shouldResetAllowance(null, now)).toBe(true);
    expect(shouldResetAllowance(undefined, now)).toBe(true);
  });

  it("resets when the period boundary has passed", () => {
    expect(shouldResetAllowance("2026-06-01T00:00:00Z", now)).toBe(true);
  });

  it("does not reset mid-period", () => {
    expect(shouldResetAllowance("2026-07-01T00:00:00Z", now)).toBe(false);
  });

  it("resets exactly at the boundary", () => {
    expect(shouldResetAllowance("2026-06-13T12:00:00Z", now)).toBe(true);
  });

  it("resets on a garbage date", () => {
    expect(shouldResetAllowance("not-a-date", now)).toBe(true);
  });
});

describe("nextResetISO", () => {
  it("returns 00:00 UTC on the first of next month", () => {
    expect(nextResetISO(new Date("2026-06-13T12:00:00Z"))).toBe("2026-07-01T00:00:00.000Z");
  });

  it("rolls over the year in December", () => {
    expect(nextResetISO(new Date("2026-12-31T23:59:59Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
});

import { describe, it, expect } from "vitest";
import {
  emailAllowed,
  bellAllowed,
  allMuted,
  digestEnabled,
  digestCadence,
  digestHour,
  digestSections,
  shouldSendDigest,
  sanitizePreferences,
  DIGEST_DEFAULTS,
} from "#core/shared/notifications/preferences";

describe("notification preferences — immediate gating (opt-in defaults)", () => {
  it("emails by default when nothing is set", () => {
    expect(emailAllowed(null, null, "announcement")).toBe(true);
    expect(emailAllowed({}, true, "meeting")).toBe(true);
  });

  it("honors the master email kill-switch", () => {
    expect(emailAllowed({}, false, "announcement")).toBe(false);
  });

  it("honors _all mute for both channels", () => {
    expect(allMuted({ _all: false })).toBe(true);
    expect(emailAllowed({ _all: false }, true, "announcement")).toBe(false);
    expect(bellAllowed({ _all: false }, "announcement")).toBe(false);
  });

  it("honors per-category opt-out (default on)", () => {
    expect(emailAllowed({ announcement: false }, true, "announcement")).toBe(false);
    expect(emailAllowed({ announcement: false }, true, "meeting")).toBe(true);
    expect(bellAllowed({ meeting_bell: false }, "meeting")).toBe(false);
    expect(bellAllowed({ meeting_bell: false }, "announcement")).toBe(true);
  });
});

describe("notification preferences — digest", () => {
  it("is off unless explicitly enabled", () => {
    expect(digestEnabled(null)).toBe(false);
    expect(digestEnabled({ digest_enabled: true })).toBe(true);
  });

  it("falls back to defaults for cadence/hour/sections", () => {
    expect(digestCadence(null)).toBe(DIGEST_DEFAULTS.cadence);
    expect(digestHour(null)).toBe(DIGEST_DEFAULTS.hour);
    expect(digestSections(null)).toEqual(DIGEST_DEFAULTS.sections);
    expect(digestHour({ digest_hour: 99 })).toBe(DIGEST_DEFAULTS.hour); // out of range
  });

  describe("shouldSendDigest", () => {
    const base = { digest_enabled: true, digest_hour: 8 };

    it("never fires when disabled or cadence off", () => {
      expect(shouldSendDigest({ ...base, digest_enabled: false }, 8, 1)).toBe(false);
      expect(shouldSendDigest({ ...base, digest_cadence: "off" }, 8, 1)).toBe(false);
    });

    it("only fires at the configured local hour", () => {
      expect(shouldSendDigest({ ...base, digest_cadence: "daily" }, 8, 3)).toBe(true);
      expect(shouldSendDigest({ ...base, digest_cadence: "daily" }, 9, 3)).toBe(false);
    });

    it("weekly fires Mondays only", () => {
      expect(shouldSendDigest({ ...base, digest_cadence: "weekly" }, 8, 1)).toBe(true);
      expect(shouldSendDigest({ ...base, digest_cadence: "weekly" }, 8, 2)).toBe(false);
    });

    it("weekdays skips the weekend", () => {
      expect(shouldSendDigest({ ...base, digest_cadence: "weekdays" }, 8, 5)).toBe(true);
      expect(shouldSendDigest({ ...base, digest_cadence: "weekdays" }, 8, 6)).toBe(false);
      expect(shouldSendDigest({ ...base, digest_cadence: "weekdays" }, 8, 0)).toBe(false);
    });
  });
});

describe("sanitizePreferences", () => {
  it("keeps only known keys with correct types", () => {
    const out = sanitizePreferences({
      _all: true,
      announcement: false,
      meeting_bell: false,
      digest_enabled: true,
      digest_cadence: "daily",
      digest_hour: 7,
      digest_sections: ["meetings", "bogus"],
      evil: "<script>",
      payment: "not-a-bool",
    });
    expect(out).toEqual({
      _all: true,
      announcement: false,
      meeting_bell: false,
      digest_enabled: true,
      digest_cadence: "daily",
      digest_hour: 7,
      digest_sections: ["meetings"],
    });
  });

  it("drops an out-of-range hour and invalid cadence", () => {
    const out = sanitizePreferences({ digest_hour: 42, digest_cadence: "hourly" });
    expect(out.digest_hour).toBeUndefined();
    expect(out.digest_cadence).toBeUndefined();
  });

  it("returns an empty object for junk input", () => {
    expect(sanitizePreferences(null)).toEqual({});
    expect(sanitizePreferences("nope")).toEqual({});
  });
});

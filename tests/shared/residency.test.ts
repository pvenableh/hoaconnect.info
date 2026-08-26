import { describe, it, expect } from "vitest";
import {
  normalizeResidency,
  isKnownNonResidency,
  residencyOnAccept,
} from "#core/shared/members/residency";

describe("normalizeResidency", () => {
  it("passes through the two real residencies", () => {
    expect(normalizeResidency("owner")).toBe("owner");
    expect(normalizeResidency("tenant")).toBe("tenant");
  });

  it("treats property_manager as no residency, not as an owner", () => {
    // A manager is neither owner nor tenant of the unit; the Property Manager
    // ROLE carries that. Recording them as an owner would put them in
    // owner-only audiences.
    expect(normalizeResidency("property_manager")).toBeNull();
  });

  it("rejects junk rather than letting it reach the roster", () => {
    for (const bad of ["Owner", "OWNER", "landlord", "", " ", 1, true, {}, []]) {
      expect(normalizeResidency(bad)).toBeNull();
    }
  });

  it("is null for null and undefined", () => {
    expect(normalizeResidency(null)).toBeNull();
    expect(normalizeResidency(undefined)).toBeNull();
  });
});

describe("isKnownNonResidency", () => {
  it("accepts the deliberate 'unspecified' inputs", () => {
    expect(isKnownNonResidency(null)).toBe(true);
    expect(isKnownNonResidency(undefined)).toBe(true);
    expect(isKnownNonResidency("")).toBe(true);
    expect(isKnownNonResidency("property_manager")).toBe(true);
  });

  it("does NOT excuse a typo — that is what makes the 400 possible", () => {
    // The endpoint rejects only when normalizeResidency fails AND this is
    // false, so a misspelling must land here as false or it would be
    // silently swallowed as "unspecified".
    expect(isKnownNonResidency("Owner")).toBe(false);
    expect(isKnownNonResidency("landlord")).toBe(false);
    expect(isKnownNonResidency("owner ")).toBe(false);
  });
});

describe("residencyOnAccept", () => {
  it("uses the residency the invitation carries", () => {
    expect(residencyOnAccept("tenant")).toBe("tenant");
    expect(residencyOnAccept("owner")).toBe("owner");
  });

  it("falls back to owner for invitations that predate the field", () => {
    // Not a new guess: this is exactly what accept-invitation did
    // unconditionally for every invitee before Phase 1.
    expect(residencyOnAccept(null)).toBe("owner");
    expect(residencyOnAccept(undefined)).toBe("owner");
  });

  it("never returns a non-residency, even from a manager invitation", () => {
    expect(residencyOnAccept("property_manager")).toBe("owner");
    expect(residencyOnAccept("landlord")).toBe("owner");
  });

  it("is the regression guard for the hardcoded owner", () => {
    // The bug: every accepted invitation became an owner regardless of what
    // the admin chose. 1033 Lenox has 22 tenants.
    expect(residencyOnAccept("tenant")).not.toBe("owner");
  });
});

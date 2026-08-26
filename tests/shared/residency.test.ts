import { describe, it, expect } from "vitest";
import {
  normalizeResidency,
  isKnownNonResidency,
  residencyOnAccept,
  residencyFor,
  resolveResidency,
  RESIDENCY_UNIT_FIELDS,
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

describe("residencyFor — unit link first, member_type as fallback", () => {
  it("prefers the unit link over the member's own value", () => {
    // The whole point of Phase 2: someone recorded as an owner on the member
    // row who actually RENTS the unit they live in.
    const member = { member_type: "owner", units: [{ member_type: "tenant" }] };
    expect(residencyFor(member)).toBe("tenant");
    expect(resolveResidency(member).source).toBe("unit_link");
  });

  it("falls back to member_type when there are no unit links at all", () => {
    // 605 Lincoln Road: live in production, 33 active members, ZERO links.
    // Without this, every one of them resolves to nothing.
    expect(residencyFor({ member_type: "owner", units: [] })).toBe("owner");
    expect(residencyFor({ member_type: "owner" })).toBe("owner");
    expect(residencyFor({ member_type: "tenant", units: null })).toBe("tenant");
    expect(resolveResidency({ member_type: "owner" }).source).toBe("member_fallback");
  });

  it("falls back when the links exist but carry no residency", () => {
    // Every one of the 81 links on production today, since the field was only
    // just added. They must not blank out the members they belong to.
    const member = { member_type: "tenant", units: [{ member_type: null }, { member_type: "" }] };
    expect(residencyFor(member)).toBe("tenant");
    expect(resolveResidency(member).source).toBe("member_fallback");
  });

  it("returns null, not owner, when nothing anywhere says", () => {
    // 1033 Lenox has 3 active members with member_type: null. Guessing "owner"
    // here would put them in owner-only mail audiences.
    expect(residencyFor({ member_type: null, units: [] })).toBe(null);
    expect(residencyFor(null)).toBe(null);
    expect(residencyFor(undefined)).toBe(null);
    expect(resolveResidency({}).source).toBe("none");
  });

  it("lets a primary unit win over a non-primary one", () => {
    const member = {
      member_type: "owner",
      units: [
        { member_type: "owner", is_primary_unit: false },
        { member_type: "tenant", is_primary_unit: true },
      ],
    };
    expect(residencyFor(member)).toBe("tenant");
  });

  it("ignores an occupancy that has already ended", () => {
    const asOf = new Date("2026-08-26T00:00:00Z");
    const member = {
      member_type: "owner",
      units: [{ member_type: "tenant", end_date: "2026-03-01" }],
    };
    expect(residencyFor(member, { asOf })).toBe("owner");
    expect(resolveResidency(member, { asOf }).source).toBe("member_fallback");
  });

  it("keeps an occupancy whose end date has not arrived yet", () => {
    const asOf = new Date("2026-08-26T00:00:00Z");
    const member = {
      member_type: "owner",
      units: [{ member_type: "tenant", end_date: "2027-03-01" }],
    };
    expect(residencyFor(member, { asOf })).toBe("tenant");
  });

  it("keeps a link whose end_date is unparseable rather than discarding it", () => {
    const member = { member_type: "owner", units: [{ member_type: "tenant", end_date: "not-a-date" }] };
    expect(residencyFor(member)).toBe("tenant");
  });

  it("does NOT consult the link's status", () => {
    // 79 of 81 production links are `draft` — that is what migrate-1033.ts
    // wrote. Filtering on status would ignore all of 1033 Lenox's residency.
    const member = { member_type: "owner", units: [{ member_type: "tenant", status: "draft" }] };
    expect(residencyFor(member)).toBe("tenant");
  });

  it("falls through to the member when a link carries a junk residency", () => {
    // Directus does NOT enforce `choices` — proved on production. A direct
    // write of garbage must not poison an audience.
    const member = { member_type: "owner", units: [{ member_type: "COMPLETE-GARBAGE" }] };
    expect(residencyFor(member)).toBe("owner");
    expect(resolveResidency(member).source).toBe("member_fallback");
  });

  it("ignores unexpanded string ids in the units alias", () => {
    // A caller that forgot to expand `units` gets the fallback, not a crash.
    const member = { member_type: "owner", units: ["a1b2", "c3d4"] };
    expect(residencyFor(member)).toBe("owner");
  });

  it("asks for every field the resolver actually reads", () => {
    // A half-migrated call site that omits end_date would let an ended
    // occupancy decide a current mail audience.
    expect([...RESIDENCY_UNIT_FIELDS]).toEqual([
      "units.member_type",
      "units.is_primary_unit",
      "units.end_date",
    ]);
  });
});

/**
 * The transition planner's two jobs: never leave a community without an
 * administrator, and refuse outright when it cannot avoid doing so.
 *
 * The ordering assertions here are the point of the module. A transition that
 * revokes before it promotes opens a window with no admin — and if the promote
 * then fails, that window never closes: nobody left can invite anyone, export
 * anything, or undo it. Route code can't be trusted to preserve that ordering
 * across future edits; a test can.
 */

import { describe, it, expect } from "vitest";
import {
  addDays,
  eligibleSuccessors,
  planTransition,
  TRANSITION_GRACE_DAYS,
  type MemberSnapshot,
  type OrgSnapshot,
  type TransitionInput,
  type VendorSnapshot,
} from "#core/shared/transition/plan";
import {
  GRANT_PRESETS,
  MANAGER_GRANT_KEYS,
  MANAGER_GRANT_LABELS,
  matchPreset,
  normalizeGrants,
  NO_GRANTS,
  hasAnyGrant,
  presetFor,
} from "#core/shared/transition/grants";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTransitionAuditEntry } from "#core/shared/transition/audit";

const NOW = "2026-08-19T12:00:00.000Z";

function member(over: Partial<MemberSnapshot> & { id: string }): MemberSnapshot {
  return {
    name: `Member ${over.id}`,
    email: `${over.id}@example.com`,
    userId: `user-${over.id}`,
    roleKind: "member",
    status: "active",
    isBoardMember: false,
    boardTitle: null,
    hasGrants: false,
    isAgencyStaff: false,
    ...over,
  };
}

function org(over: Partial<OrgSnapshot> = {}): OrgSnapshot {
  return {
    id: "org-1",
    name: "Harborview Lofts",
    slug: "harborview",
    billingAccountId: "acct-1",
    subscriptionStatus: "active",
    isFreeAccount: false,
    graceEndsAt: null,
    ...over,
  };
}

function vendor(over: Partial<VendorSnapshot> = {}): VendorSnapshot {
  return {
    id: "vendor-1",
    company: "Acme Management",
    status: "active",
    activeUntil: null,
    userId: "user-pm",
    memberId: "pm",
    ...over,
  };
}

/** The ordinary case: an agency manages the org, a board president can take over. */
function baseInput(over: Partial<TransitionInput> = {}): TransitionInput {
  return {
    organization: org(),
    members: [
      member({ id: "pm", roleKind: "property_manager", hasGrants: true, name: "Dana Reyes" }),
      member({ id: "agency", roleKind: "hoa_admin", name: "Acme Management", isAgencyStaff: true }),
      member({ id: "pres", isBoardMember: true, boardTitle: "president", name: "Jo Alvarez" }),
      member({ id: "owner", name: "Sam Chu" }),
    ],
    managementVendors: [vendor()],
    successorMemberId: "pres",
    now: NOW,
    ...over,
  };
}

const kinds = (p: ReturnType<typeof planTransition>) => p.steps.map((s) => s.kind);

describe("the community is never left without an administrator", () => {
  it("promotes before it revokes anything", () => {
    const plan = planTransition(baseInput());
    const order = kinds(plan);

    expect(order[0]).toBe("promote_admin");
    for (const taking of ["revoke_grants", "deactivate_member"] as const) {
      expect(order.indexOf("promote_admin")).toBeLessThan(order.indexOf(taking));
    }
  });

  it("refuses when nobody is left to promote", () => {
    // Exactly what add-property.post.ts can leave behind: the agency is the
    // only admin and there is no other active human on the org.
    const plan = planTransition(
      baseInput({
        members: [
          member({ id: "pm", roleKind: "property_manager", hasGrants: true }),
          member({ id: "agency", roleKind: "hoa_admin", isAgencyStaff: true }),
        ],
        successorMemberId: null,
      })
    );

    expect(plan.canExecute).toBe(false);
    expect(plan.blockers.map((b) => b.code)).toContain("no_eligible_successor");
  });

  it("asks for a choice when one is possible but not made", () => {
    const plan = planTransition(baseInput({ successorMemberId: null }));
    expect(plan.canExecute).toBe(false);
    expect(plan.blockers.map((b) => b.code)).toEqual(["successor_required"]);
  });

  it("needs no successor when an admin who is staying already exists", () => {
    const plan = planTransition(
      baseInput({
        successorMemberId: null,
        members: [
          member({ id: "pm", roleKind: "property_manager", hasGrants: true }),
          member({ id: "pres", roleKind: "hoa_admin", isBoardMember: true, boardTitle: "president" }),
        ],
      })
    );
    expect(plan.canExecute).toBe(true);
    expect(kinds(plan)).not.toContain("promote_admin");
  });

  it("will not hand the account to the manager who is leaving", () => {
    const plan = planTransition(baseInput({ successorMemberId: "pm" }));
    expect(plan.blockers.map((b) => b.code)).toContain("successor_ineligible");
  });

  it("will not hand the account to another property manager", () => {
    const plan = planTransition(
      baseInput({
        successorMemberId: "pm2",
        members: [
          ...baseInput().members,
          member({ id: "pm2", roleKind: "property_manager" }),
        ],
        outgoingMemberIds: ["pm"],
      })
    );
    expect(plan.blockers.map((b) => b.code)).toContain("successor_ineligible");
  });

  it("takes back the admin seat the agency holds on an org it created", () => {
    // add-property.post.ts makes the creating agency the HOA Admin. If the
    // transition only offboarded `property_manager` rows, the manager would
    // walk away still holding the community's account.
    const plan = planTransition(baseInput());
    expect(plan.outgoing.map((m) => m.id).sort()).toEqual(["agency", "pm"]);
    expect(eligibleSuccessors(baseInput()).map((m) => m.id)).not.toContain("agency");
  });

  it("never offers agency staff as the successor, even when they are left behind", () => {
    const ranked = eligibleSuccessors(
      baseInput({ outgoingMemberIds: ["pm"] })
    );
    expect(ranked.map((m) => m.id)).not.toContain("agency");
  });

  it("rejects a successor who isn't a member at all", () => {
    const plan = planTransition(baseInput({ successorMemberId: "stranger" }));
    expect(plan.blockers.map((b) => b.code)).toContain("successor_not_found");
  });
});

describe("an explicitly empty outgoing list means nobody", () => {
  it("changes billing without offboarding anyone", () => {
    // The agency dashboard's detach: the property leaves the billing account,
    // but the manager keeps working there. Reading `outgoingMemberIds?.length`
    // would have turned this into the default and revoked their access.
    const plan = planTransition(baseInput({ outgoingMemberIds: [], successorMemberId: null }));
    expect(plan.outgoing).toEqual([]);
    expect(kinds(plan)).toEqual(["detach_billing", "open_grace", "write_audit"]);
    expect(plan.canExecute).toBe(true);
  });
});

describe("who gets offered as a successor", () => {
  it("puts board members first, by seniority", () => {
    const ranked = eligibleSuccessors(
      baseInput({
        members: [
          member({ id: "pm", roleKind: "property_manager" }),
          member({ id: "owner" }),
          member({ id: "dir", isBoardMember: true, boardTitle: "director" }),
          member({ id: "pres", isBoardMember: true, boardTitle: "president" }),
          member({ id: "treas", isBoardMember: true, boardTitle: "treasurer" }),
        ],
      })
    );
    expect(ranked.map((m) => m.id)).toEqual(["pres", "treas", "dir", "owner"]);
  });

  it("never offers the outgoing manager, inactive members, or managers", () => {
    const ranked = eligibleSuccessors(
      baseInput({
        members: [
          member({ id: "pm", roleKind: "property_manager" }),
          member({ id: "gone", status: "inactive" }),
          member({ id: "pending", status: "pending" }),
          member({ id: "ok" }),
        ],
      })
    );
    expect(ranked.map((m) => m.id)).toEqual(["ok"]);
  });
});

describe("billing becomes a grace window, not a cliff", () => {
  it("opens a 60-day window when detaching from an agency account", () => {
    const plan = planTransition(baseInput());
    expect(kinds(plan)).toContain("detach_billing");
    expect(kinds(plan)).toContain("open_grace");
    expect(plan.graceEndsAt).toBe(addDays(NOW, TRANSITION_GRACE_DAYS));
  });

  it("touches no billing for a self-billed community", () => {
    const plan = planTransition(
      baseInput({ organization: org({ billingAccountId: null }) })
    );
    expect(kinds(plan)).not.toContain("detach_billing");
    expect(plan.graceEndsAt).toBeNull();
    expect(plan.warnings.map((w) => w.code)).toContain("self_billed_no_detach");
  });

  it("skips the grace window for a free account, which cannot be locked out", () => {
    const plan = planTransition(
      baseInput({ organization: org({ isFreeAccount: true }) })
    );
    expect(kinds(plan)).toContain("detach_billing");
    expect(kinds(plan)).not.toContain("open_grace");
    expect(plan.graceEndsAt).toBeNull();
  });

  it("warns rather than blocks when a transition is already under way", () => {
    const plan = planTransition(
      baseInput({ organization: org({ graceEndsAt: "2026-10-01T00:00:00.000Z" }) })
    );
    expect(plan.canExecute).toBe(true);
    expect(plan.warnings.map((w) => w.code)).toContain("transition_in_flight");
  });
});

describe("the community's own record of who managed it", () => {
  it("end-dates the management vendor", () => {
    const plan = planTransition(baseInput());
    const step = plan.steps.find((s) => s.kind === "end_vendor");
    expect(step?.targetIds).toEqual(["vendor-1"]);
  });

  it("does not re-end an already-ended relationship", () => {
    const plan = planTransition(
      baseInput({ managementVendors: [vendor({ activeUntil: "2026-01-01" })] })
    );
    expect(kinds(plan)).not.toContain("end_vendor");
    expect(plan.warnings.map((w) => w.code)).toContain("vendor_already_ended");
  });

  it("proceeds, with a warning, when no management company is recorded", () => {
    const plan = planTransition(baseInput({ managementVendors: [] }));
    expect(plan.canExecute).toBe(true);
    expect(plan.warnings.map((w) => w.code)).toContain("no_management_vendor");
  });

  it("deactivates the outgoing membership instead of deleting it", () => {
    const plan = planTransition(baseInput());
    const step = plan.steps.find((s) => s.kind === "deactivate_member");
    expect([...(step?.targetIds ?? [])].sort()).toEqual(["agency", "pm"]);
    expect(step?.detail).toMatch(/Nothing is deleted/i);
  });

  it("always ends with the audit entry", () => {
    const plan = planTransition(baseInput());
    expect(kinds(plan).at(-1)).toBe("write_audit");
  });

  it("offers the outgoing manager an export only when asked", () => {
    expect(kinds(planTransition(baseInput()))).not.toContain("offer_export");
    expect(
      kinds(planTransition(baseInput({ includeExportForOutgoing: true })))
    ).toContain("offer_export");
  });
});

describe("a transition that changes nothing is not an event", () => {
  it("blocks when there is no manager and the admin is already a member", () => {
    const plan = planTransition({
      organization: org({ billingAccountId: null }),
      members: [member({ id: "pres", roleKind: "hoa_admin", isBoardMember: true })],
      managementVendors: [],
      now: NOW,
    });
    expect(plan.canExecute).toBe(false);
    expect(plan.blockers.map((b) => b.code)).toContain("nothing_to_do");
  });
});

describe("grant presets", () => {
  it("gives full service every grant there is", () => {
    const full = presetFor("full_service")!;
    expect(MANAGER_GRANT_KEYS.every((k) => full.grants[k])).toBe(true);
  });

  it("defines every key on every preset — a missing key reads as neither on nor off", () => {
    for (const preset of GRANT_PRESETS) {
      expect(Object.keys(preset.grants).sort()).toEqual([...MANAGER_GRANT_KEYS].sort());
    }
  });

  it("revocation clears every key rather than nulling the field", () => {
    expect(Object.keys(NO_GRANTS).sort()).toEqual([...MANAGER_GRANT_KEYS].sort());
    expect(hasAnyGrant(NO_GRANTS)).toBe(false);
  });

  it("names every grant, because the ledger writes the name into a permanent row", () => {
    // A key with no label renders as the raw key in a grant-change entry —
    // "gained feedback" instead of "gained Community feedback" — in a record
    // that cannot be edited afterwards.
    for (const key of MANAGER_GRANT_KEYS) {
      expect(MANAGER_GRANT_LABELS[key], key).toBeTruthy();
      expect(MANAGER_GRANT_LABELS[key]).not.toBe(key);
    }
  });

  it("offers every grant as a switch on the settings screen", () => {
    // The screen keeps its own list, because a switch is phrased as an action
    // and a ledger entry needs a noun. A key missing from that list is a
    // permission an admin cannot turn on — and, far worse, cannot turn OFF when
    // a manager leaves.
    const page = readFileSync(
      join(process.cwd(), "app/components/pages/SettingsPropertyManagementPage.vue"),
      "utf8"
    );
    const listed = new Set(
      [...page.matchAll(/\{\s*key:\s*"([a-z_]+)",\s*label:/g)].map((m) => m[1])
    );
    for (const key of MANAGER_GRANT_KEYS) {
      expect(listed.has(key), `${key} has no switch on the settings screen`).toBe(true);
    }
  });

  it("adds a new grant switched OFF, so it never widens an existing manager", () => {
    // `feedback` arrived after managers already existed. normalizeGrants filling
    // an absent key as false is what makes adding one safe.
    expect(normalizeGrants({ inquiries: true }).feedback).toBe(false);
    expect(NO_GRANTS.feedback).toBe(false);
    // The narrower presets deliberately leave it off; full service is the only
    // one that hands over community feedback.
    expect(presetFor("inquiries_only")!.grants.feedback).toBe(false);
    expect(presetFor("standard")!.grants.feedback).toBe(false);
    expect(presetFor("full_service")!.grants.feedback).toBe(true);
  });

  it("recognizes a stored set as its preset, and a custom mix as none", () => {
    expect(matchPreset(presetFor("standard")!.grants)?.key).toBe("standard");
    expect(matchPreset({ inquiries: true, projects: true })).toBeNull();
  });

  it("treats a missing flag as off rather than truthy", () => {
    const norm = normalizeGrants({ inquiries: true, violations: "yes" as never });
    expect(norm.inquiries).toBe(true);
    expect(norm.violations).toBe(false);
    expect(norm.documents).toBe(false);
  });
});

describe("the audit entry", () => {
  it("reads as a sentence and keeps the structured record", () => {
    const plan = planTransition(baseInput());
    const entry = buildTransitionAuditEntry({
      plan,
      organizationId: "org-1",
      organizationName: "Harborview Lofts",
      actor: { userId: "u1", name: "Jo Alvarez", email: "jo@example.com" },
      occurredAt: NOW,
    });

    // Named, not counted — see listNames in audit.ts.
    expect(entry.summary).toContain("Dana Reyes");
    expect(entry.summary).toContain("Acme Management");
    expect(entry.summary).toContain("Jo Alvarez");
    expect(entry.event_type).toBe("management_transition");
    expect(entry.visibility).toBe("owners");
    expect((entry.payload as any).outgoing[0].member_id).toBe("pm");
    expect((entry.payload as any).grace_ends_at).toBe(plan.graceEndsAt);
  });

  it("keeps the actor's name even though it also stores the user id", () => {
    // The row has to still read correctly after the account is deleted.
    const entry = buildTransitionAuditEntry({
      plan: planTransition(baseInput()),
      organizationId: "org-1",
      organizationName: "Harborview Lofts",
      actor: { userId: null, name: "Jo Alvarez", email: null },
      occurredAt: NOW,
    });
    expect(entry.actor_user).toBeNull();
    expect(entry.actor_name).toBe("Jo Alvarez");
  });
});

describe("addDays", () => {
  it("crosses month boundaries in UTC", () => {
    expect(addDays("2026-01-31T00:00:00.000Z", 1)).toBe("2026-02-01T00:00:00.000Z");
    expect(addDays("2026-08-19T12:00:00.000Z", 60)).toBe("2026-10-18T12:00:00.000Z");
  });

  it("throws on a timestamp it cannot parse rather than returning Invalid Date", () => {
    expect(() => addDays("not-a-date", 1)).toThrow(/Invalid timestamp/);
  });
});

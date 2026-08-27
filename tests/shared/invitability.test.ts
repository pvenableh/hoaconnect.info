import { describe, it, expect } from "vitest";
import {
  isInvitableStatus,
  invitableMembers,
  inviteGateFor,
} from "#core/shared/members/invitability";

const member = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  status: "active",
  user: null,
  first_name: "Dana",
  last_name: "Reyes",
  ...over,
});

describe("isInvitableStatus", () => {
  it("is true only for active", () => {
    expect(isInvitableStatus("active")).toBe(true);
    for (const s of ["inactive", "pending", "archived", "", null, undefined, "Active", 1]) {
      expect(isInvitableStatus(s)).toBe(false);
    }
  });
});

describe("invitableMembers", () => {
  it("keeps active members who have never signed in — the whole point of the batch", () => {
    // ⚠️ The two axes. No account is NOT a reason to exclude someone; it is the
    // reason to INCLUDE them. 58 of 1033 Lenox's 59 active members are exactly
    // this shape.
    const rows = [
      member({ id: "a", status: "active", user: null }),
      member({ id: "b", status: "active", user: null }),
    ];
    expect(invitableMembers(rows).map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("drops archived former residents", () => {
    const rows = [member({ id: "a" }), member({ id: "z", status: "archived" })];
    expect(invitableMembers(rows).map((m) => m.id)).toEqual(["a"]);
  });

  it("drops inactive and pending members", () => {
    const rows = [
      member({ id: "a" }),
      member({ id: "i", status: "inactive" }),
      member({ id: "p", status: "pending" }),
    ];
    expect(invitableMembers(rows).map((m) => m.id)).toEqual(["a"]);
  });

  it("drops people who are already on the portal", () => {
    const rows = [member({ id: "a" }), member({ id: "u", user: "user-uuid" })];
    expect(invitableMembers(rows).map((m) => m.id)).toEqual(["a"]);
  });

  it("recognises an expanded user object, not just an id string", () => {
    expect(invitableMembers([member({ user: { id: "user-uuid" } })])).toHaveLength(0);
    expect(invitableMembers([member({ user: {} })])).toHaveLength(1);
  });

  it("reproduces 1033 Lenox's real numbers: 86 members → 58 invitable", () => {
    const rows = [
      ...Array.from({ length: 58 }, (_, i) => member({ id: `a${i}`, status: "active", user: null })),
      member({ id: "onboarded", status: "active", user: "user-uuid" }),
      ...Array.from({ length: 27 }, (_, i) => member({ id: `x${i}`, status: "archived" })),
    ];
    expect(rows).toHaveLength(86);
    expect(invitableMembers(rows)).toHaveLength(58);
  });

  it("tolerates an empty roster", () => {
    expect(invitableMembers([])).toEqual([]);
  });
});

describe("inviteGateFor", () => {
  it("allows an email nobody in the org holds", () => {
    expect(inviteGateFor([])).toMatchObject({
      allowed: true,
      member: null,
      code: null,
      restore: null,
    });
  });

  it("allows an ACTIVE member with no account, and names the row to adopt", () => {
    const active = member({ id: "existing" });
    const decision = inviteGateFor([active]);
    expect(decision.allowed).toBe(true);
    // The row matters: accept-invitation adopts it instead of creating a second
    // member for the same email.
    expect(decision.member?.id).toBe("existing");
  });

  it("blocks a member who already has an account", () => {
    const decision = inviteGateFor([member({ user: "user-uuid" })]);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("member_already_onboarded");
    expect(decision.message!).toContain("already has a portal account");
    expect(decision.restore).toBeNull();
  });

  it("blocks an ARCHIVED member, names the reason, and offers restore", () => {
    const decision = inviteGateFor([member({ id: "old", status: "archived" })]);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("member_archived");
    expect(decision.status).toBe("archived");
    expect(decision.message!).toContain("archived former resident");
    expect(decision.restore).toEqual({
      memberId: "old",
      name: "Dana Reyes",
      currentStatus: "archived",
    });
  });

  it("never restores by itself — the decision carries a target, not an action", () => {
    // ⚠️ Settled decision: a typo'd email that matches a former resident must
    // not silently reactivate them. The gate is pure; it cannot write.
    const archived = member({ id: "old", status: "archived" });
    const decision = inviteGateFor([archived]);
    expect(decision.allowed).toBe(false);
    expect(archived.status).toBe("archived");
  });

  it("blocks inactive and pending, naming the actual status", () => {
    for (const status of ["inactive", "pending"]) {
      const decision = inviteGateFor([member({ status })]);
      expect(decision.allowed).toBe(false);
        expect(decision.code).toBe("member_not_active");
      expect(decision.status).toBe(status);
      expect(decision.message!).toContain(`"${status}"`);
    }
  });

  it("blocks an unrecognised status rather than assuming it is safe", () => {
    const decision = inviteGateFor([member({ status: null })]);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("member_not_active");
    expect(decision.status).toBe("unknown");
  });

  it("falls back to a generic name when the row has none", () => {
    const decision = inviteGateFor([
      member({ status: "archived", first_name: null, last_name: null }),
    ]);
    expect(decision.allowed).toBe(false);
    expect(decision.message!.startsWith("This email")).toBe(true);
  });

  // ── Duplicate (email, organization) rows are REAL — 605 Lincoln Road holds
  // four such groups today, one of them three rows deep. The gate must not
  // depend on which one Directus returns first.
  describe("duplicate member rows", () => {
    it("an account on ANY duplicate wins over an active one", () => {
      const decision = inviteGateFor([
        member({ id: "a", status: "active", user: null }),
        member({ id: "b", status: "active", user: "user-uuid" }),
      ]);
      expect(decision.allowed).toBe(false);
        expect(decision.code).toBe("member_already_onboarded");
    });

    it("an active row wins over an archived one, in either order", () => {
      const rows = [
        member({ id: "old", status: "archived" }),
        member({ id: "now", status: "active" }),
      ];
      for (const order of [rows, [...rows].reverse()]) {
        const decision = inviteGateFor(order);
        expect(decision.allowed).toBe(true);
        expect(decision.member?.id).toBe("now");
      }
    });

    it("prefers the archived row's message when every duplicate is non-active", () => {
      const decision = inviteGateFor([
        member({ id: "i", status: "inactive" }),
        member({ id: "x", status: "archived" }),
      ]);
      expect(decision.allowed).toBe(false);
        expect(decision.code).toBe("member_archived");
      expect(decision.restore?.memberId).toBe("x");
    });
  });

  it("has no restore target when the blocking row has no id", () => {
    const decision = inviteGateFor([member({ id: null, status: "archived" })]);
    expect(decision.allowed).toBe(false);
    expect(decision.restore).toBeNull();
  });
});

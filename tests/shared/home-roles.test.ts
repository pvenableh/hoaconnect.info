import { describe, expect, it } from "vitest";
import { emptyRoleContext, type RoleContext } from "../../core/shared/roles/role-context";
import {
  HOME_ROLE_ORDER,
  ROLE_HOMES,
  homeFor,
  homeForRoles,
  homeRoles,
  type HomeRole,
} from "../../core/shared/home/roles";

function ctx(p: {
  residency?: RoleContext["residency"];
  board?: boolean;
  manager?: boolean;
  admin?: boolean;
  helps?: RoleContext["helps"];
}): RoleContext {
  const c = emptyRoleContext("org");
  c.residency = p.residency ?? "none";
  c.hats = { board: !!p.board, manager: !!p.manager, admin: !!p.admin };
  c.helps = p.helps ?? [];
  return c;
}

const ONE_HAT: Record<HomeRole, RoleContext> = {
  tenant: ctx({ residency: "tenant" }),
  owner: ctx({ residency: "owner" }),
  board: ctx({ board: true }),
  team: ctx({ helps: ["projects"] as RoleContext["helps"] }),
  manager: ctx({ manager: true }),
  admin: ctx({ admin: true }),
};

describe("home role config", () => {
  it.each(HOME_ROLE_ORDER)("%s: one hat resolves to that role and its §5 row", (role) => {
    expect(homeRoles(ONE_HAT[role])).toEqual([role]);
    const bands = homeFor(ONE_HAT[role]);
    expect(bands.needs).toEqual(ROLE_HOMES[role].needs);
    expect(bands.glance).toEqual(ROLE_HOMES[role].glance);
    expect(bands.acts).toEqual(ROLE_HOMES[role].acts);
    expect(bands.feed).toBe("whats-new");
  });

  it("every role has something in each of the three bands", () => {
    for (const role of HOME_ROLE_ORDER) {
      expect(ROLE_HOMES[role].needs.length).toBeGreaterThan(0);
      expect(ROLE_HOMES[role].glance.length).toBeGreaterThan(0);
      expect(ROLE_HOMES[role].acts.length).toBeGreaterThan(0);
    }
  });

  it("two hats: every pair gets both sets, deduped, higher priority first", () => {
    for (let i = 0; i < HOME_ROLE_ORDER.length; i++) {
      for (let j = i + 1; j < HOME_ROLE_ORDER.length; j++) {
        const [a, b] = [HOME_ROLE_ORDER[i]!, HOME_ROLE_ORDER[j]!];
        const bands = homeForRoles([b, a]); // input order must not matter
        expect(bands.roles).toEqual([a, b]);
        for (const band of ["needs", "glance", "acts"] as const) {
          const expected = [...new Set([...ROLE_HOMES[a][band], ...ROLE_HOMES[b][band]])];
          expect(bands[band]).toEqual(expected);
          expect(new Set(bands[band]).size).toBe(bands[band].length);
        }
      }
    }
  });

  it("an owner on the board gets owner and board content, not a mode switch", () => {
    const bands = homeFor(ctx({ residency: "owner", board: true }));
    expect(bands.roles).toEqual(["board", "owner"]);
    expect(bands.needs).toEqual(["approvals", "votes", "balance-due", "forms-to-sign"]); // votes once
  });

  it("an admin who is also a manager keeps both", () => {
    expect(homeRoles(ctx({ admin: true, manager: true }))).toEqual(["admin", "manager"]);
  });

  it("a membership with no hat and no residency holds no role", () => {
    expect(homeRoles(ctx({}))).toEqual([]);
    expect(homeRoles(null)).toEqual([]);
    expect(homeFor(emptyRoleContext("org")).needs).toEqual([]);
  });
});

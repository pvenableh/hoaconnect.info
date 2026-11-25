/**
 * GET /api/support/context reads in one batch (core/server/utils/support-context.ts).
 * The route is exercised end to end in support.test.ts; these pin the rules
 * applied to the batched rows.
 */
import { describe, it, expect } from "vitest";
import { supportContextFrom, supportContextSpecs, supportRolesOf } from "#core/server/utils/support-context";

const ROLES = { hoaAdmin: "role-admin", propertyManager: "role-pm" };
const org = (id: string, name: string | null, slug = id) => ({ id, name, slug });

describe("supportContextSpecs", () => {
  it("reads only the caller's active memberships, their current board terms and accounts they run", () => {
    const s = supportContextSpecs("u-1", "2026-11-25");
    expect(s.sup_members.filter).toEqual({ user: { _eq: "u-1" }, status: { _eq: "active" } });
    expect(s.sup_board.filter._and[0]).toEqual({ hoa_member: { user: { _eq: "u-1" }, status: { _eq: "active" } } });
    expect(s.sup_board.filter._and).toContainEqual({ _or: [{ term_end: { _gte: "2026-11-25" } }, { term_end: { _null: true } }] });
    expect(s.sup_accounts.filter).toEqual({ user: { _eq: "u-1" }, role: { _in: ["owner", "billing_admin"] } });
  });
});

describe("supportRolesOf", () => {
  it("is no roles without a membership", () => {
    expect(supportRolesOf(undefined, [], ROLES)).toEqual({ membership: null, boardTitles: [], residency: null, managerGrants: [], billingAccountRole: null });
  });
  it("reads a manager's grants and the membership's own board titles", () => {
    const r = supportRolesOf({ id: "m-1", role: "role-pm", manager_permissions: { contact_platform: true }, units: [] }, [
      { hoa_member: "m-1", title: "director" },
      { hoa_member: "m-1", title: "director" },
      { hoa_member: "m-2", title: "president" },
    ], ROLES);
    expect(r.membership).toBe("property_manager");
    expect(r.managerGrants).toContain("contact_platform");
    expect(r.boardTitles).toEqual(["director"]);
  });
  it("is a plain member when the role is unset", () => {
    expect(supportRolesOf({ id: "m-1", role: null }, [], {}).membership).toBe("member");
  });
});

describe("supportContextFrom", () => {
  const rows = {
    sup_members: [
      { id: "m-1", role: "role-member", member_type: "owner", organization: org("o-b", "Beta") },
      { id: "m-2", role: "role-admin", organization: org("o-a", null, "alpha") },
      { id: "m-3", role: "role-member", organization: null },
    ],
    sup_board: [],
    sup_accounts: [
      { role: "owner", billing_account: { id: "acc-1", name: null } },
      { role: "billing_admin", billing_account: null },
    ],
  };

  it("lists each community by name (slug when unnamed), with its doors, and the accounts", () => {
    const c = supportContextFrom(rows, { staff: false }, ROLES);
    expect(c.communities).toEqual([
      { id: "o-a", name: "alpha", slug: "alpha", canAsk: true, categories: ["bug", "question", "billing", "feature"], isAdmin: true },
      { id: "o-b", name: "Beta", slug: "o-b", canAsk: true, categories: ["bug"], isAdmin: false },
    ]);
    expect(c.accounts).toEqual([{ id: "acc-1", name: "Billing account", categories: ["bug", "question", "billing", "feature"] }]);
    expect([c.staff, c.adminOfAny]).toEqual([false, true]);
  });

  it("decides a community's doors by its first membership", () => {
    const c = supportContextFrom(
      { ...rows, sup_members: [{ id: "m-1", role: "role-pm", organization: org("o-a", "A") }, { id: "m-2", role: "role-admin", organization: org("o-a", "A") }] },
      { staff: true },
      ROLES
    );
    expect(c.communities.map((x) => [x.canAsk, x.isAdmin])).toEqual([[false, true], [false, true]]);
  });
});

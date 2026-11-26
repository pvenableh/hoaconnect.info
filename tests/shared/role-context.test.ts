/**
 * resolveRoleContext — the pure resolver (docs/spec-role-context.md).
 *
 * Table tests: one row per person the plan names (§1), plus the status and
 * degrade cases. Every row also checks the two safety rules: the manager hat
 * never grants access, and access comes only from admin or a work switch.
 */
import { describe, it, expect } from "vitest";
import {
  emptyRoleContext,
  resolveRoleContext,
  type RoleBillingAccount,
  type RoleBoardTerm,
  type RoleContext,
  type RoleMembership,
  type ResolveRoleOptions,
} from "#core/shared/roles/role-context";
import { AREA_KEYS, type AreaKey } from "#core/shared/transition/grants";

const APP_ADMIN = "role-app-admin";
const HOA_ADMIN = "role-hoa-admin";
const PM = "role-pm";
const MEMBER = "role-member";
const ME = "user-me";
const ORG_A = "org-a";
const ORG_B = "org-b";

const opts = (over: Partial<ResolveRoleOptions> = {}): ResolveRoleOptions => ({
  userId: ME,
  globalRoleId: MEMBER,
  roles: { appAdmin: APP_ADMIN, propertyManager: PM, adminRoleIds: [HOA_ADMIN] },
  ...over,
});

const member = (over: RoleMembership = {}): RoleMembership => ({
  id: "m-1",
  organization: ORG_A,
  status: "active",
  role: MEMBER,
  member_type: "owner",
  ...over,
});

const working = (ctx: RoleContext): AreaKey[] => AREA_KEYS.filter((k) => ctx.areas[k].canWork);
const notified = (ctx: RoleContext): AreaKey[] => AREA_KEYS.filter((k) => ctx.areas[k].isNotified);

interface Row {
  name: string;
  membership: RoleMembership | null;
  terms?: RoleBoardTerm[];
  billing?: RoleBillingAccount | null;
  options?: Partial<ResolveRoleOptions>;
  expect: {
    residency: RoleContext["residency"];
    hats: RoleContext["hats"];
    work: AreaKey[] | "all";
    notify?: AreaKey[];
    isAccountOwner: boolean;
    managerTitle?: string | null;
    source?: RoleContext["source"];
  };
}

const NO_HATS = { board: false, manager: false, admin: false };

const ROWS: Row[] = [
  {
    name: "tenant",
    membership: member({ member_type: "tenant" }),
    expect: { residency: "tenant", hats: NO_HATS, work: [], isAccountOwner: false },
  },
  {
    name: "owner",
    membership: member(),
    expect: { residency: "owner", hats: NO_HATS, work: [], isAccountOwner: false },
  },
  {
    name: "owner on the board",
    membership: member(),
    terms: [{ title: "treasurer" }],
    expect: { residency: "owner", hats: { ...NO_HATS, board: true }, work: [], isAccountOwner: false },
  },
  {
    name: "manager with grants (legacy row: hat from the Property Manager role)",
    membership: member({
      role: PM,
      member_type: null,
      manager_permissions: { inquiries: true, projects: true, communications: false },
    }),
    expect: {
      residency: "none",
      hats: { ...NO_HATS, manager: true },
      work: ["inquiries", "projects"],
      notify: [],
      isAccountOwner: false,
      managerTitle: null,
      source: "legacy",
    },
  },
  {
    name: "manager with grants, title and a notify switch (hat row)",
    membership: member({
      role: PM,
      member_type: null,
      is_manager: true,
      manager_title: "  Accounting ",
      manager_permissions: { documents: true },
      manager_areas: { billing: { work: false, notify: true }, documents: { work: true, notify: false } },
    }),
    expect: {
      residency: "none",
      hats: { ...NO_HATS, manager: true },
      work: ["documents"],
      notify: ["billing"],
      isAccountOwner: false,
      managerTitle: "Accounting",
      source: "hat",
    },
  },
  {
    name: "manager who is admin keeps the hat",
    membership: member({ role: HOA_ADMIN, member_type: null, is_manager: true, manager_title: "Full service" }),
    billing: { owner: "user-board-chair" },
    expect: {
      residency: "none",
      hats: { ...NO_HATS, manager: true, admin: true },
      work: "all",
      isAccountOwner: false,
      managerTitle: "Full service",
    },
  },
  {
    name: "account owner who is a management company",
    membership: member({ role: HOA_ADMIN, member_type: null, is_manager: true }),
    billing: { owner: "someone-else", members: [{ user: { id: ME }, role: "owner" }] },
    expect: {
      residency: "none",
      hats: { ...NO_HATS, manager: true, admin: true },
      work: "all",
      isAccountOwner: true,
    },
  },
  {
    name: "board admin of an agency-billed community is not the account owner",
    membership: member({ role: HOA_ADMIN }),
    terms: [{ title: "president" }],
    billing: { owner: "user-agency", members: [{ user: ME, role: "billing_admin" }] },
    expect: { residency: "owner", hats: { ...NO_HATS, board: true, admin: true }, work: "all", isAccountOwner: false },
  },
  {
    name: "self-billed admin is the account owner",
    membership: member({ role: HOA_ADMIN }),
    billing: null,
    expect: { residency: "owner", hats: { ...NO_HATS, admin: true }, work: "all", isAccountOwner: true },
  },
  {
    name: "archived membership: nothing, whatever the row says",
    membership: member({
      status: "archived",
      role: HOA_ADMIN,
      is_manager: true,
      manager_permissions: { inquiries: true },
      manager_areas: { inquiries: { work: true, notify: true } },
    }),
    terms: [{ title: "president" }],
    billing: null,
    expect: { residency: "none", hats: NO_HATS, work: [], notify: [], isAccountOwner: false, managerTitle: null },
  },
  {
    name: "inactive Property Manager: no hat, no access",
    membership: member({ status: "inactive", role: PM, manager_permissions: { inquiries: true } }),
    expect: { residency: "none", hats: NO_HATS, work: [], isAccountOwner: false },
  },
  {
    name: "pending admin: the admin hat only, as checkAdminAccess admits today",
    membership: member({ status: "pending", role: HOA_ADMIN }),
    terms: [{ title: "president" }],
    billing: null,
    expect: { residency: "none", hats: { ...NO_HATS, admin: true }, work: "all", isAccountOwner: false },
  },
  {
    name: "pending Property Manager: nothing, as getManagerGrants requires active",
    membership: member({ status: "pending", role: PM, manager_permissions: { inquiries: true } }),
    expect: { residency: "none", hats: NO_HATS, work: [], isAccountOwner: false },
  },
  {
    name: "platform App Admin with no membership: admin, never the account owner",
    membership: null,
    options: { globalRoleId: APP_ADMIN, orgId: ORG_A },
    billing: null,
    expect: { residency: "none", hats: { ...NO_HATS, admin: true }, work: "all", isAccountOwner: false },
  },
  {
    name: "the hat never grants access",
    membership: member({
      role: MEMBER,
      is_manager: true,
      manager_permissions: { inquiries: true, projects: true, documents: true },
      manager_areas: { inquiries: { work: true, notify: true } },
    }),
    expect: {
      residency: "owner",
      hats: { ...NO_HATS, manager: true },
      work: [],
      notify: ["inquiries"],
      isAccountOwner: false,
    },
  },
  {
    name: "the hat switched off does not take away a work switch",
    membership: member({ role: PM, member_type: null, is_manager: false, manager_permissions: { violations: true } }),
    expect: { residency: "none", hats: NO_HATS, work: ["violations"], notify: [], isAccountOwner: false, source: "hat" },
  },
  {
    name: "a stored grant on a notify-only area is ignored",
    membership: member({ role: PM, member_type: null, manager_permissions: { vendors: true, billing: true } }),
    expect: { residency: "none", hats: { ...NO_HATS, manager: true }, work: [], isAccountOwner: false },
  },
  {
    name: "residency comes from the unit link first",
    membership: member({ member_type: "owner", units: [{ member_type: "tenant", is_primary_unit: true }] }),
    expect: { residency: "tenant", hats: NO_HATS, work: [], isAccountOwner: false },
  },
];

describe("resolveRoleContext", () => {
  it.each(ROWS)("$name", (row) => {
    const ctx = resolveRoleContext(row.membership, row.terms ?? [], row.billing ?? null, opts(row.options));
    expect(ctx.residency).toBe(row.expect.residency);
    expect(ctx.hats).toEqual(row.expect.hats);
    expect(working(ctx)).toEqual(row.expect.work === "all" ? [...AREA_KEYS] : row.expect.work);
    expect(notified(ctx)).toEqual(row.expect.notify ?? []);
    expect(ctx.isAccountOwner).toBe(row.expect.isAccountOwner);
    if (row.expect.managerTitle !== undefined) expect(ctx.managerTitle).toBe(row.expect.managerTitle);
    if (row.expect.source) expect(ctx.source).toBe(row.expect.source);
    // Every area is always present, so callers never test for a missing key.
    expect(Object.keys(ctx.areas).sort()).toEqual([...AREA_KEYS].sort());
  });

  it("two managers with different areas", () => {
    const accounting = resolveRoleContext(
      member({
        id: "m-acc",
        role: PM,
        is_manager: true,
        manager_title: "Accounting",
        manager_permissions: { communications: true },
        manager_areas: { billing: { work: false, notify: true } },
      }),
      [],
      null,
      opts()
    );
    const maintenance = resolveRoleContext(
      member({
        id: "m-mnt",
        role: PM,
        is_manager: true,
        manager_title: "Maintenance",
        manager_permissions: { inquiries: true, projects: true },
        manager_areas: { inquiries: { work: true, notify: true }, projects: { work: true, notify: true } },
      }),
      [],
      null,
      opts({ userId: "user-other" })
    );
    expect([accounting.managerTitle, maintenance.managerTitle]).toEqual(["Accounting", "Maintenance"]);
    expect(working(accounting)).toEqual(["communications"]);
    expect(notified(accounting)).toEqual(["billing"]);
    expect(working(maintenance)).toEqual(["inquiries", "projects"]);
    expect(notified(maintenance)).toEqual(["inquiries", "projects"]);
  });

  it("one person, different hats in two communities", () => {
    const inA = resolveRoleContext(member({ id: "m-a", organization: ORG_A }), [{ title: "director" }], null, opts());
    const inB = resolveRoleContext(
      member({ id: "m-b", organization: { id: ORG_B }, role: PM, member_type: null, manager_permissions: { directory: true } }),
      [],
      null,
      opts()
    );
    expect(inA).toMatchObject({ orgId: ORG_A, membershipId: "m-a", residency: "owner", hats: { board: true, manager: false } });
    expect(inB).toMatchObject({ orgId: ORG_B, membershipId: "m-b", residency: "none", hats: { board: false, manager: true } });
    expect(working(inA)).toEqual([]);
    expect(working(inB)).toEqual(["directory"]);
  });

  describe("helpers and committees (docs/spec-delegation.md)", () => {
    it("an owner helper works their helper areas, with no hat", () => {
      const ctx = resolveRoleContext(member({ is_manager: false }), [], null, opts({ helperAreas: ["projects", "feedback"] }));
      expect(working(ctx)).toEqual(["feedback", "projects"]);
      expect(ctx.helps).toEqual(["feedback", "projects"]);
      expect(ctx.hats).toEqual(NO_HATS);
      expect(ctx.residency).toBe("owner");
    });

    it("a tenant helper is the same as an owner helper", () => {
      const ctx = resolveRoleContext(member({ member_type: "tenant" }), [], null, opts({ helperAreas: ["documents"] }));
      expect(ctx.residency).toBe("tenant");
      expect(working(ctx)).toEqual(["documents"]);
    });

    it("a committee member's areas arrive the same way (the reader merges them)", () => {
      const ctx = resolveRoleContext(member(), [{ title: "director" }], null, opts({ helperAreas: ["responsibilities"] }));
      expect(ctx.hats.board).toBe(true);
      expect(working(ctx)).toEqual(["responsibilities"]);
    });

    it("an archived or pending membership holding a row gets nothing", () => {
      for (const status of ["archived", "inactive", "pending"]) {
        const ctx = resolveRoleContext(member({ status }), [], null, opts({ helperAreas: ["projects"] }));
        expect(working(ctx), status).toEqual([]);
        expect(ctx.helps, status).toEqual([]);
      }
    });

    it("a non-helper area passed in is ignored, never widened", () => {
      const ctx = resolveRoleContext(
        member(),
        [],
        null,
        opts({ helperAreas: ["activity", "contact_platform", "billing", "junk"] })
      );
      expect(working(ctx)).toEqual([]);
      expect(ctx.helps).toEqual([]);
      expect(ctx.hats.manager).toBe(false);
    });

    it("a manager who also helps keeps both, and helps lists only the helper part", () => {
      const ctx = resolveRoleContext(
        member({ role: PM, is_manager: true, manager_permissions: { inquiries: true } }),
        [],
        null,
        opts({ helperAreas: ["projects"] })
      );
      expect(working(ctx)).toEqual(["inquiries", "projects"]);
      expect(ctx.helps).toEqual(["projects"]);
    });
  });

  it("an unset App Admin role id never matches an unset session role", () => {
    const ctx = resolveRoleContext(null, [], null, opts({ globalRoleId: undefined, roles: { adminRoleIds: [] } }));
    expect(ctx.hats.admin).toBe(false);
  });

  it("the empty context grants nothing", () => {
    const ctx = emptyRoleContext(ORG_A);
    expect(ctx.orgId).toBe(ORG_A);
    expect(working(ctx)).toEqual([]);
    expect(ctx.hats).toEqual(NO_HATS);
  });
});

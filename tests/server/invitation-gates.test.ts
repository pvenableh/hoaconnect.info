/**
 * Invitations and join requests act for one community, in one of its roles.
 *
 *  - POST /api/hoa/cancel-invitation — takes an admin of the invitation's own
 *    community; until 2026-11-12 any signed-in user could cancel any
 *    community's pending invitation by its id;
 *  - POST /api/hoa/invite-member — the role must be a community role (member,
 *    HOA admin, property manager). Accepting creates an account with that role
 *    and the App Admin's id is public config, so until then an admin of any
 *    community could invite an address they own as App Admin;
 *  - POST /api/hoa/approve-join-request — the same role rule, and a named unit
 *    must be the community's own;
 *  - GET /api/roles/list — offers a community admin only those three roles.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const ROLES = {
  directusRoleAppAdmin: "role-app-admin",
  directusRoleHoaAdmin: "role-hoa-admin",
  directusRoleMember: "role-member",
  directusRolePropertyManager: "role-pm",
  directusRolePlatformSupport: "role-support",
};

const h = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  ops: [] as string[],
  writes: [] as string[],
  appAdmin: false,
  lastRolesFilter: null as unknown,
}));

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query: any) => ({ op: "readItem", collection, id, query }),
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  createItem: (collection: string, data: any) => ({ op: "createItem", collection, data }),
  updateItem: (collection: string, id: string, data: any) => ({ op: "updateItem", collection, id, data }),
  readRoles: (query: any) => ({ op: "readRoles", collection: "directus_roles", query }),
}));
vi.mock("#core/server/utils/invitation-email", () => ({ sendHoaInvitationEmail: async () => {} }));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const cancel = (await import("#core/server/api/hoa/cancel-invitation.post")).default as (e: H3Event) => Promise<any>;
const invite = (await import("#core/server/api/hoa/invite-member.post")).default as (e: H3Event) => Promise<any>;
const approve = (await import("#core/server/api/hoa/approve-join-request.post")).default as (e: H3Event) => Promise<any>;
const roles = (await import("#core/server/api/roles/list.get")).default as (e: H3Event) => Promise<any>;

const ROWS: Record<string, any> = {
  "hoa_invitations:inv-lenox": { id: "inv-lenox", email: "a@example.com", invitation_status: "pending", organization: "org-lenox" },
  "hoa_invitations:inv-other": { id: "inv-other", email: "b@example.com", invitation_status: "pending", organization: "org-other" },
  "hoa_join_requests:jr-lenox": {
    id: "jr-lenox",
    status: "pending",
    member_type: "owner",
    user: { id: "u-dana", email: "dana@example.com", first_name: "Dana", last_name: "D" },
    organization: { id: "org-lenox", name: "1033 Lenox", slug: "lenox" },
  },
  "hoa_join_requests:jr-other": {
    id: "jr-other",
    status: "pending",
    user: { id: "u-erin", email: "erin@example.com", first_name: "Erin", last_name: "E" },
    organization: { id: "org-other", name: "Other", slug: "other" },
  },
  "hoa_units:unit-lenox": { id: "unit-lenox", organization: "org-lenox" },
  "hoa_units:unit-other": { id: "unit-other", organization: "org-other" },
  "hoa_organizations:org-lenox": { name: "1033 Lenox", slug: "lenox", settings: null },
};

beforeEach(() => {
  h.body = {};
  h.ops = [];
  h.writes = [];
  h.appAdmin = false;
  h.lastRolesFilter = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { ...ROLES, appUrl: "https://app.test" }, directus: { url: "https://d.test" } }));
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "u-oscar" } }));
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getPlatformActor", async () => (h.appAdmin ? { userId: "u-oscar", role: "app_admin", permissions: [] } : null));
  vi.stubGlobal("$fetch", async () => ({ data: [] }));
  vi.stubGlobal("shouldBlockDemoEmail", async () => true);
  vi.stubGlobal("recomputeMemberCount", async () => {});
  vi.stubGlobal("notifyUsers", async () => {});
  vi.stubGlobal("safeRequestOrigin", async () => "https://app.test");
  vi.stubGlobal("sendEmail", async () => {});
  // Oscar administers Lenox and nothing else (or, with h.appAdmin, everything).
  vi.stubGlobal("requireAdminAccess", async (_e: unknown, org: string) => {
    if (h.appAdmin) return { isAdmin: true, isAppAdmin: true, isHoaAdmin: false };
    if (org !== "org-lenox") throw Object.assign(new Error("Admin access required"), { statusCode: 403 });
    return { isAdmin: true, isAppAdmin: false, isHoaAdmin: true };
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      h.ops.push(`${op.op}:${op.collection}`);
      if (op.op === "createItem" || op.op === "updateItem") {
        h.writes.push(`${op.op}:${op.collection}`);
        return { id: `${op.collection}-new`, ...op.data };
      }
      if (op.op === "readItem") {
        const row = ROWS[`${op.collection}:${op.id}`];
        if (!row) throw new Error("not found");
        return row;
      }
      if (op.op === "readRoles") {
        h.lastRolesFilter = op.query.filter;
        return [];
      }
      return [];
    },
  }));
});

describe("POST /api/hoa/cancel-invitation", () => {
  it("cancels the caller's own community's invitation", async () => {
    h.body = { invitationId: "inv-lenox" };
    expect((await cancel({} as H3Event)).success).toBe(true);
    expect(h.writes).toEqual(["updateItem:hoa_invitations"]);
  });

  it("refuses another community's invitation and changes nothing", async () => {
    h.body = { invitationId: "inv-other" };
    await expect(cancel({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.writes).toEqual([]);
  });
});

describe("POST /api/hoa/invite-member", () => {
  const base = { email: "new@example.com", firstName: "New", lastName: "Person", organizationId: "org-lenox", memberType: "owner" };

  it("invites into a community role", async () => {
    h.body = { ...base, roleId: ROLES.directusRoleMember };
    expect((await invite({} as H3Event)).success).toBe(true);
    expect(h.writes).toEqual(["createItem:hoa_invitations"]);
  });

  it.each([
    ["App Admin", ROLES.directusRoleAppAdmin],
    ["Platform Support", ROLES.directusRolePlatformSupport],
    ["an unknown role", "role-directus-administrator"],
  ])("refuses a community admin inviting as %s, before reading or writing anything", async (_label, roleId) => {
    h.body = { ...base, roleId };
    await expect(invite({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.ops).toEqual([]);
  });

  it("refuses another community's invitation outright", async () => {
    h.body = { ...base, organizationId: "org-other", roleId: ROLES.directusRoleMember };
    await expect(invite({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.ops).toEqual([]);
  });

  it("leaves the App Admin free to name a platform role", async () => {
    h.appAdmin = true;
    h.body = { ...base, roleId: ROLES.directusRolePlatformSupport };
    expect((await invite({} as H3Event)).success).toBe(true);
  });
});

describe("POST /api/hoa/approve-join-request", () => {
  it("approves into the member role with the community's own unit", async () => {
    h.body = { requestId: "jr-lenox", unitId: "unit-lenox" };
    expect((await approve({} as H3Event)).success).toBe(true);
    expect(h.writes).toEqual(["createItem:hoa_members", "createItem:hoa_member_units", "updateItem:hoa_join_requests"]);
  });

  it("refuses another community's request and writes nothing", async () => {
    h.body = { requestId: "jr-other" };
    await expect(approve({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.writes).toEqual([]);
  });

  it("refuses a platform role and writes nothing", async () => {
    h.body = { requestId: "jr-lenox", roleId: ROLES.directusRoleAppAdmin };
    await expect(approve({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.writes).toEqual([]);
  });

  it("refuses another community's unit and writes nothing", async () => {
    h.body = { requestId: "jr-lenox", unitId: "unit-other" };
    await expect(approve({} as H3Event)).rejects.toMatchObject({ statusCode: 400 });
    expect(h.writes).toEqual([]);
  });
});

describe("GET /api/roles/list", () => {
  it("offers a community admin only the three community roles", async () => {
    await roles({} as H3Event);
    expect(h.lastRolesFilter).toEqual({
      id: { _in: [ROLES.directusRoleMember, ROLES.directusRoleHoaAdmin, ROLES.directusRolePropertyManager] },
    });
  });

  it("offers the App Admin every role but Directus's own Administrator", async () => {
    h.appAdmin = true;
    await roles({} as H3Event);
    expect(h.lastRolesFilter).toEqual({ name: { _neq: "Administrator" } });
  });
});

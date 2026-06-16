import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import {
  checkAdminAccess,
  requireAdminAccess,
  checkMembership,
  requireMembership,
} from "#core/server/utils/admin-auth";

const APP_ADMIN_ROLE = "role-app-admin";
const HOA_ADMIN_ROLE = "role-hoa-admin";
const MEMBER_ROLE = "role-member";
const ORG = "org-1";

const event = {} as H3Event;

// Mutable per-test fixtures the stubbed globals read from.
let session: { user?: { id: string; role?: string | { id: string } } } | null;
let memberRows: Array<{ id: string; role: string | { id: string } }>;
let directusRequest: ReturnType<typeof vi.fn>;

beforeEach(() => {
  session = null;
  memberRows = [];
  directusRequest = vi.fn(async () => memberRows);

  vi.stubGlobal("useRuntimeConfig", () => ({
    public: {
      directusRoleAppAdmin: APP_ADMIN_ROLE,
      directusRoleHoaAdmin: HOA_ADMIN_ROLE,
    },
  }));
  vi.stubGlobal("getUserSession", async () => session);
  vi.stubGlobal("requireUserSession", async () => session);
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
});

describe("checkAdminAccess", () => {
  it("denies when there is no session", async () => {
    const res = await checkAdminAccess(event, ORG);
    expect(res).toMatchObject({ isAdmin: false, isAppAdmin: false, isHoaAdmin: false });
    expect(directusRequest).not.toHaveBeenCalled();
  });

  it("short-circuits for the app administrator role", async () => {
    session = { user: { id: "u1", role: { id: APP_ADMIN_ROLE } } };
    const res = await checkAdminAccess(event, ORG);
    expect(res).toMatchObject({ isAdmin: true, isAppAdmin: true, isHoaAdmin: false, userId: "u1" });
    expect(directusRequest).not.toHaveBeenCalled();
  });

  it("grants HOA admin via the org member record's role", async () => {
    session = { user: { id: "u1", role: MEMBER_ROLE } };
    memberRows = [{ id: "m1", role: HOA_ADMIN_ROLE }];
    const res = await checkAdminAccess(event, ORG);
    expect(res).toMatchObject({ isAdmin: true, isHoaAdmin: true, memberId: "m1", userId: "u1" });
  });

  it("resolves expanded role objects on the member record", async () => {
    session = { user: { id: "u1", role: MEMBER_ROLE } };
    memberRows = [{ id: "m1", role: { id: HOA_ADMIN_ROLE } }];
    const res = await checkAdminAccess(event, ORG);
    expect(res.isAdmin).toBe(true);
  });

  it("denies a plain member", async () => {
    session = { user: { id: "u1", role: MEMBER_ROLE } };
    memberRows = [{ id: "m1", role: MEMBER_ROLE }];
    const res = await checkAdminAccess(event, ORG);
    expect(res).toMatchObject({ isAdmin: false, isHoaAdmin: false });
  });

  it("denies when the user has no membership in the org (tenant isolation)", async () => {
    session = { user: { id: "u1", role: MEMBER_ROLE } };
    memberRows = []; // org filter matched nothing
    const res = await checkAdminAccess(event, ORG);
    expect(res.isAdmin).toBe(false);
  });

  it("fails closed when the membership lookup throws", async () => {
    session = { user: { id: "u1", role: MEMBER_ROLE } };
    directusRequest.mockRejectedValueOnce(new Error("directus down"));
    const res = await checkAdminAccess(event, ORG);
    expect(res.isAdmin).toBe(false);
  });
});

describe("requireAdminAccess", () => {
  it("throws 403 for non-admins", async () => {
    session = { user: { id: "u1", role: MEMBER_ROLE } };
    memberRows = [{ id: "m1", role: MEMBER_ROLE }];
    await expect(requireAdminAccess(event, ORG)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns the check result for admins", async () => {
    session = { user: { id: "u1", role: { id: APP_ADMIN_ROLE } } };
    const res = await requireAdminAccess(event, ORG);
    expect(res.isAdmin).toBe(true);
  });
});

describe("checkMembership", () => {
  it("denies without a session", async () => {
    expect(await checkMembership(event, ORG)).toMatchObject({ isMember: false });
  });

  it("returns membership with the member's role id", async () => {
    session = { user: { id: "u1" } };
    memberRows = [{ id: "m9", role: { id: MEMBER_ROLE } }];
    const res = await checkMembership(event, ORG);
    expect(res).toMatchObject({ isMember: true, memberId: "m9", memberRole: MEMBER_ROLE });
  });

  it("denies when no active membership exists in the org", async () => {
    session = { user: { id: "u1" } };
    memberRows = [];
    expect(await checkMembership(event, ORG)).toMatchObject({ isMember: false });
  });
});

describe("requireMembership", () => {
  it("throws 403 for non-members", async () => {
    session = { user: { id: "u1" } };
    memberRows = [];
    await expect(requireMembership(event, ORG)).rejects.toMatchObject({ statusCode: 403 });
  });
});

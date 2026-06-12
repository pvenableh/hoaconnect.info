import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import {
  getManagerGrants,
  requireAdminOrManagerGrant,
} from "~~/server/utils/manager-access";

const PM_ROLE = "role-property-manager";
const ORG = "org-1";
const event = {} as H3Event;

let session: { user?: { id: string } } | null;
let memberRows: Array<{ manager_permissions: unknown }>;
let adminResult: { isAdmin: boolean };
let directusRequest: ReturnType<typeof vi.fn>;

beforeEach(() => {
  session = { user: { id: "u1" } };
  memberRows = [];
  adminResult = { isAdmin: false };
  directusRequest = vi.fn(async () => memberRows);

  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { directusRolePropertyManager: PM_ROLE },
  }));
  vi.stubGlobal("getUserSession", async () => session);
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
  // manager-access calls checkAdminAccess via Nitro auto-import (global)
  vi.stubGlobal("checkAdminAccess", async () => adminResult);
});

describe("getManagerGrants", () => {
  it("returns null without a session", async () => {
    session = null;
    expect(await getManagerGrants(event, ORG)).toBeNull();
  });

  it("returns null when the PM role isn't configured", async () => {
    vi.stubGlobal("useRuntimeConfig", () => ({ public: {} }));
    expect(await getManagerGrants(event, ORG)).toBeNull();
  });

  it("returns null when the caller is not an active PM of the org", async () => {
    memberRows = [];
    expect(await getManagerGrants(event, ORG)).toBeNull();
  });

  it("returns the grant flags for an active PM", async () => {
    memberRows = [{ manager_permissions: { communications: true, violations: false } }];
    expect(await getManagerGrants(event, ORG)).toEqual({
      communications: true,
      violations: false,
    });
  });

  it("normalizes a missing/invalid grants payload to an empty object", async () => {
    memberRows = [{ manager_permissions: null }];
    expect(await getManagerGrants(event, ORG)).toEqual({});
  });

  it("fails closed when the lookup throws", async () => {
    directusRequest.mockRejectedValueOnce(new Error("boom"));
    expect(await getManagerGrants(event, ORG)).toBeNull();
  });
});

describe("requireAdminOrManagerGrant", () => {
  it("authorizes org admins regardless of grants", async () => {
    adminResult = { isAdmin: true };
    expect(await requireAdminOrManagerGrant(event, ORG, "communications")).toEqual({
      via: "admin",
    });
    expect(directusRequest).not.toHaveBeenCalled();
  });

  it("authorizes a PM holding the specific grant", async () => {
    memberRows = [{ manager_permissions: { communications: true } }];
    expect(await requireAdminOrManagerGrant(event, ORG, "communications")).toEqual({
      via: "manager",
    });
  });

  it("rejects a PM missing the specific grant (403)", async () => {
    memberRows = [{ manager_permissions: { communications: true } }];
    await expect(
      requireAdminOrManagerGrant(event, ORG, "violations")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects non-admin non-PM callers (403)", async () => {
    memberRows = [];
    await expect(
      requireAdminOrManagerGrant(event, ORG, "documents")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("treats truthy-but-not-true grant values as denied", async () => {
    memberRows = [{ manager_permissions: { documents: "yes" } }];
    await expect(
      requireAdminOrManagerGrant(event, ORG, "documents")
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

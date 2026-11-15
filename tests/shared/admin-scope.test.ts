/**
 * `hoa_members.admin_of` (core/shared/roles/admin-scope.ts): the organization
 * a membership administers, as the HOA Admin policy reads it.
 */
import { describe, it, expect } from "vitest";
import { adminScopeChanges, adminScopeOf, syncKeysFrom } from "#core/shared/roles/admin-scope";

const ADMIN = "role-admin";
const MEMBER = "role-member";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("adminScopeOf", () => {
  it.each([
    ["an active admin", { role: ADMIN, status: "active", organization: "org-a" }, "org-a"],
    ["a pending admin (the server honours it)", { role: ADMIN, status: "pending", organization: "org-a" }, "org-a"],
    ["an archived admin", { role: ADMIN, status: "archived", organization: "org-a" }, null],
    ["an inactive admin", { role: ADMIN, status: "inactive", organization: "org-a" }, null],
    ["no status", { role: ADMIN, status: null, organization: "org-a" }, null],
    ["a member", { role: MEMBER, status: "active", organization: "org-a" }, null],
    ["a role and org given as objects", { role: { id: ADMIN }, status: "active", organization: { id: "org-a" } }, "org-a"],
    ["no organization", { role: ADMIN, status: "active", organization: null }, null],
  ])("%s", (_name, m, want) => {
    expect(adminScopeOf({ id: "m", ...m }, ADMIN)).toBe(want);
  });

  it("is null without a configured admin role", () => {
    expect(adminScopeOf({ id: "m", role: "", status: "active", organization: "org-a" }, "")).toBeNull();
  });
});

describe("adminScopeChanges", () => {
  it("lists only rows whose stored value is wrong", () => {
    const rows = [
      { id: "a", role: ADMIN, status: "active", organization: "org-a", admin_of: "org-a" }, // right
      { id: "b", role: ADMIN, status: "active", organization: "org-b", admin_of: null }, // promoted
      { id: "c", role: MEMBER, status: "active", organization: "org-a", admin_of: "org-a" }, // demoted
      { id: "d", role: ADMIN, status: "archived", organization: "org-a", admin_of: "org-a" }, // removed
      { id: "e", role: MEMBER, status: "active", organization: "org-a" }, // never set, still null
      { id: "f", role: ADMIN, status: "active", organization: "org-c", admin_of: "org-a" }, // moved org
    ];
    expect(adminScopeChanges(rows, ADMIN)).toEqual([
      { id: "b", admin_of: "org-b" },
      { id: "c", admin_of: null },
      { id: "d", admin_of: null },
      { id: "f", admin_of: "org-c" },
    ]);
  });
});

describe("syncKeysFrom", () => {
  it("reads a Directus trigger: key on create, keys on update", () => {
    expect(syncKeysFrom({ event: "hoa_members.items.create", key: id(1), payload: {} })).toEqual([id(1)]);
    expect(syncKeysFrom({ event: "hoa_members.items.update", keys: [id(1), id(2), id(1)] })).toEqual([id(1), id(2)]);
  });

  it("accepts the trigger as a JSON string", () => {
    expect(syncKeysFrom(JSON.stringify({ keys: [id(3)] }))).toEqual([id(3)]);
  });

  it("means 'everyone' for all: true, nothing named, junk, or a bad string", () => {
    expect(syncKeysFrom({ all: true, keys: [id(1)] })).toBeNull();
    expect(syncKeysFrom({})).toBeNull();
    expect(syncKeysFrom(null)).toBeNull();
    expect(syncKeysFrom("{not json")).toBeNull();
    expect(syncKeysFrom({ keys: ["drop table", 7, { id: id(1) }] })).toBeNull();
  });

  it("caps a batch at 500", () => {
    const many = Array.from({ length: 600 }, (_, i) => id(i + 1));
    expect(syncKeysFrom({ keys: many })).toHaveLength(500);
  });
});

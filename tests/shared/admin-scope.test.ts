/**
 * `hoa_members.admin_of` (core/shared/roles/admin-scope.ts): the organization
 * a membership administers, as the HOA Admin policy reads it.
 */
import { describe, it, expect } from "vitest";
import {
  activeScopeOf,
  adminScopeChanges,
  adminScopeOf,
  channelPostsTo,
  channelScopeChanges,
  managerScopeOf,
  postingOrgsByUser,
  scopeChanges,
  scopeFieldsOf,
  syncKeysFrom,
} from "#core/shared/roles/admin-scope";

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

const PM = "role-pm";
const ROLES = { hoaAdmin: ADMIN, propertyManager: PM };

describe("manager scopes", () => {
  it("manager_of: an active Property Manager membership only (getManagerGrants' rule)", () => {
    expect(managerScopeOf({ id: "m", role: PM, status: "active", organization: "org-m" }, PM)).toBe("org-m");
    expect(managerScopeOf({ id: "m", role: PM, status: "pending", organization: "org-m" }, PM)).toBeNull();
    expect(managerScopeOf({ id: "m", role: MEMBER, status: "active", organization: "org-m" }, PM)).toBeNull();
    expect(managerScopeOf({ id: "m", role: PM, status: "active", organization: "org-m" }, "")).toBeNull();
  });

  it("a grant field holds the org only with the grant, and never without the role", () => {
    expect(scopeFieldsOf({ id: "m", role: PM, status: "active", organization: "org-m", manager_permissions: { communications: true } }, ROLES)).toEqual({
      admin_of: null, manager_of: "org-m", communications_of: "org-m", inquiries_of: null, active_in: "org-m", posts_in: "org-m",
    });
    expect(scopeFieldsOf({ id: "m", role: MEMBER, status: "active", organization: "org-m", manager_permissions: { communications: true, inquiries: true } }, ROLES)).toEqual({
      admin_of: null, manager_of: null, communications_of: null, inquiries_of: null, active_in: "org-m", posts_in: "org-m",
    });
    expect(scopeFieldsOf({ id: "m", role: PM, status: "active", organization: "org-m", manager_permissions: null }, ROLES).inquiries_of).toBeNull();
  });

  it("scopeChanges compares only fields the row has, and only those named", () => {
    const rows = [
      { id: "a", role: PM, status: "active", organization: "org-m", manager_permissions: { inquiries: true }, admin_of: null },
      { id: "b", role: PM, status: "active", organization: "org-m", manager_permissions: { inquiries: true }, admin_of: null, manager_of: null, inquiries_of: null, communications_of: null },
    ];
    expect(scopeChanges(rows, ROLES)).toEqual([{ id: "b", patch: { manager_of: "org-m", inquiries_of: "org-m" } }]);
    expect(scopeChanges(rows, ROLES, ["admin_of"])).toEqual([]);
  });
});

describe("where a member writes: active_in and posts_in", () => {
  it.each([
    ["active", "org-a", "org-a"],
    ["pending", null, null],
    ["inactive", null, null],
    ["archived", null, null],
  ])("a %s membership", (status, active, posts) => {
    const f = scopeFieldsOf({ id: "m", role: MEMBER, status, organization: "org-a" }, ROLES);
    expect([f.active_in, f.posts_in]).toEqual([active, posts]);
  });

  it("a restricted active member keeps active_in and loses posts_in", () => {
    const f = scopeFieldsOf({ id: "m", role: MEMBER, status: "active", organization: "org-a" }, ROLES, { restricted: true });
    expect([f.active_in, f.posts_in]).toEqual(["org-a", null]);
  });

  it("never depends on the role, the hat or a grant: an active admin and manager write as members too", () => {
    expect(activeScopeOf({ id: "m", role: ADMIN, status: "active", organization: { id: "org-a" } })).toBe("org-a");
    expect(scopeFieldsOf({ id: "m", role: PM, status: "active", organization: "org-a" }, ROLES).posts_in).toBe("org-a");
    expect(activeScopeOf({ id: "m", role: MEMBER, status: null, organization: "org-a" })).toBeNull();
  });

  it("scopeChanges reads the restriction for each membership", () => {
    const rows = [
      { id: "a", role: MEMBER, status: "active", organization: "org-a", active_in: "org-a", posts_in: "org-a" },
      { id: "b", role: MEMBER, status: "archived", organization: "org-a", active_in: "org-a", posts_in: "org-a" },
    ];
    expect(scopeChanges(rows, ROLES)).toEqual([{ id: "b", patch: { active_in: null, posts_in: null } }]);
    expect(scopeChanges(rows, ROLES, undefined, (id) => id === "a")).toEqual([
      { id: "a", patch: { posts_in: null } },
      { id: "b", patch: { active_in: null, posts_in: null } },
    ]);
  });
});

describe("chat: posts_to on a channel row", () => {
  const memberships = [
    { id: "m1", user: "u1", role: MEMBER, status: "active", organization: "org-a" },
    { id: "m2", user: "u1", role: MEMBER, status: "archived", organization: "org-b" },
    { id: "m3", user: { id: "u2" }, role: ADMIN, status: "active", organization: "org-b" },
    { id: "m4", user: null, role: MEMBER, status: "active", organization: "org-c" },
  ];
  const posting = postingOrgsByUser(memberships, ROLES);
  const row = (id: string, user: unknown, channel: unknown, posts_to?: string | null) => ({ id, user, channel, ...(posts_to !== undefined ? { posts_to } : {}) });

  it("groups each person's posting communities; a membership without a login has none", () => {
    expect([...posting.entries()].map(([u, s]) => [u, [...s]])).toEqual([["u1", ["org-a"]], ["u2", ["org-b"]]]);
  });

  it("is the row's channel only where its person posts in the channel's community", () => {
    expect(channelPostsTo(row("r", "u1", { id: "ch-a", organization: "org-a" }), posting)).toBe("ch-a");
    expect(channelPostsTo(row("r", "u1", { id: "ch-b", organization: "org-b" }), posting)).toBeNull(); // archived there
    expect(channelPostsTo(row("r", "u2", { id: "ch-b", organization: { id: "org-b" } }), posting)).toBe("ch-b");
    expect(channelPostsTo(row("r", "u3", { id: "ch-a", organization: "org-a" }), posting)).toBeNull(); // no membership
    expect(channelPostsTo(row("r", "u1", null), posting)).toBeNull(); // the channel is gone
    expect(channelPostsTo(row("r", "u1", "ch-a"), posting)).toBeNull(); // read without its organization
  });

  it("a restricted member's rows close, and only theirs", () => {
    const paused = postingOrgsByUser(memberships, ROLES, (id) => id === "m1");
    expect(channelPostsTo(row("r", "u1", { id: "ch-a", organization: "org-a" }), paused)).toBeNull();
    expect(channelPostsTo(row("r", "u2", { id: "ch-b", organization: "org-b" }), paused)).toBe("ch-b");
  });

  it("lists only wrong rows, and skips rows read before the field existed", () => {
    const rows = [
      row("r1", "u1", { id: "ch-a", organization: "org-a" }, "ch-a"), // right
      row("r2", "u1", { id: "ch-b", organization: "org-b" }, "ch-b"), // archived there
      row("r3", "u2", { id: "ch-b", organization: "org-b" }, null), // new row
      row("r4", "u1", { id: "ch-b", organization: "org-b" }), // no field yet
    ];
    expect(channelScopeChanges(rows, posting)).toEqual([
      { id: "r2", posts_to: null },
      { id: "r3", posts_to: "ch-b" },
    ]);
  });
});

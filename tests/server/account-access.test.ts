/**
 * grantRoleAccess (core/server/utils/account-access.ts): an existing account
 * that takes a community role in another community gets that role's Directus
 * policies attached to it, without its own role changing.
 *
 * Directus is faked at the REST level: accounts with a role, and
 * `directus_access` rows that tie a policy to a role or to a user.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const ROLE = { member: "role-member", admin: "role-admin", pm: "role-pm", platform: "role-platform" };
const P = { member: "pol-member", admin: "pol-admin", pm: "pol-pm", platform: "pol-administrator" };

interface Access { role?: string; user?: string; policy: string }
const directus = {
  users: {} as Record<string, string | null>,
  access: [] as Access[],
  posted: [] as Access[],
};

function seed() {
  directus.users = { member: ROLE.member, pm: ROLE.pm, admin: ROLE.admin, platform: ROLE.platform, roleless: null };
  directus.access = [
    { role: ROLE.member, policy: P.member },
    { role: ROLE.admin, policy: P.admin },
    { role: ROLE.admin, policy: P.member },
    { role: ROLE.pm, policy: P.member },
    { role: ROLE.pm, policy: P.pm },
    { role: ROLE.platform, policy: P.platform },
  ];
  directus.posted = [];
}

const matches = (row: Access, f: any): boolean => {
  if (f._or) return f._or.some((g: any) => matches(row, g));
  return Object.entries(f).every(([k, cond]: [string, any]) => (row as any)[k] === cond._eq);
};

let grantRoleAccess: typeof import("#core/server/utils/account-access").grantRoleAccess;

beforeAll(async () => {
  vi.stubGlobal("useRuntimeConfig", () => ({
    directusUrl: "https://d.test",
    directusToken: "t",
    public: { directusRoleMember: ROLE.member, directusRoleHoaAdmin: ROLE.admin, directusRolePropertyManager: ROLE.pm },
  }));
  vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));
  vi.stubGlobal("communityRoleIds", (await import("#core/server/utils/member-roles")).communityRoleIds);
  vi.stubGlobal("$fetch", async (url: string, opts: any) => {
    const path = url.replace("https://d.test", "");
    if (opts.headers?.Authorization !== "Bearer t") throw new Error("no token");
    if (path.startsWith("/users/")) return { data: { role: directus.users[path.slice(7)] ?? null } };
    if (path === "/access" && opts.method === "POST") {
      directus.access.push(opts.body);
      directus.posted.push(opts.body);
      return { data: opts.body };
    }
    if (path === "/access") return { data: directus.access.filter((r) => matches(r, JSON.parse(opts.query.filter))) };
    throw new Error(`fake directus: ${path}`);
  });
  ({ grantRoleAccess } = await import("#core/server/utils/account-access"));
});

beforeEach(seed);

describe("an existing account taking a community role elsewhere", () => {
  it("gets the HOA Admin policy when a member account is made an admin, and keeps its role", async () => {
    expect(await grantRoleAccess("member", ROLE.admin)).toEqual([P.admin]);
    expect(directus.posted).toEqual([{ user: "member", policy: P.admin }]);
    expect(directus.users.member).toBe(ROLE.member);
  });

  it("keeps a property manager's policy: only the admin policy is added", async () => {
    expect(await grantRoleAccess("pm", ROLE.admin)).toEqual([P.admin]);
  });

  it("adds nothing the account's role already gives", async () => {
    expect(await grantRoleAccess("admin", ROLE.member)).toEqual([]);
    expect(await grantRoleAccess("member", ROLE.member)).toEqual([]);
    expect(directus.posted).toEqual([]);
  });

  it("adds nothing twice", async () => {
    await grantRoleAccess("member", ROLE.admin);
    expect(await grantRoleAccess("member", ROLE.admin)).toEqual([]);
    expect(directus.posted).toHaveLength(1);
  });

  it("gives an account with no role every policy of the community role", async () => {
    expect((await grantRoleAccess("roleless", ROLE.pm)).sort()).toEqual([P.member, P.pm].sort());
  });

  it("leaves a platform account alone, and never hands out a role that isn't a community's", async () => {
    expect(await grantRoleAccess("platform", ROLE.admin)).toEqual([]);
    expect(await grantRoleAccess("member", ROLE.platform)).toEqual([]);
    expect(await grantRoleAccess("member", null)).toEqual([]);
    expect(directus.posted).toEqual([]);
  });
});

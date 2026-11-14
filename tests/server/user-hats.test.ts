/**
 * GET /api/user/hats — the org switcher's badges (docs/spec-capability-nav.md).
 * Only the session user's own memberships; an archived row carries no hats;
 * the manager title travels with the hat. Plus the pure badge text.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { hatLine, managerChip } from "#core/shared/roles/hat-badge";

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query?: any) => ({ op: "readOne", collection, id, query }),
  readItems: (collection: string, query?: any) => ({ op: "read", collection, query }),
}));

const LENOX = "org-lenox";
const LINCOLN = "org-lincoln";
const ME = "user-me";
const OTHER = "user-other";
const HOA_ADMIN = "r-hoa-admin";
const PM = "r-pm";
const MEMBER = "r-member";

type Row = Record<string, any>;
let TABLES: Record<string, Row[]>;
let ops: Array<{ op: string; collection: string; query?: any }>;
let session: { user: { id: string; role: string } } | null;

function matches(row: Row, filter: any): boolean {
  if (!filter) return true;
  if (filter._and) return filter._and.every((f: any) => matches(row, f));
  if (filter._or) return filter._or.some((f: any) => matches(row, f));
  return Object.entries(filter).every(([field, cond]: [string, any]) => {
    if ("_eq" in cond) return row[field] === cond._eq;
    if ("_null" in cond) return row[field] == null;
    if ("_lte" in cond) return row[field] == null || row[field] <= cond._lte;
    if ("_gte" in cond) return row[field] == null || row[field] >= cond._gte;
    return true;
  });
}

const directus = {
  request: async (op: any) => {
    ops.push(op);
    return (TABLES[op.collection] ?? []).filter((r) => matches(r, op.query?.filter));
  },
};

beforeEach(async () => {
  ops = [];
  session = { user: { id: ME, role: MEMBER } };
  TABLES = {
    hoa_members: [
      { id: "m-me-lenox", user: ME, organization: LENOX, status: "active", role: HOA_ADMIN, member_type: "owner", is_manager: true, manager_title: "Accounting" },
      { id: "m-me-lincoln", user: ME, organization: LINCOLN, status: "archived", role: PM, member_type: null, is_manager: true, manager_title: "Maintenance" },
      { id: "m-other-lincoln", user: OTHER, organization: LINCOLN, status: "active", role: HOA_ADMIN, member_type: "owner", is_manager: false },
    ],
    hoa_board_members: [
      { id: "b-1", hoa_member: "m-me-lenox", status: "published", title: "treasurer" },
      { id: "b-2", hoa_member: "m-other-lincoln", status: "published", title: "president" },
    ],
  };
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("requireUserSession", async () => {
    if (!session) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return session;
  });
  vi.stubGlobal("getUserSession", async () => session);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { directusRoleHoaAdmin: HOA_ADMIN, directusRolePropertyManager: PM },
  }));
  vi.stubGlobal("getTypedDirectus", () => directus);
  const utils = await import("#core/server/utils/role-context");
  vi.stubGlobal("getMembershipHats", utils.getMembershipHats);
});

const call = async () => ((await import("#core/server/api/user/hats.get")).default as any)({});

describe("GET /api/user/hats", () => {
  it("401s without a session", async () => {
    session = null;
    await expect(call()).rejects.toMatchObject({ statusCode: 401 });
  });

  it("reads only the session user's rows", async () => {
    await call();
    const reads = ops.filter((o) => o.collection === "hoa_members");
    expect(reads).toHaveLength(1);
    expect(reads[0].query.filter).toEqual({ user: { _eq: ME } });
  });

  it("returns each community's hats, with the manager title on the hat", async () => {
    const { hats } = await call();
    expect(hats).toHaveLength(2);
    const lenox = hats.find((h: any) => h.orgId === LENOX);
    expect(lenox).toMatchObject({ hats: { admin: true, board: true, manager: true }, managerTitle: "Accounting", residency: "owner" });
  });

  it("gives an archived membership no hats", async () => {
    const { hats } = await call();
    const lincoln = hats.find((h: any) => h.orgId === LINCOLN);
    expect(lincoln).toMatchObject({ hats: { admin: false, board: false, manager: false }, managerTitle: null });
  });
});

describe("badge text", () => {
  const b = (over: Partial<Parameters<typeof hatLine>[0]> = {}) => ({
    hats: { board: false, manager: false, admin: false },
    managerTitle: null,
    residency: "none" as const,
    ...over,
  });

  it("puts the manager title on the manager chip", () => {
    expect(managerChip(b({ hats: { board: false, manager: true, admin: false }, managerTitle: "Accounting" }))).toBe("Manager · Accounting");
    expect(managerChip(b({ hats: { board: false, manager: true, admin: false } }))).toBe("Manager");
    expect(managerChip(b())).toBeNull();
  });

  it("adds hats rather than picking one", () => {
    expect(hatLine(b({ hats: { board: true, manager: true, admin: true }, residency: "owner" }))).toBe("Admin · Board · Owner");
    expect(hatLine(b({ residency: "tenant" }))).toBe("Resident");
    expect(hatLine(b())).toBe("Member");
    expect(hatLine(b({ hats: { board: false, manager: true, admin: false } }))).toBe("");
  });
});

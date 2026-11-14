/**
 * GET /api/org/role-context is org-scoped (docs/spec-role-context.md).
 *
 * The context is the SESSION user's own, in the org asked for: every Directus
 * read is filtered by that user and that org, a user id in the query is
 * ignored, and a caller with no live membership there gets 403 — so the
 * endpoint cannot be used to learn about another community or another person.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query?: any) => ({ op: "readOne", collection, id, query }),
  readItems: (collection: string, query?: any) => ({ op: "read", collection, query }),
}));

const LENOX = "org-lenox";
const LINCOLN = "org-lincoln";
const ME = "user-me";
const OTHER = "user-other";
const HOA_ADMIN = "r-hoa-admin";
const APP_ADMIN = "r-app-admin";
const PM = "r-pm";
const MEMBER = "r-member";

type Row = Record<string, any>;
let TABLES: Record<string, Row[]>;
let ops: Array<{ op: string; collection: string; id?: string; query?: any }>;
let session: { user: { id: string; role: string } } | null;

/** A tiny filter engine: `_eq` on top-level fields, enough for these reads. */
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
    if (op.op === "readOne") return TABLES[op.collection]?.find((r) => r.id === op.id) ?? null;
    return (TABLES[op.collection] ?? []).filter((r) => matches(r, op.query?.filter));
  },
};

beforeEach(async () => {
  ops = [];
  session = { user: { id: ME, role: MEMBER } };
  TABLES = {
    hoa_members: [
      { id: "m-me-lenox", user: ME, organization: LENOX, status: "active", role: PM, member_type: null, manager_permissions: { inquiries: true } },
      { id: "m-me-lincoln-old", user: ME, organization: LINCOLN, status: "archived", role: HOA_ADMIN, member_type: "owner" },
      { id: "m-other-lincoln", user: OTHER, organization: LINCOLN, status: "active", role: HOA_ADMIN, member_type: "owner" },
    ],
    hoa_board_members: [{ id: "b-1", hoa_member: "m-other-lincoln", status: "published", title: "president" }],
    hoa_organizations: [
      { id: LENOX, billing_account: "ba-agency" },
      { id: LINCOLN, billing_account: null },
    ],
    billing_accounts: [{ id: "ba-agency", owner: ME }],
    billing_account_members: [{ id: "bam-1", billing_account: "ba-agency", user: ME, role: "owner" }],
  };

  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("requireUserSession", async () => {
    if (!session) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return session;
  });
  vi.stubGlobal("getUserSession", async () => session);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { directusRoleAppAdmin: APP_ADMIN, directusRoleHoaAdmin: HOA_ADMIN, directusRolePropertyManager: PM },
  }));
  vi.stubGlobal("getTypedDirectus", () => directus);
  vi.stubGlobal("resolveActors", async (_e: unknown, org: string) => (org === LENOX ? ["member", "property_manager"] : []));
  vi.stubGlobal("getManagerGrants", async (_e: unknown, org: string) => (org === LENOX ? { inquiries: true } : null));
  const utils = await import("#core/server/utils/role-context");
  vi.stubGlobal("getRoleContext", utils.getRoleContext);
  vi.stubGlobal("resolveCapabilities", utils.resolveCapabilities);
});

const handler = async () => (await import("#core/server/api/org/role-context.get")).default as any;
const call = async (query: Record<string, string>) => (await handler())({ __query: query });

describe("GET /api/org/role-context", () => {
  it("401 without a session", async () => {
    session = null;
    await expect(call({ orgId: LENOX })).rejects.toMatchObject({ statusCode: 401 });
  });

  it("400 without orgId", async () => {
    await expect(call({})).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns the caller's own context, actors and capabilities", async () => {
    const res = await call({ orgId: LENOX });
    expect(res.context).toMatchObject({
      orgId: LENOX,
      membershipId: "m-me-lenox",
      hats: { manager: true, admin: false, board: false },
      source: "legacy",
    });
    expect(res.context.areas.inquiries.canWork).toBe(true);
    expect(res.context.areas.projects.canWork).toBe(false);
    expect(res.actors).toEqual(["member", "property_manager"]);
    expect(res.capabilities).toContain("projects:read");
  });

  it("the agency's billing owner sees isAccountOwner", async () => {
    const res = await call({ orgId: LENOX });
    expect(res.context.isAccountOwner).toBe(true);
  });

  it("403 in another community, even with an archived admin row there", async () => {
    await expect(call({ orgId: LINCOLN })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("403 in a community the caller has never joined", async () => {
    await expect(call({ orgId: "org-elsewhere" })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("ignores a user id in the query", async () => {
    await expect(call({ orgId: LINCOLN, userId: OTHER, user: OTHER })).rejects.toMatchObject({ statusCode: 403 });
    const memberReads = ops.filter((o) => o.collection === "hoa_members");
    expect(memberReads.every((o) => o.query.filter.user._eq === ME)).toBe(true);
  });

  it("every read is filtered by the session user and the org asked for", async () => {
    await call({ orgId: LENOX });
    for (const o of ops) {
      if (o.collection === "hoa_members") {
        expect(o.query.filter).toEqual({ user: { _eq: ME }, organization: { _eq: LENOX } });
      } else if (o.collection === "hoa_organizations") {
        expect(o.id).toBe(LENOX);
      } else if (o.collection === "billing_accounts") {
        expect(o.id).toBe("ba-agency");
      } else if (o.collection === "billing_account_members") {
        expect(o.query.filter).toEqual({ billing_account: { _eq: "ba-agency" }, user: { _eq: ME } });
      } else if (o.collection === "hoa_board_members") {
        expect(JSON.stringify(o.query.filter)).toContain("m-me-lenox");
      } else {
        throw new Error(`unexpected read of ${o.collection}`);
      }
    }
  });

  it("reads hoa_members with * so a missing manager field never fails the read", async () => {
    await call({ orgId: LENOX });
    const read = ops.find((o) => o.collection === "hoa_members");
    expect(read?.query.fields[0]).toBe("*");
  });

  it("the platform App Admin gets a context without a membership", async () => {
    session = { user: { id: "user-staff", role: APP_ADMIN } };
    const res = await call({ orgId: LINCOLN });
    expect(res.context).toMatchObject({ orgId: LINCOLN, membershipId: null, hats: { admin: true }, isAccountOwner: false });
  });

  it("an admin of a self-billed community is its account owner", async () => {
    session = { user: { id: OTHER, role: MEMBER } };
    const res = await call({ orgId: LINCOLN });
    expect(res.context).toMatchObject({ hats: { admin: true, board: true }, isAccountOwner: true });
  });
});

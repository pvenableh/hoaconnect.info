/**
 * GET /api/org/expenses — read-only expenses for oversight (decided
 * 2026-11-14): admins and every board seat (money:read); never a plain
 * member or a manager; only the org asked for.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query?: any) => ({ op: "read", collection, query }),
}));

const LENOX = "org-lenox";
let session: { user: { id: string } } | null;
let isAdmin: boolean;
let caps: string[] | Error;
let reads: any[];

const ROWS = [
  { id: "e-1", organization: LENOX, amount: "120.00", status: "paid" },
  { id: "e-2", organization: "org-other", amount: "999.00", status: "paid" },
];

beforeEach(() => {
  session = { user: { id: "u-1" } };
  isAdmin = false;
  caps = [];
  reads = [];
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("requireUserSession", async () => {
    if (!session) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return session;
  });
  vi.stubGlobal("checkAdminAccess", async () => ({ isAdmin }));
  vi.stubGlobal("resolveCapabilities", async () => {
    if (caps instanceof Error) throw caps;
    return { actors: [], capabilities: caps };
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      reads.push(op);
      return ROWS.filter((r) => r.organization === op.query.filter.organization._eq);
    },
  }));
});

const call = async (query: Record<string, string>) =>
  ((await import("#core/server/api/org/expenses/index.get")).default as any)({ __query: query });

describe("GET /api/org/expenses", () => {
  it("401 without a session, 400 without orgId", async () => {
    session = null;
    await expect(call({ orgId: LENOX })).rejects.toMatchObject({ statusCode: 401 });
    session = { user: { id: "u-1" } };
    await expect(call({})).rejects.toMatchObject({ statusCode: 400 });
  });

  it("lets every board seat read, through money:read", async () => {
    caps = ["money:read", "documents:read"];
    const { expenses } = await call({ orgId: LENOX });
    expect(expenses.map((e: any) => e.id)).toEqual(["e-1"]);
    expect(reads[0].query.filter).toEqual({ organization: { _eq: LENOX } });
  });

  it("lets an admin read", async () => {
    isAdmin = true;
    expect((await call({ orgId: LENOX })).expenses).toHaveLength(1);
  });

  it("refuses a member, a manager, or a non-member", async () => {
    caps = ["documents:read", "projects:read"];
    await expect(call({ orgId: LENOX })).rejects.toMatchObject({ statusCode: 403 });
    caps = new Error("not a member");
    await expect(call({ orgId: LENOX })).rejects.toMatchObject({ statusCode: 403 });
    expect(reads).toHaveLength(0);
  });
});

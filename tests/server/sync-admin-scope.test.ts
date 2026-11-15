/**
 * POST /api/internal/sync-admin-scope keeps hoa_members.admin_of true: only
 * the cron secret or an App Administrator may call it, it writes only rows
 * that are wrong, and a second call writes nothing (the Flow's echo ends).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query?: any) => ({ op: "read", collection, query }),
  updateItem: (collection: string, id: string, data: any) => ({ op: "update", collection, id, data }),
}));

const ADMIN = "role-admin";
const PM = "role-pm";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let rows: any[];
let writes: any[];
let reads: any[];
let cron: boolean;
let session: any;

beforeEach(() => {
  rows = [
    { id: id(1), role: ADMIN, status: "active", organization: "org-a", admin_of: null },
    { id: id(2), role: "role-member", status: "active", organization: "org-b", admin_of: "org-b" },
    { id: id(3), role: ADMIN, status: "active", organization: "org-c", admin_of: "org-c" },
  ];
  // Rows read with "*" carry every scope field that exists; these three do not
  // have the manager fields yet, so only admin_of is compared on them.
  writes = [];
  reads = [];
  cron = true;
  session = null;
  process.env.CRON_SECRET = "s3cret";
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("readBody", async (e: any) => e.__body);
  vi.stubGlobal("getHeader", (e: any, name: string) => (name === "x-cron-secret" && cron ? "s3cret" : undefined));
  vi.stubGlobal("getUserSession", async () => session ?? {});
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { directusRoleHoaAdmin: ADMIN, directusRolePropertyManager: PM, directusRoleAppAdmin: "role-app-admin" } }));
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      if (op.op === "read") {
        reads.push(op);
        const keys = op.query.filter?.id?._in as string[] | undefined;
        return rows.filter((r) => !keys || keys.includes(r.id)).map((r) => ({ ...r }));
      }
      writes.push(op);
      Object.assign(rows.find((r) => r.id === op.id), op.data);
      return {};
    },
  }));
});

const call = async (body: unknown) =>
  ((await import("#core/server/api/internal/sync-admin-scope.post")).default as any)({ __body: body });

describe("sync-admin-scope", () => {
  it("refuses without the cron secret or an App Administrator", async () => {
    cron = false;
    await expect(call({ all: true })).rejects.toMatchObject({ statusCode: 401 });
    session = { user: { id: "u", role: ADMIN } };
    await expect(call({ all: true })).rejects.toMatchObject({ statusCode: 403 });
    expect(reads).toHaveLength(0);
  });

  it("reconciles everyone, writing only the rows that are wrong", async () => {
    const res = await call({ all: true });
    expect(res).toEqual({ ok: true, scope: "all", checked: 3, updated: 2 });
    expect(writes.map((w) => [w.id, w.data])).toEqual([
      [id(1), { admin_of: "org-a" }],
      [id(2), { admin_of: null }],
    ]);
    expect(reads[0].query.filter).toBeUndefined();
    expect(reads[0].query.fields).toEqual(["*"]);
  });

  it("syncs only the members a Flow trigger names", async () => {
    const res = await call({ event: "hoa_members.items.update", keys: [id(2)], payload: { role: "role-member" } });
    expect(res).toMatchObject({ scope: "keys", checked: 1, updated: 1 });
    expect(reads[0].query.filter).toEqual({ id: { _in: [id(2)] } });
  });

  it("writes nothing the second time, so the Flow's echo of its own write ends", async () => {
    await call({ all: true });
    writes = [];
    const res = await call({ keys: [id(1), id(2)] });
    expect(res.updated).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it("scopes a manager by role and grants, never by the hat", async () => {
    const SCOPES = { admin_of: null, manager_of: null, communications_of: null, inquiries_of: null };
    rows = [
      { id: id(4), role: PM, status: "active", organization: "org-m", manager_permissions: { inquiries: true, communications: false }, ...SCOPES },
      { id: id(5), role: PM, status: "pending", organization: "org-m", manager_permissions: { inquiries: true }, ...SCOPES },
      { id: id(6), role: "role-member", status: "active", organization: "org-m", is_manager: true, manager_permissions: { inquiries: true }, ...SCOPES },
      { id: id(7), role: PM, status: "active", organization: "org-n", manager_permissions: { communications: true }, ...SCOPES, manager_of: "org-n", inquiries_of: "org-n" },
    ];
    await call({ all: true });
    expect(writes.map((w) => [w.id, w.data])).toEqual([
      [id(4), { manager_of: "org-m", inquiries_of: "org-m" }],
      [id(7), { communications_of: "org-n", inquiries_of: null }],
    ]);
  });

  it("an App Administrator may run it by hand", async () => {
    cron = false;
    session = { user: { id: "u", role: "role-app-admin" } };
    await expect(call(null)).resolves.toMatchObject({ scope: "all" });
  });
});

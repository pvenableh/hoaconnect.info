/**
 * The community's books are read through the server only (plan decision 16):
 * GET /api/org/money/charges, /api/org/money/schedules and /api/org/expenses
 * admit admins and every board seat (money:read) — never a plain member, a
 * manager or a non-member — and read only the org asked for.
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

const TABLES: Record<string, any[]> = {
  payment_requests: [
    { id: "c-1", organization: LENOX, status: "pending", paid_at: null, amount: "250.00", amount_paid: "0.00", amount_remaining: "250.00" },
    { id: "c-2", organization: LENOX, status: "canceled", paid_at: null },
    { id: "c-3", organization: "org-other", status: "pending", paid_at: null },
  ],
  payment_schedules: [
    { id: "s-1", organization: LENOX, amount: "325.50" },
    { id: "s-2", organization: "org-other" },
  ],
  payment_expenses: [
    { id: "e-1", organization: LENOX, amount: "175.00" },
    { id: "e-2", organization: "org-other" },
  ],
};

beforeEach(async () => {
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
      const f = op.query.filter;
      return TABLES[op.collection].filter((r) => {
        if (r.organization !== f.organization._eq) return false;
        if (f._or) return !!r.paid_at || !["paid", "canceled"].includes(r.status);
        return true;
      });
    },
  }));
  const access = await import("#core/server/utils/money-access");
  vi.stubGlobal("requireMoneyRead", access.requireMoneyRead);
  vi.stubGlobal("moneyLimit", access.moneyLimit);
  vi.stubGlobal("numericMoney", access.numericMoney);
  vi.stubGlobal("canEnterMoney", access.canEnterMoney);
  vi.stubGlobal("getUserSession", async () => session ?? {});
  // Each row's approval and actions are tests/server/money-approvals.test.ts's; here, the read gate.
  vi.stubGlobal("describeExpenses", async (_o: string, rows: any[]) => rows.map(() => ({})));
});

const ROUTES = {
  charges: "#core/server/api/org/money/charges.get",
  schedules: "#core/server/api/org/money/schedules.get",
  expenses: "#core/server/api/org/expenses/index.get",
} as const;

const call = async (route: keyof typeof ROUTES, query: Record<string, string>) =>
  ((await import(/* @vite-ignore */ ROUTES[route])).default as any)({ __query: query });

describe("money reads", () => {
  for (const route of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
    describe(route, () => {
      it("401 without a session, 400 without orgId", async () => {
        session = null;
        await expect(call(route, { orgId: LENOX })).rejects.toMatchObject({ statusCode: 401 });
        session = { user: { id: "u-1" } };
        await expect(call(route, {})).rejects.toMatchObject({ statusCode: 400 });
      });

      it("admits every board seat through money:read, and only this org", async () => {
        caps = ["money:read", "documents:read"];
        const res = await call(route, { orgId: LENOX });
        const rows = Object.values(res)[0] as any[];
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.organization === LENOX)).toBe(true);
        expect(reads[0].query.filter.organization).toEqual({ _eq: LENOX });
      });

      it("admits an admin", async () => {
        isAdmin = true;
        const res = await call(route, { orgId: LENOX });
        expect((Object.values(res)[0] as any[]).length).toBeGreaterThan(0);
      });

      it("refuses a member, a manager or a non-member, and reads nothing", async () => {
        caps = ["documents:read", "projects:read", "governing:read"];
        await expect(call(route, { orgId: LENOX })).rejects.toMatchObject({ statusCode: 403 });
        caps = new Error("not a member");
        await expect(call(route, { orgId: LENOX })).rejects.toMatchObject({ statusCode: 403 });
        expect(reads).toHaveLength(0);
      });
    });
  }

  it("charges: view=glance keeps paid-with-a-date and open charges", async () => {
    isAdmin = true;
    const { charges } = await call("charges", { orgId: LENOX, view: "glance" });
    expect(charges.map((c: any) => c.id)).toEqual(["c-1"]);
  });

  it("clamps limit", async () => {
    isAdmin = true;
    await call("charges", { orgId: LENOX, limit: "999999" });
    await call("schedules", { orgId: LENOX, limit: "nonsense" });
    expect(reads[0].query.limit).toBe(1000);
    expect(reads[1].query.limit).toBe(200);
  });
});

describe("amounts", () => {
  // Directus sends a decimal as text; the expenses page added "175.00" to 0 as
  // strings and showed $NaN as its total.
  it("come back as numbers, not Directus's text", async () => {
    isAdmin = true;
    const { expenses } = await call("expenses", { orgId: LENOX });
    expect(expenses[0].amount).toBe(175);
    const { charges } = await call("charges", { orgId: LENOX });
    expect(charges.find((c: any) => c.id === "c-1")).toMatchObject({ amount: 250, amount_paid: 0, amount_remaining: 250 });
    const { schedules } = await call("schedules", { orgId: LENOX });
    expect(schedules[0].amount).toBe(325.5);
  });

  it("leave a missing amount missing, and never turn text into a wrong number", async () => {
    const { numericMoney } = await import("#core/server/utils/money-access");
    expect(numericMoney([{ amount: null }, { amount: "" }, { amount: "n/a" }, { amount: 12 }], ["amount"])).toEqual([
      { amount: null },
      { amount: null },
      { amount: null },
      { amount: 12 },
    ]);
  });
});

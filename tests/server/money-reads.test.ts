/**
 * The community's books are read through the server only (plan decision 16):
 * GET /api/org/money/charges, /api/org/money/schedules and /api/org/expenses
 * admit admins and every board seat (money:read) — never a plain member, a
 * manager or a non-member — and read only the org asked for. Schedules check
 * first and read nothing for a refused caller; charges and expenses read in
 * one batch (readItemsBatch) and answer money:read from the memberships they
 * read, so a refused caller gets a 403 and no rows, never the data.
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
let batches: any[];
/** The caller's membership in Lenox as the batch reads it: admin role, a seat, or a manager grant. */
let manager: { projects: boolean } | null;

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
  batches = [];
  manager = null;
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
  // The check reads the caller's board seat; `caps` stands in for what it grants.
  vi.stubGlobal("getBoardSeatActor", async () => (caps instanceof Error || !caps.includes("money:read") ? null : "board_member"));
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
  // Which charges have a waiver open: tests/server/money-waivers.test.ts's; here, the read gate.
  vi.stubGlobal("OPEN_STATES", ["pending", "cannot_approve"]);
  vi.stubGlobal("loadApprovals", async () => []);
  // Each row's correction flags are tests/server/charge-corrections.test.ts's; here, the read gate.
  const corrections = await import("#core/server/utils/charge-corrections");
  vi.stubGlobal("CHARGE_APPROVAL_KINDS", corrections.CHARGE_APPROVAL_KINDS);
  vi.stubGlobal("factsOf", corrections.factsOf);
  vi.stubGlobal("LATE_FEE_FIELDS", corrections.LATE_FEE_FIELDS);
  vi.stubGlobal("lateFeesByCharge", corrections.lateFeesByCharge);
  vi.stubGlobal("lateFeesOf", async () => new Map());
  vi.stubGlobal("chargesWithPayments", async () => new Set());
  vi.stubGlobal("namesFor", async () => new Map());
  // Each row's approval and actions are tests/server/money-approvals.test.ts's; here, the read gate.
  vi.stubGlobal("describeExpenses", async (_o: string, rows: any[]) => rows.map(() => ({})));
  // Expenses: one batch, with money:read answered from the memberships it read.
  const approvalsMod = await import("#core/server/utils/money-approvals");
  for (const k of ["orgMembersSpec", "seatsOfMembers", "APPROVAL_FIELDS", "DECISION_FIELDS", "orgDecisionsFilter", "decisionsByApproval"]) {
    vi.stubGlobal(k, (approvalsMod as any)[k]);
  }
  vi.stubGlobal("requireMoneyReadFrom", access.requireMoneyReadFrom);
  vi.stubGlobal("isAppAdminSession", () => false);
  vi.stubGlobal("isHoaAdminRole", (r: unknown) => r === "role-admin");
  vi.stubGlobal("isPropertyManagerRole", (r: unknown) => r === "role-pm");
  const membersOf = (org: string) =>
    org !== LENOX || caps instanceof Error || !session
      ? []
      : [
          {
            id: "m-1",
            user: session.user.id,
            status: "active",
            role: isAdmin ? "role-admin" : manager ? "role-pm" : null,
            manager_permissions: manager,
            board_member_terms: caps.includes("money:read") ? [{ title: "director", status: "published", term_start: null, term_end: null }] : [],
          },
        ];
  vi.stubGlobal("readItemsBatch", async (specs: Record<string, any>) => {
    batches.push(specs);
    return Object.fromEntries(
      Object.entries(specs).map(([k, spec]) => {
        const org = spec.filter?.organization?._eq;
        if (spec.collection === "hoa_members") return [k, membersOf(org)];
        const f = spec.filter ?? {};
        return [
          k,
          (TABLES[spec.collection] ?? []).filter((r) => {
            if (r.organization !== org) return false;
            if (f.request_type && r.request_type !== f.request_type._eq) return false;
            if (f._or) return !!r.paid_at || !["paid", "canceled"].includes(r.status);
            return true;
          }),
        ];
      })
    );
  });
});

/** The org filter of the route's first read, whichever way it read. */
const firstOrgFilter = () => reads[0]?.query.filter.organization ?? (batches[0]?.expenses ?? batches[0]?.charges)?.filter.organization;
const BATCHED = new Set(["charges", "expenses"]);

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
        expect(firstOrgFilter()).toEqual({ _eq: LENOX });
      });

      it("admits an admin", async () => {
        isAdmin = true;
        const res = await call(route, { orgId: LENOX });
        expect((Object.values(res)[0] as any[]).length).toBeGreaterThan(0);
      });

      it(BATCHED.has(route) ? "refuses a member, a manager or a non-member, and returns nothing" : "refuses a member, a manager or a non-member, and reads nothing", async () => {
        caps = ["documents:read", "projects:read", "governing:read"];
        await expect(call(route, { orgId: LENOX })).rejects.toMatchObject({ statusCode: 403 });
        caps = ["documents:read"];
        manager = { projects: true }; // a manager's projects grant enters money; it never reads the books
        await expect(call(route, { orgId: LENOX })).rejects.toMatchObject({ statusCode: 403 });
        manager = null;
        caps = new Error("not a member");
        await expect(call(route, { orgId: LENOX })).rejects.toMatchObject({ statusCode: 403 });
        if (!BATCHED.has(route)) expect(reads).toHaveLength(0);
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
    expect(batches[0].charges.limit).toBe(1000);
    expect(reads[0].query.limit).toBe(200);
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

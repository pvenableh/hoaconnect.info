/**
 * GET /api/org/ai-spend — the admins' AI spend view. The wallet, the
 * window's debit rows and the caller's memberships go as one batch; the
 * admin check answers from that standing and a refusal carries no rows. A
 * failed batch reads one by one, with the same answer.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { aiSpendSpecs, spendTotals } from "#core/server/utils/ai-spend";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
  createItem: (collection: string, payload: unknown) => ({ op: "create", collection, payload }),
  updateItem: (collection: string, id: string, payload: unknown) => ({ op: "update", collection, id, payload }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();
const RECENT = new Date(Date.now() - 2 * 86_400_000).toISOString();
const OLD = new Date(Date.now() - 60 * 86_400_000).toISOString();

type Op = { op: string; collection: string; [k: string]: any };
let ops: Op[];
let rows: Record<string, any[]>;
let admins: string[];
let batches: { orgId: string; keys: string[]; need: string }[];
let batchFails: boolean;

const users: Record<string, any> = {
  u1: { id: "u1", first_name: "Ada", last_name: "Lane", email: "ada@example.com" },
  u2: { id: "u2", first_name: null, last_name: null, email: "bo@example.com" },
};

const tx = (extra: any) => ({ organization: HOME, type: "debit", feature: "draft", model: "m", date_created: RECENT, ...extra });

// As Directus answers: the filter's _eq and _gte, a newest-first sort, the
// user joined when a field asks for it, and only the fields named.
function read(collection: string, query: any): any[] {
  const f = query?.filter ?? {};
  let out = (rows[collection] ?? []).filter((r) =>
    Object.entries(f).every(([k, c]: [string, any]) =>
      c?._eq !== undefined ? String(r[k]) === String(c._eq) : c?._gte !== undefined ? String(r[k]) >= String(c._gte) : true
    )
  );
  const sort = query?.sort?.[0];
  if (sort === "-date_created") out = [...out].sort((a, b) => String(b.date_created).localeCompare(String(a.date_created)));
  if (sort === "date_created") out = [...out].sort((a, b) => String(a.date_created).localeCompare(String(b.date_created)));
  const fields: any[] = query?.fields ?? [];
  const wantsUser = fields.some((x) => (typeof x === "object" && x?.user) || (typeof x === "string" && x.startsWith("user.")));
  out = out.map((r) => {
    const plain = Object.fromEntries(fields.filter((x) => typeof x === "string" && !x.includes(".") && x in r).map((x) => [x, r[x]]));
    return wantsUser ? { ...plain, user: r.user ? users[r.user] : null } : plain;
  });
  return typeof query?.limit === "number" && query.limit > 0 ? out.slice(0, query.limit) : out;
}

beforeEach(() => {
  vi.resetModules();
  ops = [];
  batches = [];
  batchFails = false;
  admins = [HOME];
  rows = {
    ai_wallets: [
      { id: "w1", organization: HOME, allowance_credits: 700, purchased_credits: 250, included_credits: 8000, period_resets_at: FUTURE, date_created: "2026-01-01" },
    ],
    ai_transactions: [
      tx({ credits: 5, user: "u1", date_created: RECENT }),
      tx({ credits: 3, user: "u2", feature: "embed" }),
      tx({ credits: 2, user: "u1", feature: null }),
      tx({ credits: 4, user: null, feature: "embed" }),
      tx({ credits: 9, user: "u1", date_created: OLD }),
      tx({ credits: 7, user: "u1", type: "purchase" }),
      tx({ credits: 6, user: "u1", organization: OTHER }),
    ],
  };
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "me" } }));
  vi.stubGlobal("checkAdminAccess", async (_e: any, orgId: string) => ({ isAdmin: admins.includes(orgId) }));
  vi.stubGlobal("getWalletSummary", async (orgId: string) => {
    ops.push({ op: "summary", collection: "ai_wallets", orgId });
    // As getWalletSummary answers mid-period: the existing wallet, else a new one.
    const w = rows.ai_wallets!.find((r) => r.organization === orgId);
    if (w) return (await import("#core/server/utils/ai-wallet")).walletSummaryOf(w);
    return { walletId: "fresh", balanceCredits: 0, allowanceCredits: 0, purchasedCredits: 0, includedCredits: 0, periodResetsAt: null };
  });
  vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, orgId: string, specs: Record<string, any>, need: string) => {
    batches.push({ orgId, keys: Object.keys(specs), need });
    if (batchFails) throw new Error("batch failed");
    return Object.fromEntries(Object.entries(specs).map(([k, s]) => [k, read(s.collection, s)]));
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (d: Op) => {
      ops.push(d);
      return d.op === "read" ? read(d.collection, d.query) : [];
    },
  }));
});

const load = async () => (await import("#core/server/api/org/ai-spend.get")).default as any;

describe("aiSpendSpecs", () => {
  it("reads the wallet and the window's debits, newest first, with the acting user", () => {
    const specs = aiSpendSpecs("org-1", "2026-11-01T00:00:00.000Z");
    expect(specs.sp_wallet).toMatchObject({ collection: "ai_wallets", filter: { organization: { _eq: "org-1" } }, limit: 1 });
    expect(specs.sp_debits).toEqual({
      collection: "ai_transactions",
      filter: { organization: { _eq: "org-1" }, type: { _eq: "debit" }, date_created: { _gte: "2026-11-01T00:00:00.000Z" } },
      fields: ["credits", "feature", "model", "date_created", "user.id", "user.first_name", "user.last_name", "user.email"],
      sort: ["-date_created"],
      limit: -1,
    });
  });
});

describe("spendTotals", () => {
  it("totals per feature and per user, naming a missing user System", () => {
    expect(
      spendTotals([
        { credits: "5", feature: "draft", user: users.u1 },
        { credits: -2, feature: null, user: users.u2 },
        { credits: 4, feature: "embed", user: null },
        { credits: 1, feature: "draft", user: { id: "u3" } },
      ])
    ).toEqual({
      totals: { credits: 10, calls: 4 },
      byFeature: { draft: 6, other: 0, embed: 4 },
      users: [
        { userId: "u1", name: "Ada Lane", email: "ada@example.com", credits: 5, calls: 1 },
        { userId: null, name: "System", email: null, credits: 4, calls: 1 },
        { userId: "u3", name: "Unknown user", email: null, credits: 1, calls: 1 },
        { userId: "u2", name: "bo@example.com", email: "bo@example.com", credits: 0, calls: 1 },
      ],
    });
  });
});

describe("GET /api/org/ai-spend", () => {
  const expected = {
    scope: "all",
    days: 30,
    wallet: { walletId: "w1", balanceCredits: 950, allowanceCredits: 700, purchasedCredits: 250, includedCredits: 8000, periodResetsAt: FUTURE },
    totals: { credits: 14, calls: 4 },
    byFeature: { draft: 5, embed: 7, other: 2 },
    users: [
      { userId: "u1", name: "Ada Lane", email: "ada@example.com", credits: 7, calls: 2 },
      { userId: null, name: "System", email: null, credits: 4, calls: 1 },
      { userId: "u2", name: "bo@example.com", email: "bo@example.com", credits: 3, calls: 1 },
    ],
  };

  it("reads everything in one batch with the caller's memberships", async () => {
    const res = await (await load())({ __query: { orgId: HOME } });
    expect(batches).toEqual([{ orgId: HOME, keys: ["sp_wallet", "sp_debits"], need: "base" }]);
    expect(ops).toEqual([]);
    expect(res).toEqual(expected);
  });

  it("gives the same answer when the batch fails", async () => {
    batchFails = true;
    const res = await (await load())({ __query: { orgId: HOME } });
    expect(res).toEqual(expected);
    expect(ops.map((o) => `${o.op}:${o.collection}`)).toEqual(["summary:ai_wallets", "read:ai_transactions"]);
  });

  it("provisions a missing wallet through getWalletSummary", async () => {
    rows.ai_wallets = [];
    const res = await (await load())({ __query: { orgId: HOME, days: "7" } });
    expect(res.wallet.walletId).toBe("fresh");
    expect(res.days).toBe(7);
    expect(ops.map((o) => o.op)).toEqual(["summary"]);
  });

  it("refuses a non-admin with no rows, and requires an orgId", async () => {
    const handler = await load();
    const err: any = await handler({ __query: { orgId: OTHER } }).catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403, message: "Not authorized to view AI spend" });
    expect(JSON.stringify(err)).not.toContain("credits");
    expect(ops).toEqual([]);
    await expect(handler({ __query: {} })).rejects.toMatchObject({ statusCode: 400 });
  });
});

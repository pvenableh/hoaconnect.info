/**
 * GET /api/ai/credits — the wallet meter. It reads the wallet with the
 * caller's standing in one batch and answers from that row while the
 * wallet's period runs; a missing wallet or an elapsed period still goes
 * through getWalletSummary, which creates or refreshes the allowance.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { walletSpec, walletSummaryOf } from "#core/server/utils/ai-wallet";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
  createItem: (collection: string, payload: unknown) => ({ op: "create", collection, payload }),
  updateItem: (collection: string, id: string, payload: unknown) => ({ op: "update", collection, id, payload }),
  aggregate: (collection: string, query: unknown) => ({ op: "aggregate", collection, query }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const FUTURE = new Date(Date.now() + 10 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

type Op = { op: string; collection: string; [k: string]: any };
let ops: Op[];
let rows: Record<string, any[]>;
let authorizedOrgs: string[];

const wallet = (extra: any = {}) => ({
  id: "w1",
  organization: HOME,
  allowance_credits: 700,
  purchased_credits: 250,
  included_credits: 8000,
  balance_credits: 950,
  period_resets_at: FUTURE,
  date_created: "2026-01-01T00:00:00.000Z",
  ...extra,
});

const matches = (row: any, filter: any) =>
  Object.entries(filter ?? {}).every(([f, c]: [string, any]) => (c?._eq !== undefined ? String(row[f]) === String(c._eq) : true));

beforeEach(async () => {
  vi.resetModules();
  ops = [];
  authorizedOrgs = [HOME];
  rows = {
    ai_wallets: [],
    ai_transactions: [],
    hoa_organizations: [{ id: HOME, subscription_plan: { included_credits: 8000 } }],
  };
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "me" } }));
  vi.stubGlobal("requireOrgComposeAccess", async (_e: any, orgId: string) => {
    if (!authorizedOrgs.includes(orgId)) throw Object.assign(new Error("Not authorized for this organization"), { statusCode: 403 });
    return ["admin"];
  });
  vi.stubGlobal("isAiConfigured", () => true);
  vi.stubGlobal("isRagConfigured", () => false);
  vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, _o: string, specs: any) =>
    (await import("#core/server/utils/directus-graphql")).readItemsBatchRest(specs)
  );
  vi.stubGlobal("getWalletSummary", async (orgId: string) => (await import("#core/server/utils/ai-wallet")).getWalletSummary(orgId));
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (d: Op) => {
      ops.push(d);
      const all = (rows[d.collection] ||= []);
      if (d.op === "read") {
        let out = all.filter((r) => matches(r, d.query?.filter));
        if (d.query?.sort?.[0] === "date_created") out = [...out].sort((a, b) => String(a.date_created).localeCompare(String(b.date_created)));
        const fields: string[] | undefined = d.query?.fields;
        if (fields && fields.every((f) => typeof f === "string")) out = out.map((r) => Object.fromEntries(fields.filter((f) => f in r).map((f) => [f, r[f]])));
        return typeof d.query?.limit === "number" && d.query.limit > 0 ? out.slice(0, d.query.limit) : out;
      }
      if (d.op === "create") {
        const row = { id: `new-${ops.length}`, ...d.payload };
        all.push(row);
        return row;
      }
      if (d.op === "update") {
        const row = all.find((r) => r.id === d.id);
        Object.assign(row ?? {}, d.payload);
        return row;
      }
      return [];
    },
  }));
});

const load = async () => (await import("#core/server/api/ai/credits.get")).default as any;
const writes = () => ops.filter((o) => o.op !== "read");

describe("walletSpec / walletSummaryOf", () => {
  it("reads the community's first wallet with the fields a summary needs", () => {
    expect(walletSpec("org-1")).toEqual({
      collection: "ai_wallets",
      filter: { organization: { _eq: "org-1" } },
      fields: ["id", "allowance_credits", "purchased_credits", "included_credits", "period_resets_at"],
      sort: ["date_created"],
      limit: 1,
    });
  });

  it("sums both pools and reads a missing pool as zero", () => {
    expect(walletSummaryOf(wallet() as any)).toEqual({
      walletId: "w1",
      balanceCredits: 950,
      allowanceCredits: 700,
      purchasedCredits: 250,
      includedCredits: 8000,
      periodResetsAt: FUTURE,
    });
    expect(walletSummaryOf({ id: "w2" } as any)).toMatchObject({ balanceCredits: 0, includedCredits: 0, periodResetsAt: null });
  });
});

describe("GET /api/ai/credits", () => {
  it("requires an orgId and refuses a community the caller has no standing in", async () => {
    const handler = await load();
    await expect(handler({ __query: {} })).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler({ __query: { orgId: OTHER } })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("reads the wallet in one batch with the caller's standing and writes nothing mid-period", async () => {
    rows.ai_wallets = [wallet()];
    const seen: string[][] = [];
    const { readItemsBatchRest } = await import("#core/server/utils/directus-graphql");
    vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, orgId: string, specs: any) => {
      expect(orgId).toBe(HOME);
      seen.push(Object.keys(specs));
      return readItemsBatchRest(specs);
    });
    const handler = await load();
    const res = await handler({ __query: { orgId: HOME } });
    expect(seen).toEqual([["cr_wallet"]]);
    expect(ops.filter((o) => o.collection === "ai_wallets")).toHaveLength(1);
    expect(writes()).toEqual([]);
    expect(res).toMatchObject({ walletId: "w1", balanceCredits: 950, lowBalance: true, aiConfigured: true, ragConfigured: false });
  });

  it("answers the same through getWalletSummary when the batch fails", async () => {
    rows.ai_wallets = [wallet(), wallet({ id: "w-later", date_created: "2026-06-01T00:00:00.000Z" })];
    const handler = await load();
    const ok = await handler({ __query: { orgId: HOME } });
    vi.stubGlobal("batchWithAccessSnapshot", async () => {
      throw new Error("graphql down");
    });
    expect(await handler({ __query: { orgId: HOME } })).toEqual(ok);
    expect(ok.walletId).toBe("w1");
  });

  it("still refreshes an elapsed allowance and creates a missing wallet", async () => {
    rows.ai_wallets = [wallet({ allowance_credits: 3, period_resets_at: PAST })];
    const handler = await load();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res).toMatchObject({ allowanceCredits: 8000, balanceCredits: 8250 });
    expect(writes().map((o) => `${o.op}:${o.collection}`)).toEqual(["update:ai_wallets", "create:ai_transactions"]);

    rows.ai_wallets = [];
    ops = [];
    const fresh = await handler({ __query: { orgId: HOME } });
    expect(fresh).toMatchObject({ allowanceCredits: 8000, purchasedCredits: 0 });
    expect(writes().map((o) => `${o.op}:${o.collection}`)).toContain("create:ai_wallets");
  });

  it("refuses with no wallet when the batch has read for a stranger", async () => {
    rows.ai_wallets = [wallet({ organization: OTHER, purchased_credits: 424242 })];
    const handler = await load();
    const err = await handler({ __query: { orgId: OTHER } }).catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(err)).not.toContain("424242");
  });
});

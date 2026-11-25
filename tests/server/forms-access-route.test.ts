/**
 * GET /api/org/forms/access — the upgrade prompt's plan state. The plan read
 * rides with the caller's role context as one batch; a refusal carries no
 * plan, and a missing row (or a batch that read nothing) goes through
 * getFormsGate, which answers or fails as the route did before.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { formsGateSpec } from "#core/server/utils/forms-gate";

const h = vi.hoisted(() => ({
  orgs: {} as Record<string, any>,
  allowed: true,
  batches: [] as { orgId: string; keys: string[] }[],
  gateReads: [] as string[],
}));

vi.mock("@directus/sdk", () => ({ readItem: (c: string, id: string) => ({ c, id }) }));

const ORG = "org-1";
const MID = { subscription_status: "active", subscription_plan: { slug: "mid" } };
const EXPIRED = { subscription_status: "expired", subscription_plan: { slug: "grand" } };

beforeEach(() => {
  vi.resetModules();
  h.orgs = { [ORG]: MID };
  h.allowed = true;
  h.batches = [];
  h.gateReads = [];
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.statusMessage), o));
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "me" } }));
  // The extras come back as the batch reads them: the community's row by id, when it exists.
  vi.stubGlobal("getRoleContextWith", async (_e: any, orgId: string, extra: Record<string, any>) => {
    h.batches.push({ orgId, keys: Object.keys(extra) });
    const row = h.orgs[extra.plan.filter.id._eq];
    return { context: {}, allowed: h.allowed, rows: { plan: row ? [row] : [] } };
  });
  // getFormsGate's readItem: the row, or Directus's refusal for a missing one.
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (d: { id: string }) => {
      h.gateReads.push(d.id);
      if (!h.orgs[d.id]) throw Object.assign(new Error("You don't have permission to access this."), { statusCode: 403 });
      return h.orgs[d.id];
    },
  }));
  vi.stubGlobal("getFormsGate", async (orgId: string) => (await import("#core/server/utils/forms-gate")).getFormsGate(orgId));
});

const load = async () => (await import("#core/server/api/org/forms/access.get")).default as any;

describe("GET /api/org/forms/access", () => {
  it("reads the plan with the caller's role context in one batch", async () => {
    const res = await (await load())({ __query: { orgId: ORG } });
    expect(h.batches).toEqual([{ orgId: ORG, keys: ["plan"] }]);
    expect(h.gateReads).toEqual([]);
    expect(res).toEqual({ allowed: true, reason: null, message: null });
  });

  it("names the community's plan fields as getFormsGate reads them", async () => {
    expect(formsGateSpec(ORG)).toMatchObject({ collection: "hoa_organizations", filter: { id: { _eq: ORG } }, limit: 1 });
  });

  it("answers as getFormsGate answers, for each plan state", async () => {
    const handler = await load();
    const { getFormsGate } = await import("#core/server/utils/forms-gate");
    for (const org of [MID, EXPIRED, { subscription_status: "active", subscription_plan: { slug: "boutique" } }, { is_free_account: true }]) {
      h.orgs[ORG] = org;
      const gate = await getFormsGate(ORG);
      expect(await handler({ __query: { orgId: ORG } })).toEqual({
        allowed: gate.allowed,
        reason: gate.reason,
        message: gate.allowed ? null : expect.any(String),
      });
    }
    h.orgs[ORG] = EXPIRED;
    expect(await handler({ __query: { orgId: ORG } })).toEqual({ allowed: false, reason: "subscription", message: "Renew your subscription to use forms to sign." });
  });

  it("a missing row goes through getFormsGate and fails as before", async () => {
    await expect((await load())({ __query: { orgId: "gone" } })).rejects.toMatchObject({ message: "You don't have permission to access this." });
    expect(h.gateReads).toEqual(["gone"]);
  });

  it("a refusal carries no plan; 400 without an orgId", async () => {
    h.allowed = false;
    h.orgs[ORG] = EXPIRED;
    const handler = await load();
    const err = await handler({ __query: { orgId: ORG } }).catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(err)).not.toMatch(/subscription|Renew/);
    expect(h.gateReads).toEqual([]);
    await expect(handler({ __query: {} })).rejects.toMatchObject({ statusCode: 400 });
  });
});

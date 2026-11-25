/**
 * GET /api/org/billing/band — the subscription page's quote, on a
 * MemoryDirectus: the unit counts and the bands ride with the caller's
 * standing as one batch, a failed batch answers the same read one by one, and
 * a refusal carries none of it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryDirectus } from "./support/memory-directus";

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.mock("#core/server/utils/stripe", () => ({ getStripe: () => ({ prices: { list: async () => ({ data: [] }) } }), isStripeLiveMode: () => false }));

const ORG = "org-home";
const OTHER = "org-other";
const BANDS = [
  { id: "p1", slug: "boutique", name: "Boutique", min_units: 1, max_units: 30, price_monthly: "249.00", price_yearly: "2490.00", onboarding_fee: "15.00", is_contact_only: false, sort: 1 },
  { id: "p2", slug: "mid", name: "Mid", min_units: 31, max_units: 60, price_monthly: "449.00", price_yearly: "4490.00", onboarding_fee: "15.00", is_contact_only: false, sort: 2 },
  { id: "p3", slug: "enterprise", name: "Enterprise", min_units: 61, max_units: null, price_monthly: null, is_contact_only: true, sort: 3 },
  { id: "p4", slug: "old", name: "Old", min_units: 1, max_units: 999, price_monthly: "1.00", is_contact_only: false, sort: 0, is_active: false },
];

let db: MemoryDirectus;
let admins: string[];
const directusRequest = async (op: any) => {
  if (op.op === "aggregate") return [{ count: db.all(op.collection, op.options.query?.filter).length }];
  if (op.op === "readItem") {
    const r = db.one(op.collection, op.id);
    if (!r) throw Object.assign(new Error("forbidden"), { response: { status: 403 } });
    return { ...r };
  }
  return db.request(op);
};

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
const band = await import("#core/server/utils/subscription-band");
const { readItemsBatchRest } = await import("#core/server/utils/directus-graphql");
for (const k of ["resolveBandForOrg", "getActiveBands", "bandWithModePrices", "bandSpecs", "bandFrom"] as const) vi.stubGlobal(k, (band as any)[k]);
const handler = (await import("#core/server/api/org/billing/band.get")).default as (e: any) => Promise<any>;
const call = (organizationId: string) => handler({ __query: { organizationId } });

beforeEach(() => {
  band._resetBandPriceCache();
  db = new MemoryDirectus({});
  db.seed("subscription_plans", BANDS.map((b) => ({ status: "published", is_active: true, ...b })));
  db.seed("hoa_organizations", [
    { id: ORG, declared_units: 12 },
    { id: OTHER, declared_units: 0 },
  ]);
  db.seed(
    "hoa_units",
    Array.from({ length: 40 }, (_, i) => ({ id: `u${i}`, organization: i < 35 ? ORG : OTHER }))
  );
  admins = [ORG];
  vi.stubGlobal("requireAdminAccess", async (_e: any, orgId: string) => {
    if (!admins.includes(orgId)) throw Object.assign(new Error("Admin access required for this operation"), { statusCode: 403 });
    return { isAdmin: true };
  });
  vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, _o: string, specs: any) => readItemsBatchRest(specs));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/org/billing/band", () => {
  it("quotes the band for the larger of the real and declared unit counts, with the active ladder", async () => {
    const res = await call(ORG);
    expect(res.units).toBe(35);
    expect(res.band).toMatchObject({ slug: "mid", minUnits: 31, maxUnits: 60, contactOnly: false });
    expect(res.ladder.map((b: any) => [b.slug, b.current])).toEqual([
      ["boutique", false],
      ["mid", true],
      ["enterprise", false],
    ]);
    db.all("hoa_organizations", { id: { _eq: ORG } })[0].declared_units = 70;
    expect((await call(ORG)).band).toMatchObject({ slug: "enterprise", contactOnly: true });
  });

  it("reads in one batch with the caller's memberships", async () => {
    const seen: [string, string[], string | undefined][] = [];
    vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, orgId: string, specs: any, need?: string) => {
      seen.push([orgId, Object.keys(specs), need]);
      return readItemsBatchRest(specs);
    });
    await call(ORG);
    expect(seen).toEqual([[ORG, ["bd_units", "bd_org", "bd_bands"], "base"]]);
  });

  it("answers the same, read one by one, when the batch fails", async () => {
    const ok = await call(ORG);
    vi.stubGlobal("batchWithAccessSnapshot", async () => {
      throw new Error("graphql down");
    });
    expect(await call(ORG)).toEqual(ok);
  });

  it("refuses a non-admin with no quote, though the batch has read it", async () => {
    admins = [];
    const err = await call(ORG).catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(err)).not.toContain("Boutique");
  });
});

describe("bandFrom", () => {
  it("takes the larger unit count, reads a missing declared count as 0, and selects from the bands", () => {
    const bands = BANDS.slice(0, 3);
    expect(band.bandFrom({ bd_units: [{ count: "5" }], bd_org: [{ declared_units: 40 }], bd_bands: bands })).toMatchObject({
      units: 40,
      band: { slug: "mid" },
      bands,
    });
    expect(band.bandFrom({ bd_units: [{ count: "5" }], bd_org: [], bd_bands: bands })).toMatchObject({ units: 5, band: { slug: "boutique" } });
    expect(band.bandFrom({ bd_units: [], bd_org: [{ declared_units: null }], bd_bands: [] })).toEqual({ units: 0, band: null, bands: [] });
  });
});

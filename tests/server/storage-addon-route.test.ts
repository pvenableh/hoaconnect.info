/**
 * POST /api/org/storage/addon — the Extra Storage add-on joins a band
 * subscription at the band's own interval. Stripe won't mix monthly and
 * yearly items on one subscription, so a yearly band gets the $100/year price
 * and a monthly band the $10/month one; turning it off removes whichever is there.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query?: any) => ({ op: "readItem", collection, id, query }),
  updateItem: (collection: string, id: string, data: any) => ({ op: "updateItem", collection, id, data }),
}));
const ctx = { orgId: "org-1", userId: "u-admin", isAdmin: true };
vi.mock("#core/server/utils/org-storage", () => ({
  resolveStorageContext: async () => ctx,
  assertAdmin: (c: { isAdmin: boolean }) => {
    if (!c.isAdmin) throw Object.assign(new Error("Admin access required"), { statusCode: 403 });
  },
  invalidateOrgStorage: () => {},
}));
const stripe = {
  subscriptions: { retrieve: vi.fn() },
  subscriptionItems: { create: vi.fn(async () => ({})), del: vi.fn(async () => ({})) },
};
vi.mock("#core/server/utils/stripe", () => ({ getStripe: () => stripe }));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const route = (await import("#core/server/api/org/storage/addon.post")).default as unknown as (e: H3Event) => Promise<any>;

let body: Record<string, unknown>;
let config: Record<string, unknown>;
let writes: any[];
const event = {} as H3Event;

const subscription = (items: Array<[string, string]>) => ({
  id: "sub_1",
  items: { data: items.map(([id, interval], i) => ({ id: `si_${i}`, price: { id, recurring: { interval } } })) },
});

beforeEach(() => {
  body = { orgId: "org-1", addon: "extra_storage_100", enabled: true };
  config = {
    stripeAddonStoragePriceTest: "price_storage_month",
    stripeAddonStoragePriceYearlyTest: "price_storage_year",
  };
  writes = [];
  ctx.isAdmin = true;
  stripe.subscriptions.retrieve.mockReset();
  stripe.subscriptionItems.create.mockClear();
  stripe.subscriptionItems.del.mockClear();
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("useRuntimeConfig", () => config);
  vi.stubGlobal("isStripeLiveMode", () => false);
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      if (op.op === "readItem") return { id: "org-1", is_demo: false, stripe_subscription_id: "sub_1", active_addons: {} };
      writes.push(op);
      return {};
    },
  }));
});

describe("POST /api/org/storage/addon", () => {
  it("adds the yearly price to a yearly band", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(subscription([["band_year", "year"]]));
    expect(await route(event)).toMatchObject({ addon: "extra_storage_100", enabled: true });
    expect(stripe.subscriptionItems.create).toHaveBeenCalledWith(expect.objectContaining({ subscription: "sub_1", price: "price_storage_year" }));
    expect(writes[0].data).toEqual({ active_addons: { extra_storage_100: true } });
  });

  it("adds the monthly price to a monthly band, as before", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(subscription([["band_month", "month"]]));
    await route(event);
    expect(stripe.subscriptionItems.create).toHaveBeenCalledWith(expect.objectContaining({ price: "price_storage_month" }));
  });

  it("turning it off removes whichever of its prices is on the subscription", async () => {
    body.enabled = false;
    stripe.subscriptions.retrieve.mockResolvedValue(subscription([["band_year", "year"], ["price_storage_year", "year"]]));
    await route(event);
    expect(stripe.subscriptionItems.del).toHaveBeenCalledWith("si_1", expect.anything());
    expect(writes[0].data).toEqual({ active_addons: {} });
  });

  it("does not add it twice when either price is already there", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(subscription([["band_year", "year"], ["price_storage_year", "year"]]));
    await route(event);
    expect(stripe.subscriptionItems.create).not.toHaveBeenCalled();
  });

  it("503s with nothing written when the band's interval has no add-on price", async () => {
    delete config.stripeAddonStoragePriceYearlyTest;
    stripe.subscriptions.retrieve.mockResolvedValue(subscription([["band_year", "year"]]));
    await expect(route(event)).rejects.toMatchObject({ statusCode: 503 });
    expect(stripe.subscriptionItems.create).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("503s before reading Stripe when no add-on price is set up at all", async () => {
    config = {};
    await expect(route(event)).rejects.toMatchObject({ statusCode: 503 });
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it("refuses a non-admin before anything", async () => {
    ctx.isAdmin = false;
    await expect(route(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });
});

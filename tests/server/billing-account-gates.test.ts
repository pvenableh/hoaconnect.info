/**
 * An agency billing account is paid for, on the agency plan's price.
 *
 *  - POST /api/billing-account/create — `isFreeAccount` takes HOA Connect staff
 *    with `billing.write`, and a trial ends (14 days). Until 2026-11-12 any
 *    user could comp themselves, and every other account was a trial with no
 *    end date, which entitlement reads as forever;
 *  - POST /api/stripe/billing-account/subscribe — `priceId` must be one of the
 *    two agency prices, and a seat override or trial takes staff. Until then the
 *    browser's price, quantity and trial (≤365 days) went straight to Stripe.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const h = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  staff: false,
  writes: [] as Array<{ collection: string; data: any }>,
  subscriptions: [] as any[],
}));

vi.mock("@directus/sdk", () => ({
  createItem: (collection: string, data: any) => ({ op: "createItem", collection, data }),
  updateItem: (collection: string, id: string, data: any) => ({ op: "updateItem", collection, id, data }),
}));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const create = (await import("#core/server/api/billing-account/create.post")).default as (e: H3Event) => Promise<any>;
const subscribe = (await import("#core/server/api/stripe/billing-account/subscribe.post")).default as (e: H3Event) => Promise<any>;

const PRICES = { agencyPriceIdMonthly: "price_agency_m", agencyPriceIdYearly: "price_agency_y" };

beforeEach(() => {
  h.body = {};
  h.staff = false;
  h.writes = [];
  h.subscriptions = [];
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { ...PRICES } }));
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: "u-agency" }));
  vi.stubGlobal("requireOpsPermission", async () => {
    if (!h.staff) throw Object.assign(new Error("HOA Connect staff only"), { statusCode: 403 });
    return { userId: "u-staff", role: "app_admin", permissions: [] };
  });
  vi.stubGlobal("getPlatformActor", async () => (h.staff ? { userId: "u-staff", role: "app_admin", permissions: [] } : null));
  vi.stubGlobal("requireBillingAccountRole", async () => ({ role: "owner" }));
  vi.stubGlobal("getBillingAccount", async () => ({ id: "acct-1", name: "Agency", stripe_customer_id: "cus_1", owner: { email: "a@example.com" } }));
  vi.stubGlobal("countActiveProperties", async () => 4);
  vi.stubGlobal("mapStripeStatus", () => ({ subscription_status: "active", status: "active" }));
  vi.stubGlobal("getStripe", () => ({
    subscriptions: {
      create: async (params: any) => {
        h.subscriptions.push(params);
        return { id: "sub_1", status: "active", items: { data: [{ quantity: params.items[0].quantity, price: { recurring: { interval: "month" } } }] }, latest_invoice: null };
      },
    },
  }));
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      h.writes.push({ collection: op.collection, data: op.data });
      return { id: `${op.collection}-new`, name: op.data?.name };
    },
  }));
});

describe("POST /api/billing-account/create", () => {
  it("gives a new account a trial that ends in 14 days", async () => {
    h.body = { name: "Agency" };
    await create({} as H3Event);
    const account = h.writes.find((w) => w.collection === "billing_accounts")!.data;
    expect(account.subscription_status).toBe("trial");
    expect(account.is_free_account).toBe(false);
    const days = (new Date(account.trial_ends_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
  });

  it("refuses a customer comping their own account, and writes nothing", async () => {
    h.body = { name: "Agency", isFreeAccount: true };
    await expect(create({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.writes).toEqual([]);
  });

  it("lets staff with billing.write comp an account", async () => {
    h.staff = true;
    h.body = { name: "Agency", isFreeAccount: true };
    await create({} as H3Event);
    const account = h.writes.find((w) => w.collection === "billing_accounts")!.data;
    expect(account).toMatchObject({ is_free_account: true, subscription_status: "active", trial_ends_at: null });
  });
});

describe("POST /api/stripe/billing-account/subscribe", () => {
  it("subscribes on the agency price at the account's property count", async () => {
    h.body = { accountId: "acct-1", priceId: PRICES.agencyPriceIdYearly };
    await subscribe({} as H3Event);
    expect(h.subscriptions[0].items).toEqual([{ price: PRICES.agencyPriceIdYearly, quantity: 4 }]);
  });

  it("refuses any other price before calling Stripe", async () => {
    h.body = { accountId: "acct-1", priceId: "price_something_cheap" };
    await expect(subscribe({} as H3Event)).rejects.toMatchObject({ statusCode: 400 });
    expect(h.subscriptions).toEqual([]);
    expect(h.writes).toEqual([]);
  });

  it("ignores a customer's seat override and trial", async () => {
    h.body = { accountId: "acct-1", priceId: PRICES.agencyPriceIdMonthly, quantity: 1, trialDays: 365 };
    await subscribe({} as H3Event);
    expect(h.subscriptions[0].items[0].quantity).toBe(4);
    expect(h.subscriptions[0].trial_period_days).toBeUndefined();
  });

  it("honours staff's seat override and trial", async () => {
    h.staff = true;
    h.body = { accountId: "acct-1", priceId: PRICES.agencyPriceIdMonthly, quantity: 2, trialDays: 30 };
    await subscribe({} as H3Event);
    expect(h.subscriptions[0].items[0].quantity).toBe(2);
    expect(h.subscriptions[0].trial_period_days).toBe(30);
  });
});

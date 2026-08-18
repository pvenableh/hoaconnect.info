// Money-path tests for POST /api/stripe/paymentintent — the endpoint that
// creates every resident charge. Covers the Stripe Connect dues routing
// (destination charge + application fee math), its deliberate silent fallback
// to a platform charge, and the card / ACH payment-method params.
//
// Same harness as connect-endpoints.test.ts: Nitro auto-imports are stubbed as
// globals and the Stripe SDK is mocked, so the handler runs as a plain
// function with no Nuxt/Stripe/Directus runtime.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const { paymentIntentsCreate } = vi.hoisted(() => ({
  paymentIntentsCreate: vi.fn(),
}));

vi.mock("stripe", () => {
  class StripeError extends Error {}
  function MockStripe(this: any) {
    this.paymentIntents = { create: paymentIntentsCreate };
  }
  (MockStripe as any).errors = { StripeError };
  return { default: MockStripe };
});

// The handler imports readItem from the real SDK; return a tagged object so the
// stubbed directus.request() can be asserted on without a Directus runtime.
vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query?: unknown) => ({
    cmd: "readItem",
    collection,
    id,
    query,
  }),
}));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const handler = (await import("#core/server/api/stripe/paymentintent.post"))
  .default as (event: H3Event) => Promise<any>;

const ORG = "11111111-1111-4111-8111-111111111111";
const event = {} as H3Event;

let body: Record<string, unknown>;
let org: Record<string, unknown> | null;
let directusRequest: ReturnType<typeof vi.fn>;
let feePercent: string;

/** The params the handler passed to stripe.paymentIntents.create. */
const created = () => paymentIntentsCreate.mock.calls[0]![0] as Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
  feePercent = "2";
  body = {
    amount: 25000, // $250.00
    email: "resident@example.com",
    organizationId: ORG,
    routeDuesToConnect: true,
  };
  org = {
    id: ORG,
    stripe_connect_account_id: "acct_org",
    connect_charges_enabled: true,
  };
  directusRequest = vi.fn(async () => org);
  paymentIntentsCreate.mockResolvedValue({
    id: "pi_1",
    client_secret: "pi_1_secret",
    amount: 25000,
    currency: "usd",
  });

  vi.stubGlobal("useRuntimeConfig", () => ({
    stripeSecretKeyTest: "sk_test_x",
    stripeSecretKeyLive: "",
    stripeConnectFeePercent: feePercent,
    public: { companyName: "Property Flow" },
  }));
  vi.stubGlobal("isStripeLiveMode", () => false);
  vi.stubGlobal("STRIPE_API_VERSION", "2024-11-20.acacia");
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("isDemoOrg", async () => false);
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
});

describe("dues routed to the connected account", () => {
  it("adds transfer_data.destination and the platform application fee", async () => {
    const res = await handler(event);

    expect(res).toMatchObject({ id: "pi_1", clientSecret: "pi_1_secret" });
    expect(created().transfer_data).toEqual({ destination: "acct_org" });
    // 2% of $250.00 = $5.00 → 500 cents
    expect(created().application_fee_amount).toBe(500);
    expect(created().metadata).toMatchObject({
      organization_id: ORG,
      connect_account_id: "acct_org",
      platform_fee_percent: "2",
    });
  });

  it("reads the destination from the org server-side, never from the client", async () => {
    body.destination = "acct_attacker";
    body.transfer_data = { destination: "acct_attacker" };

    await handler(event);

    expect(directusRequest).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: "readItem", collection: "hoa_organizations", id: ORG })
    );
    expect(created().transfer_data).toEqual({ destination: "acct_org" });
  });

  it("rounds the fee to whole cents", async () => {
    feePercent = "2.9";
    body.amount = 1234; // 2.9% of 1234 = 35.786 → 36
    await handler(event);
    expect(created().application_fee_amount).toBe(36);
  });

  it("omits application_fee_amount when the configured fee rounds to zero", async () => {
    feePercent = "0";
    await handler(event);
    expect(created().transfer_data).toEqual({ destination: "acct_org" });
    expect(created().application_fee_amount).toBeUndefined();
  });

  it("defaults the fee to 2% when STRIPE_CONNECT_FEE_PERCENT is unset", async () => {
    feePercent = "";
    await handler(event);
    expect(created().application_fee_amount).toBe(500);
    expect(created().metadata.platform_fee_percent).toBe("2");
  });
});

describe("silent fallback to a platform charge", () => {
  const expectPlatformCharge = () => {
    expect(created().transfer_data).toBeUndefined();
    expect(created().application_fee_amount).toBeUndefined();
    expect(created().metadata.connect_account_id).toBeUndefined();
  };

  it("falls back when the org has no connected account", async () => {
    org = { id: ORG, stripe_connect_account_id: null, connect_charges_enabled: false };
    const res = await handler(event);
    expect(res.id).toBe("pi_1");
    expectPlatformCharge();
  });

  it("falls back when the account exists but charges are not enabled yet", async () => {
    org = { id: ORG, stripe_connect_account_id: "acct_org", connect_charges_enabled: false };
    await handler(event);
    expectPlatformCharge();
  });

  it("falls back — and still creates the charge — when the org lookup throws", async () => {
    directusRequest.mockRejectedValue(new Error("directus down"));
    const res = await handler(event);
    expect(res.id).toBe("pi_1");
    expectPlatformCharge();
  });

  it("never routes (or even looks up an org) without routeDuesToConnect", async () => {
    body.routeDuesToConnect = false;
    await handler(event);
    expect(directusRequest).not.toHaveBeenCalled();
    expectPlatformCharge();
  });

  it("never routes without an organizationId", async () => {
    delete body.organizationId;
    await handler(event);
    expect(directusRequest).not.toHaveBeenCalled();
    expectPlatformCharge();
  });
});

describe("payment method params", () => {
  it("card: restricts to card and can save it for later", async () => {
    body.paymentType = "card";
    body.saveCard = true;
    await handler(event);
    expect(created().payment_method_types).toEqual(["card"]);
    expect(created().setup_future_usage).toBe("on_session");
    expect(created().automatic_payment_methods).toBeUndefined();
  });

  it("card without saveCard does not set setup_future_usage", async () => {
    body.paymentType = "card";
    await handler(event);
    expect(created().setup_future_usage).toBeUndefined();
  });

  it("ACH: us_bank_account with financial-connections payment_method permission", async () => {
    body.paymentType = "us_bank_account";
    await handler(event);
    expect(created().payment_method_types).toEqual(["us_bank_account"]);
    expect(created().payment_method_options).toEqual({
      us_bank_account: { financial_connections: { permissions: ["payment_method"] } },
    });
  });

  it("no paymentType: lets Stripe decide via automatic_payment_methods", async () => {
    await handler(event);
    expect(created().automatic_payment_methods).toEqual({ enabled: true });
    expect(created().payment_method_types).toBeUndefined();
  });

  it("routing and ACH compose — a dues ACH payment is still a destination charge", async () => {
    body.paymentType = "us_bank_account";
    await handler(event);
    expect(created().payment_method_types).toEqual(["us_bank_account"]);
    expect(created().transfer_data).toEqual({ destination: "acct_org" });
    expect(created().application_fee_amount).toBe(500);
  });
});

describe("guardrails", () => {
  it("rejects a demo org before creating any charge", async () => {
    vi.stubGlobal("isDemoOrg", async () => true);
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("rejects an amount below the 50-cent minimum with a 400", async () => {
    body.amount = 10;
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with a 400", async () => {
    body.email = "not-an-email";
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("carries member + payment_request ids into metadata for the webhook", async () => {
    body.memberId = "22222222-2222-4222-8222-222222222222";
    body.paymentRequestId = "33333333-3333-4333-8333-333333333333";
    await handler(event);
    expect(created().metadata).toMatchObject({
      organization_id: ORG,
      member_id: body.memberId,
      payment_request_id: body.paymentRequestId,
    });
  });
});

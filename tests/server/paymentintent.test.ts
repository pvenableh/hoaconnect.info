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
  readItems: (collection: string, query?: any) => ({ cmd: "readItems", collection, query }),
}));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const handler = (await import("#core/server/api/stripe/paymentintent.post"))
  .default as (event: H3Event) => Promise<any>;

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "44444444-4444-4444-8444-444444444444";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const CHARGE = "33333333-3333-4333-8333-333333333333";
/** The caller's charges, by (org, member). Anything else misses the filter. */
const CHARGES = [{ id: CHARGE, organization: ORG, member: MEMBER }];
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
  directusRequest = vi.fn(async (op: any) => {
    if (op?.cmd === "readItems" && op.collection === "payment_requests") {
      const f = op.query.filter;
      return CHARGES.filter(
        (c) => c.id === f.id._eq && c.organization === f.organization._eq && c.member === f.member._eq
      ).map((c) => ({ id: c.id }));
    }
    return org;
  });
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
    public: { companyName: "HOA Connect" },
  }));
  vi.stubGlobal("isStripeLiveMode", () => false);
  vi.stubGlobal("STRIPE_API_VERSION", "2024-11-20.acacia");
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("isDemoOrg", async () => false);
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "u-dana" } }));
  // Dana is an active member of ORG and nothing else.
  vi.stubGlobal("requireMembership", async (_e: unknown, orgId: string) => {
    if (orgId !== ORG) throw Object.assign(new Error("not a member"), { statusCode: 403 });
    return { isMember: true, memberId: MEMBER };
  });
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

  it("refuses a charge with no organizationId", async () => {
    delete body.organizationId;
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(directusRequest).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
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
    body.memberId = MEMBER;
    body.paymentRequestId = CHARGE;
    await handler(event);
    expect(created().metadata).toMatchObject({
      organization_id: ORG,
      member_id: body.memberId,
      payment_request_id: body.paymentRequestId,
    });
  });
});

// Until 2026-11-12 this route had no session check and took every id — and the
// webhook's metadata — from the body. A caller pays their own charge in a
// community they belong to, and the ids the webhook books from are the server's.
describe("whose charge this is", () => {
  it("refuses an anonymous caller before creating anything", async () => {
    vi.stubGlobal("requireUserSession", async () => {
      throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 401 });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("refuses another community's charge before reading or creating anything", async () => {
    body.organizationId = OTHER_ORG;
    body.paymentRequestId = CHARGE;
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(directusRequest).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("refuses paying as another member", async () => {
    body.memberId = "55555555-5555-4555-8555-555555555555";
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("refuses a charge that is not the caller's", async () => {
    body.paymentRequestId = "66666666-6666-4666-8666-666666666666";
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404 });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("books the caller's own member id even when the body names none", async () => {
    await handler(event);
    expect(created().metadata.member_id).toBe(MEMBER);
  });

  it("ignores client metadata and customer — the webhook's keys are the server's", async () => {
    body.metadata = { kind: "ai_credits", org_id: OTHER_ORG, credits: "10000000", organization_id: OTHER_ORG };
    body.customer = "cus_someone_else";
    await handler(event);
    expect(created().metadata.kind).toBeUndefined();
    expect(created().metadata.credits).toBeUndefined();
    expect(created().metadata.org_id).toBeUndefined();
    expect(created().metadata.organization_id).toBe(ORG);
    expect(created().customer).toBeUndefined();
  });
});

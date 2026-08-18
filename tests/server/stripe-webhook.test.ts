// Money-path tests for POST /api/stripe/webhook — the only writer of the
// financial ledger. Covers the three flows Connect activation depends on:
//   • payment_intent.succeeded → an idempotent payment_transactions row
//     (Stripe retries the same event; a duplicate would double-count the
//     linked payment request's amount_paid)
//   • account.updated → syncs the org's Connect onboarding/charges/payouts flags
//   • ai_credits top-ups → still short-circuit to the wallet, untouched by the above
//
// Same harness as connect-endpoints.test.ts: Nitro auto-imports stubbed as
// globals, Stripe mocked. @directus/sdk commands are mocked into tagged objects
// so the stubbed request() can both dispatch and be asserted on.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const { constructEvent } = vi.hoisted(() => ({ constructEvent: vi.fn() }));

vi.mock("stripe", () => {
  class StripeError extends Error {}
  function MockStripe(this: any) {
    this.webhooks = { constructEvent };
  }
  (MockStripe as any).errors = { StripeError };
  return { default: MockStripe };
});

vi.mock("@directus/sdk", () => ({
  createItem: (collection: string, data: unknown) => ({ cmd: "createItem", collection, data }),
  updateItem: (collection: string, id: string, data: unknown) => ({
    cmd: "updateItem",
    collection,
    id,
    data,
  }),
  readItems: (collection: string, query: unknown) => ({ cmd: "readItems", collection, query }),
  readItem: (collection: string, id: string, query?: unknown) => ({
    cmd: "readItem",
    collection,
    id,
    query,
  }),
}));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const handler = (await import("#core/server/api/stripe/webhook.post")).default as (
  event: H3Event
) => Promise<any>;

const ORG = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const REQUEST = "33333333-3333-4333-8333-333333333333";
const event = {} as H3Event;

type Cmd = { cmd: string; collection: string; id?: string; data?: any; query?: any };

/** Rows the stubbed Directus returns per collection for readItems/readItem. */
let reads: Record<string, any[]>;
let directusRequest: ReturnType<typeof vi.fn>;
let creditWallet: ReturnType<typeof vi.fn>;

/** Every command the handler sent to Directus, in order. */
const commands = () => directusRequest.mock.calls.map((c) => c[0] as Cmd);
const writes = (cmd: "createItem" | "updateItem", collection: string) =>
  commands().filter((c) => c.cmd === cmd && c.collection === collection);

const paymentIntent = (over: Record<string, any> = {}) => ({
  id: "pi_1",
  amount: 25000,
  currency: "usd",
  description: "January dues",
  customer: "cus_1",
  receipt_email: "resident@example.com",
  metadata: {
    organization_id: ORG,
    member_id: MEMBER,
    payment_request_id: REQUEST,
  },
  ...over,
});

const fire = async (type: string, object: unknown, account?: string) => {
  constructEvent.mockReturnValue({ id: "evt_1", type, data: { object }, account });
  return handler(event);
};

beforeEach(() => {
  vi.clearAllMocks();
  reads = { payment_transactions: [], hoa_organizations: [], billing_accounts: [] };
  creditWallet = vi.fn(async () => ({ credited: true, balanceCredits: 1000 }));

  directusRequest = vi.fn(async (cmd: Cmd) => {
    if (cmd.cmd === "readItems") return reads[cmd.collection] ?? [];
    if (cmd.cmd === "readItem") return (reads[cmd.collection] ?? [])[0] ?? null;
    return { id: "new-row" };
  });

  vi.stubGlobal("useRuntimeConfig", () => ({
    stripeSecretKeyTest: "sk_test_x",
    stripeSecretKeyLive: "",
    public: {},
  }));
  vi.stubGlobal("isStripeLiveMode", () => false);
  vi.stubGlobal("STRIPE_API_VERSION", "2024-11-20.acacia");
  vi.stubGlobal("getHeader", () => "t=1,v1=sig");
  vi.stubGlobal("readRawBody", async () => "{}");
  vi.stubGlobal("getStripeWebhookSecret", () => "whsec_x");
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
  vi.stubGlobal("creditWallet", creditWallet);
  vi.stubGlobal("mapStripeStatus", () => ({ subscription_status: "active", status: "active" }));
});

describe("signature verification", () => {
  it("rejects a body whose signature does not verify — before any write", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(directusRequest).not.toHaveBeenCalled();
  });

  it("rejects a request with no stripe-signature header", async () => {
    vi.stubGlobal("getHeader", () => undefined);
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 });
    expect(constructEvent).not.toHaveBeenCalled();
  });
});

describe("payment_intent.succeeded", () => {
  it("writes one payment_transactions row in dollars, org/member/request-scoped", async () => {
    const res = await fire("payment_intent.succeeded", paymentIntent());

    expect(res).toEqual({ received: true });
    const [row] = writes("createItem", "payment_transactions");
    expect(row!.data).toMatchObject({
      status: "succeeded",
      organization: ORG,
      member: MEMBER,
      payment_request: REQUEST,
      amount: 250, // cents → dollars
      currency: "usd",
      stripe_payment_intent_id: "pi_1",
      stripe_customer_id: "cus_1",
      receipt_email: "resident@example.com",
    });
  });

  it("credits the linked payment request and marks it paid when fully covered", async () => {
    reads.payment_requests = [{ id: REQUEST, amount: 250, amount_paid: 0 }];

    await fire("payment_intent.succeeded", paymentIntent());

    const [update] = writes("updateItem", "payment_requests");
    expect(update!.id).toBe(REQUEST);
    expect(update!.data).toMatchObject({
      amount_paid: 250,
      amount_remaining: 0,
      status: "paid",
    });
    expect(update!.data.paid_at).toEqual(expect.any(String));
  });

  it("leaves a partially covered request partially_paid", async () => {
    reads.payment_requests = [{ id: REQUEST, amount: 400, amount_paid: 50 }];

    await fire("payment_intent.succeeded", paymentIntent());

    const [update] = writes("updateItem", "payment_requests");
    expect(update!.data).toMatchObject({
      amount_paid: 300,
      amount_remaining: 100,
      status: "partially_paid",
    });
  });

  it("is idempotent: a redelivered event writes nothing", async () => {
    reads.payment_transactions = [{ id: "existing" }];
    reads.payment_requests = [{ id: REQUEST, amount: 250, amount_paid: 250 }];

    await fire("payment_intent.succeeded", paymentIntent());

    expect(writes("createItem", "payment_transactions")).toHaveLength(0);
    // The real damage a duplicate would do: double-crediting the request.
    expect(writes("updateItem", "payment_requests")).toHaveLength(0);
  });

  it("dedupes on the PaymentIntent id and only against a succeeded row", async () => {
    await fire("payment_intent.succeeded", paymentIntent());

    const lookup = commands().find(
      (c) => c.cmd === "readItems" && c.collection === "payment_transactions"
    );
    expect(lookup!.query.filter).toEqual({
      stripe_payment_intent_id: { _eq: "pi_1" },
      status: { _eq: "succeeded" },
    });
  });

  it("still records the transaction when the intent carries no org metadata", async () => {
    await fire("payment_intent.succeeded", paymentIntent({ metadata: {} }));

    const [row] = writes("createItem", "payment_transactions");
    expect(row!.data).toMatchObject({ organization: null, member: null, payment_request: null });
    expect(writes("updateItem", "payment_requests")).toHaveLength(0);
  });

  it("records a failed intent as a failed transaction (no request credit)", async () => {
    await fire("payment_intent.payment_failed", paymentIntent());

    const [row] = writes("createItem", "payment_transactions");
    expect(row!.data).toMatchObject({ status: "failed", amount: 250 });
    expect(writes("updateItem", "payment_requests")).toHaveLength(0);
  });
});

describe("ai_credits top-ups", () => {
  const topUp = () =>
    paymentIntent({
      id: "pi_credits",
      metadata: { kind: "ai_credits", org_id: ORG, credits: "1000" },
    });

  it("credits the org wallet, idempotent on the PaymentIntent id", async () => {
    await fire("payment_intent.succeeded", topUp());

    expect(creditWallet).toHaveBeenCalledWith({
      orgId: ORG,
      kind: "purchase",
      credits: 1000,
      stripeId: "pi_credits",
    });
  });

  it("is platform revenue — never a payment_transactions row", async () => {
    await fire("payment_intent.succeeded", topUp());

    expect(writes("createItem", "payment_transactions")).toHaveLength(0);
    expect(directusRequest).not.toHaveBeenCalled();
  });

  it("a dues payment does not touch the AI wallet", async () => {
    await fire("payment_intent.succeeded", paymentIntent());
    expect(creditWallet).not.toHaveBeenCalled();
  });
});

describe("account.updated (Connect onboarding sync)", () => {
  const account = (over: Record<string, any> = {}) => ({
    id: "acct_org",
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    ...over,
  });

  beforeEach(() => {
    reads.hoa_organizations = [{ id: ORG }];
  });

  it("marks the org active once charges AND payouts are enabled", async () => {
    await fire("account.updated", account());

    const [update] = writes("updateItem", "hoa_organizations");
    expect(update!.id).toBe(ORG);
    expect(update!.data).toEqual({
      connect_onboarding_status: "active",
      connect_charges_enabled: true,
      connect_payouts_enabled: true,
    });
  });

  it("stays pending while onboarding is incomplete", async () => {
    await fire("account.updated", account({ charges_enabled: false, payouts_enabled: false }));

    expect(writes("updateItem", "hoa_organizations")[0]!.data).toEqual({
      connect_onboarding_status: "pending",
      connect_charges_enabled: false,
      connect_payouts_enabled: false,
    });
  });

  it("charges without payouts is still pending — not active", async () => {
    await fire("account.updated", account({ payouts_enabled: false }));

    expect(writes("updateItem", "hoa_organizations")[0]!.data).toMatchObject({
      connect_onboarding_status: "pending",
      connect_charges_enabled: true,
      connect_payouts_enabled: false,
    });
  });

  it("a disabled_reason marks the account restricted", async () => {
    await fire(
      "account.updated",
      account({
        charges_enabled: false,
        payouts_enabled: false,
        requirements: { disabled_reason: "requirements.past_due" },
      })
    );

    expect(writes("updateItem", "hoa_organizations")[0]!.data).toMatchObject({
      connect_onboarding_status: "restricted",
    });
  });

  it("matches the org by connect account id", async () => {
    await fire("account.updated", account());

    const lookup = commands().find(
      (c) => c.cmd === "readItems" && c.collection === "hoa_organizations"
    );
    expect(lookup!.query.filter).toEqual({ stripe_connect_account_id: { _eq: "acct_org" } });
  });

  it("no-ops (and does not throw) for an account no org claims", async () => {
    reads.hoa_organizations = [];
    const res = await fire("account.updated", account());

    expect(res).toEqual({ received: true });
    expect(writes("updateItem", "hoa_organizations")).toHaveLength(0);
  });
});

describe("payout events", () => {
  it("are acknowledged without a ledger write (funds land in the org's own bank)", async () => {
    const res = await fire(
      "payout.paid",
      { id: "po_1", amount: 25000, currency: "usd", status: "paid", arrival_date: 1 },
      "acct_org"
    );

    expect(res).toEqual({ received: true });
    expect(directusRequest).not.toHaveBeenCalled();
  });
});

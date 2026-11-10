/**
 * Stripe webhook REPLAY fixtures (Earnest parity round 3, Phase 9 §9.4).
 *
 * Each fixture under ./fixtures/stripe is a Stripe event as delivered: the raw
 * JSON body. The handler reads it as bytes, "verifies" it (constructEvent is
 * mocked to parse what it is given), and writes to a STATEFUL in-memory
 * Directus — so a redelivered event sees what the first delivery wrote. That is
 * the point: Stripe delivers at-least-once, and every assertion below is about
 * the ledger row and the money after a replay, not the status code.
 *
 * Covers payment_intent.succeeded (transaction + request credit + ledger row +
 * receipt), charge.succeeded, charge.refunded (partial, then full, each
 * replayed; out-of-order arrival), account.updated, and the subscription events
 * the org's status hangs on (an unpaid checkout must not move the org).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

const { constructEvent } = vi.hoisted(() => ({ constructEvent: vi.fn() }));

vi.mock("stripe", () => {
  class StripeError extends Error {}
  function MockStripe(this: any) {
    this.webhooks = { constructEvent };
  }
  (MockStripe as any).errors = { StripeError };
  return { default: MockStripe };
});
vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
const handler = (await import("#core/server/api/stripe/webhook.post")).default as (e: H3Event) => Promise<any>;

const ORG = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const REQUEST = "33333333-3333-4333-8333-333333333333";

const fixture = (name: string) => readFileSync(resolve(__dirname, "fixtures/stripe", name), "utf8");

let db: MemoryDirectus;
let receipts: any[];
let rawBody: string;

/** Deliver a fixture exactly as Stripe would: raw bytes in, `{ received: true }` out. */
const deliver = async (name: string) => {
  rawBody = fixture(name);
  return handler({} as H3Event);
};

const txns = () => db.all("payment_transactions");
const request = () => db.one("payment_requests", REQUEST)!;
const ledger = (type?: string) => db.all("org_audit_log", type ? { event_type: { _eq: type } } : undefined);
const org = () => db.one("hoa_organizations", ORG)!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  db = new MemoryDirectus();
  db.seed("hoa_organizations", [
    {
      id: ORG,
      name: "Oak Court",
      stripe_customer_id: "cus_Rorgfixture",
      stripe_connect_account_id: "acct_1Qfixture",
      connect_onboarding_status: "pending",
      subscription_status: "trial",
      trial_ends_at: "2026-11-20T00:00:00.000Z",
    },
  ]);
  db.seed("hoa_members", [
    { id: MEMBER, organization: ORG, first_name: "Dana", last_name: "Reyes", email: "dana@example.com", user: "user-dana" },
  ]);
  db.seed("payment_requests", [
    { id: REQUEST, organization: ORG, title: "November dues", amount: 250, amount_paid: 0, amount_remaining: 250, status: "active", due_date: "2026-11-01", paid_at: null },
  ]);
  receipts = [];

  constructEvent.mockImplementation((body: string) => JSON.parse(body));
  vi.stubGlobal("useRuntimeConfig", () => ({ stripeSecretKeyTest: "sk_test_x", stripeSecretKeyLive: "", public: {} }));
  vi.stubGlobal("isStripeLiveMode", () => false);
  vi.stubGlobal("STRIPE_API_VERSION", "2024-11-20.acacia");
  vi.stubGlobal("getHeader", () => "t=1,v1=sig");
  vi.stubGlobal("readRawBody", async () => rawBody);
  vi.stubGlobal("getStripeWebhookSecrets", () => ["whsec_x"]);
  vi.stubGlobal("getTypedDirectus", () => db);
  vi.stubGlobal("creditWallet", vi.fn());
  vi.stubGlobal("notifySubscriptionActivated", vi.fn(async () => true));
  vi.stubGlobal("openAutoSupportRequest", vi.fn(async () => null));
  vi.stubGlobal("mapStripeStatus", () => ({ subscription_status: "active", status: "active" }));
  vi.stubGlobal("notifyPaymentReceived", async (_d: unknown, r: any) => {
    receipts.push(r);
    return true;
  });
  // The real writer is one createItem on org_audit_log (+ a RAG index that is
  // a no-op without Voyage) — written to the same store.
  vi.stubGlobal("writeAuditEntry", async (entry: any) => (await db.request({ op: "createItem", collection: "org_audit_log", data: entry })).id);
});

describe("payment_intent.succeeded — replayed", () => {
  it("books one transaction, credits the charge once, writes one board-only ledger row, sends one receipt", async () => {
    expect(await deliver("payment_intent.succeeded.json")).toEqual({ received: true });
    expect(await deliver("payment_intent.succeeded.json")).toEqual({ received: true });
    expect(await deliver("payment_intent.succeeded.json")).toEqual({ received: true });

    expect(txns()).toHaveLength(1);
    expect(txns()[0]).toMatchObject({
      status: "succeeded",
      amount: 250,
      organization: ORG,
      member: MEMBER,
      payment_request: REQUEST,
      stripe_payment_intent_id: "pi_3QfixtureDues",
    });
    expect(request()).toMatchObject({ amount_paid: 250, amount_remaining: 0, status: "paid" });

    const rows = ledger("payment_recorded");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organization: ORG,
      visibility: "board",
      actor_user: "user-dana",
      actor_name: "Dana Reyes",
      summary: "Dana Reyes paid $250.00 toward November dues.",
      payload: expect.objectContaining({ amount: 250, currency: "USD", reference: "pi_3QfixtureDues", method: "card", transaction_id: txns()[0]!.id }),
    });
    // No card digits on the permanent record.
    expect(JSON.stringify(rows[0])).not.toContain("4242");
    expect(receipts).toHaveLength(1);
  });
});

describe("charge.succeeded", () => {
  it("stamps the charge on the booked transaction; a replay changes nothing", async () => {
    await deliver("payment_intent.succeeded.json");
    await deliver("charge.succeeded.json");
    const after = { ...txns()[0] };
    await deliver("charge.succeeded.json");

    expect(txns()[0]).toEqual(after);
    expect(after).toMatchObject({ stripe_charge_id: "ch_3QfixtureDues", last4: "4242", processing_fee: 8, net_amount: 250 });
  });
});

describe("charge.refunded — partial, then full, each replayed", () => {
  beforeEach(async () => {
    await deliver("payment_intent.succeeded.json");
    await deliver("charge.succeeded.json");
  });

  it("a $50 partial refund takes $50 back once — not the whole payment, not twice", async () => {
    await deliver("charge.refunded.partial.json");
    await deliver("charge.refunded.partial.json");

    expect(txns()[0]).toMatchObject({ status: "succeeded", net_amount: 200 });
    expect(request()).toMatchObject({ amount_paid: 200, amount_remaining: 50, status: "partially_paid" });
    const refunds = ledger("payment_refunded");
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      visibility: "board",
      summary: "$50.00 was refunded to Dana Reyes (November dues) — part of the payment.",
      payload: expect.objectContaining({ amount: 50, fully_refunded: false, reference: "pi_3QfixtureDues" }),
    });
  });

  it("the full refund after it reverses only the remaining $200, and the charge goes back to owing (overdue)", async () => {
    await deliver("charge.refunded.partial.json");
    await deliver("charge.refunded.full.json");
    await deliver("charge.refunded.full.json");
    await deliver("charge.refunded.partial.json"); // a late redelivery of the first refund

    expect(txns()[0]).toMatchObject({ status: "refunded", net_amount: 0 });
    // Due Nov 1 and now unpaid: overdue — not "partially_paid" at $0, and no paid_at.
    expect(request()).toMatchObject({ amount_paid: 0, amount_remaining: 250, status: "overdue", paid_at: null });
    const refunds = ledger("payment_refunded").map((r) => [r.payload.amount, r.payload.fully_refunded]);
    expect(refunds).toEqual([
      [50, false],
      [200, true],
    ]);
    // The ledger reconciles: paid 250, refunded 50 + 200.
    expect(ledger("payment_recorded")[0]!.payload.amount).toBe(250);
  });

  it("the payment ledger row is never rewritten by a refund — corrections are new entries", async () => {
    const before = { ...ledger("payment_recorded")[0] };
    await deliver("charge.refunded.full.json");
    expect(ledger("payment_recorded")).toEqual([before]);
  });
});

describe("charge.refunded — out of order", () => {
  it("a refund processed before charge.succeeded still finds the payment by its PaymentIntent", async () => {
    await deliver("payment_intent.succeeded.json");
    await deliver("charge.refunded.full.json");

    expect(txns()[0]).toMatchObject({ status: "refunded", net_amount: 0, stripe_charge_id: "ch_3QfixtureDues" });
    expect(request()).toMatchObject({ amount_paid: 0 });
    expect(ledger("payment_refunded")).toHaveLength(1);
  });

  it("a late charge.succeeded does not put the gross back — so a refund replay after it is still a no-op", async () => {
    await deliver("payment_intent.succeeded.json");
    await deliver("charge.refunded.partial.json");
    await deliver("charge.succeeded.json");
    await deliver("charge.refunded.partial.json");

    expect(txns()[0]).toMatchObject({ net_amount: 200 });
    expect(request()).toMatchObject({ amount_paid: 200 });
    expect(ledger("payment_refunded")).toHaveLength(1);
  });

  it("a refund for a payment never booked writes nothing", async () => {
    await deliver("charge.refunded.full.json");
    expect(txns()).toHaveLength(0);
    expect(ledger()).toHaveLength(0);
    expect(request()).toMatchObject({ amount_paid: 0, status: "active" });
  });
});

describe("account.updated", () => {
  it("activates the org's Connect account; a replay leaves it exactly so", async () => {
    await deliver("account.updated.json");
    const after = { ...org() };
    await deliver("account.updated.json");

    expect(after).toMatchObject({ connect_onboarding_status: "active", connect_charges_enabled: true, connect_payouts_enabled: true });
    expect(org()).toEqual(after);
  });
});

describe("customer.subscription.* — the org's own subscription", () => {
  it("an unpaid checkout (incomplete) leaves a trial org on its trial", async () => {
    await deliver("customer.subscription.created.incomplete.json");
    expect(org()).toMatchObject({ subscription_status: "trial" });
    expect(org().stripe_subscription_id).toBeUndefined();
  });

  it("payment makes it active and records the subscription; a replay is identical", async () => {
    await deliver("customer.subscription.created.incomplete.json");
    await deliver("customer.subscription.updated.active.json");
    const after = { ...org() };
    await deliver("customer.subscription.updated.active.json");

    expect(after).toMatchObject({ subscription_status: "active", stripe_subscription_id: "sub_1Qfixture", billing_cycle: "monthly" });
    expect(org()).toEqual(after);
  });

  it("an abandoned checkout expiring (incomplete_expired) does not expire the org", async () => {
    await deliver("customer.subscription.updated.active.json");
    await deliver("customer.subscription.updated.incomplete_expired.json");
    expect(org()).toMatchObject({ subscription_status: "active", stripe_subscription_id: "sub_1Qfixture" });
  });
});

// Phase 9 money-path pure modules: the band checkout (what the subscription page
// quotes = what the route charges), the org status a Stripe subscription maps
// to, the refund planner (deltas, so replays are no-ops) and the request status
// after money moves either way.
import { describe, it, expect } from "vitest";
import { isCheckoutRefusal, planBandCheckout, type CheckoutBand } from "#core/shared/billing/band-checkout";
import { orgStatusForStripeSubscription } from "#core/shared/billing/subscription-status";
import { planChargeRefund, requestStatusAfter } from "#core/shared/billing/refund";
import { buildPaymentRefundedEntry } from "#core/shared/ledger/entries";
import { defaultVisibilityFor, eventTypesInCategory } from "#core/shared/ledger/events";

const SMALL: CheckoutBand = {
  name: "Small",
  slug: "small",
  price_monthly: 149,
  price_yearly: 1490,
  onboarding_fee: 500,
  stripe_price_id_monthly: "price_m",
  stripe_price_id_yearly: "price_y",
  stripe_price_id_onboarding: "price_onb",
};

describe("planBandCheckout", () => {
  it("monthly with standard onboarding: the band's recurring price plus the one-time line", () => {
    const p = planBandCheckout(SMALL, "monthly", "standard");
    expect(p).toEqual({
      ok: true,
      recurringPriceId: "price_m",
      onboardingPriceId: "price_onb",
      periodAmount: 149,
      onboardingAmount: 500,
      firstInvoiceCents: 64900,
    });
  });

  it("annual uses the yearly price; onboarding 'none' adds no line", () => {
    const p = planBandCheckout(SMALL, "annual", "none");
    expect(p).toMatchObject({ ok: true, recurringPriceId: "price_y", onboardingPriceId: null, firstInvoiceCents: 149000 });
  });

  it("a band with no onboarding fee needs no onboarding price", () => {
    const p = planBandCheckout({ ...SMALL, onboarding_fee: 0, stripe_price_id_onboarding: null }, "monthly", "standard");
    expect(p).toMatchObject({ ok: true, onboardingPriceId: null, firstInvoiceCents: 14900 });
  });

  it.each([
    ["no band", null, "no_band", 404],
    ["contact-only", { ...SMALL, is_contact_only: true }, "contact_only", 409],
    ["no monthly price (contact-only by omission)", { ...SMALL, price_monthly: null }, "contact_only", 409],
    ["no Stripe price yet", { ...SMALL, stripe_price_id_monthly: null }, "no_price", 503],
    ["onboarding fee but no onboarding price", { ...SMALL, stripe_price_id_onboarding: null }, "no_price", 503],
  ] as const)("refuses: %s", (_label, band, reason, status) => {
    const p = planBandCheckout(band as any, "monthly", "standard");
    expect(isCheckoutRefusal(p)).toBe(true);
    expect(p).toMatchObject({ ok: false, reason, status });
  });
});

describe("orgStatusForStripeSubscription", () => {
  it.each([
    ["incomplete", undefined, null],
    ["incomplete_expired", undefined, null],
    ["trialing", undefined, "trial"],
    ["active", undefined, "active"],
    ["past_due", undefined, "expired"],
    ["unpaid", undefined, "canceled"],
    ["canceled", undefined, "canceled"],
    ["active", "customer.subscription.deleted", "canceled"],
    ["incomplete", "customer.subscription.deleted", null],
  ])("%s (%s) → %s", (status, eventType, want) => {
    expect(orgStatusForStripeSubscription(status, eventType)).toBe(want);
  });
});

describe("planChargeRefund", () => {
  const booked = { amount: 250, net_amount: null, status: "succeeded" };
  const charge = (refunded: number, full = false) => ({ amount_captured: 25000, amount_refunded: refunded, refunded: full });

  it("a first partial refund: the delta, and the transaction stays succeeded", () => {
    expect(planChargeRefund(booked, charge(5000))).toEqual({ delta: 50, netAfter: 200, status: "succeeded", fullyRefunded: false });
  });
  it("a replay of it is a zero delta", () => {
    expect(planChargeRefund({ ...booked, net_amount: 200 }, charge(5000)).delta).toBe(0);
  });
  it("the cumulative full refund after it reverses only what is left", () => {
    expect(planChargeRefund({ ...booked, net_amount: 200 }, charge(25000, true))).toEqual({
      delta: 200,
      netAfter: 0,
      status: "refunded",
      fullyRefunded: true,
    });
  });
  it("a late partial redelivery after the full refund is a zero delta, never negative", () => {
    expect(planChargeRefund({ ...booked, net_amount: 0, status: "refunded" }, charge(5000)).delta).toBe(0);
  });
  it("an already-refunded row with no net recorded holds nothing", () => {
    expect(planChargeRefund({ ...booked, status: "refunded" }, charge(25000, true)).delta).toBe(0);
  });
  it("cents, not floats: 0.1 + 0.2 style amounts land exactly", () => {
    const p = planChargeRefund({ amount: 0.3, net_amount: null, status: "succeeded" }, { amount_captured: 30, amount_refunded: 10, refunded: false });
    expect(p).toMatchObject({ delta: 0.1, netAfter: 0.2 });
  });
});

describe("requestStatusAfter", () => {
  const NOW = "2026-11-05T12:00:00Z";
  it.each([
    [{ amount: 250 }, 250, "paid"],
    [{ amount: 250 }, 300, "paid"],
    [{ amount: 250 }, 100, "partially_paid"],
    [{ amount: 250, due_date: "2026-12-01" }, 0, "active"],
    [{ amount: 250, due_date: "2026-11-01" }, 0, "overdue"],
    [{ amount: 250, due_date: null }, 0, "active"],
  ] as const)("%o paid %s → %s", (req, paid, want) => {
    expect(requestStatusAfter(req as any, paid, NOW)).toBe(want);
  });
});

describe("payment_refunded ledger entry", () => {
  const base = {
    organizationId: "org-1",
    organizationName: "Oak Court",
    payment: { transactionId: "t1", memberId: "m1", memberName: "Dana Reyes", amount: 50, currency: "usd", description: "November dues", reference: "pi_1" },
    actor: { userId: null, name: "Stripe refund", email: null },
    occurredAt: "2026-11-05T12:00:00Z",
  };
  it("is board-only money, says partial vs full, and carries the delta", () => {
    const e = buildPaymentRefundedEntry({ ...base, fullyRefunded: false })!;
    expect(e).toMatchObject({ event_type: "payment_refunded", visibility: "board" });
    expect(e.summary).toBe("$50.00 was refunded to Dana Reyes (November dues) — part of the payment.");
    expect(e.payload).toMatchObject({ amount: 50, currency: "USD", fully_refunded: false });
    expect(buildPaymentRefundedEntry({ ...base, fullyRefunded: true })!.summary).toContain("the payment in full");
    expect(defaultVisibilityFor("payment_refunded")).toBe("board");
    expect(eventTypesInCategory("money")).toContain("payment_refunded");
  });
  it("a zero delta (a replay) is not an event", () => {
    expect(buildPaymentRefundedEntry({ ...base, payment: { ...base.payment, amount: 0 }, fullyRefunded: true })).toBeNull();
  });
});

// HOA Connect runs on Hue's shared Stripe account: only our objects are booked.
import { appCustomerSearchQuery, appMetadata, isHoaConnectObject, STRIPE_APP } from "#core/shared/billing/stripe-app";

describe("stripe-app (Hue's shared account)", () => {
  it("appMetadata tags, stringifies, drops nulls, and the tag can't be overridden", () => {
    expect(appMetadata({ organization_id: "o1", units: 4, gone: null, app: "other" } as any)).toEqual({
      app: STRIPE_APP,
      organization_id: "o1",
      units: "4",
    });
  });

  it.each([
    [{ app: "hoaconnect" }, true],
    [{ organization_id: "o1" }, true],
    [{ kind: "ai_credits", org_id: "o1" }, true],
    [{ billing_account_id: "b1" }, true],
    [{ band_slug: "boutique" }, true],
    [{ organization_id: "" }, false],
    [{ app: "hue-studio", order: "42" }, false],
    [{}, false],
    [null, false],
  ])("%o → %s", (metadata, want) => expect(isHoaConnectObject(metadata as any)).toBe(want));

  it("the customer search is scoped to the app and escapes quotes", () => {
    expect(appCustomerSearchQuery("o'neil@example.com")).toBe("email:'o\\'neil@example.com' AND metadata['app']:'hoaconnect'");
  });
});

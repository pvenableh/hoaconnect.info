/**
 * Operator console maths (docs/plan-operator-console.md §5): MRR normalised to
 * monthly, agency quantity, running vs one-off discounts, other products'
 * subscriptions left out, and the community status buckets.
 */
import { describe, it, expect } from "vitest";
import {
  communityStatus,
  countStatuses,
  isDuesCharge,
  isOurStripeObject,
  monthlyValue,
  summarizeRevenue,
  withinDays,
} from "#core/shared/ops/metrics";
import { OPS_PERMISSIONS, opsCan, platformRoleFor, roleIdOf } from "#core/shared/ops/permissions";

const NOW = new Date("2026-11-09T12:00:00Z");
const DAY = 86_400_000;
const iso = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

const sub = (over: Record<string, any> = {}, price: Record<string, any> = {}, quantity = 1) => ({
  id: "sub_1",
  status: "active",
  metadata: { app: "hoaconnect" },
  items: {
    data: [
      {
        quantity,
        price: { unit_amount: 24900, currency: "usd", recurring: { interval: "month", interval_count: 1 }, ...price },
      },
    ],
  },
  discount: null,
  ...over,
});

describe("monthlyValue", () => {
  it("takes a monthly price as it is", () => {
    expect(monthlyValue(sub(), NOW).cents).toBe(24900);
  });

  it("divides an annual price by twelve", () => {
    expect(monthlyValue(sub({}, { unit_amount: 249000, recurring: { interval: "year", interval_count: 1 } }), NOW).cents).toBe(20750);
  });

  it("handles interval counts and weekly prices", () => {
    expect(monthlyValue(sub({}, { unit_amount: 30000, recurring: { interval: "month", interval_count: 3 } }), NOW).cents).toBe(10000);
    expect(monthlyValue(sub({}, { unit_amount: 1200, recurring: { interval: "week", interval_count: 1 } }), NOW).cents).toBe(5200);
  });

  it("multiplies by quantity, so an agency counts per property", () => {
    expect(monthlyValue(sub({}, { unit_amount: 9900 }, 3), NOW).cents).toBe(29700);
  });

  it("takes a running percent discount off", () => {
    const s = sub({ discount: { end: null, coupon: { percent_off: 50, duration: "forever" } } });
    expect(monthlyValue(s, NOW).cents).toBe(12450);
  });

  it("takes an amount discount off per period, normalised to the month", () => {
    const s = sub(
      { discount: { end: null, coupon: { amount_off: 12000, duration: "forever" } } },
      { unit_amount: 240000, recurring: { interval: "year", interval_count: 1 } }
    );
    expect(monthlyValue(s, NOW).cents).toBe(19000);
  });

  it("ignores a one-off discount, and a repeating one that has ended", () => {
    expect(monthlyValue(sub({ discount: { coupon: { percent_off: 50, duration: "once" } } }), NOW).cents).toBe(24900);
    const ended = { end: Math.floor((NOW.getTime() - DAY) / 1000), coupon: { percent_off: 50, duration: "repeating" } };
    expect(monthlyValue(sub({ discount: ended }), NOW).cents).toBe(24900);
    const running = { end: Math.floor((NOW.getTime() + DAY) / 1000), coupon: { percent_off: 50, duration: "repeating" } };
    expect(monthlyValue(sub({ discount: running }), NOW).cents).toBe(12450);
  });

  it("skips one-off items and reports prices it can't value", () => {
    const s = sub();
    s.items.data.push({ quantity: 1, price: { unit_amount: 150000, currency: "usd", recurring: null } } as any);
    s.items.data.push({ quantity: 1, price: { unit_amount: null, currency: "usd", recurring: { interval: "month", interval_count: 1 } } } as any);
    expect(monthlyValue(s, NOW)).toMatchObject({ cents: 24900, unpriced: 1 });
  });
});

describe("summarizeRevenue", () => {
  it("counts active subscriptions only, past due as at risk, and never another product's", () => {
    const r = summarizeRevenue(
      [
        sub({ id: "a" }),
        sub({ id: "b", status: "past_due" }, { unit_amount: 49900 }),
        sub({ id: "c", status: "trialing" }),
        sub({ id: "d", status: "canceled" }),
        sub({ id: "e", metadata: { app: "another-hue-product" } }, { unit_amount: 100000 }),
        sub({ id: "f", metadata: { organization_id: "org-legacy" } }, { unit_amount: 1000 }),
      ],
      NOW
    );
    expect(r).toMatchObject({
      mrrCents: 25900,
      arrCents: 310800,
      atRiskMrrCents: 49900,
      activeSubscriptions: 2,
      byStatus: { active: 2, past_due: 1, trialing: 1, canceled: 1 },
      currencies: ["usd"],
    });
  });
});

describe("communityStatus", () => {
  it("buckets by the fields entitlement reads", () => {
    expect(communityStatus({ subscription_status: "active" }, null, NOW).status).toBe("active");
    expect(communityStatus({ subscription_status: "past_due" }, null, NOW).status).toBe("past_due");
    expect(communityStatus({ subscription_status: "canceled" }, null, NOW).status).toBe("canceled");
    expect(communityStatus({ subscription_status: "expired" }, null, NOW).status).toBe("expired");
    expect(communityStatus({ subscription_status: null }, null, NOW).status).toBe("expired");
    expect(communityStatus({ subscription_status: "canceled", is_free_account: true }, null, NOW).status).toBe("free");
  });

  it("flags a trial ending within three days, and calls a lapsed trial expired", () => {
    expect(communityStatus({ subscription_status: "trial", trial_ends_at: iso(2) }, null, NOW)).toMatchObject({
      status: "trial",
      trialEndingSoon: true,
    });
    expect(communityStatus({ subscription_status: "trial", trial_ends_at: iso(10) }, null, NOW)).toMatchObject({
      status: "trial",
      trialEndingSoon: false,
    });
    expect(communityStatus({ subscription_status: "trial", trial_ends_at: iso(-1) }, null, NOW).status).toBe("expired");
    expect(communityStatus({ subscription_status: "trial", trial_ends_at: null }, null, NOW).status).toBe("trial");
  });

  it("resolves an agency-billed community up to its billing account", () => {
    const r = communityStatus(
      { subscription_status: "expired", billing_account: "acc-1" },
      { subscription_status: "active" },
      NOW
    );
    expect(r).toMatchObject({ status: "active", agency: true });
  });

  it("notes a transition grace window", () => {
    expect(communityStatus({ subscription_status: "canceled", grace_ends_at: iso(5) }, null, NOW).inGrace).toBe(true);
  });

  it("counts buckets, with trial-ending and agency as overlays", () => {
    const c = countStatuses([
      communityStatus({ subscription_status: "trial", trial_ends_at: iso(1) }, null, NOW),
      communityStatus({ subscription_status: "trial", trial_ends_at: iso(9) }, null, NOW),
      communityStatus({ billing_account: "a" }, { subscription_status: "active" }, NOW),
    ]);
    expect(c).toMatchObject({ total: 3, trial: 2, trial_ending: 1, active: 1, agency: 1 });
  });
});

describe("helpers", () => {
  it("withinDays counts the window and not the future", () => {
    expect(withinDays(iso(-6), 7, NOW)).toBe(true);
    expect(withinDays(iso(-8), 7, NOW)).toBe(false);
    expect(withinDays(iso(1), 7, NOW)).toBe(false);
    expect(withinDays(null, 7, NOW)).toBe(false);
  });

  it("knows our Stripe objects by tag, subscription metadata or customer", () => {
    const ours = new Set(["cus_ours"]);
    expect(isOurStripeObject({ metadata: { app: "hoaconnect" } }, ours)).toBe(true);
    expect(isOurStripeObject({ metadata: {}, subscription_details: { metadata: { app: "hoaconnect" } } }, ours)).toBe(true);
    expect(isOurStripeObject({ metadata: {}, customer: "cus_ours" }, ours)).toBe(true);
    expect(isOurStripeObject({ object: "customer", id: "cus_ours", metadata: {} }, ours)).toBe(true);
    expect(isOurStripeObject({ metadata: { app: "other" }, customer: "cus_other" }, ours)).toBe(false);
  });

  it("tells resident dues from platform charges", () => {
    expect(isDuesCharge({ transfer_data: { destination: "acct_1" } })).toBe(true);
    expect(isDuesCharge({ metadata: { payment_request_id: "pr_1" } })).toBe(true);
    expect(isDuesCharge({ metadata: { app: "hoaconnect", organization_id: "o" } })).toBe(false);
  });
});

describe("platform roles", () => {
  const ids = { appAdmin: "role-app", platformSupport: "role-support" };

  it("maps role ids, never names, and ignores an unset id", () => {
    expect(platformRoleFor("role-app", ids)).toBe("app_admin");
    expect(platformRoleFor("role-support", ids)).toBe("platform_support");
    expect(platformRoleFor("Administrator", ids)).toBeNull();
    expect(platformRoleFor("", { appAdmin: "role-app", platformSupport: "" })).toBeNull();
    expect(platformRoleFor(undefined, { platformSupport: undefined })).toBeNull();
    expect(roleIdOf({ id: "role-app" })).toBe("role-app");
    expect(roleIdOf(null)).toBeNull();
  });

  it("gives Platform Support reading and support, never money", () => {
    expect(OPS_PERMISSIONS.app_admin).toEqual(["billing.read", "billing.write", "support"]);
    expect(opsCan("platform_support", "billing.read")).toBe(true);
    expect(opsCan("platform_support", "support")).toBe(true);
    expect(opsCan("platform_support", "billing.write")).toBe(false);
    expect(opsCan(null, "billing.read")).toBe(false);
  });
});

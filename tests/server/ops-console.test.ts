/**
 * The operator console's read side (docs/plan-operator-console.md, Phase 1).
 *
 * Guards: only App Admin and Platform Support get in, and everyone else is
 * refused before Directus or Stripe is asked anything. Routes: the real
 * handlers on a MemoryDirectus and a fake Stripe that pages two items at a time
 * and carries another Hue product's objects alongside ours.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

const h = vi.hoisted(() => ({ stripe: null as any, session: null as any, query: {} as any, params: {} as any }));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.mock("#core/server/utils/stripe", () => ({
  getStripe: () => h.stripe,
  isStripeLiveMode: () => false,
}));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const adminAuth = await import("#core/server/utils/admin-auth");
const opsData = await import("#core/server/utils/ops-data");
type Handler = (event: H3Event) => Promise<any>;
const routes = {
  overview: (await import("#core/server/api/ops/overview.get")).default as Handler,
  communities: (await import("#core/server/api/ops/communities.get")).default as Handler,
  community: (await import("#core/server/api/ops/communities/[id].get")).default as Handler,
  billingAccounts: (await import("#core/server/api/ops/billing-accounts.get")).default as Handler,
  payments: (await import("#core/server/api/ops/payments.get")).default as Handler,
};

const event = {} as H3Event;
const ROLE = {
  appAdmin: "role-app-admin",
  support: "role-platform-support",
  hoaAdmin: "role-hoa-admin",
  pm: "role-pm",
  member: "role-member",
};
const NOW = new Date("2026-11-09T12:00:00Z");
const DAY = 86_400_000;
const iso = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
const unix = (days: number) => Math.floor((NOW.getTime() + days * DAY) / 1000);

let db: MemoryDirectus;
let directusCalls: number;

const directusRequest = async (op: any) => {
  directusCalls += 1;
  switch (op.op) {
    case "aggregate": {
      const q = op.options.query ?? op.options;
      const rows = db.all(op.collection, q?.filter);
      const groupBy: string[] | undefined = op.options.groupBy;
      if (!groupBy) return [{ count: rows.length }];
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r[groupBy[0]!], (counts.get(r[groupBy[0]!]) ?? 0) + 1);
      return [...counts].map(([k, count]) => ({ [groupBy[0]!]: k, count: String(count) }));
    }
    case "readUsers":
      return db.all("directus_users", op.query.filter);
  }
  return db.request(op);
};

/** A Stripe list endpoint over `items`, two per page, honouring starting_after. */
const pager = (items: () => any[], filter: (x: any, p: any) => boolean = () => true) =>
  vi.fn(async (p: any = {}) => {
    const all = items().filter((x) => filter(x, p));
    const from = p.starting_after ? all.findIndex((x) => x.id === p.starting_after) + 1 : 0;
    const data = all.slice(from, from + 2);
    return { data, has_more: from + 2 < all.length };
  });

const price = (unit_amount: number, interval = "month") => ({ unit_amount, currency: "usd", recurring: { interval, interval_count: 1 } });
const subscription = (id: string, status: string, unit: number, over: Record<string, any> = {}, quantity = 1, interval = "month") => ({
  id,
  object: "subscription",
  status,
  customer: `cus_${id}`,
  metadata: { app: "hoaconnect" },
  items: { data: [{ quantity, price: price(unit, interval) }] },
  discount: null,
  ...over,
});

let SUBS: any[];
let EVENTS: any[];
let CHARGES: any[];
let PROMOS: any[];

function seed() {
  db = new MemoryDirectus();
  db.seed("subscription_plans", [
    { id: "plan-boutique", slug: "boutique", name: "Boutique", min_units: 1, max_units: 49, status: "published", is_active: true },
    { id: "plan-mid", slug: "mid", name: "Mid", min_units: 50, max_units: 149, status: "published", is_active: true },
  ]);
  const org = (id: string, name: string, over: Record<string, any>) => ({
    id,
    name,
    slug: id,
    subscription_status: "active",
    trial_ends_at: null,
    is_free_account: false,
    billing_account: null,
    subscription_plan: "plan-boutique",
    declared_units: 0,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    date_created: iso(-60),
    ...over,
  });
  db.seed("hoa_organizations", [
    org("harbor", "Harbor Court", { stripe_subscription_id: "sub_a", stripe_customer_id: "cus_sub_a", date_created: iso(-2), declared_units: 60 }),
    org("annual", "Annual Place", { stripe_subscription_id: "sub_y", stripe_customer_id: "cus_sub_y", billing_cycle: "yearly" }),
    org("soon", "Trial Soon", { subscription_status: "trial", trial_ends_at: iso(2), date_created: iso(-10) }),
    org("later", "Trial Later", { subscription_status: "trial", trial_ends_at: iso(10), date_created: iso(-4) }),
    org("lapsed", "Trial Lapsed", { subscription_status: "trial", trial_ends_at: iso(-1) }),
    org("pastdue", "Past Due Pines", { subscription_status: "past_due", stripe_subscription_id: "sub_pd", stripe_customer_id: "cus_sub_pd" }),
    org("gone", "Gone Gardens", { subscription_status: "canceled" }),
    org("comp", "Comp Commons", { subscription_status: "canceled", is_free_account: true }),
    org("agency1", "Agency One", { subscription_status: "expired", billing_account: "acc-1" }),
    org("agency2", "Agency Two", { subscription_status: "expired", billing_account: "acc-1" }),
  ]);
  db.seed("billing_accounts", [
    {
      id: "acc-1",
      name: "Acme Management",
      status: "active",
      subscription_status: "active",
      stripe_customer_id: "cus_sub_ag",
      stripe_subscription_id: "sub_ag",
      seats_purchased: 3,
    },
  ]);
  db.seed("hoa_units", [
    ...Array.from({ length: 10 }, () => ({ organization: "harbor" })),
    ...Array.from({ length: 4 }, () => ({ organization: "annual" })),
    ...["later", "lapsed", "pastdue", "gone", "comp", "agency1", "agency2"].map((o) => ({ organization: o })),
  ]);
  db.seed("directus_users", [
    { id: "u-alice", first_name: "Alice", last_name: "Admin", email: "alice@harbor.test", last_access: iso(-1) },
    { id: "u-pat", first_name: "Pat", last_name: "Manager", email: "pat@pm.test", last_access: iso(-3) },
    { id: "u-oscar", first_name: "Oscar", last_name: "Officer", email: "oscar@harbor.test", last_access: null },
    { id: "u-rita", first_name: "Rita", last_name: "Resident", email: "rita@harbor.test" },
    { id: "u-tom", first_name: "Tom", last_name: "Tenant", email: "tom@harbor.test" },
    { id: "u-bill", first_name: "Bill", last_name: "Agent", email: "bill@acme.test" },
  ]);
  const member = (id: string, user: string, role: string, over: Record<string, any> = {}) => {
    const u = db.one("directus_users", user)!;
    return { id, user, organization: "harbor", role, status: "active", first_name: u.first_name, last_name: u.last_name, email: u.email, date_created: iso(-30), ...over };
  };
  db.seed("hoa_members", [
    member("m-alice", "u-alice", ROLE.hoaAdmin, { member_type: "owner" }),
    member("m-pat", "u-pat", ROLE.pm, { manager_permissions: { inquiries: true, communications: true, violations: false, made_up: true } }),
    member("m-oscar", "u-oscar", ROLE.member, { member_type: "owner" }),
    member("m-rita", "u-rita", ROLE.member, { member_type: "owner" }),
    member("m-tom", "u-tom", ROLE.member, { member_type: "owner", units: [{ member_type: "tenant", is_primary_unit: true, end_date: null }] }),
    member("m-ex", "u-tom", ROLE.member, { status: "archived" }),
    { id: "m-agency-admin", user: "u-bill", organization: "agency1", role: ROLE.hoaAdmin, status: "active", first_name: null, last_name: null, email: null, date_created: iso(-5) },
  ]);
  db.seed("hoa_board_members", [
    { id: "b-oscar", hoa_member: "m-oscar", title: "president", status: "published", term_start: "2026-01-01", term_end: null, sort: 1 },
    { id: "b-rita-past", hoa_member: "m-rita", title: "treasurer", status: "published", term_start: "2024-01-01", term_end: "2025-12-31", sort: 2 },
  ]);
  db.seed("billing_account_members", [{ id: "bam-1", billing_account: "acc-1", user: "u-bill", role: "billing_admin" }]);
  db.seed("ai_wallets", [{ organization: "harbor", balance_credits: 420, allowance_credits: 400, purchased_credits: 20 }]);
  db.seed(
    "org_audit_log",
    Array.from({ length: 22 }, (_, i) => ({
      organization: "harbor",
      event_type: "admin_promoted",
      occurred_at: iso(-i),
      actor_name: "Alice Admin",
      actor_email: "alice@harbor.test",
      summary: `entry ${i}`,
    }))
  );

  SUBS = [
    // A one-off discount touched one invoice; MRR stays at list price.
    subscription("sub_a", "active", 24900, { discount: { end: null, coupon: { percent_off: 50, duration: "once" } } }),
    subscription("sub_y", "active", 249000, { discount: { end: null, coupon: { percent_off: 50, duration: "forever" } } }, 1, "year"),
    subscription("sub_ag", "active", 9900, {}, 3),
    subscription("sub_pd", "past_due", 49900),
    subscription("sub_old", "canceled", 24900),
    subscription("sub_other", "active", 100000, { metadata: { app: "another-hue-product" } }),
  ];
  const invoiceEvent = (id: string, type: string, invoice: any, pending = 0) => ({
    id,
    type,
    created: unix(-3),
    pending_webhooks: pending,
    data: { object: { object: "invoice", ...invoice } },
  });
  EVENTS = [
    invoiceEvent("evt_f1", "invoice.payment_failed", { id: "in_pd", customer: "cus_sub_pd", subscription_details: { metadata: { app: "hoaconnect" } } }),
    invoiceEvent("evt_f2", "invoice.payment_failed", { id: "in_pd", customer: "cus_sub_pd", subscription_details: { metadata: { app: "hoaconnect" } } }),
    invoiceEvent("evt_f3", "invoice.payment_failed", { id: "in_x", customer: "cus_other", metadata: { app: "another-hue-product" } }),
    invoiceEvent("evt_w1", "invoice.paid", { id: "in_a", customer: "cus_sub_a" }, 1),
    invoiceEvent("evt_w2", "invoice.paid", { id: "in_o", customer: "cus_other" }, 1),
  ];
  CHARGES = [
    { id: "ch_sub", object: "charge", created: unix(-1), amount: 24900, amount_refunded: 0, refunded: false, currency: "usd", status: "succeeded", customer: "cus_sub_a", metadata: {}, description: "Subscription update", payment_intent: "pi_sub" },
    { id: "ch_ref", object: "charge", created: unix(-2), amount: 49900, amount_refunded: 10000, refunded: false, currency: "usd", status: "succeeded", customer: "cus_sub_pd", metadata: {}, payment_intent: "pi_ref" },
    { id: "ch_fail", object: "charge", created: unix(-3), amount: 49900, amount_refunded: 0, refunded: false, currency: "usd", status: "failed", failure_message: "Your card was declined.", customer: "cus_sub_pd", metadata: {} },
    { id: "ch_dues", object: "charge", created: unix(-4), amount: 35000, amount_refunded: 0, refunded: false, currency: "usd", status: "succeeded", customer: "cus_resident", metadata: { app: "hoaconnect", organization_id: "harbor", member_id: "m-rita" }, transfer_data: { destination: "acct_harbor" }, billing_details: { name: "Rita Resident", email: "rita@harbor.test" } },
    { id: "ch_other", object: "charge", created: unix(-1), amount: 999900, amount_refunded: 0, refunded: false, currency: "usd", status: "succeeded", customer: "cus_other", metadata: { app: "another-hue-product" } },
  ];
  PROMOS = [
    { id: "promo_spring", code: "SPRING", active: true, times_redeemed: 3, max_redemptions: null, metadata: { app: "hoaconnect" }, coupon: { percent_off: 50, duration: "once", metadata: {} } },
    { id: "promo_hue", code: "HUE", active: true, times_redeemed: 5, max_redemptions: null, metadata: {}, coupon: { amount_off: 500, metadata: { app: "another-hue-product" } } },
  ];

  h.stripe = {
    subscriptions: {
      list: pager(() => SUBS),
      retrieve: vi.fn(async (id: string) => SUBS.find((s) => s.id === id)),
    },
    events: {
      list: pager(
        () => EVENTS,
        (e, p) => (!p.type || e.type === p.type) && (p.delivery_success !== false || e.pending_webhooks > 0)
      ),
    },
    charges: { list: pager(() => CHARGES, (c, p) => !p.customer || c.customer === p.customer) },
    invoices: { list: vi.fn(async () => ({ data: [{ id: "in_a", number: "A-1", created: unix(-1), total: 24900, amount_paid: 24900, currency: "usd", status: "paid", hosted_invoice_url: "https://invoice.test/a" }], has_more: false })) },
    promotionCodes: { list: pager(() => PROMOS) },
  };
}

const stripeCalls = () =>
  Object.values(h.stripe).reduce(
    (n: number, api: any) => n + Object.values(api).reduce((m: number, fn: any) => m + (fn.mock?.calls.length ?? 0), 0),
    0
  );

const as = (role: string | null, userId = "u-staff") => {
  h.session = role === null ? null : { user: { id: userId, role } };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  seed();
  directusCalls = 0;
  opsData._resetOpsCache();
  h.query = {};
  h.params = {};
  as(ROLE.appAdmin);

  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("getRouterParam", (_e: unknown, k: string) => h.params[k]);
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: {
      directus: { url: "https://directus.test" },
      directusRoleAppAdmin: ROLE.appAdmin,
      directusRolePlatformSupport: ROLE.support,
      directusRoleHoaAdmin: ROLE.hoaAdmin,
      directusRolePropertyManager: ROLE.pm,
      directusRoleMember: ROLE.member,
    },
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Guards ──────────────────────────────────────────────────────────────────

/**
 * People who hold real power inside a community, or over its bill, but are not
 * HOA Connect staff. Each is seeded with the membership that makes them that,
 * so a guard that consulted memberships would let them through.
 */
const OUTSIDERS: Array<[string, () => void]> = [
  ["an HOA Admin", () => as(ROLE.hoaAdmin, "u-alice")],
  ["a Property Manager", () => as(ROLE.pm, "u-pat")],
  ["a member", () => as(ROLE.member, "u-rita")],
  ["a billing_admin", () => as(ROLE.member, "u-bill")],
  ["a user whose role is unset", () => as("", "u-tom")],
];

describe("requireAppAdmin", () => {
  it("passes the App Admin", async () => {
    await expect(adminAuth.requireAppAdmin(event)).resolves.toMatchObject({ role: "app_admin", userId: "u-staff" });
  });

  it.each([...OUTSIDERS, ["Platform Support", () => as(ROLE.support)] as [string, () => void]])(
    "refuses %s with 403 before anything else runs",
    async (_who, setup) => {
      setup();
      await expect(adminAuth.requireAppAdmin(event)).rejects.toMatchObject({ statusCode: 403 });
      expect(directusCalls).toBe(0);
      expect(stripeCalls()).toBe(0);
    }
  );

  it("answers 401 without a session", async () => {
    as(null);
    await expect(adminAuth.requireAppAdmin(event)).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("requireOpsPermission", () => {
  it("passes the App Admin on all three", async () => {
    for (const p of ["billing.read", "billing.write", "support"] as const) {
      await expect(adminAuth.requireOpsPermission(event, p)).resolves.toMatchObject({ role: "app_admin" });
    }
  });

  it("passes Platform Support on billing.read and support, and refuses billing.write", async () => {
    as(ROLE.support);
    await expect(adminAuth.requireOpsPermission(event, "billing.read")).resolves.toMatchObject({ role: "platform_support" });
    await expect(adminAuth.requireOpsPermission(event, "support")).resolves.toMatchObject({ role: "platform_support" });
    await expect(adminAuth.requireOpsPermission(event, "billing.write")).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each(OUTSIDERS)("refuses %s on every permission", async (_who, setup) => {
    setup();
    for (const p of ["billing.read", "billing.write", "support"] as const) {
      await expect(adminAuth.requireOpsPermission(event, p)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(directusCalls).toBe(0);
  });

  it("matches nobody as Platform Support while the role id is unset", async () => {
    vi.stubGlobal("useRuntimeConfig", () => ({ public: { directusRoleAppAdmin: ROLE.appAdmin, directusRolePlatformSupport: "" } }));
    as("");
    await expect(adminAuth.requireOpsPermission(event, "billing.read")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("/api/ops read routes", () => {
  const all = Object.entries(routes);

  it.each(all)("%s refuses every outsider before Directus or Stripe is called", async (_name, route) => {
    h.params = { id: "harbor" };
    for (const [who, setup] of OUTSIDERS) {
      setup();
      await expect(route(event), who).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(directusCalls).toBe(0);
    expect(stripeCalls()).toBe(0);
  });

  it.each(all)("%s is open to Platform Support", async (_name, route) => {
    as(ROLE.support);
    h.params = { id: "harbor" };
    await expect(route(event)).resolves.toBeTruthy();
  });
});

// ── Overview ────────────────────────────────────────────────────────────────

describe("GET /api/ops/overview", () => {
  it("adds up MRR from our active subscriptions, by quantity, net of running discounts", async () => {
    const res = await routes.overview(event);
    // 24900 (one-off discount ignored) + 249000/12 × 50% + 9900 × 3
    expect(res.revenue).toMatchObject({
      mrrCents: 24900 + 10375 + 29700,
      arrCents: (24900 + 10375 + 29700) * 12,
      atRiskMrrCents: 49900,
      activeSubscriptions: 3,
      byStatus: { active: 3, past_due: 1, canceled: 1 },
    });
    expect(res.stripeMode).toBe("test");
  });

  it("buckets communities the way the app treats them", async () => {
    const res = await routes.overview(event);
    expect(res.communities).toEqual({
      total: 10,
      active: 4, // harbor, annual, and both agency communities through acc-1
      trial: 2,
      trial_ending: 1,
      past_due: 1,
      expired: 1, // the lapsed trial
      canceled: 1,
      free: 1,
      agency: 2,
    });
    expect(res.noUnits).toBe(1);
    expect(res.signups).toEqual({ last7: 2, last30: 3 });
  });

  it("counts only our failed payments, undelivered webhooks and discount codes", async () => {
    const res = await routes.overview(event);
    expect(res.failedPayments).toEqual({ events: 2, invoices: 1 });
    expect(res.webhooks).toMatchObject({ undelivered: 1, types: { "invoice.paid": 1 } });
    expect(res.discounts.redemptions).toBe(3);
    expect(res.discounts.codes.map((c: any) => c.code)).toEqual(["SPRING"]);
  });

  it("reads every page of a Stripe list", async () => {
    await routes.overview(event);
    // Six subscriptions at two a page.
    expect(h.stripe.subscriptions.list).toHaveBeenCalledTimes(3);
    expect(h.stripe.subscriptions.list.mock.calls[2][0]).toMatchObject({ status: "all", starting_after: "sub_pd" });
  });

  it("caches Stripe for 60 seconds", async () => {
    await routes.overview(event);
    const first = stripeCalls();
    await routes.overview(event);
    expect(stripeCalls()).toBe(first);
    vi.setSystemTime(new Date(NOW.getTime() + 61_000));
    await routes.overview(event);
    expect(stripeCalls()).toBe(first * 2);
  });

  it("still shows the communities when Stripe is down", async () => {
    h.stripe.subscriptions.list = vi.fn(async () => {
      throw new Error("stripe down");
    });
    const res = await routes.overview(event);
    expect(res.revenue).toBeNull();
    expect(res.communities.total).toBe(10);
    expect(res.warnings).toHaveLength(1);
  });
});

// ── Communities ─────────────────────────────────────────────────────────────

describe("GET /api/ops/communities", () => {
  it("filters on the quick filters", async () => {
    const names = async (filter: string) => {
      h.query = { filter };
      return (await routes.communities(event)).rows.map((r: any) => r.id);
    };
    expect(await names("trial_ending")).toEqual(["soon"]);
    expect(await names("past_due")).toEqual(["pastdue"]);
    expect(await names("no_units")).toEqual(["soon"]);
    expect(await names("free")).toEqual(["comp"]);
    expect((await names("agency")).sort()).toEqual(["agency1", "agency2"]);
  });

  it("searches name and slug, and pages on the server", async () => {
    h.query = { q: "trial" };
    expect((await routes.communities(event)).total).toBe(3);
    h.query = { pageSize: "4", page: "3" };
    const res = await routes.communities(event);
    expect(res).toMatchObject({ total: 10, pages: 3, page: 3 });
    expect(res.rows).toHaveLength(2);
  });

  it("gives each row its band, units, billing, value and primary contact", async () => {
    h.query = { q: "harbor" };
    const [row] = (await routes.communities(event)).rows;
    expect(row).toMatchObject({
      band: { slug: "boutique" },
      realUnits: 10,
      declaredUnits: 60,
      billedBy: "self",
      status: "active",
      monthlyValueCents: 24900,
      primaryContact: { name: "Alice Admin", email: "alice@harbor.test" },
    });
    h.query = { q: "agency one" };
    const [agency] = (await routes.communities(event)).rows;
    expect(agency).toMatchObject({ billedBy: "agency", billingAccount: { name: "Acme Management" }, monthlyValueCents: null });
  });
});

// ── One community ───────────────────────────────────────────────────────────

describe("GET /api/ops/communities/:id", () => {
  beforeEach(() => {
    h.params = { id: "harbor" };
  });

  it("names the customer contacts, with each one's role", async () => {
    const { people } = await routes.community(event);
    expect(people.hoaAdmins).toEqual([expect.objectContaining({ name: "Alice Admin", email: "alice@harbor.test" })]);
    expect(people.boardOfficers).toEqual([expect.objectContaining({ title: "president", name: "Oscar Officer" })]);
    expect(people.propertyManagers).toEqual([
      expect.objectContaining({ name: "Pat Manager", grants: ["inquiries", "communications"] }),
    ]);
    expect(people.billingAccountMembers).toEqual([]);
  });

  it("shows residents as counts only", async () => {
    const res = await routes.community(event);
    // Alice and Oscar and Rita own; Tom's unit link says tenant; Pat has no residency.
    expect(res.people.counts).toEqual({ members: 5, owners: 3, tenants: 1, unknownResidency: 1, units: 10, declaredUnits: 60 });
    const body = JSON.stringify(res);
    for (const resident of ["Rita", "rita@harbor.test", "Tom", "tom@harbor.test"]) expect(body).not.toContain(resident);
  });

  it("lists the billing account's members for an agency-billed community", async () => {
    h.params = { id: "agency1" };
    const res = await routes.community(event);
    expect(res.people.billingAccountMembers).toEqual([
      expect.objectContaining({ role: "billing_admin", name: "Bill Agent", email: "bill@acme.test" }),
    ]);
    expect(res.billing.source).toBe("billing_account");
    expect(res.billing.subscription).toMatchObject({ id: "sub_ag", quantity: 3, monthlyValueCents: 29700 });
  });

  it("reads billing live, and the band its units now fall into", async () => {
    const { billing, activity, links } = await routes.community(event);
    expect(billing.band).toEqual({ slug: "boutique", name: "Boutique" });
    expect(billing.bandForUnits).toMatchObject({ slug: "mid", units: 60 });
    expect(billing.subscription).toMatchObject({ id: "sub_a", status: "active", monthlyValueCents: 24900 });
    expect(billing.invoices).toHaveLength(1);
    expect(billing.charges.map((c: any) => c.id)).toEqual(["ch_sub"]);
    expect(activity.lastAdminSignInAt).toBe(iso(-1));
    expect(activity.aiWallet).toMatchObject({ balance_credits: 420 });
    expect(activity.audit).toHaveLength(20);
    expect(activity.audit[0].summary).toBe("entry 0");
    expect(JSON.stringify(activity.audit)).not.toContain("alice@harbor.test");
    expect(links.stripeCustomer).toBe("https://dashboard.stripe.com/test/customers/cus_sub_a");
    expect(links.directus).toBe("https://directus.test/admin/content/hoa_organizations/harbor");
  });

  it("answers 404 for a community that doesn't exist", async () => {
    h.params = { id: "nope" };
    await expect(routes.community(event)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── Billing accounts and payments ───────────────────────────────────────────

describe("GET /api/ops/billing-accounts", () => {
  it("compares the Stripe quantity with the communities attached", async () => {
    const { accounts } = await routes.billingAccounts(event);
    expect(accounts).toEqual([
      expect.objectContaining({
        name: "Acme Management",
        stripeQuantity: 3,
        attachedCount: 2,
        quantityMismatch: true,
        monthlyValueCents: 29700,
        members: [expect.objectContaining({ role: "billing_admin", email: "bill@acme.test" })],
      }),
    ]);
  });
});

describe("GET /api/ops/payments", () => {
  it("lists our platform charges newest first, with refunds and failures", async () => {
    const res = await routes.payments(event);
    expect(res.rows.map((r: any) => [r.id, r.status])).toEqual([
      ["ch_sub", "succeeded"],
      ["ch_ref", "partially_refunded"],
      ["ch_fail", "failed"],
    ]);
    expect(res.rows[0].community).toEqual({ id: "harbor", name: "Harbor Court" });
    expect(res.totals).toMatchObject({ count: 3, refundedCents: 10000, failed: 1 });
  });

  it("keeps resident dues under their own tab, without the resident's details", async () => {
    h.query = { kind: "dues" };
    const res = await routes.payments(event);
    expect(res.rows.map((r: any) => r.id)).toEqual(["ch_dues"]);
    expect(res.rows[0].community).toEqual({ id: "harbor", name: "Harbor Court" });
    expect(JSON.stringify(res)).not.toMatch(/Rita|rita@/);
  });
});

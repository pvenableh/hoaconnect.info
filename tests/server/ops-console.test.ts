/**
 * The operator console (docs/plan-operator-console.md, Phases 1 and 2).
 *
 * Guards: only App Admin and Platform Support get in, and everyone else is
 * refused before Directus or Stripe is asked anything. Routes: the real
 * handlers on a MemoryDirectus and a fake Stripe that pages two items at a time
 * and carries another Hue product's objects alongside ours.
 *
 * Actions: App Admin only. Platform Support and every outsider are refused
 * before Stripe or Directus is called; each action writes one `ops_audit_log`
 * row; and the fake Stripe keys writes on `idempotencyKey` the way Stripe does,
 * so a double submit can be shown to refund once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

const h = vi.hoisted(() => ({
  stripe: null as any,
  session: null as any,
  query: {} as any,
  params: {} as any,
  body: {} as any,
  rateAllowed: true,
  rateCalls: [] as unknown[][],
  /** Break ops_audit_log: reads fail, writes fail, or reads see nothing (another instance's row). */
  auditFault: null as null | "read" | "write" | "hide-reads",
}));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.mock("#core/server/utils/stripe", () => ({
  getStripe: () => h.stripe,
  isStripeLiveMode: () => false,
}));
// The real limiter keeps its buckets for the life of the process; here each test starts fresh.
vi.mock("#core/server/utils/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => {
    h.rateCalls.push(args);
    return h.rateAllowed;
  },
  clientIp: () => "127.0.0.1",
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
const actions = {
  refund: (await import("#core/server/api/ops/charges/[id]/refund.post")).default as Handler,
  cancel: (await import("#core/server/api/ops/communities/[id]/cancel.post")).default as Handler,
  resume: (await import("#core/server/api/ops/communities/[id]/resume.post")).default as Handler,
  trial: (await import("#core/server/api/ops/communities/[id]/trial.post")).default as Handler,
  comp: (await import("#core/server/api/ops/communities/[id]/comp.post")).default as Handler,
  portal: (await import("#core/server/api/ops/communities/[id]/portal.post")).default as Handler,
  codeCreate: (await import("#core/server/api/ops/codes.post")).default as Handler,
  codeDeactivate: (await import("#core/server/api/ops/codes/[id]/deactivate.post")).default as Handler,
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
  if (op.collection === "ops_audit_log" && h.auditFault) {
    if (h.auditFault === "read" && op.op === "readItems") throw new Error("Directus: no such collection");
    if (h.auditFault === "write" && op.op === "createItem") throw new Error("Directus: write failed");
    if (h.auditFault === "hide-reads" && op.op === "readItems") {
      h.auditFault = null; // the next read (after the unique clash) sees the other instance's row
      return [];
    }
  }
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
    // Copies, as Stripe sends: a cached page must not change when the fake's state does.
    const data = all.slice(from, from + 2).map((x) => ({ ...x }));
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
let COUPONS: any[];

function seed() {
  db = new MemoryDirectus({ ops_audit_log: ["idempotency_key"] });
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
    { id: "u-staff", first_name: "Sam", last_name: "Staff", email: "sam@hoaconnect.test" },
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

  COUPONS = [];
  // Writes: the same idempotencyKey gets the first answer back, as Stripe does.
  const answered = new Map<string, any>();
  let seq = 0;
  const keyed = (write: (...args: any[]) => any) =>
    vi.fn(async (...args: any[]) => {
      const key = args.at(-1)?.idempotencyKey;
      if (key && answered.has(key)) return answered.get(key);
      const out = await write(...args);
      if (key) answered.set(key, out);
      return out;
    });
  const find = (list: () => any[], kind: string) => async (id: string) => {
    const found = list().find((x) => x.id === id);
    if (!found) throw stripeError("resource_missing", `No such ${kind}: '${id}'`);
    return { ...found };
  };
  const sub = (id: string) => {
    const s = SUBS.find((x) => x.id === id);
    if (!s) throw stripeError("resource_missing", `No such subscription: '${id}'`);
    return s;
  };

  h.stripe = {
    subscriptions: {
      list: pager(() => SUBS),
      retrieve: vi.fn(find(() => SUBS, "subscription")),
      update: keyed((id: string, params: any) => Object.assign(sub(id), params)),
      cancel: keyed((id: string) => Object.assign(sub(id), { status: "canceled", cancel_at_period_end: false })),
    },
    refunds: {
      create: keyed(async (params: any) => {
        const ch = CHARGES.find((c) => c.id === params.charge)!;
        if (params.amount > ch.amount - ch.amount_refunded) throw stripeError("amount_too_large", "Refund amount is greater than unrefunded amount");
        ch.amount_refunded += params.amount;
        ch.refunded = ch.amount_refunded === ch.amount;
        return { id: `re_${++seq}`, object: "refund", status: "succeeded", amount: params.amount, charge: ch.id, metadata: params.metadata };
      }),
    },
    coupons: {
      create: keyed((params: any) => {
        const coupon = { id: `co_${++seq}`, object: "coupon", valid: true, ...params };
        COUPONS.push(coupon);
        return coupon;
      }),
      del: vi.fn(async (id: string) => ({ id, deleted: true })),
    },
    billingPortal: {
      sessions: {
        create: keyed((params: any) => ({ id: `bps_${++seq}`, url: `https://billing.stripe.test/p/session_${seq}`, customer: params.customer })),
      },
    },
    events: {
      list: pager(
        () => EVENTS,
        (e, p) => (!p.type || e.type === p.type) && (p.delivery_success !== false || e.pending_webhooks > 0)
      ),
    },
    charges: {
      list: pager(() => CHARGES, (c, p) => !p.customer || c.customer === p.customer),
      retrieve: vi.fn(find(() => CHARGES, "charge")),
    },
    invoices: { list: vi.fn(async () => ({ data: [{ id: "in_a", number: "A-1", created: unix(-1), total: 24900, amount_paid: 24900, currency: "usd", status: "paid", hosted_invoice_url: "https://invoice.test/a" }], has_more: false })) },
    promotionCodes: {
      list: pager(
        () => PROMOS,
        (x, p) => (!p.code || x.code.toLowerCase() === String(p.code).toLowerCase()) && (p.active === undefined || x.active === p.active)
      ),
      retrieve: vi.fn(find(() => PROMOS, "promotion code")),
      create: keyed((params: any) => {
        const coupon = COUPONS.find((c) => c.id === params.coupon);
        const promo = { id: `promo_${++seq}`, object: "promotion_code", active: true, times_redeemed: 0, max_redemptions: null, ...params, coupon };
        PROMOS.push(promo);
        return promo;
      }),
      update: keyed((id: string, params: any) => Object.assign(PROMOS.find((x) => x.id === id)!, params)),
    },
  };
}

/** Every call to the fake Stripe, at any depth (billingPortal.sessions.create too). */
const stripeCalls = (api: any = h.stripe): number =>
  Object.values(api).reduce((n: number, v: any) => n + (v?.mock ? v.mock.calls.length : v && typeof v === "object" ? stripeCalls(v) : 0), 0);

/** Stripe's write calls only. */
const stripeWrites = () =>
  [
    h.stripe.refunds.create,
    h.stripe.subscriptions.update,
    h.stripe.subscriptions.cancel,
    h.stripe.coupons.create,
    h.stripe.promotionCodes.create,
    h.stripe.promotionCodes.update,
    h.stripe.billingPortal.sessions.create,
  ].reduce((n, fn) => n + fn.mock.calls.length, 0);

function stripeError(code: string, message: string) {
  return Object.assign(new Error(message), { type: "StripeInvalidRequestError", code, raw: { code, message } });
}

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
  h.body = {};
  h.rateAllowed = true;
  h.rateCalls = [];
  h.auditFault = null;
  as(ROLE.appAdmin);

  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("getRouterParam", (_e: unknown, k: string) => h.params[k]);
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: {
      directus: { url: "https://directus.test" },
      appUrl: "https://app.test/",
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
    expect(res.rows.map((r: any) => r.refundable)).toEqual([true, true, false]);
  });

  it("keeps resident dues under their own tab, without the resident's details", async () => {
    h.query = { kind: "dues" };
    const res = await routes.payments(event);
    expect(res.rows.map((r: any) => r.id)).toEqual(["ch_dues"]);
    expect(res.rows[0].refundable).toBe(false);
    expect(res.rows[0].community).toEqual({ id: "harbor", name: "Harbor Court" });
    expect(JSON.stringify(res)).not.toMatch(/Rita|rita@/);
  });
});

// ── Actions (Phase 2) ───────────────────────────────────────────────────────

let reqSeq = 0;
/** What the dialog sends: a reason, a confirmation and its own request id. */
const submit = (extra: Record<string, unknown> = {}) => ({
  reason: "TEST: customer asked",
  requestId: `req-test-${++reqSeq}`,
  confirmed: true,
  ...extra,
});
const auditRows = () => db.table("ops_audit_log");
const call = (route: Handler, params: Record<string, string>, body: Record<string, unknown>) => {
  h.params = params;
  h.body = body;
  return route(event);
};
const LIVE_MISSING = "No such subscription: 'sub_a'; a similar object exists in live mode, but a test mode key was used to make this request.";

/** One valid call per action, with whatever state makes it do something. */
const ACTION_CALLS: Array<[string, Handler, Record<string, string>, () => Record<string, unknown>, (() => void)?]> = [
  ["refund", actions.refund, { id: "ch_sub" }, () => submit()],
  ["cancel now", actions.cancel, { id: "harbor" }, () => submit({ when: "now" })],
  ["cancel at period end", actions.cancel, { id: "harbor" }, () => submit({ when: "period_end" })],
  ["resume", actions.resume, { id: "harbor" }, () => submit(), () => (SUBS[0].cancel_at_period_end = true)],
  ["extend trial", actions.trial, { id: "soon" }, () => submit({ trialEndsOn: "2026-11-20" })],
  ["mark free", actions.comp, { id: "gone" }, () => submit({ free: true })],
  ["open the portal", actions.portal, { id: "harbor" }, () => submit()],
  ["create a code", actions.codeCreate, {}, () => submit({ code: "FALL25", percentOff: 25, duration: "once" })],
  ["deactivate a code", actions.codeDeactivate, { id: "promo_spring" }, () => submit()],
];

/** Platform Support may read the console but never move money. */
const REFUSED: Array<[string, () => void]> = [["Platform Support", () => as(ROLE.support)], ...OUTSIDERS];

describe("/api/ops actions: who may act", () => {
  it.each(ACTION_CALLS)(
    "%s refuses Platform Support and every outsider before Stripe or Directus is called",
    async (_name, route, params, body) => {
      for (const [who, setup] of REFUSED) {
        setup();
        await expect(call(route, params, body()), who).rejects.toMatchObject({ statusCode: 403 });
      }
      expect(stripeCalls()).toBe(0);
      expect(directusCalls).toBe(0);
      expect(h.rateCalls).toEqual([]);
      expect(auditRows()).toEqual([]);
    }
  );

  it.each(ACTION_CALLS)("%s runs for the App Admin and writes its audit row", async (_name, route, params, body, prep) => {
    prep?.();
    const res = await call(route, params, body());
    expect(res).toMatchObject({ ok: true, replayed: false, unchanged: false, audited: true });
    expect(auditRows()).toHaveLength(1);
    expect(auditRows()[0]).toMatchObject({
      id: res.auditId,
      action: res.action,
      actor_user: "u-staff",
      actor_role: "app_admin",
      actor_name: "Sam Staff",
      actor_email: "sam@hoaconnect.test",
      reason: "TEST: customer asked",
      stripe_mode: "test",
      schema_version: 1,
      idempotency_key: expect.stringMatching(/^ops:/),
    });
    expect(auditRows()[0].summary).toEqual(expect.any(String));
  });

  it("checks the rate limit after the guard, per staff member", async () => {
    h.rateAllowed = false;
    await expect(call(actions.refund, { id: "ch_sub" }, submit())).rejects.toMatchObject({ statusCode: 429 });
    expect(h.rateCalls).toEqual([["ops-write:u-staff", 20, 600_000]]);
    expect(stripeCalls()).toBe(0);
  });

  it("needs a confirmation, a reason and a request id before Stripe is called", async () => {
    const { requestId: _dropped, ...noRequestId } = submit();
    for (const body of [submit({ confirmed: false }), submit({ reason: " ok " }), submit({ reason: undefined }), noRequestId]) {
      await expect(call(actions.refund, { id: "ch_sub" }, body)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(stripeCalls()).toBe(0);
    expect(auditRows()).toEqual([]);
  });

  it("runs nothing when the audit log can't be read", async () => {
    h.auditFault = "read";
    await expect(call(actions.refund, { id: "ch_sub" }, submit())).rejects.toMatchObject({ statusCode: 503 });
    expect(stripeWrites()).toBe(0);
  });

  it("says the action landed and the row didn't when only the audit write fails", async () => {
    h.auditFault = "write";
    const res = await call(actions.refund, { id: "ch_sub" }, submit());
    expect(res).toMatchObject({ ok: true, audited: false, auditId: null, result: { amountCents: 24900 } });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("AUDIT ROW NOT WRITTEN"),
      expect.stringContaining('"refund":"re_'),
      expect.anything()
    );
  });
});

describe("POST /api/ops/charges/:id/refund", () => {
  beforeEach(() => {
    // The annual plan's charge: $2,490, over the typed-amount line.
    CHARGES.push({ id: "ch_big", object: "charge", created: unix(-1), amount: 249000, amount_refunded: 0, refunded: false, currency: "usd", status: "succeeded", customer: "cus_sub_y", metadata: {}, payment_intent: "pi_big" });
  });
  const charge = (id: string) => CHARGES.find((c) => c.id === id)!;

  it("refunds what's left by default, tagged and keyed, and logs it", async () => {
    const body = submit();
    const res = await call(actions.refund, { id: "ch_sub" }, body);
    const key = `ops:refund:ch_sub:${body.requestId}`;
    expect(h.stripe.refunds.create).toHaveBeenCalledWith(
      { charge: "ch_sub", amount: 24900, metadata: expect.objectContaining({ app: "hoaconnect", ops_actor: "u-staff", ops_reason: "TEST: customer asked" }) },
      { idempotencyKey: key }
    );
    expect(res.result).toMatchObject({ amountCents: 24900, status: "succeeded" });
    expect(auditRows()[0]).toMatchObject({
      action: "refund",
      organization: "harbor",
      organization_name: "Harbor Court",
      amount_cents: 24900,
      currency: "usd",
      stripe_ids: { charge: "ch_sub", refund: res.result.refundId, customer: "cus_sub_a", payment_intent: "pi_sub" },
      before: { amount_refunded: 0 },
      after: { amount_refunded: 24900, refund_status: "succeeded" },
      idempotency_key: key,
    });
  });

  it("refunds part, each submit its own refund, never more than is left", async () => {
    await expect(call(actions.refund, { id: "ch_ref" }, submit({ amountCents: 39901 }))).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("$399.00"),
    });
    await call(actions.refund, { id: "ch_ref" }, submit({ amountCents: 10000 }));
    await call(actions.refund, { id: "ch_ref" }, submit({ amountCents: 10000 }));
    expect(charge("ch_ref").amount_refunded).toBe(30000);
    expect(auditRows().map((r) => r.after.amount_refunded)).toEqual([20000, 30000]);
  });

  it("above $500 needs the amount typed, and the server checks it", async () => {
    for (const typedAmount of [undefined, "2,490.01", "249000", "$2.490", ""]) {
      await expect(call(actions.refund, { id: "ch_big" }, submit({ typedAmount })), String(typedAmount)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(h.stripe.refunds.create).not.toHaveBeenCalled();
    await call(actions.refund, { id: "ch_big" }, submit({ typedAmount: "$2,490.00" }));
    expect(charge("ch_big").refunded).toBe(true);
  });

  it("doesn't ask for the typed amount at $500 exactly", async () => {
    await call(actions.refund, { id: "ch_big" }, submit({ amountCents: 50000 }));
    expect(charge("ch_big").amount_refunded).toBe(50000);
  });

  it("refuses dues, other products' charges, failed charges and unknown ones", async () => {
    await expect(call(actions.refund, { id: "ch_dues" }, submit())).rejects.toMatchObject({ statusCode: 409 });
    await expect(call(actions.refund, { id: "ch_other" }, submit())).rejects.toMatchObject({ statusCode: 404 });
    await expect(call(actions.refund, { id: "ch_fail" }, submit())).rejects.toMatchObject({ statusCode: 409 });
    await expect(call(actions.refund, { id: "ch_nope" }, submit())).rejects.toMatchObject({ statusCode: 404 });
    await expect(call(actions.refund, { id: "../evil" }, submit())).rejects.toMatchObject({ statusCode: 400 });
    expect(h.stripe.refunds.create).not.toHaveBeenCalled();
    expect(auditRows()).toEqual([]);
  });

  it("a double submit refunds once", async () => {
    const body = submit();
    const [a, b] = await Promise.all([call(actions.refund, { id: "ch_sub" }, body), call(actions.refund, { id: "ch_sub" }, body)]);
    const again = await call(actions.refund, { id: "ch_sub" }, body);
    expect(h.stripe.refunds.create).toHaveBeenCalledTimes(1);
    expect(charge("ch_sub").amount_refunded).toBe(24900);
    expect(auditRows()).toHaveLength(1);
    expect([a.replayed, b.replayed, again.replayed]).toEqual([false, true, true]);
    expect(again.auditId).toBe(a.auditId);
  });

  it("two instances racing reach Stripe with one key, and the log keeps one row", async () => {
    const body = submit();
    const unrefunded = { ...charge("ch_sub") };
    await call(actions.refund, { id: "ch_sub" }, body);
    // The other instance read the charge before the first refund landed, and doesn't see the first row yet.
    h.stripe.charges.retrieve.mockResolvedValueOnce(unrefunded);
    h.auditFault = "hide-reads";
    const res = await call(actions.refund, { id: "ch_sub" }, body);
    expect(h.stripe.refunds.create).toHaveBeenCalledTimes(2);
    expect(new Set(h.stripe.refunds.create.mock.calls.map((c: any[]) => c[1].idempotencyKey)).size).toBe(1);
    expect(charge("ch_sub").amount_refunded).toBe(24900);
    expect(auditRows()).toHaveLength(1);
    expect(res).toMatchObject({ replayed: true, auditId: auditRows()[0].id });
  });

  it("shows the refund on the community page and the payments feed straight away", async () => {
    h.params = { id: "harbor" };
    expect((await routes.community(event)).billing.charges[0]).toMatchObject({ id: "ch_sub", amountRefunded: 0, refundable: true });
    expect((await routes.payments(event)).rows.find((r: any) => r.id === "ch_sub")).toMatchObject({ status: "succeeded" });
    await call(actions.refund, { id: "ch_sub" }, submit());
    h.params = { id: "harbor" };
    expect((await routes.community(event)).billing.charges[0]).toMatchObject({ amountRefunded: 24900, refunded: true, refundable: false });
    expect((await routes.payments(event)).rows.find((r: any) => r.id === "ch_sub")).toMatchObject({ status: "refunded", refundable: false });
  });
});

describe("POST /api/ops/communities/:id/cancel and /resume", () => {
  const subA = () => SUBS.find((s) => s.id === "sub_a")!;

  it("sets the subscription to cancel at period end, then resumes it, each logged", async () => {
    const first = submit({ when: "period_end" });
    await call(actions.cancel, { id: "harbor" }, first);
    expect(h.stripe.subscriptions.update).toHaveBeenCalledWith("sub_a", { cancel_at_period_end: true }, { idempotencyKey: `ops:cancel_at_period_end:harbor:${first.requestId}` });
    const second = submit();
    await call(actions.resume, { id: "harbor" }, second);
    expect(h.stripe.subscriptions.update).toHaveBeenLastCalledWith("sub_a", { cancel_at_period_end: false }, { idempotencyKey: `ops:resume:harbor:${second.requestId}` });
    expect(auditRows().map((r) => [r.action, r.before.cancel_at_period_end, r.after.cancel_at_period_end])).toEqual([
      ["cancel_at_period_end", false, true],
      ["resume", true, false],
    ]);
    expect(auditRows()[0]).toMatchObject({ organization: "harbor", billing_account: null, stripe_ids: { subscription: "sub_a", customer: "cus_sub_a" } });
  });

  it("shows the new state straight away, not the cached one", async () => {
    h.params = { id: "harbor" };
    expect((await routes.community(event)).billing.subscription.cancelAtPeriodEnd).toBe(false);
    await call(actions.cancel, { id: "harbor" }, submit({ when: "period_end" }));
    h.params = { id: "harbor" };
    expect((await routes.community(event)).billing.subscription.cancelAtPeriodEnd).toBe(true);
  });

  it("cancels now once; doing it again changes nothing and logs nothing", async () => {
    await call(actions.cancel, { id: "harbor" }, submit({ when: "now" }));
    expect(subA().status).toBe("canceled");
    expect(await call(actions.cancel, { id: "harbor" }, submit({ when: "now" }))).toMatchObject({ unchanged: true, auditId: null });
    expect(h.stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(auditRows()).toHaveLength(1);
    await expect(call(actions.resume, { id: "harbor" }, submit())).rejects.toMatchObject({ statusCode: 409 });
    await expect(call(actions.cancel, { id: "harbor" }, submit({ when: "period_end" }))).rejects.toMatchObject({ statusCode: 409 });
  });

  it("resuming one that isn't set to cancel changes nothing", async () => {
    expect(await call(actions.resume, { id: "harbor" }, submit())).toMatchObject({ unchanged: true });
    expect(stripeWrites()).toBe(0);
    expect(auditRows()).toEqual([]);
  });

  it("acts on the billing account's subscription for an agency-billed community", async () => {
    await call(actions.cancel, { id: "agency1" }, submit({ when: "period_end" }));
    expect(h.stripe.subscriptions.update).toHaveBeenCalledWith("sub_ag", { cancel_at_period_end: true }, expect.anything());
    expect(auditRows()[0]).toMatchObject({ organization: "agency1", billing_account: "acc-1", summary: expect.stringContaining("Acme Management") });
  });

  it("answers 409 without a subscription and 404 without a community", async () => {
    await expect(call(actions.cancel, { id: "soon" }, submit({ when: "now" }))).rejects.toMatchObject({ statusCode: 409 });
    await expect(call(actions.cancel, { id: "nope" }, submit({ when: "now" }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(call(actions.cancel, { id: "harbor" }, submit({ when: "tomorrow" }))).rejects.toMatchObject({ statusCode: 400 });
    expect(stripeWrites()).toBe(0);
  });
});

describe("POST /api/ops/communities/:id/trial", () => {
  const org = (id: string) => db.one("hoa_organizations", id)!;

  it("moves the trial's end in Directus and logs before and after", async () => {
    await call(actions.trial, { id: "soon" }, submit({ trialEndsOn: "2026-11-30" }));
    expect(org("soon")).toMatchObject({ subscription_status: "trial", trial_ends_at: "2026-11-30T23:59:59.000Z" });
    expect(auditRows()[0]).toMatchObject({
      action: "extend_trial",
      organization: "soon",
      before: { subscription_status: "trial", trial_ends_at: iso(2) },
      after: { subscription_status: "trial", trial_ends_at: "2026-11-30T23:59:59.000Z" },
    });
    expect(stripeCalls()).toBe(0);
  });

  it("moves a trial Stripe is running too", async () => {
    SUBS.push(subscription("sub_tr", "trialing", 24900, { trial_end: unix(10) }));
    Object.assign(org("later"), { stripe_subscription_id: "sub_tr", stripe_customer_id: "cus_sub_tr" });
    const body = submit({ trialEndsOn: "2026-12-15" });
    await call(actions.trial, { id: "later" }, body);
    expect(h.stripe.subscriptions.update).toHaveBeenCalledWith(
      "sub_tr",
      { trial_end: Date.UTC(2026, 11, 15, 23, 59, 59) / 1000, proration_behavior: "none" },
      { idempotencyKey: `ops:extend_trial:later:${body.requestId}` }
    );
    expect(auditRows()[0].stripe_ids).toMatchObject({ subscription: "sub_tr" });
  });

  it("gives a canceled community a new trial", async () => {
    await call(actions.trial, { id: "gone" }, submit({ trialEndsOn: "2026-11-20" }));
    expect(org("gone")).toMatchObject({ subscription_status: "trial", trial_ends_at: "2026-11-20T23:59:59.000Z" });
  });

  it("refuses an earlier or past date, one past 90 days, a paying community and an agency-billed one", async () => {
    for (const [id, trialEndsOn, statusCode] of [
      ["soon", "2026-11-10", 400], // the trial already runs to the 11th
      ["soon", "2026-11-08", 400],
      ["soon", "2027-03-01", 400],
      ["soon", "next week", 400],
      ["harbor", "2026-11-20", 409],
      ["pastdue", "2026-11-20", 409],
      ["agency1", "2026-11-20", 409],
    ] as const) {
      await expect(call(actions.trial, { id }, submit({ trialEndsOn })), `${id} ${trialEndsOn}`).rejects.toMatchObject({ statusCode });
    }
    expect(auditRows()).toEqual([]);
    expect(org("soon").trial_ends_at).toBe(iso(2));
  });
});

describe("POST /api/ops/communities/:id/comp", () => {
  const org = (id: string) => db.one("hoa_organizations", id)!;

  it("marks a community free and back, each once", async () => {
    await call(actions.comp, { id: "gone" }, submit({ free: true }));
    expect(org("gone").is_free_account).toBe(true);
    expect(await call(actions.comp, { id: "gone" }, submit({ free: true }))).toMatchObject({ unchanged: true });
    await call(actions.comp, { id: "gone" }, submit({ free: false }));
    expect(org("gone").is_free_account).toBe(false);
    expect(auditRows().map((r) => [r.action, r.before.is_free_account, r.after.is_free_account])).toEqual([
      ["comp_on", false, true],
      ["comp_off", true, false],
    ]);
    expect(stripeCalls()).toBe(0);
  });

  it("says when a free community is still being billed, asking Stripe rather than Directus", async () => {
    expect((await call(actions.comp, { id: "harbor" }, submit({ free: true }))).result).toEqual({ free: true, stillBilled: true });
    // Directus says active, but Stripe has canceled it.
    SUBS.find((s) => s.id === "sub_y")!.status = "canceled";
    expect((await call(actions.comp, { id: "annual" }, submit({ free: true }))).result).toEqual({ free: true, stillBilled: false });
    // Stripe can't be read: unknown, and the comp still goes through.
    h.stripe.subscriptions.retrieve.mockRejectedValueOnce(stripeError("resource_missing", LIVE_MISSING));
    expect((await call(actions.comp, { id: "pastdue" }, submit({ free: true }))).result).toEqual({ free: true, stillBilled: null });
    expect(db.one("hoa_organizations", "pastdue")!.is_free_account).toBe(true);
  });

  it("leaves an agency-billed community to its billing account", async () => {
    await expect(call(actions.comp, { id: "agency1" }, submit({ free: true }))).rejects.toMatchObject({ statusCode: 409 });
    expect(org("agency1").is_free_account).toBe(false);
  });
});

describe("POST /api/ops/codes and /codes/:id/deactivate", () => {
  it("creates a tagged coupon and code, logs it, and shows it on the overview straight away", async () => {
    expect((await routes.overview(event)).discounts.codes.map((c: any) => c.code)).toEqual(["SPRING"]);
    const body = submit({ code: "fall25", percentOff: 25, duration: "repeating", durationInMonths: 3, maxRedemptions: 10, expiresOn: "2026-12-31" });
    const res = await call(actions.codeCreate, {}, body);
    expect(h.stripe.coupons.create).toHaveBeenCalledWith(
      { name: "FALL25", duration: "repeating", percent_off: 25, duration_in_months: 3, metadata: expect.objectContaining({ app: "hoaconnect", source: "ops" }) },
      { idempotencyKey: `ops:code_create:new:${body.requestId}:coupon` }
    );
    expect(h.stripe.promotionCodes.create).toHaveBeenCalledWith(
      {
        coupon: expect.stringMatching(/^co_/),
        code: "FALL25",
        max_redemptions: 10,
        expires_at: Date.UTC(2026, 11, 31, 23, 59, 59) / 1000,
        metadata: expect.objectContaining({ app: "hoaconnect" }),
      },
      { idempotencyKey: `ops:code_create:new:${body.requestId}:promo` }
    );
    expect(res.result).toMatchObject({ code: "FALL25", label: expect.stringContaining("25%") });
    expect(auditRows()[0]).toMatchObject({
      action: "code_create",
      stripe_ids: { promotion_code: res.result.id, coupon: expect.stringMatching(/^co_/) },
      after: expect.objectContaining({ code: "FALL25", percent_off: 25, duration_in_months: 3 }),
    });
    expect((await routes.overview(event)).discounts.codes.map((c: any) => c.code)).toEqual(["SPRING", "FALL25"]);
  });

  it("refuses a code already active on the account, Hue's included, before creating anything", async () => {
    for (const code of ["SPRING", "hue"]) {
      await expect(call(actions.codeCreate, {}, submit({ code, percentOff: 10, duration: "once" })), code).rejects.toMatchObject({ statusCode: 409 });
    }
    expect(h.stripe.coupons.create).not.toHaveBeenCalled();
  });

  it("refuses terms that don't add up", async () => {
    for (const extra of [
      { code: "X", percentOff: 10, duration: "once" },
      { code: "BOTH", percentOff: 10, amountOffCents: 500, duration: "once" },
      { code: "NEITHER", duration: "once" },
      { code: "REPEAT", percentOff: 10, duration: "repeating" },
      { code: "TOOMUCH", percentOff: 120, duration: "once" },
    ]) {
      await expect(call(actions.codeCreate, {}, submit(extra)), extra.code).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(stripeCalls()).toBe(0);
  });

  it("removes the coupon again when the code can't be created", async () => {
    h.stripe.promotionCodes.create.mockRejectedValueOnce(stripeError("parameter_invalid", "Code is invalid"));
    await expect(call(actions.codeCreate, {}, submit({ code: "OOPS1", percentOff: 10, duration: "once" }))).rejects.toMatchObject({ statusCode: 502 });
    expect(h.stripe.coupons.del).toHaveBeenCalledWith(COUPONS[0].id);
    expect(auditRows()).toEqual([]);
  });

  it("deactivates our code once, and leaves Hue's alone", async () => {
    await call(actions.codeDeactivate, { id: "promo_spring" }, submit());
    expect(PROMOS[0].active).toBe(false);
    expect(await call(actions.codeDeactivate, { id: "promo_spring" }, submit())).toMatchObject({ unchanged: true });
    await expect(call(actions.codeDeactivate, { id: "promo_hue" }, submit())).rejects.toMatchObject({ statusCode: 404 });
    expect(h.stripe.promotionCodes.update).toHaveBeenCalledTimes(1);
    expect(auditRows()).toEqual([
      expect.objectContaining({ action: "code_deactivate", before: { active: true, times_redeemed: 3 }, after: { active: false } }),
    ]);
  });
});

describe("POST /api/ops/communities/:id/portal", () => {
  it("opens the paying customer's portal, back to this page, and logs the session but not the link", async () => {
    const body = submit();
    const res = await call(actions.portal, { id: "harbor" }, body);
    expect(h.stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      { customer: "cus_sub_a", return_url: "https://app.test/ops/communities/harbor" },
      { idempotencyKey: `ops:portal_open:harbor:${body.requestId}` }
    );
    expect(res.result.url).toMatch(/^https:\/\/billing\.stripe\.test\//);
    expect(auditRows()[0]).toMatchObject({ action: "portal_open", stripe_ids: { customer: "cus_sub_a", portal_session: expect.stringMatching(/^bps_/) } });
    expect(JSON.stringify(auditRows())).not.toContain(res.result.url);
  });

  it("uses the billing account's customer for an agency-billed community", async () => {
    await call(actions.portal, { id: "agency1" }, submit());
    expect(h.stripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_sub_ag" }), expect.anything());
    expect(auditRows()[0]).toMatchObject({ billing_account: "acc-1" });
  });

  it("answers 409 without a Stripe customer", async () => {
    await expect(call(actions.portal, { id: "soon" }, submit())).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("live-mode objects on a test-mode server", () => {
  it("keeps the rest of the billing card when one Stripe read fails, and says why", async () => {
    h.params = { id: "harbor" };
    h.stripe.subscriptions.retrieve.mockRejectedValueOnce(stripeError("resource_missing", LIVE_MISSING));
    const { billing } = await routes.community(event);
    expect(billing.subscription).toBeNull();
    expect(billing.invoices).toHaveLength(1);
    expect(billing.charges).toHaveLength(1);
    expect(billing.otherMode).toBe("live");
    expect(billing.error).toBe("This is a live-mode object; the server is in test mode.");
  });

  it("refuses an action on one, without writing to Stripe", async () => {
    h.stripe.subscriptions.retrieve.mockRejectedValueOnce(stripeError("resource_missing", LIVE_MISSING));
    await expect(call(actions.cancel, { id: "harbor" }, submit({ when: "now" }))).rejects.toMatchObject({
      statusCode: 409,
      message: "This is a live-mode object; the server is in test mode.",
    });
    expect(stripeWrites()).toBe(0);
    expect(auditRows()).toEqual([]);
  });
});

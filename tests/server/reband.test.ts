/**
 * Re-banding (launch-followups Session 3, Peter's calls 2026-11-10): up at the
 * next renewal with no proration, never down on its own, the board and HOA
 * Connect told, no second onboarding fee, Enterprise left to a person. The
 * daily run and the console's "Change band", on a MemoryDirectus and a fake
 * Stripe that answers a repeated idempotency key the way Stripe does.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

const h = vi.hoisted(() => ({
  stripe: null as any,
  session: null as any,
  body: {} as any,
  params: {} as any,
  query: {} as any,
  notifyUsers: vi.fn(),
  notifyPlatform: vi.fn(),
  openAuto: vi.fn(),
}));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.mock("#core/server/utils/stripe", () => ({ getStripe: () => h.stripe, isStripeLiveMode: () => false }));
vi.mock("#core/server/utils/rate-limit", () => ({ rateLimit: () => true, clientIp: () => "127.0.0.1" }));
vi.mock("#core/server/utils/notify", () => ({ notifyUsers: h.notifyUsers }));
vi.mock("#core/server/utils/platform-notify", () => ({ notifyPlatform: h.notifyPlatform }));
vi.mock("#core/server/utils/support", () => ({ openAutoSupportRequest: h.openAuto }));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const { planReband, bandSlugFromLookupKey } = await import("#core/shared/billing/reband");
const reband = await import("#core/server/utils/reband");
const band = await import("#core/server/utils/subscription-band");
const opsData = await import("#core/server/utils/ops-data");
const action = (await import("#core/server/api/ops/communities/[id]/reband.post")).default as (e: H3Event) => Promise<any>;

const event = {} as H3Event;
const ROLE = { appAdmin: "role-app", support: "role-support", hoaAdmin: "role-admin", member: "role-member" };
const BANDS = [
  { id: "plan-boutique", slug: "boutique", name: "Boutique", min_units: 1, max_units: 49, price_monthly: 249, price_yearly: 2490, is_contact_only: false },
  { id: "plan-mid", slug: "mid", name: "Mid", min_units: 50, max_units: 149, price_monthly: 499, price_yearly: 4990, is_contact_only: false },
  { id: "plan-large", slug: "large", name: "Large", min_units: 150, max_units: 299, price_monthly: 999, price_yearly: 9990, is_contact_only: false },
  { id: "plan-enterprise", slug: "enterprise", name: "Enterprise", min_units: 300, max_units: null, price_monthly: null, is_contact_only: true },
];

let db: MemoryDirectus;
let SUBS: any[];
const NOW_S = Math.floor(new Date("2026-11-10T12:00:00Z").getTime() / 1000);

const directusRequest = async (op: any) => {
  if (op.op === "aggregate") {
    const q = op.options.query ?? op.options;
    return [{ count: db.all(op.collection, q?.filter).length }];
  }
  if (op.op === "readUsers") return db.all("directus_users", op.query.filter);
  if (op.op === "readItem") {
    const r = db.one(op.collection, op.id);
    if (!r) throw Object.assign(new Error("forbidden"), { response: { status: 403 } });
    return { ...r };
  }
  return db.request(op);
};

const item = (id: string, lookup: string | null, interval = "month") => ({ id, quantity: 1, price: { id: `price_${lookup ?? id}`, lookup_key: lookup, recurring: { interval } } });
const sub = (id: string, slug: string, units: string, items: any[], over: Record<string, any> = {}) => ({
  id,
  status: "active",
  current_period_end: NOW_S + 20 * 86400,
  metadata: { app: "hoaconnect", band_slug: slug, units },
  items: { data: items },
  ...over,
});

function seed() {
  db = new MemoryDirectus({ ops_audit_log: ["idempotency_key"] });
  db.seed("subscription_plans", BANDS.map((b) => ({ ...b, status: "published", is_active: true })));
  const org = (id: string, plan: string, over: Record<string, any> = {}) => ({
    id,
    name: id[0]!.toUpperCase() + id.slice(1),
    slug: id,
    subscription_status: "active",
    subscription_plan: plan,
    stripe_subscription_id: `sub_${id}`,
    stripe_customer_id: `cus_${id}`,
    billing_account: null,
    is_free_account: false,
    is_demo: false,
    declared_units: 0,
    ...over,
  });
  db.seed("hoa_organizations", [
    org("grow", "plan-boutique"),
    org("same", "plan-mid"),
    org("drift", "plan-mid"),
    org("shrink", "plan-large"),
    org("big", "plan-large"),
    org("annual", "plan-boutique"),
    org("addons", "plan-boutique"),
    org("declared", "plan-boutique", { declared_units: 55 }),
    org("free", "plan-boutique", { is_free_account: true }),
    org("demo", "plan-boutique", { is_demo: true }),
    org("agency", "plan-boutique", { billing_account: "acc-1" }),
    org("trialing", "plan-boutique", { subscription_status: "trial" }),
  ]);
  const units: Record<string, number> = { grow: 60, same: 80, drift: 75, shrink: 120, big: 350, annual: 60, addons: 60, declared: 10, free: 200, demo: 200, agency: 200, trialing: 200 };
  db.seed("hoa_units", Object.entries(units).flatMap(([o, n]) => Array.from({ length: n }, () => ({ organization: o }))));
  db.seed("hoa_members", [{ id: "m1", user: "u-admin", organization: "grow", role: ROLE.hoaAdmin, status: "active" }]);
  db.seed("directus_users", [{ id: "u-staff", first_name: "Sam", last_name: "Staff", email: "sam@hoaconnect.test" }]);

  SUBS = [
    sub("sub_grow", "boutique", "40", [item("si_grow", "hoa_boutique_monthly")]),
    sub("sub_same", "mid", "80", [item("si_same", "hoa_mid_monthly")]),
    sub("sub_drift", "mid", "70", [item("si_drift", "hoa_mid_monthly")]),
    sub("sub_shrink", "large", "200", [item("si_shrink", "hoa_large_monthly")]),
    sub("sub_big", "large", "250", [item("si_big", "hoa_large_monthly")]),
    sub("sub_annual", "boutique", "40", [item("si_annual", "hoa_boutique_annual", "year")]),
    sub("sub_addons", "boutique", "40", [item("si_band", "hoa_boutique_monthly"), item("si_storage", null)]),
    sub("sub_declared", "boutique", "10", [item("si_decl", "hoa_boutique_monthly")]),
  ];
  const answered = new Map<string, any>();
  h.stripe = {
    subscriptions: {
      retrieve: vi.fn(async (id: string) => structuredClone(SUBS.find((s) => s.id === id))),
      update: vi.fn(async (id: string, params: any, opts?: any) => {
        if (opts?.idempotencyKey && answered.has(opts.idempotencyKey)) return answered.get(opts.idempotencyKey);
        const s = SUBS.find((x) => x.id === id)!;
        if (params.metadata) s.metadata = params.metadata;
        for (const it of params.items ?? []) {
          const target = s.items.data.find((d: any) => d.id === it.id);
          const lookup = it.price.replace(/^price_/, "");
          target.price = { id: it.price, lookup_key: lookup, recurring: target.price.recurring };
        }
        const out = structuredClone(s);
        if (opts?.idempotencyKey) answered.set(opts.idempotencyKey, out);
        return out;
      }),
    },
    prices: {
      list: vi.fn(async (p: any) => ({ data: (p.lookup_keys as string[]).filter((k) => !k.startsWith("hoa_enterprise")).map((k) => ({ id: `price_${k}`, lookup_key: k, active: true })) })),
    },
  };
}

const updatesFor = (subId: string) => h.stripe.subscriptions.update.mock.calls.filter((c: any[]) => c[0] === subId);
const as = (role: string | null, id = "u-staff") => {
  h.session = role === null ? null : { user: { id, role } };
};

beforeEach(() => {
  seed();
  for (const f of [h.notifyUsers, h.notifyPlatform, h.openAuto]) {
    f.mockReset();
    f.mockResolvedValue(true);
  }
  band._resetBandPriceCache();
  opsData._resetOpsCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
  as(ROLE.appAdmin);
  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getRouterParam", (_e: unknown, k: string) => h.params[k]);
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { appUrl: "https://app.test", directusRoleAppAdmin: ROLE.appAdmin, directusRolePlatformSupport: ROLE.support, directusRoleHoaAdmin: ROLE.hoaAdmin },
  }));
});

describe("planReband", () => {
  const plan = (units: number, currentSlug: string | null, metadataUnits: string | null = String(units)) => planReband({ units, currentSlug, metadataUnits, bands: BANDS });

  it("moves up when units outgrow the band", () => {
    expect(plan(60, "boutique")).toEqual({ kind: "up", from: "boutique", to: "mid", units: 60 });
    expect(plan(160, "boutique")).toEqual({ kind: "up", from: "boutique", to: "large", units: 160 });
  });

  it("never moves down on its own, but keeps the unit count current", () => {
    expect(plan(120, "large", "200")).toEqual({ kind: "units", units: 120 });
    expect(plan(120, "large")).toEqual({ kind: "none", reason: "lower_band_kept" });
  });

  it("does nothing when nothing changed", () => {
    expect(plan(80, "mid")).toEqual({ kind: "none", reason: "same_band" });
  });

  it("hands Enterprise to a person", () => {
    expect(plan(350, "large")).toEqual({ kind: "enterprise", from: "large", to: "enterprise", units: 350 });
  });

  it("reads a band price's lookup key, and nothing else", () => {
    expect(bandSlugFromLookupKey("hoa_mid_annual")).toEqual({ slug: "mid", interval: "annual" });
    expect(bandSlugFromLookupKey("hoa_mid_onboarding")).toBeNull();
    expect(bandSlugFromLookupKey(null)).toBeNull();
  });
});

describe("the daily run", () => {
  it("moves a community up at its next renewal, with no proration, and records it", async () => {
    const res = await reband.runRebanding({});
    expect(res.moved).toEqual(
      expect.arrayContaining([
        { orgId: "grow", from: "boutique", to: "mid" },
        { orgId: "annual", from: "boutique", to: "mid" },
        { orgId: "addons", from: "boutique", to: "mid" },
        { orgId: "declared", from: "boutique", to: "mid" },
      ])
    );
    expect(updatesFor("sub_grow")).toEqual([
      [
        "sub_grow",
        { items: [{ id: "si_grow", price: "price_hoa_mid_monthly" }], proration_behavior: "none", metadata: { app: "hoaconnect", band_slug: "mid", units: "60" } },
        { idempotencyKey: "reband:sub_grow:mid" },
      ],
    ]);
    expect(db.one("hoa_organizations", "grow")!.subscription_plan).toBe("plan-mid");
    expect(db.all("ops_audit_log", { organization: { _eq: "grow" } })).toEqual([
      expect.objectContaining({ action: "reband", actor_user: null, actor_role: "system", actor_name: "HOA Connect (automatic)", before: { band: "boutique" } }),
    ]);
  });

  it("tells the community's HOA Admins and HOA Connect first", async () => {
    await reband.runRebanding({});
    expect(h.notifyUsers).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "grow", recipientUserIds: ["u-admin"], category: "payment", subject: "Your HOA Connect plan changes at renewal: Mid" })
    );
    const msg = h.notifyUsers.mock.calls.find((c: any[]) => c[0].organizationId === "grow")![0].message;
    expect(msg).toContain("60 units");
    expect(msg).toContain("$499");
    expect(msg).toContain("no onboarding fee");
    expect(h.notifyPlatform).toHaveBeenCalledWith(expect.objectContaining({ subject: "Band change at renewal: Grow → Mid" }));
  });

  it("changes only the band item, keeps the interval, and counts declared units", async () => {
    await reband.runRebanding({});
    expect(updatesFor("sub_addons")[0]![1].items).toEqual([{ id: "si_band", price: "price_hoa_mid_monthly" }]);
    expect(updatesFor("sub_annual")[0]![1].items).toEqual([{ id: "si_annual", price: "price_hoa_mid_annual" }]);
    expect(updatesFor("sub_declared")[0]![1].metadata.units).toBe("55");
  });

  it("leaves a smaller community on its band, and keeps the unit count current", async () => {
    await reband.runRebanding({});
    expect(updatesFor("sub_shrink")).toEqual([["sub_shrink", { metadata: { app: "hoaconnect", band_slug: "large", units: "120" } }, { idempotencyKey: "reband-units:sub_shrink:120" }]]);
    expect(updatesFor("sub_drift")[0]![1]).toEqual({ metadata: { app: "hoaconnect", band_slug: "mid", units: "75" } });
    expect(updatesFor("sub_same")).toEqual([]);
  });

  it("opens one support entry for Enterprise and leaves Stripe alone", async () => {
    const res = await reband.runRebanding({});
    expect(res.enterprise).toBe(1);
    expect(h.openAuto).toHaveBeenCalledWith(expect.objectContaining({ autoKey: "enterprise:big", category: "billing", organizationId: "big" }));
    expect(updatesFor("sub_big")).toEqual([]);
  });

  it("skips free, demo, agency-billed and unpaid communities", async () => {
    await reband.runRebanding({});
    for (const id of ["free", "demo", "agency", "trialing"]) {
      expect(h.stripe.subscriptions.retrieve).not.toHaveBeenCalledWith(`sub_${id}`);
    }
  });

  it("changes nothing on a second run", async () => {
    await reband.runRebanding({});
    const writes = h.stripe.subscriptions.update.mock.calls.length;
    const notices = h.notifyUsers.mock.calls.length;
    const second = await reband.runRebanding({});
    expect(second).toMatchObject({ moved: [], unitsUpdated: 0 });
    expect(h.stripe.subscriptions.update.mock.calls.length).toBe(writes);
    expect(h.notifyUsers.mock.calls.length).toBe(notices);
  });

  it("writes nothing on a dry run", async () => {
    const res = await reband.runRebanding({ dry: true });
    expect(res.moved.length).toBe(4);
    expect(h.stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(h.openAuto).not.toHaveBeenCalled();
    expect(db.one("hoa_organizations", "grow")!.subscription_plan).toBe("plan-boutique");
  });
});

describe("POST /api/ops/communities/:id/reband", () => {
  const submit = (bandSlug: string) => ({ reason: "TEST: board asked", requestId: `req-${Math.random().toString(36).slice(2, 10)}`, confirmed: true, bandSlug });
  const call = (id: string, body: any) => {
    h.params = { id };
    h.body = body;
    return action(event);
  };

  it("moves a community down when the board asks, from the next renewal, and logs who", async () => {
    const body = submit("mid");
    const res = await call("shrink", body);
    expect(res).toMatchObject({ ok: true, unchanged: false, result: { band: "mid", from: "large" } });
    expect(updatesFor("sub_shrink")[0]![1]).toMatchObject({ items: [{ id: "si_shrink", price: "price_hoa_mid_monthly" }], proration_behavior: "none" });
    expect(updatesFor("sub_shrink")[0]![2]).toEqual({ idempotencyKey: `ops:reband:shrink:${body.requestId}` });
    expect(db.all("ops_audit_log")).toEqual([expect.objectContaining({ action: "reband", actor_user: "u-staff", actor_role: "app_admin", reason: "TEST: board asked" })]);
    expect(h.notifyUsers.mock.calls.length + h.notifyPlatform.mock.calls.length).toBeGreaterThan(0);
  });

  it("refuses Platform Support and outsiders before Stripe is called", async () => {
    for (const role of [ROLE.support, ROLE.hoaAdmin, ROLE.member]) {
      as(role);
      await expect(call("shrink", submit("mid"))).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(h.stripe.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(h.stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("refuses Enterprise, an agency-billed community and an unknown band; the same band changes nothing", async () => {
    await expect(call("shrink", submit("enterprise"))).rejects.toMatchObject({ statusCode: 409 });
    await expect(call("agency", submit("mid"))).rejects.toMatchObject({ statusCode: 409 });
    await expect(call("shrink", submit("huge"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(call("same", submit("mid"))).resolves.toMatchObject({ unchanged: true });
    expect(h.stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(db.all("ops_audit_log")).toEqual([]);
  });
});

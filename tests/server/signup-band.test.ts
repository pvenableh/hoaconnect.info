/**
 * Signup on band pricing: the board declares a unit count, the server picks the
 * band, the org starts in `trial`, and subscribe-band charges that band.
 *
 * The band resolver and the admin check are the real ones, running on a
 * MemoryDirectus; only Stripe and the Nitro auto-imports are stand-ins. A missing
 * `declared_units` field behaves as Directus 11 does: a 403, even to the admin token.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

const h = vi.hoisted(() => ({
  body: {} as any,
  session: null as any,
  fieldMissing: false,
  declaredReadFails: false,
  stripe: null as any,
  authRequest: (async () => ({})) as (op: any) => Promise<any>,
}));

vi.mock("@directus/sdk", async () => ({
  ...(await import("./support/email-queue-memory")).sdkDescriptors,
  readField: (collection: string, field: string) => ({ op: "readField", collection, field }),
  readRoles: (query: any) => ({ op: "readRoles", query }),
  createFolder: (data: any) => ({ op: "createFolder", data }),
  createUser: (data: any) => ({ op: "createUser", data }),
  login: (creds: any) => ({ op: "login", creds }),
  readMe: () => ({ op: "readMe" }),
  rest: () => ({}),
  staticToken: () => ({}),
  createDirectus: () => ({
    with() {
      return this;
    },
    request: (op: any) => h.authRequest(op),
  }),
}));
vi.mock("#core/server/utils/stripe", () => ({
  getStripe: () => h.stripe,
  isStripeLiveMode: () => false,
}));
vi.mock("#core/server/utils/sendgrid", () => ({ sendWelcomeEmail: vi.fn(async () => undefined) }));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const bandUtils = await import("#core/server/utils/subscription-band");
const adminAuth = await import("#core/server/utils/admin-auth");
type Handler = (event: H3Event) => Promise<any>;
const setupOrganization = (await import("#core/server/api/hoa/setup-organization.post")).default as Handler;
const subscribeBand = (await import("#core/server/api/stripe/subscribe-band.post")).default as Handler;

const event = {} as H3Event;
const ROLE_HOA_ADMIN = "role-hoa-admin";
const USER = "user-1";
const ORG = "org-1";

const BANDS = [
  { id: "plan-boutique", slug: "boutique", name: "Boutique", min_units: 1, max_units: 49, price_monthly: 249, price_yearly: 2490, onboarding_fee: 1500 },
  { id: "plan-mid", slug: "mid", name: "Mid", min_units: 50, max_units: 149, price_monthly: 499, price_yearly: 4990, onboarding_fee: 2500 },
  { id: "plan-enterprise", slug: "enterprise", name: "Enterprise", min_units: 150, max_units: null, price_monthly: null, is_contact_only: true },
].map((b) => ({ ...b, status: "published", is_active: true }));

const forbidden = () => Object.assign(new Error("forbidden"), { response: { status: 403 } });

let db: MemoryDirectus;
/** The org's stored customer at the moment Stripe was asked for the subscription. */
let customerOnOrgAtSubscribe: string | null | undefined;

const directusRequest = async (op: any) => {
  switch (op.op) {
    case "readField":
      if (h.fieldMissing) throw forbidden();
      return { field: op.field };
    case "aggregate":
      return [{ count: db.all(op.collection, op.options.query.filter).length }];
    case "readRoles":
      return db.all("directus_roles", op.query.filter);
    case "createFolder":
      return db.request({ op: "createItem", collection: "directus_folders", data: op.data });
    case "createUser":
      return db.request({ op: "createItem", collection: "directus_users", data: op.data });
    case "readItem":
      if (op.query?.fields?.includes("declared_units")) {
        if (h.fieldMissing) throw forbidden();
        if (h.declaredReadFails) throw new Error("directus is down");
      }
  }
  return db.request(op);
};

const signup = (over: Record<string, any> = {}) => {
  h.body = {
    organizationName: "Harbor Court",
    slug: "harbor-court",
    declaredUnits: 60,
    isLoggedIn: true,
    ...over,
  };
  return setupOrganization(event);
};

const subscribe = (over: Record<string, any> = {}) => {
  h.body = { organizationId: ORG, ...over };
  return subscribeBand(event);
};

const orgs = () => db.table("hoa_organizations");

/** An org whose signed-in user has the given role. */
const seedOrg = (org: Record<string, any> = {}, role = ROLE_HOA_ADMIN) => {
  db.seed("hoa_organizations", [{ id: ORG, name: "Harbor Court", subscription_status: "trial", ...org }]);
  db.seed("hoa_members", [{ user: USER, organization: ORG, role, status: "active" }]);
};
const seedUnits = (n: number) =>
  db.seed("hoa_units", Array.from({ length: n }, () => ({ organization: ORG })));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  db = new MemoryDirectus();
  db.seed("subscription_plans", BANDS);
  db.seed("directus_roles", [{ id: ROLE_HOA_ADMIN, name: "HOA Admin" }]);

  h.session = { user: { id: USER, email: "board@example.com", role: "role-member" } };
  h.fieldMissing = false;
  h.declaredReadFails = false;
  customerOnOrgAtSubscribe = undefined;
  bandUtils._resetBandPriceCache();

  h.stripe = {
    prices: {
      list: vi.fn(async ({ lookup_keys }: { lookup_keys: string[] }) => ({
        data: lookup_keys.map((k) => ({ id: `price_${k}`, lookup_key: k, active: true })),
      })),
    },
    customers: {
      create: vi.fn(async () => ({ id: "cus_new" })),
      retrieve: vi.fn(async (id: string) => ({ id })),
    },
    subscriptions: {
      create: vi.fn(async (params: any) => {
        customerOnOrgAtSubscribe = db.one("hoa_organizations", params.metadata.organization_id)?.stripe_customer_id;
        return {
          id: "sub_new",
          status: "incomplete",
          latest_invoice: { payment_intent: { client_secret: "pi_secret" } },
        };
      }),
    },
  };

  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("setUserSession", async (_e: unknown, s: unknown) => {
    h.session = s;
  });
  vi.stubGlobal("requireUserSession", async () => h.session);
  vi.stubGlobal("useRuntimeConfig", () => ({
    directus: { url: "http://directus.test" },
    public: { appUrl: "http://app.test", directusRoleAppAdmin: "role-app-admin", directusRoleHoaAdmin: ROLE_HOA_ADMIN },
  }));
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
  vi.stubGlobal("selectBandForUnits", bandUtils.selectBandForUnits);
  vi.stubGlobal("hasDeclaredUnitsField", bandUtils.hasDeclaredUnitsField);
  vi.stubGlobal("resolveBandForOrg", bandUtils.resolveBandForOrg);
  vi.stubGlobal("bandWithModePrices", bandUtils.bandWithModePrices);
  vi.stubGlobal("requireAdminAccess", adminAuth.requireAdminAccess);
});

describe("setup-organization", () => {
  it("ignores the status, Stripe ids and plan id the client sends", async () => {
    const res = await signup({
      subscriptionStatus: "active",
      stripeCustomerId: "cus_forged",
      stripeSubscriptionId: "sub_forged",
      subscriptionPlanId: "plan-boutique",
      trialEndsAt: "2099-01-01T00:00:00.000Z",
    });

    expect(res.organization.subscriptionStatus).toBe("trial");
    const [org] = orgs();
    expect(org).toMatchObject({ subscription_status: "trial", subscription_plan: "plan-mid" });
    expect(org!.stripe_customer_id).toBeUndefined();
    expect(org!.stripe_subscription_id).toBeUndefined();
    expect(org!.trial_ends_at).toBeUndefined();
  });

  it("picks the band from the declared count and stores that count", async () => {
    await signup({ declaredUnits: 12 });
    expect(orgs()[0]).toMatchObject({ subscription_plan: "plan-boutique", declared_units: 12 });
  });

  it("refuses a contact-only band and creates nothing", async () => {
    await expect(signup({ declaredUnits: 500 })).rejects.toMatchObject({ statusCode: 409 });
    expect(orgs()).toHaveLength(0);
    expect(db.table("hoa_members")).toHaveLength(0);
  });

  it.each([undefined, null, "", 0, -3, 2.5, "lots", 2_000_000])("refuses a declared count of %s", async (declaredUnits) => {
    await expect(signup({ declaredUnits })).rejects.toMatchObject({ statusCode: 400 });
    expect(orgs()).toHaveLength(0);
  });

  it("without the declared_units field, says which script to run and creates nothing", async () => {
    h.fieldMissing = true;
    await expect(signup()).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining("pnpm add:declared-units"),
    });
    expect(orgs()).toHaveLength(0);
  });

  it("a brand-new admin passes the charge route's admin check straight after signing up", async () => {
    h.session = null;
    h.authRequest = async (op) =>
      op.op === "login" ? { access_token: "tok", refresh_token: "ref", expires: 900 } : db.table("directus_users")[0];

    const res = await signup({
      isLoggedIn: false,
      email: "new@example.com",
      password: "pw",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    h.body = { organizationId: res.organization.id };
    const charged = await subscribeBand(event);

    expect(h.session.user.id).toBe(db.table("directus_users")[0]!.id);
    expect(charged).toMatchObject({ clientSecret: "pi_secret", band: { slug: "mid" } });
  });
});

describe("resolveBandForOrg", () => {
  it("uses the declared count when it beats the real one", async () => {
    seedOrg({ declared_units: 60 });
    seedUnits(5);
    await expect(bandUtils.resolveBandForOrg(ORG)).resolves.toMatchObject({ units: 60, band: { slug: "mid" } });
  });

  it("uses the real count when it beats the declared one", async () => {
    seedOrg({ declared_units: 10 });
    seedUnits(55);
    await expect(bandUtils.resolveBandForOrg(ORG)).resolves.toMatchObject({ units: 55, band: { slug: "mid" } });
  });

  it("falls back to the real count where the field doesn't exist yet", async () => {
    h.fieldMissing = true;
    seedOrg();
    seedUnits(55);
    await expect(bandUtils.resolveBandForOrg(ORG)).resolves.toMatchObject({ units: 55, band: { slug: "mid" } });
  });

  it("throws on any other Directus failure rather than quoting the smallest band", async () => {
    h.declaredReadFails = true;
    seedOrg({ declared_units: 60 });
    await expect(bandUtils.resolveBandForOrg(ORG)).rejects.toThrow("directus is down");
  });
});

describe("subscribe-band", () => {
  it("charges the band the declared count falls into", async () => {
    seedOrg({ declared_units: 60 });
    seedUnits(5);

    const res = await subscribe();

    expect(res.band.slug).toBe("mid");
    expect(h.stripe.subscriptions.create.mock.calls[0]![0]).toMatchObject({
      items: [{ price: "price_hoa_mid_monthly" }],
      metadata: { band_slug: "mid", units: "60" },
    });
  });

  it("saves the customer on the org BEFORE creating the subscription", async () => {
    seedOrg({ declared_units: 60 });
    await subscribe();
    expect(customerOnOrgAtSubscribe).toBe("cus_new");
    expect(db.one("hoa_organizations", ORG)!.stripe_customer_id).toBe("cus_new");
  });

  it("puts standard onboarding on the first invoice", async () => {
    seedOrg({ declared_units: 60 });
    const res = await subscribe();
    expect(h.stripe.subscriptions.create.mock.calls[0]![0].add_invoice_items).toEqual([{ price: "price_hoa_mid_onboarding" }]);
    expect(res.firstInvoiceCents).toBe((499 + 2500) * 100);
  });

  it("leaves onboarding off when there is none to charge", async () => {
    seedOrg({ declared_units: 60 });
    const res = await subscribe({ onboarding: "none" });
    expect(h.stripe.subscriptions.create.mock.calls[0]![0].add_invoice_items).toBeUndefined();
    expect(res.firstInvoiceCents).toBe(499 * 100);
  });

  it("refuses a member who isn't an admin, before touching Stripe", async () => {
    seedOrg({ declared_units: 60 }, "role-resident");
    await expect(subscribe()).rejects.toMatchObject({ statusCode: 403 });
    expect(h.stripe.customers.create).not.toHaveBeenCalled();
    expect(h.stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("refuses someone who isn't signed in", async () => {
    seedOrg({ declared_units: 60 });
    h.session = null;
    await expect(subscribe()).rejects.toMatchObject({ statusCode: 403 });
    expect(h.stripe.subscriptions.create).not.toHaveBeenCalled();
  });
});

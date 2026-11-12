/**
 * GET /api/hoa/find and /api/hoa/by-slug answer anyone who knows a slug. They
 * read `hoa_organizations` with "*" (and settings.*, hero.*, …) and returned all
 * of it: Stripe customer / subscription / Connect ids, the billing account, the
 * library root folder, payment instructions, inquiry routing, user_created, and
 * every block_settings column — the email sender, its domain and DNS, reminders.
 *
 * Now both read one explicit public field list (core/server/utils/public-org.ts),
 * the inquiry recipient inside settings.landing is taken out of the answer, and
 * only a signed-in admin of the community gets what the site builder edits (the
 * library folder and the stored landing).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const h = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  session: null as any,
  adminOf: [] as string[],
  adminChecks: [] as string[],
  headers: {} as Record<string, string>,
  ops: [] as Array<{ op: string; collection: string; id?: string; query?: any }>,
}));

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  readItem: (collection: string, id: string, query: any) => ({ op: "readItem", collection, id, query }),
}));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const find = (await import("#core/server/api/hoa/find.get")).default as (e: H3Event) => Promise<any>;
const bySlug = (await import("#core/server/api/hoa/by-slug.get")).default as (e: H3Event) => Promise<any>;

const storedLanding = () => ({
  mode: "dark",
  places: { neighborhood: "Lenox Hill" },
  inquiry: { enabled: true, recipient_type: "email", email: "board@lenox.example", user: "u-dana" },
});

// What Directus hands back. The stub ignores `fields`, so anything the route
// returns beyond the row is the route's own doing.
const orgRow = () => ({
  id: "org-lenox",
  slug: "lenox",
  name: "1033 Lenox",
  settings: { id: "set-1", theme: "classic", landing: storedLanding() },
});

// The fields a query asks for, as dotted paths ("settings.logo.id").
function paths(fields: unknown[], prefix = ""): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (typeof f === "string") out.push(prefix + f);
    else if (f && typeof f === "object")
      for (const [k, v] of Object.entries(f)) out.push(...paths(v as unknown[], `${prefix}${k}.`));
  }
  return out;
}

const SENSITIVE = [
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_connect_account_id",
  "billing_account",
  "folder",
  "user_created",
  "user_updated",
  "payment_instructions",
  "inquiry_routing",
  "subscription",
  "subscription_plan",
  "invitations",
  "default_monthly_dues",
  "late_fee_amount",
  "opening_balance",
  "ai_autonomy_tier",
  "active_addons",
  "trial_ends_at",
  "grace_ends_at",
  "settings.from_email",
  "settings.from_name",
  "settings.email_domain",
  "settings.email_domain_id",
  "settings.email_domain_dns",
  "settings.email_domain_verified",
  "settings.reminders",
  "settings.user_created",
];

// What the public pages read (traced in public-org.ts). Dropping one of these
// breaks the landing, the nav, branding or module gates.
const NEEDED = [
  "id",
  "slug",
  "name",
  "type",
  "modules",
  "show_board",
  "maintenance_mode",
  "external_url",
  "is_free_account",
  "subscription_status",
  "member_count",
  "phone",
  "email",
  "street_address",
  "city",
  "logo.id",
  "amenities.title",
  "hero.title",
  "hero.background_image.id",
  "hero.foreground_image.id",
  "settings.id",
  "settings.landing",
  "settings.theme",
  "settings.description",
  "settings.colors",
  "settings.logo.id",
  "settings.icon.id",
];

const orgReads = () => h.ops.filter((o) => o.collection === "hoa_organizations");

beforeEach(() => {
  h.query = { slug: "lenox" };
  h.session = null;
  h.adminOf = [];
  h.adminChecks = [];
  h.headers = {};
  h.ops = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("setResponseHeader", (_e: unknown, name: string, value: string) => {
    h.headers[name.toLowerCase()] = value;
  });
  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("checkAdminAccess", async (_e: unknown, orgId: string) => {
    h.adminChecks.push(orgId);
    const isAdmin = !!h.session?.user?.id && h.adminOf.includes(orgId);
    return { isAdmin, isAppAdmin: false, isHoaAdmin: isAdmin };
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      h.ops.push(op);
      if (op.collection !== "hoa_organizations") return [];
      if (op.op === "readItem") return { folder: "folder-lenox", settings: { landing: storedLanding() } };
      return [orgRow()];
    },
  }));
});

describe.each([
  ["find", () => find],
  ["by-slug", () => bySlug],
])("GET /api/hoa/%s for a visitor", (_label, handler) => {
  it("asks for an explicit field list — no '*' anywhere", async () => {
    await handler()({} as H3Event);
    const [read] = orgReads();
    expect(read).toBeDefined();
    const asked = paths(read!.query.fields);
    expect(asked.filter((p) => p === "*" || p.endsWith(".*"))).toEqual([]);
  });

  it("never asks for billing, payment, routing, folder or email-sender fields", async () => {
    await handler()({} as H3Event);
    const asked = paths(orgReads()[0]!.query.fields);
    for (const field of SENSITIVE) {
      expect(asked.filter((p) => p === field || p.startsWith(`${field}.`))).toEqual([]);
    }
  });

  it("still asks for everything the public pages read", async () => {
    await handler()({} as H3Event);
    const asked = paths(orgReads()[0]!.query.fields);
    for (const field of NEEDED) expect(asked).toContain(field);
  });

  it("answers without the inquiry recipient, keeping the rest of the landing", async () => {
    const org = await handler()({} as H3Event);
    expect(org.settings.landing).toEqual({
      mode: "dark",
      places: { neighborhood: "Lenox Hill" },
      inquiry: { enabled: true },
    });
    expect(org).not.toHaveProperty("folder");
    expect(org).not.toHaveProperty("admin_view");
    expect(JSON.stringify(org)).not.toContain("board@lenox.example");
    expect(JSON.stringify(org)).not.toContain("u-dana");
  });
});

describe("GET /api/hoa/find — what the site builder needs", () => {
  it("a visitor gets the public shape from one read, and no admin lookup runs", async () => {
    const org = await find({} as H3Event);
    expect(orgReads()).toHaveLength(1);
    expect(h.adminChecks).toEqual([]);
    expect(org).not.toHaveProperty("folder");
    expect(org).not.toHaveProperty("admin_view");
    expect(h.headers["cache-control"]).toBeUndefined();
  });

  it("a signed-in member who is not an admin gets the public shape", async () => {
    h.session = { user: { id: "u-member" } };
    const org = await find({} as H3Event);
    expect(h.adminChecks).toEqual(["org-lenox"]);
    expect(orgReads()).toHaveLength(1);
    expect(org).not.toHaveProperty("folder");
    expect(org).not.toHaveProperty("admin_view");
    expect(org.settings.landing.inquiry).toEqual({ enabled: true });
  });

  it("an admin of another community gets the public shape", async () => {
    h.session = { user: { id: "u-oscar" } };
    h.adminOf = ["org-other"];
    const org = await find({} as H3Event);
    expect(orgReads()).toHaveLength(1);
    expect(org).not.toHaveProperty("folder");
    expect(org).not.toHaveProperty("admin_view");
    expect(org.settings.landing.inquiry).toEqual({ enabled: true });
  });

  it("this community's admin also gets the library folder and the stored landing, uncached", async () => {
    h.session = { user: { id: "u-oscar" } };
    h.adminOf = ["org-lenox"];
    const org = await find({} as H3Event);

    const [publicRead, adminRead] = orgReads();
    expect(paths(publicRead!.query.fields)).not.toContain("folder");
    expect(adminRead).toMatchObject({ op: "readItem", id: "org-lenox" });
    expect(paths(adminRead!.query.fields).sort()).toEqual(["folder", "settings.landing"]);

    expect(org.folder).toBe("folder-lenox");
    // The site builder saves only an answer marked as the admin view.
    expect(org.admin_view).toBe(true);
    expect(org.settings.landing.inquiry).toEqual(storedLanding().inquiry);
    // The rest of the public answer is untouched.
    expect(org.settings.id).toBe("set-1");
    expect(org.settings.theme).toBe("classic");
    expect(h.headers["cache-control"]).toBe("private, no-store");
  });

  it("a failing session lookup leaves the route public, not broken", async () => {
    vi.stubGlobal("getUserSession", async () => {
      throw new Error("bad cookie");
    });
    const org = await find({} as H3Event);
    expect(org.name).toBe("1033 Lenox");
    expect(org).not.toHaveProperty("folder");
    expect(org).not.toHaveProperty("admin_view");
  });
});

describe("GET /api/hoa/by-slug", () => {
  it("has no admin variant: even this community's admin gets the public shape", async () => {
    h.session = { user: { id: "u-oscar" } };
    h.adminOf = ["org-lenox"];
    const org = await bySlug({} as H3Event);
    expect(orgReads()).toHaveLength(1);
    expect(org).not.toHaveProperty("folder");
    expect(org).not.toHaveProperty("admin_view");
    expect(org.settings.landing.inquiry).toEqual({ enabled: true });
  });
});

/**
 * URLs the server fetches or sends people to on a user's say-so.
 *
 *  - GET /api/link-preview — fetches a user-given URL. Until 2026-11-12 the
 *    guard compared the hostname's spelling and followed redirects blindly, so a
 *    public URL redirecting to 169.254.169.254, or a name resolving to 10.x, was
 *    fetched and its <title> returned. Now every resolved address must be public,
 *    and each redirect hop is checked again (public-url.ts);
 *  - POST /api/stripe/portal and /api/stripe/billing-account/portal — the
 *    return URL must be the app's own origin (or the request's trusted origin),
 *    else the default. Until then any URL was passed to Stripe (open redirect).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const h = vi.hoisted(() => ({
  dns: {} as Record<string, string[]>,
  fetches: [] as string[],
  responses: {} as Record<string, { status: number; location?: string; html?: string }>,
  query: {} as Record<string, string>,
  body: {} as Record<string, unknown>,
  portalReturn: [] as string[],
}));

vi.mock("node:dns/promises", () => {
  const lookup = async (host: string) => {
    const addrs = h.dns[host];
    if (!addrs) throw new Error("ENOTFOUND");
    return addrs.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return { lookup, default: { lookup } };
});
vi.mock("@directus/sdk", () => ({ readItem: (c: string, id: string) => ({ op: "readItem", c, id }) }));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const { isPublicIp } = await import("#core/server/utils/public-url");
const preview = (await import("#core/server/api/link-preview.get")).default as (e: H3Event) => Promise<any>;
const orgPortal = (await import("#core/server/api/stripe/portal.post")).default as (e: H3Event) => Promise<any>;
const accountPortal = (await import("#core/server/api/stripe/billing-account/portal.post")).default as (e: H3Event) => Promise<any>;

beforeEach(() => {
  h.dns = { "example.com": ["93.184.216.34"], "internal.example.com": ["10.0.0.5"], "mixed.example.com": ["93.184.216.34", "127.0.0.1"] };
  h.fetches = [];
  h.responses = {};
  h.query = {};
  h.body = {};
  h.portalReturn = [];
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "u1" } }));
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("readBody", async () => h.body);
  // Like real fetch: follows a redirect itself unless told `redirect: "manual"`.
  vi.stubGlobal("fetch", async function stubFetch(input: URL | string, init?: RequestInit): Promise<Response> {
    const url = String(input);
    h.fetches.push(url);
    const r = h.responses[url] ?? { status: 404 };
    if (r.location && init?.redirect !== "manual") return stubFetch(new URL(r.location, url), init);
    const headers = new Headers({ "content-type": "text/html" });
    if (r.location) headers.set("location", r.location);
    return new Response(r.status >= 300 && r.status < 400 ? null : (r.html ?? ""), { status: r.status, headers });
  });
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.hoaconnect.test" } }));
  vi.stubGlobal("safeRequestOrigin", async () => "https://lenox-hoa.test");
  vi.stubGlobal("requireAdminAccess", async () => ({ isAdmin: true }));
  vi.stubGlobal("requireBillingAccountRole", async () => ({ role: "owner" }));
  vi.stubGlobal("getBillingAccount", async () => ({ id: "acct-1", stripe_customer_id: "cus_1" }));
  vi.stubGlobal("getTypedDirectus", () => ({ request: async () => ({ id: "org-1", stripe_customer_id: "cus_1" }) }));
  vi.stubGlobal("getStripe", () => ({
    billingPortal: {
      sessions: {
        create: async (p: { return_url: string }) => {
          h.portalReturn.push(p.return_url);
          return { url: "https://billing.stripe.test/session" };
        },
      },
    },
  }));
});

describe("isPublicIp", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "fd00::1", "fe80::1"])(
    "refuses %s",
    (ip) => expect(isPublicIp(ip)).toBe(false)
  );
  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isPublicIp(ip)).toBe(true));
});

describe("GET /api/link-preview", () => {
  it("previews a public page", async () => {
    h.query = { url: "https://example.com/post" };
    h.responses["https://example.com/post"] = { status: 200, html: "<title>Hello</title>" };
    expect((await preview({} as H3Event)).title).toBe("Hello");
  });

  it("refuses a public URL that redirects to the metadata address, without following it", async () => {
    h.query = { url: "https://example.com/go" };
    h.responses["https://example.com/go"] = { status: 302, location: "http://169.254.169.254/latest/meta-data/" };
    h.responses["http://169.254.169.254/latest/meta-data/"] = { status: 200, html: "<title>secret</title>" };
    expect((await preview({} as H3Event)).title).toBeNull();
    expect(h.fetches).toEqual(["https://example.com/go"]);
  });

  it.each([
    ["a name resolving to a private address", "https://internal.example.com/"],
    ["a name with any private address", "https://mixed.example.com/"],
    ["a decimal IPv4 literal for loopback", "http://2130706433/"],
    ["an IPv4-mapped IPv6 loopback", "http://[::ffff:127.0.0.1]/"],
  ])("fetches nothing for %s", async (_label, url) => {
    h.query = { url };
    expect((await preview({} as H3Event)).title).toBeNull();
    expect(h.fetches).toEqual([]);
  });
});

describe("Stripe portal return URLs", () => {
  it.each([
    ["another site", "https://evil.test/phish", "https://app.hoaconnect.test/settings/subscription"],
    ["a protocol-relative URL", "//evil.test/x", "https://app.hoaconnect.test/settings/subscription"],
    ["javascript:", "javascript:alert(1)", "https://app.hoaconnect.test/settings/subscription"],
    ["the app's own page", "https://app.hoaconnect.test/settings/subscription?ok=1", "https://app.hoaconnect.test/settings/subscription?ok=1"],
    ["the community's verified domain", "https://lenox-hoa.test/settings/subscription", "https://lenox-hoa.test/settings/subscription"],
    ["a path", "/settings/subscription", "https://lenox-hoa.test/settings/subscription"],
  ])("org portal: %s", async (_label, returnUrl, expected) => {
    h.body = { organizationId: "org-1", returnUrl };
    await orgPortal({} as H3Event);
    expect(h.portalReturn).toEqual([expected]);
  });

  it("agency portal: another site falls back to the account page", async () => {
    h.body = { accountId: "acct-1", returnUrl: "https://evil.test/" };
    await accountPortal({} as H3Event);
    expect(h.portalReturn).toEqual(["https://app.hoaconnect.test/billing/acct-1"]);
  });
});

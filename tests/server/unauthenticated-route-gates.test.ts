/**
 * Two routes that asked for no session at all, with the admin token behind them.
 *
 *  - POST /api/coupons/record-usage — wrote `coupon_usage` rows for any coupon,
 *    user and community named in the body, so anyone could use up a coupon's
 *    `max_uses`. Now: a session, the user is the caller, and the caller is an
 *    admin of the community;
 *  - GET /api/hoa/check-email — answered, for any address, its account's name
 *    and every community it belonged to or was invited to. Now: an admin of the
 *    community asked about, and only that community's rows.
 *
 * (POST /api/stripe/paymentintent, the third, is covered in paymentintent.test.ts.)
 *
 * And the public community lookups, /api/hoa/find and /api/hoa/by-slug, no
 * longer ask for the community's invitations (emails and tokens) or its Stripe
 * subscription. They still return the rest of the record: an explicit public
 * field list is a follow-up.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const h = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  query: {} as Record<string, unknown>,
  session: { user: { id: "u-oscar" } } as any,
  ops: [] as Array<{ op: string; collection: string; query?: any }>,
}));

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  createItem: (collection: string, data: any) => ({ op: "createItem", collection, data }),
}));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const recordUsage = (await import("#core/server/api/coupons/record-usage.post")).default as (e: H3Event) => Promise<any>;
const checkEmail = (await import("#core/server/api/hoa/check-email.get")).default as (e: H3Event) => Promise<any>;

beforeEach(() => {
  h.body = {};
  h.query = {};
  h.session = { user: { id: "u-oscar" } };
  h.ops = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("useRuntimeConfig", () => ({ directus: { url: "https://d.test", staticToken: "t" } }));
  vi.stubGlobal("$fetch", async () => ({ data: [] }));
  vi.stubGlobal("requireUserSession", async () => {
    if (!h.session) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return h.session;
  });
  // Oscar administers Lenox and nothing else.
  vi.stubGlobal("requireAdminAccess", async (_e: unknown, org: string) => {
    if (org !== "org-lenox") throw Object.assign(new Error("Admin access required"), { statusCode: 403 });
    return { isAdmin: true, isAppAdmin: false, isHoaAdmin: true };
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      h.ops.push(op);
      if (op.op === "createItem") return { id: "usage-1" };
      return [];
    },
  }));
});

describe("POST /api/coupons/record-usage", () => {
  const usage = { couponId: "c1", userId: "u-oscar", organizationId: "org-lenox", planId: "p1", discountApplied: 10 };

  it("records the caller's own usage for their own community", async () => {
    h.body = { ...usage };
    expect((await recordUsage({} as H3Event)).success).toBe(true);
    expect(h.ops.map((o) => `${o.op}:${o.collection}`)).toEqual(["createItem:coupon_usage"]);
  });

  it("refuses an anonymous caller and writes nothing", async () => {
    h.session = null;
    h.body = { ...usage };
    await expect(recordUsage({} as H3Event)).rejects.toMatchObject({ statusCode: 401 });
    expect(h.ops).toEqual([]);
  });

  it("refuses usage for another community and writes nothing", async () => {
    h.body = { ...usage, organizationId: "org-other" };
    await expect(recordUsage({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.ops).toEqual([]);
  });

  it("refuses usage recorded for someone else and writes nothing", async () => {
    h.body = { ...usage, userId: "u-someone-else" };
    await expect(recordUsage({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.ops).toEqual([]);
  });
});

describe("GET /api/hoa/check-email", () => {
  it("refuses an anonymous caller before reading anything", async () => {
    h.session = null;
    h.query = { email: "dana@example.com", organizationId: "org-lenox" };
    await expect(checkEmail({} as H3Event)).rejects.toMatchObject({ statusCode: 401 });
    expect(h.ops).toEqual([]);
  });

  it("refuses another community's admin check before reading anything", async () => {
    h.query = { email: "dana@example.com", organizationId: "org-other" };
    await expect(checkEmail({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.ops).toEqual([]);
  });

  it("refuses a check with no community", async () => {
    h.query = { email: "dana@example.com" };
    await expect(checkEmail({} as H3Event)).rejects.toMatchObject({ statusCode: 400 });
    expect(h.ops).toEqual([]);
  });

  it("reads only the asked-about community's members and invitations", async () => {
    h.query = { email: "dana@example.com", organizationId: "org-lenox" };
    await checkEmail({} as H3Event);
    const reads = h.ops.filter((o) => o.op === "readItems");
    expect(reads.map((o) => o.collection)).toEqual(["hoa_members", "hoa_invitations"]);
    for (const r of reads) expect(r.query.filter.organization).toEqual({ _eq: "org-lenox" });
  });
});

describe("GET /api/hoa/find and /api/hoa/by-slug (public)", () => {
  it.each([
    ["find", "#core/server/api/hoa/find.get"],
    ["by-slug", "#core/server/api/hoa/by-slug.get"],
  ])("%s never asks for the community's invitations or Stripe subscription", async (_label, path) => {
    const handler = (await import(path)).default as (e: H3Event) => Promise<any>;
    h.query = { slug: "lenox" };
    vi.stubGlobal("getRouterParam", () => "lenox");
    await handler({} as H3Event).catch(() => {});
    const orgRead = h.ops.find((o) => o.op === "readItems" && o.collection === "hoa_organizations");
    expect(orgRead).toBeDefined();
    const relations = Object.assign({}, ...orgRead!.query.fields.filter((f: unknown) => typeof f === "object"));
    expect(relations).not.toHaveProperty("invitations");
    expect(relations).not.toHaveProperty("subscription");
  });
});

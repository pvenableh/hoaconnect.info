/**
 * The public unsubscribe surface (Phase 3a). What these pin:
 *
 *   · POST /api/email/unsubscribe/one-click — no auth (no session is read), a
 *     200 with an EMPTY body, idempotent (a second POST writes nothing), the
 *     same 200 for an unknown or malformed token (no oracle), and a 503 when the
 *     member can't be read or written, so the mailbox provider retries;
 *   · GET of the same URL never unsubscribes — it redirects to the page;
 *   · a token resolves to exactly one member of one org, or to nobody;
 *   · tokens are 24 random bytes, base64url, minted only for members without one,
 *     and a failed mint never fails the send.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  updateItem: (collection: string, id: string, data: any) => ({ op: "updateItem", collection, id, data }),
  updateItemsBatch: (collection: string, data: any[]) => ({ op: "updateItemsBatch", collection, data }),
  readFieldsByCollection: (collection: string) => ({ op: "readFields", collection }),
}));

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012-_9";

type Op = { op: string; collection: string; id?: string; data?: any; query?: any };
let ops: Op[];
let rows: any[];
let failRead: boolean;
let failWrite: boolean;
let status: number | null;
let headers: Record<string, string>;
let query: Record<string, unknown>;
let body: unknown;
let sessionRead: boolean;
let unprovisioned: boolean;
const PROVISIONED = [
  "email_community_opt_out",
  "email_community_opt_out_at",
  "email_community_opt_out_source",
  "email_bounced",
  "email_bounced_at",
  "email_bounced_reason",
  "unsubscribe_token",
];

const member = (over: Record<string, unknown> = {}) => ({
  id: "m-1",
  email: "pat@example.com",
  first_name: "Pat",
  email_community_opt_out: false,
  email_community_opt_out_at: null,
  email_bounced: false,
  organization: { id: "org-a", name: "Oak Court", slug: "oak" },
  ...over,
});

beforeEach(async () => {
  (await import("#core/server/utils/email-compliance"))._resetEmailComplianceSchemaCache();
  ops = [];
  rows = [member()];
  failRead = false;
  failWrite = false;
  status = null;
  headers = {};
  query = { token: TOKEN };
  body = {};
  sessionRead = false;
  unprovisioned = false;
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", () => query);
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("setResponseStatus", (_e: unknown, code: number) => {
    status = code;
  });
  vi.stubGlobal("setResponseHeader", (_e: unknown, k: string, v: string) => {
    headers[k] = v;
  });
  vi.stubGlobal("sendRedirect", (_e: unknown, to: string, code: number) => ({ redirect: to, code }));
  vi.stubGlobal("getUserSession", async () => {
    sessionRead = true;
    return null;
  });
  vi.stubGlobal("requireUserSession", async () => {
    sessionRead = true;
    throw new Error("must not be called");
  });
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.test" } }));
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.statusMessage || o.message), o));
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: Op) => {
      ops.push(op);
      if (op.op === "readItems") {
        if (failRead) throw new Error("ECONNRESET");
        return rows;
      }
      if (op.op === "readFields") {
        if (failRead) throw new Error("ECONNRESET");
        return (unprovisioned ? ["id"] : ["id", ...PROVISIONED]).map((field) => ({ field }));
      }
      if (op.op === "updateItem" || op.op === "updateItemsBatch") {
        if (failWrite) throw new Error("ECONNRESET");
        if (op.op === "updateItem") rows = rows.map((r) => (r.id === op.id ? { ...r, ...op.data } : r));
        return {};
      }
      return {};
    },
  }));
});

const loadOneClick = async () => (await import("#core/server/api/email/unsubscribe/one-click.post")).default as any;
const writes = () => ops.filter((o) => o.op === "updateItem");

describe("POST /api/email/unsubscribe/one-click", () => {
  it("opts the member out of community mail with source one_click, 200 empty, no session", async () => {
    const handler = await loadOneClick();
    const res = await handler({});
    expect(status).toBe(200);
    expect(res).toBe("");
    expect(sessionRead).toBe(false);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({
      collection: "hoa_members",
      id: "m-1",
      data: { email_community_opt_out: true, email_community_opt_out_source: "one_click" },
    });
    expect(typeof writes()[0]!.data.email_community_opt_out_at).toBe("string");
  });

  it("is idempotent: a second POST finds them out and writes nothing", async () => {
    const handler = await loadOneClick();
    await handler({});
    await handler({});
    expect(status).toBe(200);
    expect(writes()).toHaveLength(1);
  });

  it("answers an unknown token with the same 200 and no write", async () => {
    rows = [];
    const res = await (await loadOneClick())({});
    expect(status).toBe(200);
    expect(res).toBe("");
    expect(writes()).toHaveLength(0);
  });

  it("never reaches Directus with a malformed token", async () => {
    query = { token: "../../etc/passwd" };
    const res = await (await loadOneClick())({});
    expect(status).toBe(200);
    expect(res).toBe("");
    expect(ops).toHaveLength(0);
  });

  it("503s on a failed read so the provider retries", async () => {
    failRead = true;
    const res = await (await loadOneClick())({});
    expect(status).toBe(503);
    expect(res).toBe("");
  });

  it("503s on a failed write", async () => {
    failWrite = true;
    await (await loadOneClick())({});
    expect(status).toBe(503);
  });

  it("refuses a token that two rows share (resolves to nobody, writes nothing)", async () => {
    rows = [member(), member({ id: "m-2", organization: { id: "org-b", name: "B", slug: "b" } })];
    await (await loadOneClick())({});
    expect(status).toBe(200);
    expect(writes()).toHaveLength(0);
  });

  it("looks the token up with an exact match, limit 2", async () => {
    await (await loadOneClick())({});
    const read = ops.find((o) => o.op === "readItems")!;
    expect(read.query.filter).toEqual({ unsubscribe_token: { _eq: TOKEN } });
    expect(read.query.limit).toBe(2);
  });
});

describe("GET /api/email/unsubscribe/one-click", () => {
  it("redirects a person to the page and writes nothing", async () => {
    query = { token: TOKEN, e: "e-9" };
    const handler = (await import("#core/server/api/email/unsubscribe/one-click.get")).default as any;
    expect(await handler({})).toEqual({ redirect: `/unsubscribe?token=${TOKEN}&e=e-9`, code: 302 });
    expect(ops).toHaveLength(0);
  });

  it("drops a malformed token from the redirect", async () => {
    query = { token: "<script>" };
    const handler = (await import("#core/server/api/email/unsubscribe/one-click.get")).default as any;
    expect(await handler({})).toEqual({ redirect: "/unsubscribe", code: 302 });
  });
});

describe("the page's routes", () => {
  it("GET shows the org, a masked address and the standing — and changes nothing", async () => {
    const handler = (await import("#core/server/api/email/unsubscribe/index.get")).default as any;
    const res = await handler({});
    expect(res).toMatchObject({
      valid: true,
      org: { name: "Oak Court", slug: "oak" },
      email: "p•••t@example.com",
      optedOut: false,
      preferencesUrl: "https://app.test/oak/profile#email",
    });
    expect(res.essential.length).toBeGreaterThan(0);
    expect(writes()).toHaveLength(0);
  });

  it("GET says valid:false for nobody, and 503s on a failed read", async () => {
    rows = [];
    const handler = (await import("#core/server/api/email/unsubscribe/index.get")).default as any;
    expect(await handler({})).toEqual({ valid: false });
    (await import("#core/server/utils/email-compliance"))._resetEmailComplianceSchemaCache();
    failRead = true;
    await expect(handler({})).rejects.toMatchObject({ statusCode: 503 });
  });

  it("GET says valid:false before the fields exist, without reading a member", async () => {
    unprovisioned = true;
    const handler = (await import("#core/server/api/email/unsubscribe/index.get")).default as any;
    expect(await handler({})).toEqual({ valid: false });
    expect(ops.some((o) => o.op === "readItems")).toBe(false);
  });

  it("POST unsubscribe records source link; resubscribe clears it; both idempotent", async () => {
    const handler = (await import("#core/server/api/email/unsubscribe/index.post")).default as any;
    body = { token: TOKEN, action: "unsubscribe" };
    expect(await handler({})).toEqual({ ok: true, optedOut: true });
    expect(writes()[0]!.data).toMatchObject({ email_community_opt_out: true, email_community_opt_out_source: "link" });
    await handler({});
    expect(writes()).toHaveLength(1);
    body = { token: TOKEN, action: "resubscribe" };
    expect(await handler({})).toEqual({ ok: true, optedOut: false });
    expect(writes()[1]!.data).toEqual({
      email_community_opt_out: false,
      email_community_opt_out_at: null,
      email_community_opt_out_source: null,
    });
  });

  it("POST 404s an unknown token, 400s a missing action, 503s a failed read", async () => {
    const handler = (await import("#core/server/api/email/unsubscribe/index.post")).default as any;
    body = { token: TOKEN };
    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
    rows = [];
    body = { token: TOKEN, action: "unsubscribe" };
    await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
    failRead = true;
    await expect(handler({})).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe("token minting and lookup", () => {
  it("mints 24 random bytes as 32 base64url characters, never the same twice", async () => {
    const { mintUnsubscribeToken } = await import("#core/server/utils/email-compliance");
    const { isUnsubscribeToken } = await import("#core/shared/email/unsubscribe");
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = mintUnsubscribeToken();
      expect(isUnsubscribeToken(t)).toBe(true);
      expect(Buffer.from(t, "base64url")).toHaveLength(24);
      seen.add(t);
    }
    expect(seen.size).toBe(200);
  });

  it("a token resolves to exactly one member of one org", async () => {
    const { findMemberByToken } = await import("#core/server/utils/email-compliance");
    const directus = { request: async () => [member()] };
    expect(await findMemberByToken(directus, TOKEN)).toMatchObject({ id: "m-1", organization: { id: "org-a" } });
    expect(await findMemberByToken({ request: async () => [member(), member({ id: "m-2" })] }, TOKEN)).toBeNull();
    expect(await findMemberByToken({ request: async () => [member({ organization: null })] }, TOKEN)).toBeNull();
    expect(await findMemberByToken({ request: async () => [member({ organization: "org-a" })] }, TOKEN)).toBeNull();
    expect(await findMemberByToken({ request: async () => [] }, TOKEN)).toBeNull();
  });

  it("ensureUnsubscribeTokens mints only the missing ones and uses what was stored", async () => {
    const { ensureUnsubscribeTokens } = await import("#core/server/utils/email-compliance");
    const calls: Op[] = [];
    const directus = {
      request: async (op: Op) => {
        calls.push(op);
        if (op.op === "updateItemsBatch") return {};
        // Read-back: the store's copy wins (a concurrent send minted first).
        return [{ id: "m-2", unsubscribe_token: "StoredStoredStoredStoredStored12" }];
      },
    };
    const out = await ensureUnsubscribeTokens(directus, [
      { id: "m-1", unsubscribe_token: TOKEN },
      { id: "m-2", unsubscribe_token: null },
    ]);
    const batch = calls.find((c) => c.op === "updateItemsBatch")!;
    expect(batch.data.map((d: any) => d.id)).toEqual(["m-2"]);
    expect(out.map((m) => m.unsubscribe_token)).toEqual([TOKEN, "StoredStoredStoredStoredStored12"]);
  });

  it("a failed mint leaves the members as they were and does not throw", async () => {
    const { ensureUnsubscribeTokens } = await import("#core/server/utils/email-compliance");
    const list = [{ id: "m-1", unsubscribe_token: null }];
    const out = await ensureUnsubscribeTokens({ request: async () => { throw new Error("down"); } }, list);
    expect(out).toEqual(list);
  });

  it("does no work when everyone already has a token", async () => {
    const { ensureUnsubscribeTokens } = await import("#core/server/utils/email-compliance");
    let called = false;
    await ensureUnsubscribeTokens({ request: async () => { called = true; return []; } }, [{ id: "m-1", unsubscribe_token: TOKEN }]);
    expect(called).toBe(false);
  });
});

describe("emailComplianceSchema", () => {
  it("reports the fields that exist, caches a yes, and re-asks a no after a minute", async () => {
    const mod = await import("#core/server/utils/email-compliance");
    mod._resetEmailComplianceSchemaCache();
    let members: string[] = ["id", "email"];
    let reads = 0;
    const directus = {
      request: async (op: Op) => {
        reads++;
        return op.collection === "hoa_members" ? members.map((field) => ({ field })) : [{ field: "email_class" }];
      },
    };
    expect(await mod.emailComplianceSchema(directus)).toEqual({ members: false, emailClass: true });
    const before = reads;
    expect(await mod.emailComplianceSchema(directus)).toEqual({ members: false, emailClass: true });
    expect(reads).toBe(before); // the negative answer is cached for a minute

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    members = [
      "id",
      "email_community_opt_out",
      "email_community_opt_out_at",
      "email_community_opt_out_source",
      "email_bounced",
      "email_bounced_at",
      "email_bounced_reason",
      "unsubscribe_token",
    ];
    expect(await mod.emailComplianceSchema(directus)).toEqual({ members: true, emailClass: true });
    const after = reads;
    vi.setSystemTime(Date.now() + 3_600_000);
    await mod.emailComplianceSchema(directus);
    expect(reads).toBe(after); // a complete yes is kept
    vi.useRealTimers();
    mod._resetEmailComplianceSchemaCache();
  });

  it("throws when Directus can't be read (an outage is not 'fields missing')", async () => {
    const mod = await import("#core/server/utils/email-compliance");
    mod._resetEmailComplianceSchemaCache();
    await expect(mod.emailComplianceSchema({ request: async () => { throw new Error("down"); } })).rejects.toThrow("down");
  });
});

/**
 * Two new endpoints, two different things to get wrong.
 *
 * `/api/ai/notices` returns a list that names other people's arrears, other
 * people's open requests and the association's vendor exposure. That is board
 * business, and the org it is board business *for* comes from the caller's
 * standing in THIS community — never from the `orgId` they typed. So the tests
 * pin that a refusal happens before any sweep runs: a 403 must cost the
 * pointed-at community nothing, not even a read.
 *
 * `/api/ai/notices/check` is the cron, and its failure mode is the opposite of
 * a leak — it is a nag. The generators are deterministic, so an unguarded run
 * re-sends the same notice every night until someone acts, and the reliable
 * result of that is a muted category. Hence: only urgent/high escalate, one
 * fire per notice-type-per-entity per calendar month, and a month boundary that
 * actually re-opens the gate.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
  createItem: (collection: string, payload: unknown) => ({ op: "create", collection, payload }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";

type Op = { op: string; collection: string; query?: any; payload?: any };

let ops: Op[];
let rows: Record<string, any[]>;
let isAdminOf: string[];
let isBoardOf: string[];
let notified: any[];
let historyAvailable: boolean;
let warnings: string[];

const daysAgo = (n: number, from = Date.now()): string =>
  new Date(from - n * 86_400_000).toISOString();

function matches(row: any, filter: any): boolean {
  if (!filter) return true;
  if (Array.isArray(filter._and)) return filter._and.every((f: any) => matches(row, f));
  return Object.entries(filter).every(([field, cond]: [string, any]) => {
    if (field === "_and") return true;
    const v = row[field];
    if (cond?._eq !== undefined) return String(v) === String(cond._eq);
    if (cond?._neq !== undefined) return String(v) !== String(cond._neq);
    if (cond?._in !== undefined) return (cond._in as any[]).map(String).includes(String(v));
    if (cond?._gt !== undefined) return Number(v) > Number(cond._gt);
    if (cond?._nnull !== undefined) return cond._nnull ? v != null : v == null;
    return true;
  });
}

beforeEach(() => {
  vi.resetModules();
  ops = [];
  notified = [];
  warnings = [];
  isAdminOf = [HOME];
  isBoardOf = [];
  historyAvailable = true;
  rows = {
    hoa_requests: [],
    hoa_members: [],
    hoa_projects: [],
    hoa_channels: [],
    hoa_channel_messages: [],
    hoa_vendors: [],
    hoa_meetings: [],
    payment_requests: [],
    ai_wallets: [],
    ai_notice_history: [],
    hoa_organizations: [{ id: HOME, name: "Home" }],
  };

  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("readBody", async (e: any) => e?.__body ?? {});
  vi.stubGlobal("getHeader", (e: any, k: string) => e?.__headers?.[k]);
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: ME }));
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: ME } }));
  vi.stubGlobal("checkAdminAccess", async (_e: any, orgId: string) => ({
    isAdmin: isAdminOf.includes(orgId),
    memberId: "hm-1",
  }));
  vi.stubGlobal("isActiveBoardMember", async (_d: any, _u: string, orgId: string) =>
    isBoardOf.includes(orgId)
  );
  vi.stubGlobal("safeRequestOrigin", async () => "https://app.example.com");
  vi.stubGlobal("getOrgChannelEnrollees", async () => [
    { user: "admin-1", hoa_member: "hm-1" },
    { user: "board-1", hoa_member: "hm-2" },
  ]);
  vi.stubGlobal("notifyUsers", async (opts: any) => {
    notified.push(opts);
    return { bell: opts.recipientUserIds.length, push: 0, email: 0 };
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      ops.push(desc);
      if (desc.collection === "ai_notice_history" && !historyAvailable) {
        throw new Error("collection does not exist");
      }
      if (desc.op === "create") {
        (rows[desc.collection] ||= []).push({ id: `row-${ops.length}`, ...desc.payload });
        return { id: `row-${ops.length}` };
      }
      const all = rows[desc.collection] ?? [];
      let out = all.filter((r) => matches(r, desc.query?.filter));
      if (desc.query?.sort?.[0] === "-date_created") {
        out = [...out].sort(
          (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
        );
      }
      const limit = desc.query?.limit;
      return typeof limit === "number" && limit > 0 ? out.slice(0, limit) : out;
    },
  }));
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
});

const loadNotices = async () =>
  (await import("#core/server/api/ai/notices/index.get")).default as any;
const loadCheck = async () =>
  (await import("#core/server/api/ai/notices/check.post")).default as any;

/** A request old enough to be urgent, in whichever org is named. */
const agedRequest = (id: string, org: string) => ({
  id,
  organization: org,
  status: "open",
  title: `Leak ${id}`,
  assigned_to: "u1",
  date_created: daysAgo(60),
});

// ── GET /api/ai/notices ──────────────────────────────────────────────────────

describe("GET /api/ai/notices — org scope", () => {
  it("refuses a community the caller has no standing in", async () => {
    rows.hoa_requests = [agedRequest("r1", OTHER)];
    const handler = await loadNotices();
    await expect(handler({ __query: { orgId: OTHER } })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("refuses BEFORE reading anything from that community", async () => {
    // The important half. An authorization check that runs after the sweep
    // still leaks through timing and still costs the other org a full scan.
    rows.hoa_requests = [agedRequest("r1", OTHER)];
    const handler = await loadNotices();
    await handler({ __query: { orgId: OTHER } }).catch(() => {});
    expect(ops).toEqual([]);
  });

  it("requires an orgId rather than defaulting to one", async () => {
    const handler = await loadNotices();
    await expect(handler({ __query: {} })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("serves an admin their own community", async () => {
    rows.hoa_requests = [agedRequest("r1", HOME)];
    const handler = await loadNotices();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.notices.map((n: any) => n.id)).toContain("request-aged-r1");
    expect(res.total).toBe(res.notices.length);
  });

  it("serves a seated board member who is not an admin", async () => {
    isAdminOf = [];
    isBoardOf = [HOME];
    rows.hoa_requests = [agedRequest("r1", HOME)];
    const handler = await loadNotices();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.notices.length).toBeGreaterThan(0);
  });

  it("refuses a plain member — a notice names other people's arrears", async () => {
    isAdminOf = [];
    isBoardOf = [];
    const handler = await loadNotices();
    await expect(handler({ __query: { orgId: HOME } })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("never returns a row from another community, even to an admin of both", async () => {
    isAdminOf = [HOME, OTHER];
    rows.hoa_requests = [agedRequest("mine", HOME), agedRequest("theirs", OTHER)];
    const handler = await loadNotices();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.notices.every((n: any) => n.entityId !== "theirs")).toBe(true);
  });

  it("honours the limit without lying about the total", async () => {
    rows.hoa_requests = Array.from({ length: 8 }, (_, i) => agedRequest(`r${i}`, HOME));
    const handler = await loadNotices();
    const res = await handler({ __query: { orgId: HOME, limit: "3" } });
    expect(res.notices.length).toBe(3);
    expect(res.total).toBe(8);
  });

  it("scopes a focused request to that one entity", async () => {
    rows.hoa_requests = [agedRequest("r1", HOME), agedRequest("r2", HOME)];
    const handler = await loadNotices();
    const res = await handler({
      __query: { orgId: HOME, entityType: "request", entityId: "r1" },
    });
    expect(res.notices.every((n: any) => n.entityId === "r1")).toBe(true);
  });
});

// ── POST /api/ai/notices/check ───────────────────────────────────────────────

describe("POST /api/ai/notices/check — the cron", () => {
  const cronEvent = (body: any = {}) => ({
    __headers: { "x-cron-secret": "s3cret" },
    __body: body,
  });

  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
  });

  it("refuses an unauthenticated caller with no secret", async () => {
    vi.stubGlobal("requireUserSession", async () => {
      throw new Error("no session");
    });
    const handler = await loadCheck();
    await expect(handler({ __headers: {}, __body: {} })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("refuses a WRONG secret rather than falling through to open", async () => {
    vi.stubGlobal("requireUserSession", async () => {
      throw new Error("no session");
    });
    const handler = await loadCheck();
    await expect(
      handler({ __headers: { "x-cron-secret": "not-it" }, __body: {} })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("notifies once, then never again that month", async () => {
    rows.hoa_requests = [agedRequest("r1", HOME)];
    const handler = await loadCheck();

    const first = await handler(cronEvent({ orgId: HOME }));
    expect(first.results[0].escalated).toBe(1);
    expect(notified.length).toBe(1);
    expect(rows.ai_notice_history.length).toBe(1);

    const second = await handler(cronEvent({ orgId: HOME }));
    expect(second.results[0].escalated).toBe(0);
    expect(second.results[0].skipped).toBe(1);
    expect(notified.length).toBe(1); // still one
  });

  it("re-opens the gate in a new calendar month", async () => {
    rows.hoa_requests = [agedRequest("r1", HOME)];
    const handler = await loadCheck();
    await handler(cronEvent({ orgId: HOME }));
    expect(notified.length).toBe(1);

    // Same notice, different period — the stored hash no longer matches.
    rows.ai_notice_history = rows.ai_notice_history.map((r) => ({ ...r, period: "1999-01" }));
    await handler(cronEvent({ orgId: HOME }));
    expect(notified.length).toBe(2);
  });

  it("keys dedup per entity, so two aged requests both get through", async () => {
    rows.hoa_requests = [agedRequest("r1", HOME), agedRequest("r2", HOME)];
    const handler = await loadCheck();
    await handler(cronEvent({ orgId: HOME }));
    expect(notified.length).toBe(2);
  });

  it("keys dedup per notice type, so overdue and aged are independent", async () => {
    rows.hoa_requests = [
      { ...agedRequest("r1", HOME), due_date: daysAgo(20) },
    ];
    const handler = await loadCheck();
    const res = await handler(cronEvent({ orgId: HOME }));
    expect(res.results[0].escalated).toBe(2);
    expect(new Set(rows.ai_notice_history.map((r) => r.notice_type))).toEqual(
      new Set(["request-aged", "request-overdue"])
    );
  });

  it("escalates only urgent and high — medium and low never interrupt", async () => {
    // A vendor expiring in three weeks is worth seeing, not worth a push.
    rows.hoa_vendors = [
      {
        id: "v1", organization: HOME, status: "active", company: "Acme",
        active_until: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10),
      },
    ];
    const handler = await loadCheck();
    const res = await handler(cronEvent({ orgId: HOME }));
    expect(res.results[0].considered).toBe(1);
    expect(res.results[0].escalated).toBe(0);
    expect(notified.length).toBe(0);
  });

  it("sends under the ai_insight category, so the member's toggle governs it", async () => {
    rows.hoa_requests = [agedRequest("r1", HOME)];
    const handler = await loadCheck();
    await handler(cronEvent({ orgId: HOME }));
    expect(notified[0].category).toBe("ai_insight");
    expect(notified[0].organizationId).toBe(HOME);
  });

  it("notifies this community's admins and board, nobody else", async () => {
    rows.hoa_requests = [agedRequest("r1", HOME)];
    const handler = await loadCheck();
    await handler(cronEvent({ orgId: HOME }));
    expect(notified[0].recipientUserIds).toEqual(["admin-1", "board-1"]);
  });

  it("writes no history and sends nothing on a dry run", async () => {
    rows.hoa_requests = [agedRequest("r1", HOME)];
    const handler = await loadCheck();
    const res = await handler(cronEvent({ orgId: HOME, dryRun: true }));
    expect(res.dryRun).toBe(true);
    expect(res.results[0].escalated).toBe(1);
    expect(notified.length).toBe(0);
    expect(rows.ai_notice_history.length).toBe(0);
  });

  it("still sends when the dedup ledger is missing, and says so loudly", async () => {
    historyAvailable = false;
    rows.hoa_requests = [agedRequest("r1", HOME)];
    const handler = await loadCheck();
    const res = await handler(cronEvent({ orgId: HOME }));
    expect(res.dedup).toBe("unavailable");
    expect(notified.length).toBe(1);
    expect(warnings.join(" ")).toContain("ai_notice_history");
    // …and, being unable to remember, it repeats. That is the documented
    // trade: an absent ledger must never silence an urgent notice.
    await handler(cronEvent({ orgId: HOME }));
    expect(notified.length).toBe(2);
  });

  it("scopes a whole-platform run per community", async () => {
    rows.hoa_organizations = [{ id: HOME, name: "Home" }, { id: OTHER, name: "Other" }];
    rows.hoa_requests = [agedRequest("r1", HOME), agedRequest("r2", OTHER)];
    const handler = await loadCheck();
    const res = await handler(cronEvent({}));
    expect(res.organizations).toBe(2);
    for (const call of notified) {
      const forHome = call.organizationId === HOME;
      expect(call.subject).toContain(forHome ? "r1" : "r2");
    }
  });
});

describe("the dedup key itself", () => {
  it("strips the entity id to get a stable type, and survives a retitle", async () => {
    const { noticeTypeOf, noticeHash, periodKey } = await import(
      "#core/server/api/ai/notices/check.post"
    );
    const base = { id: "request-aged-abc", entityType: "request", entityId: "abc" } as any;
    expect(noticeTypeOf(base)).toBe("request-aged");

    const period = periodKey(new Date("2026-08-24T12:00:00Z"));
    expect(period).toBe("2026-08");

    const retitled = { ...base, title: "completely different" };
    expect(noticeHash(retitled, period)).toBe(noticeHash(base, period));
  });

  it("gives different entities and different months different keys", async () => {
    const { noticeHash } = await import("#core/server/api/ai/notices/check.post");
    const a = { id: "request-aged-abc", entityType: "request", entityId: "abc" } as any;
    const b = { id: "request-aged-def", entityType: "request", entityId: "def" } as any;
    expect(noticeHash(a, "2026-08")).not.toBe(noticeHash(b, "2026-08"));
    expect(noticeHash(a, "2026-08")).not.toBe(noticeHash(a, "2026-09"));
  });

  it("rolls the period on the calendar boundary, not 30 days later", async () => {
    const { periodKey } = await import("#core/server/api/ai/notices/check.post");
    expect(periodKey(new Date("2026-08-31T23:59:59Z"))).toBe("2026-08");
    expect(periodKey(new Date("2026-09-01T00:00:00Z"))).toBe("2026-09");
  });
});

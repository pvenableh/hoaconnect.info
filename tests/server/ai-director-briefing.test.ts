/**
 * GET /api/ai/director/briefing — the read-only door onto a saved briefing
 * (Round 2, Phase 7).
 *
 * This route exists for one reason, and the tests are shaped around it: the
 * stacks home wants briefing headlines, and the only endpoint that could give
 * it any — `POST /api/ai/director/plan` — DRAFTS when the cache is cold, which
 * costs the community credits. A dashboard that bills on mount is the worst
 * thing Phase 7 could ship, so the read was split from the write.
 *
 * Three things are asserted:
 *
 * 1. **Org scope**, and before a row is read. A briefing names other people's
 *    arrears; an admin of one community must not be able to name a bare orgId
 *    and read another's.
 * 2. **A cold cache is `null`, not a draft.** No wallet lookup, no model call —
 *    the only collection this handler ever touches is the briefings store.
 * 3. **The TTL still applies.** A briefing older than the window is not served,
 *    the same rule the Board Room's cached path follows, because the two read
 *    through the same loader.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query?: unknown) => ({ op: "read", collection, query }),
  createItem: (collection: string, payload: unknown) => ({ op: "create", collection, payload }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";

type Op = { op: string; collection: string; [k: string]: any };

let ops: Op[];
let rows: Record<string, any[]>;
let isAdminOf: string[];
let isBoardOf: string[];

/** Enough of Directus's filter language for what this route sends. */
function matches(row: any, filter: any): boolean {
  if (!filter) return true;
  if (Array.isArray(filter._and)) return filter._and.every((f: any) => matches(row, f));
  return Object.entries(filter).every(([field, cond]: [string, any]) => {
    const v = row[field];
    if (cond?._eq !== undefined) return String(v) === String(cond._eq);
    if (cond?._gte !== undefined) return String(v) >= String(cond._gte);
    return true;
  });
}

beforeEach(() => {
  vi.resetModules();
  ops = [];
  isAdminOf = [HOME];
  isBoardOf = [];
  rows = { hoa_director_briefings: [] };

  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: ME }));
  vi.stubGlobal("checkAdminAccess", async (_e: any, orgId: string) => ({
    isAdmin: isAdminOf.includes(orgId),
  }));
  vi.stubGlobal("isActiveBoardMember", async (_d: any, _u: string, orgId: string) =>
    isBoardOf.includes(orgId)
  );
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      ops.push(desc);
      const all = (rows[desc.collection] ||= []);
      if (desc.op === "read") {
        const out = all
          .filter((r) => matches(r, desc.query?.filter))
          .sort((a, b) => String(b.date_created).localeCompare(String(a.date_created)));
        const limit = desc.query?.limit;
        return typeof limit === "number" && limit > 0 ? out.slice(0, limit) : out;
      }
      return null;
    },
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const route = async () =>
  (await import("#core/server/api/ai/director/briefing.get")).default as any;

const briefing = (over: Record<string, any> = {}) => ({
  id: "b1",
  organization: HOME,
  cache_key: "org::::",
  plan_id: "plan-1",
  intro: "The pool pump has been down for eleven days.",
  points: ["Pool pump down 11 days", "Two invoices past due"],
  money: null,
  agenda: null,
  step_count: 2,
  date_created: new Date().toISOString(),
  ...over,
});

describe("GET /api/ai/director/briefing", () => {
  it("requires an orgId", async () => {
    const handler = await route();
    await expect(handler({ __query: {} })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses a community the caller has no standing in — before reading a row", async () => {
    rows.hoa_director_briefings = [briefing({ organization: OTHER })];
    const handler = await route();
    await expect(handler({ __query: { orgId: OTHER } })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(ops).toHaveLength(0);
  });

  it("serves a seated board member who is not an admin", async () => {
    isAdminOf = [];
    isBoardOf = [HOME];
    rows.hoa_director_briefings = [briefing()];
    const handler = await route();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.briefing?.points).toEqual(["Pool pump down 11 days", "Two invoices past due"]);
  });

  it("returns the saved briefing's headlines", async () => {
    rows.hoa_director_briefings = [briefing()];
    const handler = await route();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.briefing).toMatchObject({
      planId: "plan-1",
      stepCount: 2,
      intro: "The pool pump has been down for eleven days.",
    });
    expect(res.cacheKey).toBe("org::::");
  });

  it("returns null on a cold cache rather than drafting one", async () => {
    const handler = await route();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.briefing).toBeNull();
    // The ONLY collection this handler may touch. A wallet read or an
    // ai_transactions write here would mean the home page can spend money.
    expect(ops.map((o) => o.collection)).toEqual(["hoa_director_briefings"]);
    expect(ops.every((o) => o.op === "read")).toBe(true);
  });

  it("does not serve a briefing older than the TTL", async () => {
    rows.hoa_director_briefings = [
      briefing({ date_created: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() }),
    ];
    const handler = await route();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.briefing).toBeNull();
  });

  it("reads only this community's briefings, never another's", async () => {
    rows.hoa_director_briefings = [
      briefing({ id: "b-other", organization: OTHER, points: ["Someone else's arrears"] }),
      briefing(),
    ];
    const handler = await route();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.briefing?.points).not.toContain("Someone else's arrears");
    const filter = JSON.stringify(ops[0]?.query?.filter);
    expect(filter).toContain(HOME);
  });

  it("keys an entity-scoped read separately from the community-wide one", async () => {
    rows.hoa_director_briefings = [
      briefing({ cache_key: "entity:hoa_requests:r1::::", points: ["Just this request"] }),
      briefing({ id: "b-org", points: ["The whole association"] }),
    ];
    const handler = await route();
    const scoped = await handler({
      __query: { orgId: HOME, entityType: "hoa_requests", entityId: "r1" },
    });
    expect(scoped.briefing?.points).toEqual(["Just this request"]);

    const wide = await handler({ __query: { orgId: HOME } });
    expect(wide.briefing?.points).toEqual(["The whole association"]);
  });
});

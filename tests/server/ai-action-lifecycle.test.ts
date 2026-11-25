/**
 * Phase 5's three action-lifecycle endpoints, and the one property that must
 * survive all of them.
 *
 * `bulk` is the dangerous one, and not because of what it does — because of
 * what someone might make it do later. It exists to approve several small
 * internal proposals in one gesture, and the temptation is to give it its own
 * fast path. It has none: every id goes through the real `decideAiAction`, the
 * same function the single-row route calls, which is why these tests exercise
 * the REAL `core/server/utils/ai-actions` rather than a mock of it. If someone
 * reimplements approval inside the endpoint, the assertions about pending
 * guards, cross-org 404s and executor dispatch stop being satisfied by
 * accident.
 *
 * `expire-stale` fails in the opposite direction: it is a sweep, and a sweep
 * that touches one row too many rewrites history. It may only ever move
 * `pending` rows, and only past the window.
 *
 * `trust` reads counts and writes nothing, so its only real risk is answering
 * about a community the caller has no standing in.
 *
 * And underneath all three: **the outbound cap is tier-independent.** At
 * autonomy tier 3 — "full internal autonomy", the highest the dial goes — an
 * outbound proposal still lands `pending`. That is Risk 4 in the plan, asserted
 * here against the live `ACTION_CATALOG` rather than a copied list.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { cronSecretMatches } from "#core/server/utils/cron-auth";

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query?: unknown) => ({
    op: "readOne",
    collection,
    id,
    query,
  }),
  readItems: (collection: string, query?: unknown) => ({ op: "read", collection, query }),
  readUsers: (query?: unknown) => ({ op: "read", collection: "directus_users", query }),
  createItem: (collection: string, payload: unknown) => ({ op: "create", collection, payload }),
  updateItem: (collection: string, id: string, payload: unknown) => ({
    op: "updateOne",
    collection,
    id,
    payload,
  }),
  updateItems: (collection: string, ids: string[], payload: unknown) => ({
    op: "updateMany",
    collection,
    ids,
    payload,
  }),
  deleteItem: (collection: string, id: string) => ({ op: "delete", collection, id }),
  aggregate: (collection: string, query: unknown) => ({ op: "aggregate", collection, query }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";

type Op = { op: string; collection: string; [k: string]: any };

let ops: Op[];
let rows: Record<string, any[]>;
let authorizedOrgs: string[];
let ledger: any[];
let seq: number;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function matches(row: any, filter: any): boolean {
  if (!filter) return true;
  if (Array.isArray(filter._and)) return filter._and.every((f: any) => matches(row, f));
  return Object.entries(filter).every(([field, cond]: [string, any]) => {
    if (field === "_and") return true;
    const v = row[field];
    if (cond?._eq !== undefined) return String(v) === String(cond._eq);
    if (cond?._neq !== undefined) return String(v) !== String(cond._neq);
    if (cond?._in !== undefined) return (cond._in as any[]).map(String).includes(String(v));
    if (cond?._lte !== undefined) return String(v) <= String(cond._lte);
    if (cond?._gt !== undefined) return Number(v) > Number(cond._gt);
    return true;
  });
}

/** A pending proposal row, ready to be decided. */
function pendingAction(): any {
  return {
    id: `act-${++seq}`,
    organization: HOME,
    action_type: "create_task",
    status: "pending",
    category: "internal",
    risk: "low",
    outbound: false,
    payload: { title: "Chase the roofer" },
    title: "Create task “Chase the roofer”",
    entity_type: null,
    entity_id: null,
    date_created: daysAgo(1),
  };
}

beforeEach(() => {
  vi.resetModules();
  ops = [];
  ledger = [];
  seq = 0;
  authorizedOrgs = [HOME];
  rows = {
    ai_actions: [],
    hoa_tasks: [],
    hoa_emails: [],
    hoa_organizations: [{ id: HOME, name: "Home" }],
    directus_users: [{ id: ME, first_name: "Dana", last_name: "Ruiz", email: "d@example.com" }],
  };
  delete process.env.AI_ACTION_EXPIRY_DAYS;
  delete process.env.CRON_SECRET;

  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("readBody", async (e: any) => e?.__body ?? {});
  vi.stubGlobal("getHeader", (e: any, k: string) => e?.__headers?.[k]);
  // The REAL implementation, not a stand-in: these are auth tests, and a
  // stubbed-true helper would assert nothing. It reads through the stubbed
  // getHeader above.
  vi.stubGlobal("cronSecretMatches", cronSecretMatches);
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));
  vi.stubGlobal("requireUserSession", async (e: any) => {
    if (e?.__anonymous) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return { user: { id: ME } };
  });
  vi.stubGlobal("requireOrgComposeAccess", async (_e: any, orgId: string) => {
    if (!authorizedOrgs.includes(orgId)) {
      throw Object.assign(new Error("Not authorized for this organization"), { statusCode: 403 });
    }
    return ["admin"];
  });
  // trust.get.ts reads with the caller's standing in one batch; here the
  // batch is the same specs read one by one against the fake.
  vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, _orgId: string, specs: any) =>
    (await import("#core/server/utils/directus-graphql")).readItemsBatchRest(specs)
  );
  vi.stubGlobal("announceEvent", async () => {});
  vi.stubGlobal("writeAuditEntry", async (entry: any) => {
    ledger.push(entry);
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      ops.push(desc);
      const all = (rows[desc.collection] ||= []);
      switch (desc.op) {
        case "readOne":
          return all.find((r) => String(r.id) === String(desc.id)) ?? null;
        case "read": {
          let out = all.filter((r) => matches(r, desc.query?.filter));
          const { limit, offset } = desc.query ?? {};
          if (typeof offset === "number") out = out.slice(offset);
          return typeof limit === "number" && limit > 0 ? out.slice(0, limit) : out;
        }
        case "create": {
          const created = { id: `new-${ops.length}`, ...desc.payload };
          all.push(created);
          return created;
        }
        case "updateOne": {
          const row = all.find((r) => String(r.id) === String(desc.id));
          if (row) Object.assign(row, desc.payload);
          return row;
        }
        case "updateMany": {
          const touched: any[] = [];
          for (const id of desc.ids as string[]) {
            const row = all.find((r) => String(r.id) === String(id));
            if (row) {
              Object.assign(row, desc.payload);
              touched.push(row);
            }
          }
          return touched;
        }
        case "delete":
          rows[desc.collection] = all.filter((r) => String(r.id) !== String(desc.id));
          return null;
        case "aggregate":
          // The SDK nests the filter under `query` for aggregates, not beside it.
          return [{ count: all.filter((r) => matches(r, desc.query?.query?.filter)).length }];
        default:
          return null;
      }
    },
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const loadBulk = async () => (await import("#core/server/api/ai/actions/bulk.post")).default as any;
const loadExpire = async () =>
  (await import("#core/server/api/ai/actions/expire-stale")).default as any;
const loadTrust = async () =>
  (await import("#core/server/api/ai/actions/trust.get")).default as any;

// ── POST /api/ai/actions/bulk ────────────────────────────────────────────────

describe("POST /api/ai/actions/bulk — org scope", () => {
  it("refuses a community the caller has no standing in", async () => {
    rows.ai_actions = [{ ...pendingAction(), organization: OTHER }];
    const handler = await loadBulk();
    await expect(
      handler({ __body: { orgId: OTHER, ids: ["act-1"], decision: "approve" } })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuses BEFORE touching a single row", async () => {
    rows.ai_actions = [{ ...pendingAction(), organization: OTHER }];
    const handler = await loadBulk();
    await handler({ __body: { orgId: OTHER, ids: ["act-1"], decision: "approve" } }).catch(() => {});
    expect(ops).toEqual([]);
  });

  it("requires an orgId rather than defaulting to one", async () => {
    const handler = await loadBulk();
    await expect(handler({ __body: { ids: ["a"], decision: "approve" } })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("reports a foreign row as a per-item 404 and leaves it untouched", async () => {
    // The caller is authorized for HOME and names HOME, but slips in an id that
    // belongs to OTHER. It must fail as that row's outcome, not as a leak.
    const mine = pendingAction();
    const theirs = { ...pendingAction(), organization: OTHER };
    rows.ai_actions = [mine, theirs];
    const handler = await loadBulk();
    const res = await handler({
      __body: { orgId: HOME, ids: [mine.id, theirs.id], decision: "approve" },
    });
    expect(res.approved).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.results.find((r: any) => r.id === theirs.id).error).toMatch(/not found/i);
    expect(rows.ai_actions.find((r) => r.id === theirs.id).status).toBe("pending");
  });
});

describe("POST /api/ai/actions/bulk — the shape of the answer", () => {
  it("validates the decision word", async () => {
    const handler = await loadBulk();
    await expect(
      handler({ __body: { orgId: HOME, ids: ["a"], decision: "maybe" } })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("requires a non-empty id list", async () => {
    const handler = await loadBulk();
    await expect(handler({ __body: { orgId: HOME, ids: [], decision: "approve" } })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("refuses an oversized batch instead of half-doing it", async () => {
    const handler = await loadBulk();
    const ids = Array.from({ length: 201 }, (_, i) => `x${i}`);
    await expect(handler({ __body: { orgId: HOME, ids, decision: "approve" } })).rejects.toMatchObject(
      { statusCode: 400 }
    );
  });

  it("de-dupes ids so a repeat is not reported as a failure", async () => {
    const a = pendingAction();
    rows.ai_actions = [a];
    const handler = await loadBulk();
    const res = await handler({
      __body: { orgId: HOME, ids: [a.id, a.id, a.id], decision: "approve" },
    });
    expect(res.results).toHaveLength(1);
    expect(res.approved).toBe(1);
    expect(res.failed).toBe(0);
  });

  it("never fails as a whole when one row is already resolved", async () => {
    const live = pendingAction();
    const done = { ...pendingAction(), status: "executed" };
    rows.ai_actions = [live, done];
    const handler = await loadBulk();
    const res = await handler({
      __body: { orgId: HOME, ids: [live.id, done.id], decision: "approve" },
    });
    expect(res.approved).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.results.find((r: any) => r.id === done.id).error).toMatch(/already executed/i);
  });
});

describe("POST /api/ai/actions/bulk — it delegates approval, it does not implement it", () => {
  it("runs the real executor and marks the row executed", async () => {
    const a = pendingAction();
    rows.ai_actions = [a];
    const handler = await loadBulk();
    await handler({ __body: { orgId: HOME, ids: [a.id], decision: "approve" } });
    expect(rows.ai_actions[0].status).toBe("executed");
    // The executor actually wrote its row — this is the real ai-actions module.
    expect(rows.hoa_tasks).toHaveLength(1);
    expect(rows.hoa_tasks[0].title).toBe("Chase the roofer");
  });

  it("attributes the decision to the person who made it", async () => {
    const a = pendingAction();
    rows.ai_actions = [a];
    const handler = await loadBulk();
    await handler({ __body: { orgId: HOME, ids: [a.id], decision: "approve" } });
    expect(rows.ai_actions[0].approved_by).toBe(ME);
  });

  it("writes the community ledger entry, once per row, as a HUMAN approval", async () => {
    // The ledger is written inside decideAiAction. If bulk ever grew its own
    // approval path, this is what would silently stop happening.
    const a = pendingAction();
    const b = pendingAction();
    rows.ai_actions = [a, b];
    const handler = await loadBulk();
    await handler({ __body: { orgId: HOME, ids: [a.id, b.id], decision: "approve" } });
    expect(ledger).toHaveLength(2);
    expect(JSON.stringify(ledger)).not.toMatch(/automatic/);
  });

  it("rejects without running anything", async () => {
    const a = pendingAction();
    rows.ai_actions = [a];
    const handler = await loadBulk();
    const res = await handler({ __body: { orgId: HOME, ids: [a.id], decision: "reject" } });
    expect(res.rejected).toBe(1);
    expect(rows.ai_actions[0].status).toBe("rejected");
    expect(rows.hoa_tasks).toHaveLength(0);
  });
});

// ── The cap ──────────────────────────────────────────────────────────────────

describe("the outbound cap survives every path, at the top of the dial", () => {
  it("leaves an outbound proposal PENDING at tier 3", async () => {
    const { proposeAction } = await import("#core/server/utils/ai-actions");
    const res = await proposeAction(
      "send_email",
      { subject: "Pool closure", body_html: "<p>Closed Friday.</p>", audience: "all" },
      { orgId: HOME, userId: ME, autonomyTier: 3 }
    );
    expect(res.success).toBe(true);
    expect(res.status).toBe("pending");
    expect(rows.ai_actions).toHaveLength(1);
    expect(rows.ai_actions[0].status).toBe("pending");
    // Nothing was drafted, sent, or otherwise brought into existence.
    expect(rows.hoa_emails).toHaveLength(0);
  });

  it("auto-runs the internal equivalent at the same tier — so the test above is about outbound, not about tier 3 being inert", async () => {
    const { proposeAction } = await import("#core/server/utils/ai-actions");
    const res = await proposeAction(
      "create_task",
      { title: "Order chlorine" },
      { orgId: HOME, userId: ME, autonomyTier: 3 }
    );
    expect(res.status).toBe("executed");
    expect(rows.hoa_tasks).toHaveLength(1);
  });

  it("attributes an auto-run to nobody, so it cannot inflate a trust streak", async () => {
    const { proposeAction } = await import("#core/server/utils/ai-actions");
    await proposeAction(
      "create_task",
      { title: "Order chlorine" },
      { orgId: HOME, userId: ME, autonomyTier: 3 }
    );
    expect(rows.ai_actions[0].status).toBe("executed");
    expect(rows.ai_actions[0].approved_by).toBeNull();
    expect(JSON.stringify(ledger)).toMatch(/automatic/);
  });

  it("still lets a PERSON approve the outbound one through bulk — that is a decision, not a bypass", async () => {
    const { proposeAction } = await import("#core/server/utils/ai-actions");
    await proposeAction(
      "send_email",
      { subject: "Pool closure", body_html: "<p>Closed Friday.</p>", audience: "all" },
      { orgId: HOME, userId: ME, autonomyTier: 3 }
    );
    const id = rows.ai_actions[0].id;
    const handler = await loadBulk();
    const res = await handler({ __body: { orgId: HOME, ids: [id], decision: "approve" } });
    expect(res.approved).toBe(1);
    expect(rows.ai_actions[0].approved_by).toBe(ME);
    // …and even then the executor writes a DRAFT. Nothing leaves the building
    // without a further, separate human act.
    expect(rows.hoa_emails).toHaveLength(1);
    expect(rows.hoa_emails[0].status).toBe("draft");
  });

  it("refuses to auto-run outbound at tier 3 no matter which outbound action it is", async () => {
    const { ACTION_CATALOG, shouldAutoApprove } = await import("#core/shared/ai/actions");
    const outbound = ACTION_CATALOG.filter((a) => a.outbound).map((a) => a.key);
    expect(outbound).toEqual(expect.arrayContaining(["send_email", "post_announcement", "notify_board"]));
    for (const key of outbound) expect(shouldAutoApprove(key, 3)).toBe(false);
  });
});

// ── POST /api/ai/actions/expire-stale ────────────────────────────────────────

describe("POST /api/ai/actions/expire-stale — who may sweep what", () => {
  it("refuses an anonymous caller with no cron secret", async () => {
    const handler = await loadExpire();
    await expect(handler({ __anonymous: true, __body: { orgId: HOME } })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("refuses a session sweeping a community it has no standing in", async () => {
    rows.ai_actions = [{ ...pendingAction(), organization: OTHER, date_created: daysAgo(60) }];
    const handler = await loadExpire();
    await expect(handler({ __body: { orgId: OTHER } })).rejects.toMatchObject({ statusCode: 403 });
    expect(rows.ai_actions[0].status).toBe("pending");
  });

  it("refuses a session an org-wide sweep — that is the cron's privilege alone", async () => {
    const handler = await loadExpire();
    await expect(handler({ __body: {} })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("lets the cron secret sweep every community", async () => {
    process.env.CRON_SECRET = "s3cret";
    rows.ai_actions = [
      { ...pendingAction(), organization: HOME, date_created: daysAgo(60) },
      { ...pendingAction(), organization: OTHER, date_created: daysAgo(60) },
    ];
    const handler = await loadExpire();
    const res = await handler({ __headers: { "x-cron-secret": "s3cret" }, __body: {} });
    expect(res.expired).toBe(2);
    expect(res.scope).toBe("all");
  });

  it("treats a wrong secret as no secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    const handler = await loadExpire();
    await expect(
      handler({ __anonymous: true, __headers: { "x-cron-secret": "nope" }, __body: {} })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("POST /api/ai/actions/expire-stale — what it is allowed to touch", () => {
  it("expires only what is past the window", async () => {
    const old = { ...pendingAction(), date_created: daysAgo(20) };
    const fresh = { ...pendingAction(), date_created: daysAgo(3) };
    rows.ai_actions = [old, fresh];
    const handler = await loadExpire();
    const res = await handler({ __body: { orgId: HOME } });
    expect(res.expired).toBe(1);
    expect(res.windowDays).toBe(14);
    expect(rows.ai_actions.find((r) => r.id === old.id).status).toBe("rejected");
    expect(rows.ai_actions.find((r) => r.id === fresh.id).status).toBe("pending");
  });

  it("never rewrites a row that already happened", async () => {
    const done = { ...pendingAction(), status: "executed", date_created: daysAgo(90) };
    const broke = { ...pendingAction(), status: "failed", date_created: daysAgo(90) };
    const said_no = { ...pendingAction(), status: "rejected", date_created: daysAgo(90) };
    rows.ai_actions = [done, broke, said_no];
    const handler = await loadExpire();
    const res = await handler({ __body: { orgId: HOME } });
    expect(res.expired).toBe(0);
    expect(rows.ai_actions.map((r) => r.status)).toEqual(["executed", "failed", "rejected"]);
  });

  it("tags the row so the card can say Expired rather than Rejected", async () => {
    // The predicate the card renders from is `isAutoExpired`, shared, so this
    // asserts the actual reader against the actual writer rather than restating
    // a magic string in two places and hoping they stay equal.
    const { isAutoExpired } = await import("#core/shared/ai/actions");
    rows.ai_actions = [{ ...pendingAction(), date_created: daysAgo(60) }];
    const handler = await loadExpire();
    await handler({ __body: { orgId: HOME } });
    const row = rows.ai_actions[0];
    expect(row.status).toBe("rejected");
    expect(row.error_message).toBe("auto-expired (stale 14 days)");
    expect(row.result).toEqual({ expired: true });
    expect(isAutoExpired(row)).toBe(true);
  });

  it("does not call a genuinely rejected proposal expired", async () => {
    const { isAutoExpired } = await import("#core/shared/ai/actions");
    const a = pendingAction();
    rows.ai_actions = [a];
    const bulk = await loadBulk();
    await bulk({ __body: { orgId: HOME, ids: [a.id], decision: "reject" } });
    expect(rows.ai_actions[0].status).toBe("rejected");
    expect(isAutoExpired(rows.ai_actions[0])).toBe(false);
  });

  it("is idempotent — the second run finds nothing left to do", async () => {
    rows.ai_actions = [
      { ...pendingAction(), date_created: daysAgo(60) },
      { ...pendingAction(), date_created: daysAgo(60) },
    ];
    const handler = await loadExpire();
    const first = await handler({ __body: { orgId: HOME } });
    const second = await handler({ __body: { orgId: HOME } });
    expect(first.expired).toBe(2);
    expect(second.expired).toBe(0);
    // …and the second run did not re-stamp them with a fresh expiry message.
    expect(rows.ai_actions.every((r) => r.result?.expired === true)).toBe(true);
  });

  it("stays inside the named community", async () => {
    authorizedOrgs = [HOME, OTHER];
    rows.ai_actions = [
      { ...pendingAction(), organization: HOME, date_created: daysAgo(60) },
      { ...pendingAction(), organization: OTHER, date_created: daysAgo(60) },
    ];
    const handler = await loadExpire();
    const res = await handler({ __body: { orgId: HOME } });
    expect(res.expired).toBe(1);
    expect(rows.ai_actions.find((r) => r.organization === OTHER).status).toBe("pending");
  });

  it("honours a configured window", async () => {
    process.env.AI_ACTION_EXPIRY_DAYS = "3";
    rows.ai_actions = [{ ...pendingAction(), date_created: daysAgo(5) }];
    const handler = await loadExpire();
    const res = await handler({ __body: { orgId: HOME } });
    expect(res.windowDays).toBe(3);
    expect(res.expired).toBe(1);
  });

  it("counts without changing anything on a dry run", async () => {
    rows.ai_actions = [
      { ...pendingAction(), date_created: daysAgo(60) },
      { ...pendingAction(), date_created: daysAgo(60) },
    ];
    const handler = await loadExpire();
    const res = await handler({ __body: { orgId: HOME, dryRun: true } });
    expect(res.expired).toBe(2);
    expect(res.dryRun).toBe(true);
    expect(rows.ai_actions.every((r) => r.status === "pending")).toBe(true);
  });
});

// ── GET /api/ai/actions/trust ────────────────────────────────────────────────

describe("GET /api/ai/actions/trust", () => {
  it("refuses a community the caller has no standing in", async () => {
    const handler = await loadTrust();
    await expect(handler({ __query: { orgId: OTHER } })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("requires an orgId", async () => {
    const handler = await loadTrust();
    await expect(handler({ __query: {} })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("counts only THIS person's decisions in THIS community", async () => {
    rows.ai_actions = [
      { ...pendingAction(), status: "executed", approved_by: ME },
      { ...pendingAction(), status: "executed", approved_by: ME },
      { ...pendingAction(), status: "executed", approved_by: "someone-else" },
      { ...pendingAction(), status: "executed", approved_by: ME, organization: OTHER },
      { ...pendingAction(), status: "rejected", approved_by: ME },
      // An auto-run: no approver at all, and so invisible to the streak.
      { ...pendingAction(), status: "executed", approved_by: null },
    ];
    const handler = await loadTrust();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.approved).toBe(2);
    expect(res.rejected).toBe(1);
  });

  it("carries the org's tier and a nudge computed against it", async () => {
    rows.hoa_organizations = [{ id: HOME, name: "Home", ai_autonomy_tier: 0 }];
    rows.ai_actions = Array.from({ length: 4 }, () => ({
      ...pendingAction(),
      status: "executed",
      approved_by: ME,
    }));
    const handler = await loadTrust();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.tier).toBe(0);
    expect(res.nudge.suggest).toBe(true);
    expect(res.nudge.earnedTier).toBe(1);
  });

  it("suggests nothing when the dial already exceeds the record", async () => {
    rows.hoa_organizations = [{ id: HOME, name: "Home", ai_autonomy_tier: 3 }];
    rows.ai_actions = [{ ...pendingAction(), status: "executed", approved_by: ME }];
    const handler = await loadTrust();
    const res = await handler({ __query: { orgId: HOME } });
    expect(res.tier).toBe(3);
    expect(res.nudge.suggest).toBe(false);
  });

  it("reads the tier and both counts in one batch with the caller's standing", async () => {
    const seen: string[][] = [];
    const { readItemsBatchRest } = await import("#core/server/utils/directus-graphql");
    vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, orgId: string, specs: any) => {
      expect(orgId).toBe(HOME);
      seen.push(Object.keys(specs));
      return readItemsBatchRest(specs);
    });
    const handler = await loadTrust();
    await handler({ __query: { orgId: HOME } });
    expect(seen).toEqual([["tr_org", "tr_approved", "tr_rejected"]]);
  });

  it("answers the same, one read at a time, when the batch fails", async () => {
    rows.hoa_organizations = [{ id: HOME, name: "Home", ai_autonomy_tier: 2 }];
    rows.ai_actions = [
      { ...pendingAction(), status: "executed", approved_by: ME },
      { ...pendingAction(), status: "rejected", approved_by: ME },
    ];
    const handler = await loadTrust();
    const ok = await handler({ __query: { orgId: HOME } });
    vi.stubGlobal("batchWithAccessSnapshot", async () => {
      throw new Error("graphql down");
    });
    expect(await handler({ __query: { orgId: HOME } })).toEqual(ok);
    expect(ok).toMatchObject({ approved: 1, rejected: 1, tier: 2 });
  });

  it("refuses with no data when the batch has read for a stranger", async () => {
    rows.ai_actions = [{ ...pendingAction(), status: "executed", approved_by: ME, organization: OTHER }];
    const handler = await loadTrust();
    const err = await handler({ __query: { orgId: OTHER } }).catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(err)).not.toContain("approved");
  });

  it("writes nothing at all", async () => {
    rows.ai_actions = [{ ...pendingAction(), status: "executed", approved_by: ME }];
    const handler = await loadTrust();
    await handler({ __query: { orgId: HOME } });
    expect(ops.some((o) => ["create", "updateOne", "updateMany", "delete"].includes(o.op))).toBe(
      false
    );
  });
});

// ── GET /api/ai/actions ──────────────────────────────────────────────────────

const loadFeed = async () => (await import("#core/server/api/ai/actions/index.get")).default as any;

describe("GET /api/ai/actions", () => {
  it("requires an orgId and refuses a community the caller has no standing in", async () => {
    const handler = await loadFeed();
    await expect(handler({ __query: {} })).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler({ __query: { orgId: OTHER } })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("reads the feed in one batch with the caller's standing", async () => {
    const seen: string[][] = [];
    const { readItemsBatchRest } = await import("#core/server/utils/directus-graphql");
    vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, orgId: string, specs: any) => {
      expect(orgId).toBe(HOME);
      seen.push(Object.keys(specs));
      return readItemsBatchRest(specs);
    });
    const handler = await loadFeed();
    await handler({ __query: { orgId: HOME } });
    expect(seen).toEqual([["al_rows"]]);
  });

  it("answers the same, read on its own, when the batch fails", async () => {
    rows.ai_actions = [
      { ...pendingAction(), preview: JSON.stringify({ kind: "task" }) },
      { ...pendingAction(), status: "executed" },
      { ...pendingAction(), organization: OTHER },
    ];
    const handler = await loadFeed();
    const ok = await handler({ __query: { orgId: HOME, status: "pending" } });
    vi.stubGlobal("batchWithAccessSnapshot", async () => {
      throw new Error("graphql down");
    });
    expect(await handler({ __query: { orgId: HOME, status: "pending" } })).toEqual(ok);
    expect(ok.actions.map((a: any) => a.id)).toEqual(["act-1"]);
    expect(ok.actions[0].preview).toEqual({ kind: "task" });
  });

  it("refuses with no rows when the batch has read for a stranger", async () => {
    rows.ai_actions = [{ ...pendingAction(), organization: OTHER }];
    const handler = await loadFeed();
    const err = await handler({ __query: { orgId: OTHER } }).catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(err)).not.toContain("Chase the roofer");
  });
});

// ── GET /api/ai/actions/pending-count ────────────────────────────────────────

const loadPending = async () => (await import("#core/server/api/ai/actions/pending-count.get")).default as any;

describe("GET /api/ai/actions/pending-count", () => {
  it("requires an orgId and refuses a community the caller has no standing in", async () => {
    const handler = await loadPending();
    await expect(handler({ __query: {} })).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler({ __query: { orgId: OTHER } })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("counts in one batch with the caller's standing", async () => {
    const seen: string[][] = [];
    const { readItemsBatchRest } = await import("#core/server/utils/directus-graphql");
    vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, orgId: string, specs: any) => {
      expect(orgId).toBe(HOME);
      seen.push(Object.keys(specs));
      return readItemsBatchRest(specs);
    });
    const handler = await loadPending();
    await handler({ __query: { orgId: HOME } });
    expect(seen).toEqual([["pc_count"]]);
  });

  it("answers the same, counted on its own, when the batch fails", async () => {
    rows.ai_actions = [pendingAction(), pendingAction(), { ...pendingAction(), status: "executed" }, { ...pendingAction(), organization: OTHER }];
    const handler = await loadPending();
    const ok = await handler({ __query: { orgId: HOME } });
    vi.stubGlobal("batchWithAccessSnapshot", async () => {
      throw new Error("graphql down");
    });
    expect(await handler({ __query: { orgId: HOME } })).toEqual(ok);
    expect(ok).toEqual({ count: 2 });
  });

  it("refuses with no count when the batch has read for a stranger", async () => {
    rows.ai_actions = [{ ...pendingAction(), organization: OTHER }];
    const handler = await loadPending();
    const err = await handler({ __query: { orgId: OTHER } }).catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(err)).not.toContain("count");
  });
});

// ── GET /api/ai/autonomy ─────────────────────────────────────────────────────

const loadAutonomy = async () => (await import("#core/server/api/ai/autonomy.get")).default as any;

describe("GET /api/ai/autonomy", () => {
  it("requires an orgId and refuses a community the caller has no standing in", async () => {
    const handler = await loadAutonomy();
    await expect(handler({ __query: {} })).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler({ __query: { orgId: OTHER } })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("reads the tier in one batch with the caller's standing", async () => {
    const seen: string[][] = [];
    const { readItemsBatchRest } = await import("#core/server/utils/directus-graphql");
    vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, orgId: string, specs: any) => {
      expect(orgId).toBe(HOME);
      seen.push(Object.keys(specs));
      return readItemsBatchRest(specs);
    });
    const handler = await loadAutonomy();
    await handler({ __query: { orgId: HOME } });
    expect(seen).toEqual([["at_org"]]);
  });

  it("answers the same, read on its own, when the batch fails", async () => {
    for (const [stored, tier] of [[2, 2], [9, 3], [null, 0]] as const) {
      rows.hoa_organizations = [{ id: HOME, name: "Home", ai_autonomy_tier: stored }];
      const handler = await loadAutonomy();
      vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, _o: string, specs: any) =>
        (await import("#core/server/utils/directus-graphql")).readItemsBatchRest(specs)
      );
      const ok = await handler({ __query: { orgId: HOME } });
      vi.stubGlobal("batchWithAccessSnapshot", async () => {
        throw new Error("graphql down");
      });
      expect(await handler({ __query: { orgId: HOME } })).toEqual(ok);
      expect(ok).toEqual({ tier });
    }
  });

  it("refuses with no tier when the batch has read for a stranger", async () => {
    rows.hoa_organizations.push({ id: OTHER, name: "Other", ai_autonomy_tier: 3 });
    const handler = await loadAutonomy();
    const err = await handler({ __query: { orgId: OTHER } }).catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(err)).not.toContain("tier");
  });
});

// ── GET /api/ai/conversations ────────────────────────────────────────────────

const loadConversations = async () => (await import("#core/server/api/ai/conversations.get")).default as any;

describe("GET /api/ai/conversations", () => {
  const convo = (id: string, extra: any = {}) => ({
    id,
    organization: HOME,
    user: ME,
    title: `Thread ${id}`,
    model: "m",
    date_created: daysAgo(2),
    date_updated: daysAgo(1),
    ...extra,
  });

  it("requires an orgId and refuses a community the caller has no standing in", async () => {
    const handler = await loadConversations();
    await expect(handler({ __query: {} })).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler({ __query: { orgId: OTHER } })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("reads the list in one batch with the caller's standing", async () => {
    const seen: string[][] = [];
    const { readItemsBatchRest } = await import("#core/server/utils/directus-graphql");
    vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, orgId: string, specs: any) => {
      expect(orgId).toBe(HOME);
      seen.push(Object.keys(specs));
      return readItemsBatchRest(specs);
    });
    const handler = await loadConversations();
    await handler({ __query: { orgId: HOME } });
    expect(seen).toEqual([["cv_rows"]]);
  });

  it("answers the same, read on its own, when the batch fails", async () => {
    rows.ai_conversations = [convo("c1"), convo("c2", { user: "someone-else" }), convo("c3", { organization: OTHER })];
    const handler = await loadConversations();
    const ok = await handler({ __query: { orgId: HOME } });
    vi.stubGlobal("batchWithAccessSnapshot", async () => {
      throw new Error("graphql down");
    });
    expect(await handler({ __query: { orgId: HOME } })).toEqual(ok);
    expect(ok.conversations.map((c: any) => c.id)).toEqual(["c1"]);
  });

  it("refuses with no rows when the batch has read for a stranger", async () => {
    rows.ai_conversations = [convo("c9", { organization: OTHER, title: "Secret thread" })];
    const handler = await loadConversations();
    const err = await handler({ __query: { orgId: OTHER } }).catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(err)).not.toContain("Secret thread");
  });
});

// ── GET /api/ai/suggestions ──────────────────────────────────────────────────

const loadSuggestions = async () => (await import("#core/server/api/ai/suggestions.get")).default as any;

describe("GET /api/ai/suggestions", () => {
  beforeEach(() => {
    vi.stubGlobal("isRagConfigured", () => true);
    rows.ai_doc_chunks = [{ id: "k1", organization: HOME, source_title: "Bylaws" }];
    rows.hoa_governance = [{ id: "g1", organization: HOME, status: "published", title: "Parking" }];
    rows.hoa_emails = [{ id: "e1", organization: HOME, status: "sent", subject: "Pool opening", sent_at: daysAgo(1) }];
  });

  it("grounds the chips in the community's document, rule and latest email", async () => {
    const handler = await loadSuggestions();
    expect(await handler({ __query: { orgId: HOME } })).toEqual({
      suggestions: [
        "Summarize “Bylaws”",
        "What do our rules say about Parking?",
        "What was “Pool opening” about?",
        "When is the next board meeting?",
      ],
    });
  });

  it("reads them in one batch with the caller's standing, and no document read without RAG", async () => {
    const seen: string[][] = [];
    const { readItemsBatchRest } = await import("#core/server/utils/directus-graphql");
    vi.stubGlobal("batchWithAccessSnapshot", async (_e: any, orgId: string, specs: any) => {
      expect(orgId).toBe(HOME);
      seen.push(Object.keys(specs));
      return readItemsBatchRest(specs);
    });
    const handler = await loadSuggestions();
    await handler({ __query: { orgId: HOME } });
    vi.stubGlobal("isRagConfigured", () => false);
    await handler({ __query: { orgId: HOME } });
    expect(seen).toEqual([
      ["sg_chunks", "sg_rules", "sg_emails"],
      ["sg_rules", "sg_emails"],
    ]);
  });

  it("answers the same, read one by one, when the batch fails; a failing read adds nothing", async () => {
    const handler = await loadSuggestions();
    const ok = await handler({ __query: { orgId: HOME, entityType: "vendor" } });
    vi.stubGlobal("batchWithAccessSnapshot", async () => {
      throw new Error("graphql down");
    });
    expect(await handler({ __query: { orgId: HOME, entityType: "vendor" } })).toEqual(ok);
    expect(ok.suggestions).toEqual([
      "What projects has this vendor worked on?",
      "Draft an email to this vendor",
      "Summarize “Bylaws”",
      "What do our rules say about Parking?",
    ]);
    const real = (globalThis as any).getTypedDirectus();
    vi.stubGlobal("getTypedDirectus", () => ({
      request: async (desc: any) => {
        if (desc.collection === "ai_doc_chunks") throw new Error("no such collection");
        return real.request(desc);
      },
    }));
    expect((await handler({ __query: { orgId: HOME } })).suggestions.slice(0, 2)).toEqual([
      "What do our rules say about Parking?",
      "What was “Pool opening” about?",
    ]);
  });

  it("refuses a stranger with no rows, though the batch has read them", async () => {
    rows.hoa_governance = [{ id: "g9", organization: OTHER, status: "published", title: "Secret rule" }];
    const handler = await loadSuggestions();
    const err = await handler({ __query: { orgId: OTHER } }).catch((e: any) => e);
    expect(err).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(err)).not.toContain("Secret rule");
  });
});

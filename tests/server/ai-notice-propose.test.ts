/**
 * POST /api/ai/notices/propose — the door Phase 5 opens between the deterministic
 * notices engine and the HITL queue.
 *
 * Everything worth testing here is about what the client is NOT trusted with.
 * The body carries a notice id. It does not carry an action type and it does not
 * carry a payload, because a client that could supply either could ask the
 * server to execute something no generator ever proposed. So the tests pin:
 *
 *   · a notice that does not exist cannot be acted on, at all;
 *   · a client-supplied action type is ignored — only the regenerated one runs;
 *   · the org gate refuses before anything is read;
 *   · a second tap converges on the proposal already waiting, rather than
 *     stacking a second identical task;
 *   · and the proposal goes through `proposeAction()`, so the trust dial —
 *     including its refusal to auto-run outbound work — is the same code that
 *     governs a proposal made in chat.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

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
  deleteItem: (collection: string, id: string) => ({ op: "delete", collection, id }),
  aggregate: (collection: string, query: unknown) => ({ op: "aggregate", collection, query }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";

type Op = { op: string; collection: string; [k: string]: any };

let ops: Op[];
let rows: Record<string, any[]>;
let isAdminOf: string[];
let isBoardOf: string[];

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
    if (cond?._gt !== undefined) return Number(v) > Number(cond._gt);
    if (cond?._nnull !== undefined) return cond._nnull ? v != null : v == null;
    return true;
  });
}

/** Old enough that the generators produce an aged notice with a proposal. */
const agedRequest = (id: string, org = HOME) => ({
  id,
  organization: org,
  status: "open",
  title: `Leak ${id}`,
  assigned_to: "u1",
  date_created: daysAgo(45),
});

beforeEach(() => {
  vi.resetModules();
  ops = [];
  isAdminOf = [HOME];
  isBoardOf = [];
  rows = {
    ai_actions: [],
    hoa_requests: [],
    hoa_members: [],
    hoa_projects: [],
    hoa_channels: [],
    hoa_channel_messages: [],
    hoa_vendors: [],
    hoa_meetings: [],
    hoa_tasks: [],
    payment_requests: [],
    ai_wallets: [],
    hoa_organizations: [{ id: HOME, name: "Home", ai_autonomy_tier: 0 }],
    directus_users: [{ id: ME, first_name: "Dana", last_name: "Ruiz", email: "d@example.com" }],
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
  vi.stubGlobal("announceEvent", async () => {});
  vi.stubGlobal("writeAuditEntry", async () => {});
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      ops.push(desc);
      const all = (rows[desc.collection] ||= []);
      switch (desc.op) {
        case "readOne":
          return all.find((r) => String(r.id) === String(desc.id)) ?? null;
        case "read": {
          const out = all.filter((r) => matches(r, desc.query?.filter));
          const limit = desc.query?.limit;
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
        case "aggregate":
          return [{ count: all.filter((r) => matches(r, desc.query?.query?.filter)).length }];
        default:
          return null;
      }
    },
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const loadPropose = async () =>
  (await import("#core/server/api/ai/notices/propose.post")).default as any;

/** The notice id the aged-request generator produces for `id`. */
const agedNoticeId = (id: string) => `request-aged-${id}`;

describe("POST /api/ai/notices/propose — org scope", () => {
  it("refuses a community the caller has no standing in", async () => {
    rows.hoa_requests = [agedRequest("r1", OTHER)];
    const handler = await loadPropose();
    await expect(
      handler({ __body: { orgId: OTHER, noticeId: agedNoticeId("r1") } })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuses before regenerating anything from that community", async () => {
    rows.hoa_requests = [agedRequest("r1", OTHER)];
    const handler = await loadPropose();
    await handler({ __body: { orgId: OTHER, noticeId: agedNoticeId("r1") } }).catch(() => {});
    expect(ops).toEqual([]);
  });

  it("serves a seated board member who is not an admin", async () => {
    isAdminOf = [];
    isBoardOf = [HOME];
    rows.hoa_requests = [agedRequest("r1")];
    const handler = await loadPropose();
    const res = await handler({ __body: { orgId: HOME, noticeId: agedNoticeId("r1") } });
    expect(res.actionId).toBeTruthy();
  });

  it("requires both an orgId and a noticeId", async () => {
    const handler = await loadPropose();
    await expect(handler({ __body: { noticeId: "x" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler({ __body: { orgId: HOME } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("POST /api/ai/notices/propose — the payload comes from the server", () => {
  it("writes a pending proposal carrying the generator's own payload", async () => {
    rows.hoa_requests = [agedRequest("r1")];
    const handler = await loadPropose();
    const res = await handler({ __body: { orgId: HOME, noticeId: agedNoticeId("r1") } });

    expect(res.status).toBe("pending");
    expect(rows.ai_actions).toHaveLength(1);
    const row = rows.ai_actions[0];
    expect(row.status).toBe("pending");
    expect(row.organization).toBe(HOME);
    expect(row.entity_type).toBe("request");
    expect(row.entity_id).toBe("r1");
    // Whatever the generator proposed, it is one of the four reversible,
    // internal executors — never anything that transmits.
    expect(["create_task", "add_comment", "set_due_date", "update_request_status"]).toContain(
      row.action_type
    );
    expect(row.outbound).toBe(false);
  });

  it("ignores an action type the client tries to smuggle in", async () => {
    rows.hoa_requests = [agedRequest("r1")];
    const handler = await loadPropose();
    await handler({
      __body: {
        orgId: HOME,
        noticeId: agedNoticeId("r1"),
        // None of this is read. The endpoint takes an id and re-derives.
        actionType: "send_email",
        payload: { subject: "Everyone please read", body_html: "<p>hi</p>" },
      },
    });
    expect(rows.ai_actions).toHaveLength(1);
    expect(rows.ai_actions[0].action_type).not.toBe("send_email");
    expect(rows.hoa_emails ?? []).toHaveLength(0);
  });

  it("refuses a notice that no longer applies", async () => {
    // Nothing in the community is old enough to generate this notice.
    rows.hoa_requests = [{ ...agedRequest("r1"), date_created: daysAgo(1) }];
    const handler = await loadPropose();
    await expect(
      handler({ __body: { orgId: HOME, noticeId: agedNoticeId("r1") } })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(rows.ai_actions).toHaveLength(0);
  });

  it("refuses an id that never named a notice", async () => {
    rows.hoa_requests = [agedRequest("r1")];
    const handler = await loadPropose();
    await expect(
      handler({ __body: { orgId: HOME, noticeId: "totally-made-up" } })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses a notice that carries no proposal at all", async () => {
    // `request-unassigned` is real, and deliberately has nothing to propose —
    // choosing an assignee is not the assistant's call.
    rows.hoa_requests = [{ ...agedRequest("r1"), assigned_to: null }];
    const handler = await loadPropose();
    await expect(
      handler({ __body: { orgId: HOME, noticeId: `request-unassigned-r1` } })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(rows.ai_actions).toHaveLength(0);
  });
});

describe("POST /api/ai/notices/propose — it converges instead of stacking", () => {
  it("returns the proposal already waiting rather than making a second one", async () => {
    rows.hoa_requests = [agedRequest("r1")];
    const handler = await loadPropose();
    const first = await handler({ __body: { orgId: HOME, noticeId: agedNoticeId("r1") } });
    const second = await handler({ __body: { orgId: HOME, noticeId: agedNoticeId("r1") } });

    expect(second.duplicate).toBe(true);
    expect(second.actionId).toBe(first.actionId);
    expect(rows.ai_actions).toHaveLength(1);
  });
});

describe("POST /api/ai/notices/propose — the one approval path", () => {
  it("auto-runs through the trust dial when the org allows it", async () => {
    rows.hoa_organizations = [{ id: HOME, name: "Home", ai_autonomy_tier: 3 }];
    rows.hoa_requests = [agedRequest("r1")];
    const handler = await loadPropose();
    const res = await handler({ __body: { orgId: HOME, noticeId: agedNoticeId("r1") } });
    expect(res.status).toBe("executed");
    expect(rows.ai_actions[0].status).toBe("executed");
    // Auto-runs belong to nobody, so they cannot feed a trust streak.
    expect(rows.ai_actions[0].approved_by).toBeNull();
  });

  it("waits for a person when the dial is at 0", async () => {
    rows.hoa_organizations = [{ id: HOME, name: "Home", ai_autonomy_tier: 0 }];
    rows.hoa_requests = [agedRequest("r1")];
    const handler = await loadPropose();
    const res = await handler({ __body: { orgId: HOME, noticeId: agedNoticeId("r1") } });
    expect(res.status).toBe("pending");
    expect(rows.hoa_tasks).toHaveLength(0);
  });

  it("cannot reach an outbound executor at any tier, because no generator emits one", async () => {
    const { PROACTIVE_ACTIONS } = await import("#core/server/utils/ai-notices");
    const { actionByKey } = await import("#core/shared/ai/actions");
    for (const key of PROACTIVE_ACTIONS) {
      expect(actionByKey(key)?.outbound).toBe(false);
    }
  });
});

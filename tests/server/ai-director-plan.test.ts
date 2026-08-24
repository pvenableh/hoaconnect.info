/**
 * POST /api/ai/director/plan — the Board Room's plan producer.
 *
 * The endpoint spends money and creates work, which is an unusual combination,
 * and each half has its own way of going wrong.
 *
 * **Spending.** It must refuse at a zero balance BEFORE a token is bought, meter
 * both passes when it does run, and — the reason the cache exists at all — not
 * bill twice for the same answer to the same facts.
 *
 * **Creating work.** Every step is a real `ai_actions` row, and the way that
 * could go wrong is subtle: not by writing the wrong row, but by writing it
 * through the wrong door. If a future edit ever queues steps directly instead
 * of calling `proposeAction()`, the trust dial and the outbound hard cap stop
 * applying to plans while continuing to apply to chat, and nothing would look
 * broken. So these tests run the REAL `core/server/utils/ai-actions`, and the
 * cap is asserted here the way Session 6 asserted it on the bulk path: an
 * outbound step lands `pending` at autonomy tier 3, with an internal step in
 * the same plan auto-executing beside it to prove tier 3 was genuinely on.
 *
 * The model is the only thing stubbed. Everything under it is the real engine.
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

// ── The model, and only the model ────────────────────────────────────────────
type Turn = {
  text?: string;
  toolCalls?: Array<{ id?: string; name: string; input: Record<string, any> }>;
  usage?: Record<string, number>;
};

let turns: Turn[];
let llmCalls: any[];

vi.mock("#core/server/utils/llm/provider", () => ({
  getLlmProvider: () => ({
    name: "anthropic",
    async completeWithTools(params: any) {
      llmCalls.push(params);
      const turn = turns.shift() ?? { text: "", toolCalls: [] };
      return {
        text: turn.text ?? "",
        toolCalls: (turn.toolCalls ?? []).map((t, i) => ({ id: t.id ?? `tu-${i}`, ...t })),
        stopReason: (turn.toolCalls ?? []).length ? "tool_use" : "end_turn",
        usage: turn.usage ?? {
          input_tokens: 1000,
          output_tokens: 400,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        rawContent: [],
      };
    },
  }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";

type Op = { op: string; collection: string; [k: string]: any };

let ops: Op[];
let rows: Record<string, any[]>;
let isAdminOf: string[];
let isBoardOf: string[];
let charges: any[];
let balance: number;
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
    if (cond?._gte !== undefined) return String(v) >= String(cond._gte);
    if (cond?._lte !== undefined) return String(v) <= String(cond._lte);
    if (cond?._gt !== undefined) return Number(v) > Number(cond._gt);
    if (cond?._nnull !== undefined) return cond._nnull ? v != null : v == null;
    return true;
  });
}

/** Old enough that the notices generators flag it — real grounding material. */
const agedRequest = (id: string, org = HOME, title = "Irrigation valve leaking") => ({
  id,
  organization: org,
  status: "open",
  title,
  assigned_to: "u1",
  date_created: daysAgo(45),
});

beforeEach(() => {
  vi.resetModules();
  ops = [];
  llmCalls = [];
  charges = [];
  turns = [];
  balance = 5000;
  seq = 0;
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
    hoa_emails: [],
    payment_requests: [],
    payment_expenses: [],
    ai_wallets: [],
    hoa_director_briefings: [],
    hoa_organizations: [{ id: HOME, name: "Sunrise Commons", ai_autonomy_tier: 0 }],
    directus_users: [{ id: ME, first_name: "Dana", last_name: "Ruiz", email: "d@example.com" }],
  };

  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("readBody", async (e: any) => e?.__body ?? {});
  vi.stubGlobal("getHeader", (e: any, k: string) => e?.__headers?.[k]);
  vi.stubGlobal("setResponseStatus", (e: any, code: number) => {
    e.__status = code;
  });
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
  vi.stubGlobal("getWalletSummary", async () => ({
    walletId: "w1",
    balanceCredits: balance,
    allowanceCredits: balance,
    purchasedCredits: 0,
    includedCredits: balance,
    periodResetsAt: null,
  }));
  vi.stubGlobal("chargeForCompletion", async (opts: any) => {
    charges.push(opts);
    const credits = 12;
    balance = Math.max(0, balance - credits);
    return { credits, balanceCredits: balance };
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
          const sort: string[] = desc.query?.sort ?? [];
          for (const key of [...sort].reverse()) {
            const isDesc = key.startsWith("-");
            const f = isDesc ? key.slice(1) : key;
            out = [...out].sort((a, b) =>
              isDesc
                ? String(b[f] ?? "").localeCompare(String(a[f] ?? ""))
                : String(a[f] ?? "").localeCompare(String(b[f] ?? ""))
            );
          }
          const limit = desc.query?.limit;
          return typeof limit === "number" && limit > 0 ? out.slice(0, limit) : out;
        }
        case "create": {
          const created = {
            id: `new-${++seq}`,
            date_created: new Date().toISOString(),
            ...(desc.payload as any),
          };
          all.push(created);
          return created;
        }
        case "updateOne": {
          const row = all.find((r) => String(r.id) === String(desc.id));
          if (row) Object.assign(row, desc.payload);
          return row;
        }
        case "delete": {
          rows[desc.collection] = all.filter((r) => String(r.id) !== String(desc.id));
          return null;
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

const loadPlan = async () =>
  (await import("#core/server/api/ai/director/plan.post")).default as any;

const taskStep = (title = "Chase the irrigation contractor") => ({
  name: "create_task",
  input: { title },
});
const emailStep = () => ({
  name: "send_email",
  input: {
    subject: "Irrigation repairs this week",
    body_html: "<p>Crews will be on site Thursday.</p>",
    audience: "all",
  },
});

// ── Who may plan ─────────────────────────────────────────────────────────────

describe("POST /api/ai/director/plan — org scope", () => {
  it("refuses a community the caller has no standing in", async () => {
    const handler = await loadPlan();
    await expect(handler({ __body: { orgId: OTHER } })).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("refuses before reading, grounding, or spending anything", async () => {
    rows.hoa_requests = [agedRequest("r1", OTHER)];
    const handler = await loadPlan();
    await handler({ __body: { orgId: OTHER } }).catch(() => {});
    expect(ops).toEqual([]);
    expect(llmCalls).toEqual([]);
    expect(charges).toEqual([]);
  });

  it("serves a seated board member who is not an admin", async () => {
    isAdminOf = [];
    isBoardOf = [HOME];
    turns = [{ text: "All quiet.", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME } });
    expect(res.stepCount).toBe(1);
  });

  it("requires an orgId", async () => {
    const handler = await loadPlan();
    await expect(handler({ __body: {} })).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── The wallet ───────────────────────────────────────────────────────────────

describe("POST /api/ai/director/plan — metering", () => {
  it("refuses at a zero balance without calling the model", async () => {
    balance = 0;
    const event: any = { __body: { orgId: HOME } };
    const handler = await loadPlan();
    const res = await handler(event);
    expect(event.__status).toBe(402);
    expect(res).toMatchObject({ error: "insufficient_credits" });
    expect(llmCalls).toEqual([]);
  });

  it("charges the wallet once per plan, tagged as a plan", async () => {
    turns = [{ text: "Briefing.", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME } });

    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ orgId: HOME, userId: ME, feature: "plan" });
    expect(charges[0].model).toBe("claude-sonnet-5");
    expect(res.credits).toBe(12);
    expect(res.balanceCredits).toBe(4988);
  });

  it("meters BOTH passes when the first one produced no steps", async () => {
    turns = [
      { text: "Here is what I think.", toolCalls: [], usage: { input_tokens: 900, output_tokens: 300 } },
      { text: "", toolCalls: [taskStep()], usage: { input_tokens: 500, output_tokens: 200 } },
    ];
    const handler = await loadPlan();
    await handler({ __body: { orgId: HOME } });

    expect(llmCalls).toHaveLength(2);
    expect(charges[0].usage).toMatchObject({ input_tokens: 1400, output_tokens: 500 });
  });
});

// ── Grounding ────────────────────────────────────────────────────────────────

describe("POST /api/ai/director/plan — grounded before the model runs", () => {
  it("puts the community's real notices, with real ids, in front of the model", async () => {
    rows.hoa_requests = [agedRequest("r1", HOME, "Irrigation valve leaking")];
    turns = [{ text: "Briefing.", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    await handler({ __body: { orgId: HOME, subject: "requests" } });

    const userMessage = String(llmCalls[0].messages[0].content);
    expect(userMessage).toContain("Irrigation valve leaking");
    expect(userMessage).toContain("[target: hoa_requests id=r1]");
  });

  it("says plainly that nothing is flagged rather than inventing something to plan", async () => {
    turns = [{ text: "Quiet month.", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    await handler({ __body: { orgId: HOME, subject: "requests" } });
    expect(String(llmCalls[0].messages[0].content)).toContain("Nothing is currently flagged");
  });

  it("narrows to the requested subject instead of dumping the whole agenda", async () => {
    rows.hoa_requests = [agedRequest("r1", HOME, "Irrigation valve leaking")];
    turns = [{ text: "b", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    // "meetings" has nothing in it; the request notice belongs to "requests".
    await handler({ __body: { orgId: HOME, subject: "meetings" } });
    expect(String(llmCalls[0].messages[0].content)).not.toContain("Irrigation valve leaking");
  });

  it("forbids inventing a figure, in as many words", async () => {
    turns = [{ text: "b", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    await handler({ __body: { orgId: HOME } });
    expect(String(llmCalls[0].system[0].text)).toMatch(/Never invent specific facts/i);
  });

  it("grounds money mode on real totals, and names what is NOT on record", async () => {
    rows.payment_requests = [
      {
        id: "pr1",
        organization: HOME,
        member: "m1",
        status: "overdue",
        request_type: "monthly_dues",
        title: "March dues",
        amount: "400.00",
        amount_paid: "0",
        amount_remaining: "400.00",
        due_date: daysAgo(70).slice(0, 10),
      },
      {
        id: "pr2",
        organization: HOME,
        member: "m2",
        status: "paid",
        request_type: "monthly_dues",
        title: "March dues",
        amount: "400.00",
        amount_paid: "400.00",
        amount_remaining: "0",
        paid_at: daysAgo(20),
      },
    ];
    rows.hoa_members = [
      { id: "m1", organization: HOME, first_name: "Ada", last_name: "Chen" },
      { id: "m2", organization: HOME, first_name: "Bo", last_name: "Reyes" },
    ];
    turns = [{ text: "Money briefing.", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME, subject: "money" } });

    const userMessage = String(llmCalls[0].messages[0].content);
    expect(userMessage).toContain("FINANCIAL POSITION ON RECORD");
    // Directus hands decimals back as strings; a concatenation bug here shows up
    // as NaN or "0400.00", not as a wrong-but-plausible number.
    expect(userMessage).toContain("Collected to date: $400");
    expect(userMessage).toContain("Outstanding from members: $400");
    expect(userMessage).toContain("Ada Chen");
    expect(userMessage).toContain("no expenses have been recorded");

    // And the snapshot is returned + saved, so the page renders the same numbers.
    expect(res.money.summary.totalIncome).toBe(400);
    expect(res.money.aging.d61_90).toBe(400);
  });

  it("does not build money intel for a subject that is not about money", async () => {
    turns = [{ text: "b", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME, subject: "requests" } });
    expect(res.money).toBeNull();
    expect(String(llmCalls[0].messages[0].content)).not.toContain("FINANCIAL POSITION");
  });
});

// ── Steps ────────────────────────────────────────────────────────────────────

describe("POST /api/ai/director/plan — steps are real proposals", () => {
  it("writes each step as a pending row sharing one plan id", async () => {
    turns = [
      {
        text: "Two things.",
        toolCalls: [taskStep("Chase the contractor"), taskStep("Book the inspection")],
      },
    ];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME, subject: "requests" } });

    expect(res.stepCount).toBe(2);
    expect(rows.ai_actions).toHaveLength(2);
    for (const row of rows.ai_actions) {
      expect(row.status).toBe("pending");
      expect(row.organization).toBe(HOME);
      expect(row.session_id).toBe(res.planId);
    }
    // plan_id IS session_id — that is the whole link, so the read-back finds them.
    expect(res.steps.map((s: any) => s.title)).toEqual([
      "Create task “Chase the contractor”",
      "Create task “Book the inspection”",
    ]);
  });

  it("returns steps with a parsed preview, not a string of characters", async () => {
    turns = [{ text: "b", toolCalls: [taskStep("Order chlorine")] }];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME } });
    expect(res.steps[0].preview).toMatchObject({ kind: "create_task", title: "Order chlorine" });
  });

  it("drops a tool the Board Room may not use, and says which", async () => {
    turns = [
      {
        text: "b",
        toolCalls: [
          { name: "post_announcement", input: { title: "Hi", content: "<p>x</p>" } },
          taskStep(),
        ],
      },
    ];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME } });

    expect(res.stepCount).toBe(1);
    expect(res.skipped).toEqual([
      { actionType: "post_announcement", reason: "not a Board Room step" },
    ]);
    expect(rows.ai_actions.map((r) => r.action_type)).toEqual(["create_task"]);
  });

  it("offers the model exactly the four Board Room tools", async () => {
    turns = [{ text: "b", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    await handler({ __body: { orgId: HOME } });
    expect(llmCalls[0].tools.map((t: any) => t.name).sort()).toEqual([
      "create_task",
      "schedule_meeting",
      "send_email",
      "update_request_status",
    ]);
  });

  it("keeps a step that could not be queued out of the plan without failing it", async () => {
    // update_request_status with no request in view and no id is unqueueable.
    turns = [
      { text: "b", toolCalls: [{ name: "update_request_status", input: { status: "resolved" } }, taskStep()] },
    ];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME } });
    expect(res.stepCount).toBe(1);
    expect(res.skipped[0].actionType).toBe("update_request_status");
  });

  it("pins an entity-scoped plan's steps to that record", async () => {
    rows.hoa_requests = [agedRequest("r1")];
    turns = [{ text: "b", toolCalls: [taskStep("Follow up")] }];
    const handler = await loadPlan();
    await handler({ __body: { orgId: HOME, entityType: "request", entityId: "r1" } });
    expect(rows.ai_actions[0]).toMatchObject({ entity_type: "request", entity_id: "r1" });
  });
});

// ── The cap (Risk 4) ─────────────────────────────────────────────────────────

describe("the outbound cap holds on the plan path too, at the top of the dial", () => {
  beforeEach(() => {
    rows.hoa_organizations = [{ id: HOME, name: "Sunrise Commons", ai_autonomy_tier: 3 }];
  });

  it("leaves an outbound step PENDING at autonomy tier 3", async () => {
    turns = [{ text: "b", toolCalls: [emailStep()] }];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME } });

    expect(res.stepCount).toBe(1);
    const row = rows.ai_actions[0];
    expect(row.action_type).toBe("send_email");
    expect(row.outbound).toBe(true);
    expect(row.status).toBe("pending");
    // Nothing was drafted, queued or sent.
    expect(rows.hoa_emails).toHaveLength(0);
    expect(res.steps[0].status).toBe("pending");
  });

  it("auto-runs the internal step in the SAME plan — so tier 3 was genuinely on", async () => {
    turns = [{ text: "b", toolCalls: [taskStep("Order chlorine"), emailStep()] }];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME } });

    const byType = Object.fromEntries(rows.ai_actions.map((r) => [r.action_type, r]));
    expect(byType.create_task.status).toBe("executed");
    expect(byType.send_email.status).toBe("pending");
    expect(rows.hoa_tasks).toHaveLength(1);
    expect(rows.hoa_emails).toHaveLength(0);
    expect(res.stepCount).toBe(2);
  });

  it("attributes the auto-run to nobody, so a plan cannot inflate a trust streak", async () => {
    turns = [{ text: "b", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    await handler({ __body: { orgId: HOME } });
    expect(rows.ai_actions[0].status).toBe("executed");
    expect(rows.ai_actions[0].approved_by).toBeNull();
  });

  it("routes through the ONE approval path — the catalog is what decides", async () => {
    // If the endpoint ever grew its own approval logic, this is the assertion
    // that would still be satisfied by the catalog while the endpoint diverged,
    // so it is deliberately paired with the behavioural tests above.
    const { ACTION_CATALOG, shouldAutoApprove } = await import("#core/shared/ai/actions");
    const { DIRECTOR_TOOL_NAMES } = await import("#core/server/api/ai/director/plan.post");
    const outbound = ACTION_CATALOG.filter((a) => a.outbound).map((a) => a.key);
    // The Board Room's tool set includes at least one outbound action — the cap
    // is only meaningful if the planner can actually reach one.
    expect(DIRECTOR_TOOL_NAMES.some((k) => outbound.includes(k))).toBe(true);
    for (const key of DIRECTOR_TOOL_NAMES) {
      if (outbound.includes(key)) expect(shouldAutoApprove(key, 3)).toBe(false);
    }
  });

  it("every Board Room tool is a real catalog action with a wired schema", async () => {
    const { actionByKey } = await import("#core/shared/ai/actions");
    const { isKnownAction } = await import("#core/server/utils/llm/tools");
    const { DIRECTOR_TOOL_NAMES } = await import("#core/server/api/ai/director/plan.post");
    for (const key of DIRECTOR_TOOL_NAMES) {
      expect(actionByKey(key), `${key} is not in ACTION_CATALOG`).toBeDefined();
      expect(isKnownAction(key), `${key} has no tool schema`).toBe(true);
    }
  });
});

// ── The forced second pass ───────────────────────────────────────────────────

describe("a briefing with no steps is not a plan", () => {
  it("forces a second pass that must call a tool", async () => {
    turns = [
      { text: "I would suggest a few things.", toolCalls: [] },
      { text: "", toolCalls: [taskStep("Chase the contractor")] },
    ];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME } });

    expect(llmCalls).toHaveLength(2);
    expect(llmCalls[0].toolChoice).toBe("auto");
    expect(llmCalls[1].toolChoice).toBe("any");
    expect(res.stepCount).toBe(1);
  });

  it("keeps the first pass's prose as the briefing, since the forced pass has none", async () => {
    turns = [
      { text: "Arrears are aging badly.\nTL;DR: Chase the two oldest | Review monthly", toolCalls: [] },
      { text: "", toolCalls: [taskStep()] },
    ];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME } });
    expect(res.intro).toBe("Arrears are aging badly.");
    expect(res.points).toEqual(["Chase the two oldest", "Review monthly"]);
  });

  it("does not force a second pass when the first one already planned", async () => {
    turns = [{ text: "b", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    await handler({ __body: { orgId: HOME } });
    expect(llmCalls).toHaveLength(1);
  });

  it("accepts an honestly empty plan rather than inventing steps forever", async () => {
    turns = [
      { text: "Nothing needs doing.", toolCalls: [] },
      { text: "", toolCalls: [] },
    ];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME } });
    expect(llmCalls).toHaveLength(2);
    expect(res.stepCount).toBe(0);
    expect(rows.ai_actions).toHaveLength(0);
  });
});

// ── The cache ────────────────────────────────────────────────────────────────

describe("POST /api/ai/director/plan — a briefing is not re-bought", () => {
  it("serves the saved briefing on reopen, with no model call and no charge", async () => {
    turns = [{ text: "Briefing.\nTL;DR: One | Two", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    const first = await handler({ __body: { orgId: HOME, subject: "requests" } });

    llmCalls = [];
    charges = [];
    const second = await handler({ __body: { orgId: HOME, subject: "requests" } });

    expect(llmCalls).toEqual([]);
    expect(charges).toEqual([]);
    expect(second.cached).toBe(true);
    expect(second.credits).toBe(0);
    expect(second.planId).toBe(first.planId);
    expect(second.intro).toBe("Briefing.");
    expect(second.points).toEqual(["One", "Two"]);
    expect(rows.ai_actions).toHaveLength(1);
  });

  it("re-reads the steps live, so a step decided since the draft shows as decided", async () => {
    turns = [{ text: "b", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    await handler({ __body: { orgId: HOME } });
    rows.ai_actions[0].status = "executed";

    const second = await handler({ __body: { orgId: HOME } });
    expect(second.cached).toBe(true);
    expect(second.steps[0].status).toBe("executed");
  });

  it("redraws on refresh, and bills for it", async () => {
    turns = [
      { text: "First.", toolCalls: [taskStep()] },
      { text: "Second.", toolCalls: [taskStep("Something else")] },
    ];
    const handler = await loadPlan();
    const first = await handler({ __body: { orgId: HOME } });
    const second = await handler({ __body: { orgId: HOME, refresh: true } });

    expect(second.cached).toBe(false);
    expect(second.planId).not.toBe(first.planId);
    expect(second.intro).toBe("Second.");
    expect(charges).toHaveLength(2);
    expect(rows.hoa_director_briefings).toHaveLength(2);
  });

  it("does not serve one section's briefing to another", async () => {
    turns = [
      { text: "Money.", toolCalls: [taskStep()] },
      { text: "Requests.", toolCalls: [taskStep()] },
    ];
    const handler = await loadPlan();
    await handler({ __body: { orgId: HOME, subject: "money" } });
    const other = await handler({ __body: { orgId: HOME, subject: "requests" } });
    expect(other.cached).toBe(false);
    expect(other.intro).toBe("Requests.");
  });

  it("does not serve another community's briefing", async () => {
    turns = [{ text: "Ours.", toolCalls: [taskStep()] }, { text: "Theirs.", toolCalls: [taskStep()] }];
    isAdminOf = [HOME, OTHER];
    rows.hoa_organizations.push({ id: OTHER, name: "Other", ai_autonomy_tier: 0 });
    const handler = await loadPlan();
    await handler({ __body: { orgId: HOME, subject: "money" } });
    const theirs = await handler({ __body: { orgId: OTHER, subject: "money" } });
    expect(theirs.cached).toBe(false);
    expect(theirs.intro).toBe("Theirs.");
  });

  it("ignores a briefing past the TTL and draws a fresh one", async () => {
    turns = [{ text: "Fresh.", toolCalls: [taskStep()] }];
    rows.hoa_director_briefings = [
      {
        id: "stale",
        organization: HOME,
        cache_key: "org::requests::",
        plan_id: "plan-stale",
        intro: "Last week's numbers.",
        date_created: new Date(Date.now() - 24 * 3600_000).toISOString(),
      },
    ];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME, subject: "requests" } });
    expect(res.cached).toBe(false);
    expect(res.intro).toBe("Fresh.");
  });

  it("saves the briefing under the key the reader will look under", async () => {
    turns = [{ text: "b", toolCalls: [taskStep()] }];
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME, subject: "money", topic: "Reserves " } });
    const saved = rows.hoa_director_briefings[0];
    expect(saved.cache_key).toBe("org::money::reserves");
    expect(saved.cache_key).toBe(res.cacheKey);
    expect(saved.plan_id).toBe(res.planId);
    expect(saved.step_count).toBe(1);
  });

  it("a failed save costs the cache, never the plan on screen", async () => {
    turns = [{ text: "Briefing.", toolCalls: [taskStep()] }];
    const realDirectus = (globalThis as any).getTypedDirectus;
    vi.stubGlobal("getTypedDirectus", () => {
      const client = realDirectus();
      return {
        request: async (desc: Op) => {
          if (desc.collection === "hoa_director_briefings" && desc.op === "create") {
            throw new Error(`Collection "hoa_director_briefings" doesn't exist`);
          }
          return client.request(desc);
        },
      };
    });
    const handler = await loadPlan();
    const res = await handler({ __body: { orgId: HOME } });
    expect(res.stepCount).toBe(1);
    expect(res.intro).toBe("Briefing.");
  });
});

// ── The model falling over ───────────────────────────────────────────────────

describe("POST /api/ai/director/plan — when the model cannot answer", () => {
  it("returns a 502 and charges nothing", async () => {
    vi.doMock("#core/server/utils/llm/provider", () => ({
      getLlmProvider: () => ({
        name: "anthropic",
        completeWithTools: async () => {
          throw new Error("upstream exploded");
        },
      }),
    }));
    const handler = (await import("#core/server/api/ai/director/plan.post")).default as any;
    await expect(handler({ __body: { orgId: HOME } })).rejects.toMatchObject({ statusCode: 502 });
    expect(charges).toEqual([]);
    expect(rows.ai_actions).toHaveLength(0);
  });
});

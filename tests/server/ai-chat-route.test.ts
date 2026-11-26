/**
 * POST /api/ai/chat — the assistant panel's streaming turn.
 *
 * What can go wrong here costs money or crosses tenants, so that's what these
 * tests pin: who may chat in which community, refusing at a zero balance before
 * a token is bought, never resuming another community's conversation, metering
 * the summed usage of both tool rounds, and the "what the AI can see" switches
 * actually keeping a source out of the prompt. Tool calls must go through
 * proposeAction (the trust dial lives there), never run directly.
 *
 * The model, proposeAction and the context builders are stubbed; the handler
 * and its SSE framing are real.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MODEL_TIERS } from "#core/shared/ai/credits";

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query?: unknown) => ({ op: "readOne", collection, id, query }),
  readItems: (collection: string, query?: unknown) => ({ op: "read", collection, query }),
  createItem: (collection: string, payload: unknown) => ({ op: "create", collection, payload }),
  updateItem: (collection: string, id: string, payload: unknown) => ({ op: "updateOne", collection, id, payload }),
}));

// ── The model ────────────────────────────────────────────────────────────────
type Turn = {
  text?: string;
  toolUses?: Array<{ id: string; name: string; input: Record<string, any> }>;
  usage?: Record<string, number>;
  fail?: string;
};
let turns: Turn[];
let llmCalls: any[];

vi.mock("#core/server/utils/llm/provider", () => ({
  getLlmProvider: () => ({
    stream(params: any) {
      llmCalls.push(params);
      const turn = turns.shift() ?? { text: "" };
      const content: any[] = [];
      if (turn.text) content.push({ type: "text", text: turn.text });
      for (const tu of turn.toolUses ?? []) content.push({ type: "tool_use", ...tu });
      return {
        async *[Symbol.asyncIterator]() {
          if (turn.fail) throw new Error(turn.fail);
          // Two deltas, so the client sees the text arrive in pieces.
          const text = turn.text ?? "";
          const half = Math.ceil(text.length / 2);
          for (const piece of [text.slice(0, half), text.slice(half)].filter(Boolean)) {
            yield { type: "content_block_delta", delta: { type: "text_delta", text: piece } };
          }
        },
        async finalMessage() {
          return {
            content,
            stop_reason: turn.toolUses?.length ? "tool_use" : "end_turn",
            usage: turn.usage ?? {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
          };
        },
      };
    },
  }),
}));

const TOOLS = [{ name: "create_task" }];
vi.mock("#core/server/utils/llm/tools", () => ({ getActionTools: () => TOOLS }));

let proposals: any[];
vi.mock("#core/server/utils/ai-actions", () => ({
  proposeAction: async (name: string, input: any, ctx: any) => {
    proposals.push({ name, input, ctx });
    return { success: true, actionId: "act-1", status: "pending", summary: `Proposed ${name}` };
  },
}));

let autonomyReads: string[];
vi.mock("#core/server/utils/ai-autonomy", () => ({
  getOrgAutonomyTier: async (orgId: string) => {
    autonomyReads.push(orgId);
    return 2;
  },
}));

// ── The world ────────────────────────────────────────────────────────────────
const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";

type Op = { op: string; collection: string; [k: string]: any };
let ops: Op[];
let rows: Record<string, any[]>;
let composeOrgs: string[];
let balance: number;
let charges: any[];
let seq: number;
let ragConfigured: boolean;
let ragResult: { block: string } | null | Error;
let ragCalls: any[];
let dossierCalls: any[];
let orgContextCalls: string[];

type Sse = { pushes: any[]; closed: Promise<void> };
let sse: Sse;

function matches(row: any, filter: any): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([field, cond]: [string, any]) =>
    cond?._eq !== undefined ? String(row[field]) === String(cond._eq) : true
  );
}

beforeEach(() => {
  vi.resetModules();
  ops = [];
  turns = [];
  llmCalls = [];
  proposals = [];
  autonomyReads = [];
  composeOrgs = [HOME];
  balance = 5000;
  charges = [];
  seq = 0;
  ragConfigured = false;
  ragResult = null;
  ragCalls = [];
  dossierCalls = [];
  orgContextCalls = [];
  rows = {
    hoa_organizations: [{ id: HOME, name: "Sunrise Commons" }],
    ai_conversations: [],
    ai_messages: [],
  };

  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("readBody", async (e: any) => e?.__body ?? {});
  vi.stubGlobal("setResponseStatus", (e: any, code: number) => {
    e.__status = code;
  });
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: ME } }));
  vi.stubGlobal("requireOrgComposeAccess", async (_e: any, orgId: string) => {
    if (!composeOrgs.includes(orgId)) {
      throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    }
    return ["admin"];
  });
  vi.stubGlobal("getWalletSummary", async () => ({ balanceCredits: balance }));
  vi.stubGlobal("chargeForCompletion", async (opts: any) => {
    charges.push(opts);
    balance -= 7;
    return { credits: 7, balanceCredits: balance };
  });
  vi.stubGlobal("isRagConfigured", () => ragConfigured);
  vi.stubGlobal("retrieveRagContext", async (...args: any[]) => {
    ragCalls.push(args);
    if (ragResult instanceof Error) throw ragResult;
    return ragResult;
  });
  vi.stubGlobal("chatSystemPrompt", (o: any) => `SYSTEM for ${o.orgName} as ${o.actorLabel}`);
  vi.stubGlobal("getOrgContextCached", async (orgId: string) => {
    orgContextCalls.push(orgId);
    return `ORG CONTEXT ${orgId}`;
  });
  vi.stubGlobal("getEntityContext", async (o: any) => {
    dossierCalls.push(o);
    return `DOSSIER ${o.entityType} ${o.entityId}`;
  });

  let resolveClosed!: () => void;
  sse = { pushes: [], closed: new Promise<void>((r) => (resolveClosed = r)) };
  vi.stubGlobal("createEventStream", () => ({
    push: async (data: string) => {
      sse.pushes.push(JSON.parse(data));
    },
    close: async () => resolveClosed(),
    send: () => "SSE-RESPONSE",
  }));

  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      ops.push(desc);
      const all = (rows[desc.collection] ||= []);
      switch (desc.op) {
        case "readOne": {
          const row = all.find((r) => String(r.id) === String(desc.id));
          if (!row) throw new Error("not found");
          return row;
        }
        case "read": {
          let out = all.filter((r) => matches(r, desc.query?.filter));
          if (desc.query?.sort?.[0] === "-date_created") {
            out = [...out].sort((a, b) => String(b.date_created).localeCompare(String(a.date_created)));
          }
          return desc.query?.limit ? out.slice(0, desc.query.limit) : out;
        }
        case "create": {
          const created = { id: `new-${++seq}`, date_created: `2026-11-26T00:00:${String(seq).padStart(2, "0")}Z`, ...(desc.payload as any) };
          all.push(created);
          return created;
        }
        case "updateOne": {
          const row = all.find((r) => String(r.id) === String(desc.id));
          if (row) Object.assign(row, desc.payload);
          return row;
        }
        default:
          return null;
      }
    },
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const loadChat = async () => (await import("#core/server/api/ai/chat.post")).default as any;

/** Run a turn to the end of its stream; returns the SSE events. */
async function chat(body: Record<string, any>) {
  const handler = await loadChat();
  const event: any = { __body: { orgId: HOME, message: "When is the pool open?", ...body } };
  const out = await handler(event);
  await sse.closed;
  return { out, event, events: sse.pushes };
}

const created = (collection: string) => ops.filter((o) => o.op === "create" && o.collection === collection);

// ── Who may chat ─────────────────────────────────────────────────────────────

describe("POST /api/ai/chat — the gate", () => {
  it("needs an orgId and a message", async () => {
    const handler = await loadChat();
    await expect(handler({ __body: { message: "hi" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler({ __body: { orgId: HOME, message: "   " } })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses a community the caller can't compose in, before reading the wallet or writing anything", async () => {
    const handler = await loadChat();
    await expect(handler({ __body: { orgId: OTHER, message: "hi" } })).rejects.toMatchObject({ statusCode: 403 });
    expect(ops).toEqual([]);
    expect(llmCalls).toEqual([]);
  });

  it("answers 402 at a zero balance without buying a token or opening a conversation", async () => {
    balance = 0;
    const handler = await loadChat();
    const event: any = { __body: { orgId: HOME, message: "hi" } };
    const out = await handler(event);
    expect(event.__status).toBe(402);
    expect(out).toEqual({ error: "insufficient_credits", balanceCredits: 0 });
    expect(llmCalls).toEqual([]);
    expect(created("ai_conversations")).toEqual([]);
  });
});

// ── A plain turn ─────────────────────────────────────────────────────────────

describe("POST /api/ai/chat — a turn", () => {
  it("streams meta, the text in deltas, then done with the charge", async () => {
    turns = [{ text: "Nine to nine, daily." }];
    const { out, events } = await chat({});
    expect(out).toBe("SSE-RESPONSE");
    expect(events[0]).toEqual({ type: "meta", conversationId: "new-1" });
    const text = events.filter((e) => e.type === "delta").map((e) => e.text).join("");
    expect(text).toBe("Nine to nine, daily.");
    expect(events.at(-1)).toEqual({ type: "done", credits: 7, balanceCredits: 4993, stop: "end_turn" });
  });

  it("opens a conversation in this community, titled from the message and scoped to the page", async () => {
    turns = [{ text: "ok" }];
    const long = "x".repeat(80);
    await chat({
      message: long,
      context: { entityType: "member", entityId: 42, label: "Dana Ruiz", route: "/home/admin/members/42" },
    });
    const [conv] = created("ai_conversations");
    expect(conv.payload).toMatchObject({
      organization: HOME,
      user: ME,
      title: `${"x".repeat(60)}…`,
      model: MODEL_TIERS.fast,
      context: { entityType: "member", entityId: "42", label: "Dana Ruiz", route: "/home/admin/members/42" },
    });
  });

  it("persists the user turn first and the assistant turn with the metered tokens", async () => {
    turns = [{ text: "Answer", usage: { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 9, cache_creation_input_tokens: 3 } }];
    await chat({});
    const msgs = created("ai_messages").map((o) => o.payload);
    expect(msgs[0]).toMatchObject({ organization: HOME, role: "user", content: "When is the pool open?" });
    expect(msgs[1]).toMatchObject({
      organization: HOME,
      role: "assistant",
      content: "Answer",
      model: MODEL_TIERS.fast,
      input_tokens: 300,
      output_tokens: 40,
      cache_read_tokens: 9,
      cache_write_tokens: 3,
    });
    expect(charges).toEqual([
      {
        orgId: HOME,
        userId: ME,
        model: MODEL_TIERS.fast,
        feature: "chat",
        usage: { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 9, cache_creation_input_tokens: 3 },
      },
    ]);
  });

  it("resumes this community's conversation and replays its history oldest first", async () => {
    rows.ai_conversations.push({ id: "c-1", organization: HOME });
    rows.ai_messages.push(
      { id: "m1", conversation: "c-1", role: "user", content: "First?", date_created: "2026-11-01T00:00:00Z" },
      { id: "m2", conversation: "c-1", role: "assistant", content: "First.", date_created: "2026-11-01T00:00:01Z" },
      { id: "m3", conversation: "c-1", role: "assistant", content: null, date_created: "2026-11-01T00:00:02Z" }
    );
    turns = [{ text: "Second." }];
    const { events } = await chat({ conversationId: "c-1", message: "Second?" });
    expect(events[0]).toEqual({ type: "meta", conversationId: "c-1" });
    expect(created("ai_conversations")).toEqual([]);
    expect(llmCalls[0].messages).toEqual([
      { role: "user", content: "First?" },
      { role: "assistant", content: "First." },
      { role: "user", content: "Second?" },
    ]);
  });

  it("starts fresh instead of resuming another community's conversation", async () => {
    rows.ai_conversations.push({ id: "c-foreign", organization: OTHER });
    rows.ai_messages.push({ id: "m1", conversation: "c-foreign", role: "user", content: "secret", date_created: "2026-11-01T00:00:00Z" });
    turns = [{ text: "ok" }];
    const { events } = await chat({ conversationId: "c-foreign" });
    expect(events[0].conversationId).not.toBe("c-foreign");
    expect(created("ai_conversations")).toHaveLength(1);
    expect(llmCalls[0].messages).toEqual([{ role: "user", content: "When is the pool open?" }]);
    expect(created("ai_messages").every((o) => o.payload.conversation !== "c-foreign")).toBe(true);
  });

  it("reports a failed stream as an error event, closes it, and charges nothing", async () => {
    turns = [{ fail: "overloaded" }];
    const { events } = await chat({});
    expect(events.at(-1)).toEqual({ type: "error", message: "overloaded" });
    expect(charges).toEqual([]);
    // The user's turn is kept so the conversation can be retried.
    expect(created("ai_messages").map((o) => o.payload.role)).toEqual(["user"]);
  });
});

// ── Model tier ───────────────────────────────────────────────────────────────

describe("POST /api/ai/chat — model tier", () => {
  it("defaults to the fast tier without thinking", async () => {
    turns = [{ text: "ok" }];
    await chat({});
    expect(llmCalls[0]).toMatchObject({ model: MODEL_TIERS.fast, thinking: false, effort: undefined });
  });

  it("escalates a heavy turn to the standard tier with thinking", async () => {
    turns = [{ text: "ok" }];
    await chat({ heavy: true });
    expect(llmCalls[0]).toMatchObject({ model: MODEL_TIERS.standard, thinking: true, effort: "medium" });
  });

  it("lets the client's tier win over a light turn", async () => {
    turns = [{ text: "ok" }];
    await chat({ tier: "max", heavy: false });
    expect(llmCalls[0].model).toBe(MODEL_TIERS.max);
  });

  it("ignores a tier it doesn't know", async () => {
    turns = [{ text: "ok" }];
    await chat({ tier: "turbo" });
    expect(llmCalls[0].model).toBe(MODEL_TIERS.fast);
  });
});

// ── Grounding and the "what the AI can see" switches ─────────────────────────

describe("POST /api/ai/chat — grounding", () => {
  const systemTexts = () => llmCalls[0].system.map((b: any) => b.text);

  it("sends the chat prompt, then the cached org context", async () => {
    turns = [{ text: "ok" }];
    await chat({});
    expect(llmCalls[0].system).toEqual([
      { text: "SYSTEM for Sunrise Commons as an administrator" },
      { text: `ORG CONTEXT ${HOME}`, cache: true },
    ]);
  });

  it("appends retrieved passages after the cached block and escalates the tier", async () => {
    ragConfigured = true;
    ragResult = { block: "PASSAGES: pool hours 9-9" };
    turns = [{ text: "ok" }];
    await chat({});
    expect(ragCalls).toEqual([[HOME, "When is the pool open?", ME]]);
    expect(systemTexts().at(-1)).toBe("PASSAGES: pool hours 9-9");
    expect(llmCalls[0].system.at(-1).cache).toBeUndefined();
    expect(llmCalls[0].model).toBe(MODEL_TIERS.standard);
  });

  it("answers without passages when retrieval fails", async () => {
    ragConfigured = true;
    ragResult = new Error("voyage down");
    turns = [{ text: "ok" }];
    const { events } = await chat({});
    expect(events.at(-1).type).toBe("done");
    expect(systemTexts()).toHaveLength(2);
    expect(llmCalls[0].model).toBe(MODEL_TIERS.fast);
  });

  it("never retrieves when documents are switched off", async () => {
    ragConfigured = true;
    ragResult = { block: "PASSAGES" };
    turns = [{ text: "ok" }];
    await chat({ excludedContext: ["documents"] });
    expect(ragCalls).toEqual([]);
    expect(systemTexts()).not.toContain("PASSAGES");
  });

  it("leaves the org context out when organization is switched off", async () => {
    turns = [{ text: "ok" }];
    await chat({ excludedContext: ["organization"] });
    expect(orgContextCalls).toEqual([]);
    expect(systemTexts()).toEqual(["SYSTEM for Sunrise Commons as an administrator"]);
  });

  it("adds the entity's dossier and a page hint to the user turn", async () => {
    turns = [{ text: "ok" }];
    await chat({ context: { entityType: "vendor", entityId: "v-9", label: "Acme Pools", summary: "Pool contractor" } });
    expect(dossierCalls).toEqual([{ orgId: HOME, entityType: "vendor", entityId: "v-9" }]);
    expect(systemTexts().at(-1)).toBe("DOSSIER vendor v-9");
    expect(llmCalls[0].messages.at(-1).content).toBe(
      "When is the pool open?\n\n[The user is currently viewing: Acme Pools (vendor v-9) — Pool contractor]"
    );
  });

  it("keeps the entity out of both the prompt and the hint when entity is switched off", async () => {
    turns = [{ text: "ok" }];
    await chat({
      excludedContext: ["entity"],
      context: { entityType: "vendor", entityId: "v-9", label: "Acme Pools" },
    });
    expect(dossierCalls).toEqual([]);
    expect(llmCalls[0].messages.at(-1).content).toBe("When is the pool open?");
    // The user's own message is still saved unchanged.
    expect(created("ai_messages")[0].payload.content).toBe("When is the pool open?");
  });

  it("keeps a plain route hint with entity switched off, since it names no record", async () => {
    turns = [{ text: "ok" }];
    await chat({ excludedContext: ["entity"], context: { route: "/home/calendar" } });
    expect(llmCalls[0].messages.at(-1).content).toBe(
      "When is the pool open?\n\n[The user is currently viewing: /home/calendar]"
    );
  });
});

// ── Proposed actions ─────────────────────────────────────────────────────────

describe("POST /api/ai/chat — proposed actions", () => {
  it("turns a tool call into a proposal, streams its card, and meters both rounds", async () => {
    turns = [
      {
        text: "I'll set that up.",
        toolUses: [{ id: "tu-1", name: "create_task", input: { title: "Call the pool company" } }],
        usage: { input_tokens: 200, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
      { text: " Done — it's waiting for approval.", usage: { input_tokens: 260, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 } },
    ];
    const { events } = await chat({ context: { entityType: "request", entityId: "r-1" } });

    expect(proposals).toEqual([
      {
        name: "create_task",
        input: { title: "Call the pool company" },
        ctx: {
          orgId: HOME,
          userId: ME,
          conversationId: "new-1",
          entityType: "request",
          entityId: "r-1",
          autonomyTier: 2,
        },
      },
    ]);
    expect(events).toContainEqual({
      type: "action",
      action: { id: "act-1", actionType: "create_task", status: "pending", error: null },
    });

    // Round 2 carries the tool result back to the model.
    expect(llmCalls).toHaveLength(2);
    const toolResult = llmCalls[1].messages.at(-1).content[0];
    expect(toolResult).toMatchObject({ type: "tool_result", tool_use_id: "tu-1", is_error: false });
    expect(JSON.parse(toolResult.content)).toEqual({ success: true, summary: "Proposed create_task" });

    expect(charges[0].usage).toEqual({
      input_tokens: 460,
      output_tokens: 50,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: 0,
    });
    const assistant = created("ai_messages")[1].payload;
    expect(assistant.content).toBe("I'll set that up. Done — it's waiting for approval.");
    expect(events.at(-1)).toMatchObject({ type: "done", stop: "end_turn" });
  });

  it("offers no tools and reads no trust dial when the client opts out", async () => {
    turns = [{ text: "ok" }];
    await chat({ allowActions: false });
    expect(llmCalls[0].tools).toBeUndefined();
    expect(autonomyReads).toEqual([]);
  });
});

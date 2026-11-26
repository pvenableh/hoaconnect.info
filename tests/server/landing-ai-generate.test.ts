/**
 * POST /api/landing/ai-generate — the landing builder's AI wizard.
 *
 * The builder's only server route (its Save writes to Directus from the client,
 * gated by /api/hoa/find's admin_view, which public-org-fields.test.ts covers).
 * Pinned here: the gate (who may draft for which community, and refusing at a
 * zero balance before a token is bought), grounding the prompt in this
 * community's stored facts, metering the real usage, and only ever handing the
 * builder a sanitized result.
 *
 * The model and getBrandContext are stubbed; sanitizeAiLandingResult is real.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MODEL_TIERS } from "#core/shared/ai/credits";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query?: unknown) => ({ op: "read", collection, query }),
}));

let reply: { text: string; usage?: Record<string, number> } | Error;
let llmCalls: any[];

vi.mock("#core/server/utils/llm/provider", () => ({
  getLlmProvider: () => ({
    async completeWithTools(params: any) {
      llmCalls.push(params);
      if (reply instanceof Error) throw reply;
      return {
        text: reply.text,
        toolCalls: [],
        stopReason: "end_turn",
        usage: reply.usage ?? { input_tokens: 900, output_tokens: 600 },
        rawContent: [],
      };
    },
  }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";

let composeOrgs: string[];
let balance: number;
let charges: any[];
let orgRows: any[];
let brandContext: string | Error;
let reads: any[];

const goodDraft = {
  hero: { title: "Sunrise Commons", subtitle: "Garden living by the bay" },
  about: "A quiet community of 40 homes.",
  sections: [
    { type: "content", layout: "split", title: "Welcome", body: "Tree-lined streets." },
    { type: "amenities" },
    { type: "made_up_block", title: "Should be dropped" },
  ],
  faq: [
    { question: "Are pets allowed?", answer: "Yes, two per home." },
    { question: "No answer" },
  ],
};

beforeEach(() => {
  vi.resetModules();
  llmCalls = [];
  composeOrgs = [HOME];
  balance = 5000;
  charges = [];
  reads = [];
  brandContext = "Amenities: pool, gym.";
  orgRows = [{ id: HOME, name: "Sunrise Commons", type: "condominium", city: "Tampa", state: "FL" }];
  reply = { text: JSON.stringify(goodDraft) };

  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("readBody", async (e: any) => e?.__body ?? {});
  vi.stubGlobal("setResponseStatus", (e: any, code: number) => {
    e.__status = code;
  });
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: ME } }));
  vi.stubGlobal("requireOrgComposeAccess", async (_e: any, orgId: string) => {
    if (!composeOrgs.includes(orgId)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    return ["admin"];
  });
  vi.stubGlobal("getWalletSummary", async () => ({ balanceCredits: balance }));
  vi.stubGlobal("chargeForCompletion", async (opts: any) => {
    charges.push(opts);
    balance -= 20;
    return { credits: 20, balanceCredits: balance };
  });
  vi.stubGlobal("getBrandContext", async () => {
    if (brandContext instanceof Error) throw brandContext;
    return brandContext;
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: any) => {
      reads.push(desc);
      const id = desc.query?.filter?.id?._eq;
      return orgRows.filter((r) => r.id === id);
    },
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const load = async () => (await import("#core/server/api/landing/ai-generate.post")).default as any;

async function generate(body: Record<string, any> = {}) {
  const handler = await load();
  const event: any = { __body: { orgId: HOME, brief: "A garden condo community near the bay.", ...body } };
  const out = await handler(event);
  return { out, event };
}

const systemText = () => llmCalls[0].system[0].text as string;

describe("POST /api/landing/ai-generate — the gate", () => {
  it("needs an orgId and a brief", async () => {
    const handler = await load();
    await expect(handler({ __body: { brief: "x" } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(handler({ __body: { orgId: HOME, brief: "  " } })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("refuses a community the caller can't compose for, before reading or buying anything", async () => {
    const handler = await load();
    await expect(handler({ __body: { orgId: OTHER, brief: "x" } })).rejects.toMatchObject({ statusCode: 403 });
    expect(reads).toEqual([]);
    expect(llmCalls).toEqual([]);
    expect(charges).toEqual([]);
  });

  it("answers 402 at a zero balance without calling the model", async () => {
    balance = 0;
    const { out, event } = await generate();
    expect(event.__status).toBe(402);
    expect(out).toEqual({ error: "insufficient_credits", balanceCredits: 0 });
    expect(llmCalls).toEqual([]);
  });
});

describe("POST /api/landing/ai-generate — a draft", () => {
  it("returns the sanitized draft with the charge", async () => {
    const { out } = await generate();
    expect(out.credits).toBe(20);
    expect(out.balanceCredits).toBe(4980);
    expect(out.result.hero).toEqual({ title: "Sunrise Commons", subtitle: "Garden living by the bay" });
    // An unknown block type and an unanswered FAQ never reach the builder.
    expect(out.result.sections.map((s: any) => s.type)).toEqual(["content", "amenities"]);
    expect(out.result.faq).toEqual([{ question: "Are pets allowed?", answer: "Yes, two per home." }]);
  });

  it("reads the JSON out of a reply wrapped in prose or a code fence", async () => {
    reply = { text: "Here you go:\n```json\n" + JSON.stringify(goodDraft) + "\n```\nEnjoy!" };
    const { out } = await generate();
    expect(out.result.sections).toHaveLength(2);
  });

  it("meters the real usage on the standard tier as a draft", async () => {
    reply = { text: JSON.stringify(goodDraft), usage: { input_tokens: 1234, output_tokens: 567 } };
    await generate();
    expect(llmCalls[0].model).toBe(MODEL_TIERS.standard);
    expect(charges).toEqual([
      { orgId: HOME, userId: ME, usage: { input_tokens: 1234, output_tokens: 567 }, model: MODEL_TIERS.standard, feature: "draft" },
    ]);
  });

  it("is a 502 with no charge when the model call fails", async () => {
    reply = new Error("overloaded");
    await expect(generate()).rejects.toMatchObject({ statusCode: 502, message: "AI generation failed" });
    expect(charges).toEqual([]);
  });

  it("is a 502 when the reply has no usable section, though the spent tokens are still charged", async () => {
    reply = { text: "Sorry, I can't help with that." };
    await expect(generate()).rejects.toMatchObject({ statusCode: 502 });
    expect(charges).toHaveLength(1);
  });
});

describe("POST /api/landing/ai-generate — grounding", () => {
  it("names this community and its place, and passes its stored facts", async () => {
    await generate();
    expect(reads[0].query.filter).toEqual({ id: { _eq: HOME } });
    expect(systemText()).toContain("for Sunrise Commons in Tampa, FL, a condominium association");
    expect(systemText()).toContain("Known facts about this community:\nAmenities: pool, gym.");
    expect(llmCalls[0].messages).toEqual([
      { role: "user", content: "Brief:\nA garden condo community near the bay.\n\nReturn the JSON now." },
    ]);
  });

  it("tells the model to stay general when there are no stored facts or they fail to load", async () => {
    brandContext = new Error("down");
    await generate();
    expect(systemText()).toContain("No stored facts are available");
    expect(systemText()).not.toContain("Known facts about this community");
  });

  it("still drafts when the community row can't be read", async () => {
    vi.stubGlobal("getTypedDirectus", () => ({
      request: async () => {
        throw new Error("directus down");
      },
    }));
    const { out } = await generate();
    expect(systemText()).toContain("for the community, a community association");
    expect(out.result.sections).toHaveLength(2);
  });
});

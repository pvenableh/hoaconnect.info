/**
 * Governing documents: statute flags proposed by the model
 * (docs/prompts/governing-docs.md, Session 4; spec §5 and criterion 7).
 *
 * The real handlers and guards on a MemoryDirectus, with the model and the
 * wallet faked. Proves: only managers may ask; a reference id that is not in
 * the library is dropped; a quote that is not in the provision is dropped;
 * what is saved is `ai_suggested` / `suggested` with the library's citation
 * and no rule written by the model; a member cannot see a suggestion by any
 * route; no provision is written; the run is audited and charged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";
import { batchBySize, validateSuggestions } from "#core/shared/governing/suggest";

const h = vi.hoisted(() => ({
  session: null as any, query: {} as any, params: {} as any, body: {} as any,
  balance: 100, llmCalls: [] as any[], suggestions: [] as any[], stopReason: "tool_use", charges: [] as any[],
}));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.mock("#core/server/utils/ai-wallet", () => ({
  getWalletSummary: async () => ({ balanceCredits: h.balance }),
  chargeForCompletion: async (opts: any) => {
    h.charges.push(opts);
    return { credits: 7, balanceCredits: h.balance - 7 };
  },
}));
vi.mock("#core/server/utils/llm/provider", () => ({
  getLlmProvider: () => ({
    completeWithTools: async (params: any) => {
      h.llmCalls.push(params);
      return {
        text: "", stopReason: h.stopReason, usage: { input_tokens: 4000, output_tokens: 300 }, rawContent: [],
        toolCalls: [{ id: "t1", name: "propose_flags", input: { suggestions: h.suggestions } }],
      };
    },
  }),
}));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const adminAuth = await import("#core/server/utils/admin-auth");
const managerAccess = await import("#core/server/utils/manager-access");
vi.stubGlobal("checkAdminAccess", adminAuth.checkAdminAccess);
vi.stubGlobal("checkMembership", adminAuth.checkMembership);
vi.stubGlobal("getManagerGrants", managerAccess.getManagerGrants);

type Handler = (event: H3Event) => Promise<any>;
const routes = {
  suggest: (await import("#core/server/api/governing/documents/[id]/suggest-flags.post")).default as Handler,
  provision: (await import("#core/server/api/governing/provisions/[id].get")).default as Handler,
  document: (await import("#core/server/api/governing/documents/[id].get")).default as Handler,
  overview: (await import("#core/server/api/governing/overview.get")).default as Handler,
  search: (await import("#core/server/api/governing/search.get")).default as Handler,
  status: (await import("#core/server/api/governing/flags/[id]/status.post")).default as Handler,
};

const event = {} as H3Event;
const ROLE = { appAdmin: "role-app-admin", hoaAdmin: "role-hoa-admin", pm: "role-pm", member: "role-member" };
const ORG = "org-lenox";
const OTHER_ORG = "org-other";
const PROXY = "Poxies shall be in writing and filed with theCounty before the meeting.";
const BOND = "The Treasurer shall be bonded in an amount set by the Board.";
const DRAFT = "A draft sentence about proxies nobody has reviewed.";

let db: MemoryDirectus;
let writes: any[];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  db = new MemoryDirectus();
  writes = [];
  Object.assign(h, { balance: 100, llmCalls: [], suggestions: [], stopReason: "tool_use", charges: [] });
  db.seed("hoa_organizations", [{ id: ORG, state: "FL" }, { id: OTHER_ORG, state: "FL" }]);
  db.seed("hoa_governing_documents", [
    { id: "doc", organization: ORG, title: "By-Laws", kind: "bylaws", status: "published", sort: 1 },
    { id: "draft", organization: ORG, title: "Upload", kind: "rules", status: "draft", sort: 2 },
    { id: "elsewhere", organization: OTHER_ORG, title: "Other", kind: "bylaws", status: "published", sort: 1 },
  ]);
  db.seed("hoa_governing_provisions", [
    { id: "p-proxy", organization: ORG, document: "doc", citation: "By-Law 3.5", heading: "Proxies", text: PROXY, review_state: "reviewed", sort: 1 },
    { id: "p-bond", organization: ORG, document: "doc", citation: "By-Law 6.5", heading: "Bond", text: BOND, review_state: "verified", sort: 2 },
    { id: "p-draft", organization: ORG, document: "doc", citation: null, text: DRAFT, review_state: "ocr_draft", sort: 3 },
    { id: "p-other", organization: OTHER_ORG, document: "elsewhere", citation: "By-Law 1", text: "Elsewhere text about proxies.", review_state: "reviewed", sort: 1 },
  ]);
  db.seed("hoa_statute_references", [
    { id: "ref-proxy", jurisdiction: "FL", code: "718.112(2)(b)", title: null, summary: null, url: "https://example.test/a", edition: "2026", checked_on: "2026-11-01" },
    { id: "ref-bond", jurisdiction: "FL", code: "718.111(11)(h)", title: "Fidelity bonding", summary: "Library summary, as curated.", url: "https://example.test/b", edition: "2026", checked_on: "2026-11-01" },
    { id: "ref-ga", jurisdiction: "GA", code: "44-3-106", title: null, summary: null, url: null, edition: "2026", checked_on: "2026-11-01" },
  ]);
  db.seed("hoa_statute_flags", [
    { id: "flag-curated", organization: ORG, topic: "Fidelity bond", document_rule: "Curated.", statute_rule: "Curated.", statute_citation: "718.111(11)(h)", relationship: "statute_controls", severity: "high", status: "confirmed", origin: "curated" },
  ]);
  db.seed("hoa_statute_flags_provisions", [{ id: "j1", flag: "flag-curated", provision: "p-bond", sort: 1 }]);
  db.seed("hoa_statute_flags_references", [{ id: "j2", flag: "flag-curated", reference: "ref-bond", sort: 1 }]);
  db.seed("hoa_members", [
    { id: "m-admin", user: "u-admin", organization: ORG, role: ROLE.hoaAdmin, status: "active" },
    { id: "m-board", user: "u-board", organization: ORG, role: ROLE.member, status: "active" },
    { id: "m-pm-docs", user: "u-pm-docs", organization: ORG, role: ROLE.pm, status: "active", manager_permissions: { documents: true } },
    { id: "m-pm-plain", user: "u-pm-plain", organization: ORG, role: ROLE.pm, status: "active", manager_permissions: { violations: true } },
    { id: "m-member", user: "u-member", organization: ORG, role: ROLE.member, status: "active" },
    { id: "m-elsewhere", user: "u-elsewhere", organization: OTHER_ORG, role: ROLE.hoaAdmin, status: "active" },
  ]);
  db.seed("hoa_board_members", [{ hoa_member: "m-board", status: "published", title: "director", term_start: null, term_end: null, sort: 1 }]);

  vi.stubGlobal("getUserSession", async () => h.session ?? {});
  vi.stubGlobal("getQuery", () => h.query);
  vi.stubGlobal("getRouterParam", (_e: unknown, k: string) => h.params[k]);
  vi.stubGlobal("readBody", async () => h.body);
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (op: any) => {
      if (op.op === "readFiles") return [];
      if (/^(create|update|delete)/.test(op.op)) writes.push(op);
      if (op.op === "createItem") return db.request({ ...op, data: { id: crypto.randomUUID(), ...op.data } });
      return db.request(op);
    },
  }));
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { directusRoleAppAdmin: ROLE.appAdmin, directusRoleHoaAdmin: ROLE.hoaAdmin, directusRolePropertyManager: ROLE.pm, directusRoleMember: ROLE.member },
  }));
});

const as = (userId: string | null, role = ROLE.member) => {
  h.session = userId ? { user: { id: userId, role, first_name: "Pat", last_name: "Admin", email: `${userId}@example.test` } } : null;
};
const call = (route: Handler, id: string, query: Record<string, string> = {}, body: unknown = {}) => {
  h.query = { orgId: ORG, ...query };
  h.params = { id };
  h.body = body;
  return route(event);
};
const flags = () => db.table("hoa_statute_flags");
const suggested = () => flags().filter((f: any) => f.origin === "ai_suggested");
const audit = () => db.table("hoa_governing_audit_log");
const good = { provision_id: "p-proxy", reference_id: "ref-proxy", quote: "Poxies shall be in writing and filed with theCounty" };

describe("who may ask for suggestions", () => {
  it.each([
    ["an HOA Admin", () => as("u-admin")],
    ["a current board member", () => as("u-board")],
    ["a property manager with the documents grant", () => as("u-pm-docs")],
  ])("%s may", async (_n, signIn) => {
    signIn();
    h.suggestions = [good];
    expect(await call(routes.suggest, "doc")).toMatchObject({ suggested: 1, rejected: 0, credits: 7 });
  });

  it.each([
    ["a member", () => as("u-member"), 403],
    ["a property manager without the documents grant", () => as("u-pm-plain"), 403],
    ["an admin of another community", () => as("u-elsewhere"), 403],
    ["someone signed out", () => as(null), 401],
  ])("%s is refused; the model is not called and nothing is written", async (_n, signIn, code) => {
    signIn();
    h.suggestions = [good];
    await expect(call(routes.suggest, "doc")).rejects.toMatchObject({ statusCode: code });
    expect(h.llmCalls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it("refuses a draft, another community's document, and an empty wallet, without calling the model", async () => {
    as("u-admin");
    await expect(call(routes.suggest, "draft")).rejects.toMatchObject({ statusCode: 409 });
    await expect(call(routes.suggest, "elsewhere")).rejects.toMatchObject({ statusCode: 404 });
    h.balance = 0;
    await expect(call(routes.suggest, "doc")).rejects.toMatchObject({ statusCode: 402 });
    expect(h.llmCalls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });
});

describe("what the model is given", () => {
  it("only reviewed provisions of this document and this state's references; never a draft or another community's text", async () => {
    as("u-admin");
    await call(routes.suggest, "doc");
    expect(h.llmCalls).toHaveLength(1);
    const sent = JSON.stringify(h.llmCalls[0]);
    expect(sent).toContain("Poxies shall be in writing");
    expect(sent).toContain("p-bond");
    expect(sent).toContain("ref-proxy");
    expect(sent).not.toContain("p-draft");
    expect(sent).not.toContain("nobody has reviewed");
    expect(sent).not.toContain("Elsewhere text");
    expect(sent).not.toContain("ref-ga");
    expect(h.llmCalls[0].tools.map((t: any) => t.name)).toEqual(["propose_flags"]);
  });
});

describe("what is kept and what is dropped", () => {
  it("an unknown reference id is rejected", async () => {
    as("u-admin");
    h.suggestions = [{ ...good, reference_id: "ref-invented" }, { ...good, reference_id: "ref-ga" }];
    expect(await call(routes.suggest, "doc")).toMatchObject({ suggested: 0, rejected: 2, rejected_by_reason: { unknown_reference: 2 } });
    expect(suggested()).toHaveLength(0);
  });

  it("a fabricated quote is rejected, also one that only differs by a corrected typo or by spacing", async () => {
    as("u-admin");
    h.suggestions = [
      { ...good, quote: "Proxies must be notarized before the meeting." },
      { ...good, quote: "Proxies shall be in writing" },
      { ...good, quote: "filed with the County" },
      { ...good, quote: "Poxies shall be in writing... before the meeting." },
    ];
    expect(await call(routes.suggest, "doc")).toMatchObject({ suggested: 0, rejected: 4, rejected_by_reason: { quote_not_in_text: 4 } });
    expect(suggested()).toHaveLength(0);
  });

  it("a quote from a different provision, an unknown or unsent provision, a tiny quote and a malformed item are rejected", async () => {
    as("u-admin");
    h.suggestions = [
      { provision_id: "p-proxy", reference_id: "ref-proxy", quote: "The Treasurer shall be bonded" },
      { provision_id: "p-nowhere", reference_id: "ref-proxy", quote: "Poxies shall be in writing" },
      { provision_id: "p-draft", reference_id: "ref-proxy", quote: "A draft sentence about proxies" },
      { provision_id: "p-other", reference_id: "ref-proxy", quote: "Elsewhere text about proxies." },
      { ...good, quote: "Poxies" },
      { provision_id: 5, reference_id: "ref-proxy" },
      "not an object",
    ];
    expect(await call(routes.suggest, "doc")).toMatchObject({
      suggested: 0,
      rejected_by_reason: { quote_not_in_text: 1, unknown_provision: 3, quote_too_short: 1, malformed: 2 },
    });
    expect(suggested()).toHaveLength(0);
  });

  it("a pair that already has a flag is not proposed again, nor twice in one run, nor after it was dismissed", async () => {
    as("u-admin");
    h.suggestions = [{ provision_id: "p-bond", reference_id: "ref-bond", quote: "The Treasurer shall be bonded" }, good, good];
    expect(await call(routes.suggest, "doc")).toMatchObject({ suggested: 1, rejected_by_reason: { already_flagged: 1, duplicate: 1 } });
    const id = suggested()[0]!.id;
    await call(routes.status, id, {}, { status: "dismissed" });
    h.suggestions = [good];
    expect(await call(routes.suggest, "doc")).toMatchObject({ suggested: 0, rejected_by_reason: { already_flagged: 1 } });
    expect(suggested()).toHaveLength(1);
  });

  it("a valid suggestion is saved as ai_suggested / suggested with the library's own citation and no rule from the model", async () => {
    as("u-admin");
    h.suggestions = [good, { provision_id: "p-proxy", reference_id: "ref-bond", quote: "filed with theCounty before the meeting.", statute_rule: "The model's own rule.", relationship: "statute_controls" }];
    expect(await call(routes.suggest, "doc")).toMatchObject({ suggested: 2, rejected: 0, provisions: 2, references: 2 });
    const [a, b] = suggested() as any[];
    expect(a).toMatchObject({
      organization: ORG, origin: "ai_suggested", status: "suggested", relationship: "counsel_review", severity: "info",
      topic: "718.112(2)(b)", statute_citation: "718.112(2)(b)", statute_rule: null, document_rule: null,
      quoted_text: "Poxies shall be in writing and filed with theCounty",
    });
    expect(b).toMatchObject({ topic: "Fidelity bonding", statute_rule: "Library summary, as curated.", relationship: "counsel_review", document_rule: null });
    expect(JSON.stringify(flags())).not.toContain("The model's own rule.");
    expect(db.all("hoa_statute_flags_provisions", { flag: a.id })).toMatchObject([{ provision: "p-proxy" }]);
    expect(db.all("hoa_statute_flags_references", { flag: a.id })).toMatchObject([{ reference: "ref-proxy" }]);
  });

  it("never writes a provision, charges the wallet, and leaves one audit row", async () => {
    as("u-admin");
    h.suggestions = [good, { ...good, reference_id: "ref-invented" }];
    await call(routes.suggest, "doc");
    expect(writes.filter((w) => w.collection === "hoa_governing_provisions")).toHaveLength(0);
    expect(db.all("hoa_governing_provisions", { id: "p-proxy" })[0]!.text).toBe(PROXY);
    expect(h.charges).toMatchObject([{ orgId: ORG, userId: "u-admin", feature: "flags" }]);
    expect(audit()).toHaveLength(1);
    expect(audit()[0]).toMatchObject({
      action: "flags_suggest", organization: ORG, document: "doc", actor_user: "u-admin",
      after: { suggested: 1, rejected: 1, rejected_by_reason: { unknown_reference: 1 }, credits: 7 },
    });
  });

  it("a reply that was cut off or refused saves nothing", async () => {
    as("u-admin");
    h.suggestions = [good];
    for (const reason of ["max_tokens", "refusal"]) {
      h.stopReason = reason;
      await expect(call(routes.suggest, "doc")).rejects.toMatchObject({ statusCode: 422 });
    }
    expect(suggested()).toHaveLength(0);
    expect(audit()).toHaveLength(0);
  });
});

describe("a member cannot see a suggestion (criterion 7)", () => {
  it("not on the provision, the document, the overview or in search; a manager can, and a member can once it is confirmed", async () => {
    as("u-admin");
    h.suggestions = [good];
    await call(routes.suggest, "doc");
    const id = suggested()[0]!.id as string;

    as("u-member");
    const seen = JSON.stringify([
      await call(routes.provision, "p-proxy"),
      await call(routes.document, "doc"),
      await call(routes.overview, ""),
      await call(routes.search, "", { q: "Poxies" }),
    ]);
    expect(seen).not.toContain(id);
    expect(seen).not.toContain("718.112(2)(b)");
    expect(seen).not.toContain("ai_suggested");
    await expect(call(routes.status, id, {}, { status: "confirmed" })).rejects.toMatchObject({ statusCode: 403 });

    as("u-admin");
    const overview = await call(routes.overview, "");
    expect(overview.suggested.map((f: any) => f.id)).toEqual([id]);
    expect(overview.suggested[0]).toMatchObject({ origin: "ai_suggested", quoted_text: good.quote });
    expect(overview.open_questions.map((f: any) => f.id)).not.toContain(id);
    await call(routes.status, id, {}, { status: "confirmed" });

    as("u-member");
    const after = await call(routes.provision, "p-proxy");
    expect(JSON.stringify(after)).toContain(id);
  });
});

describe("the checks themselves", () => {
  const known = { provisions: new Map([["p", "Exactly  these words, with theCounty."]]), references: new Set(["r"]), existing: new Set<string>() };
  it("the quote must match character for character", () => {
    const check = (quote: string) => validateSuggestions([{ provision_id: "p", reference_id: "r", quote }], known).accepted.length;
    expect(check("Exactly  these words")).toBe(1);
    expect(check("Exactly these words")).toBe(0);
    expect(check("exactly  these words")).toBe(0);
    expect(check("with the County")).toBe(0);
  });
  it("anything that is not a list yields nothing", () => {
    for (const raw of [null, undefined, "x", { suggestions: [] }]) expect(validateSuggestions(raw, known)).toEqual({ accepted: [], rejected: [] });
  });
  it("batches keep every provision, in order, and never split one", () => {
    const items = [{ text: "a".repeat(60) }, { text: "b".repeat(60) }, { text: "c".repeat(200) }, { text: "d" }];
    const batches = batchBySize(items, 100);
    expect(batches.flat()).toEqual(items);
    expect(batches.map((b) => b.length)).toEqual([1, 1, 1, 1]);
    expect(batchBySize(items, 1000)).toEqual([items]);
  });
});

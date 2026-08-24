/**
 * useDirectorLayer owns one translation, and getting it wrong fails silently.
 *
 * A violation detail page announces itself to the AI context as `violation`.
 * There is no `hoa_violations` collection — a violation is a row in
 * `hoa_requests` — so the notices generators call it `request`, and so does
 * `entityRefFor()` when it stamps `ai_actions.entity_type`. Ask the notices
 * endpoint about a `violation` and it returns an empty list, cheerfully,
 * forever. The same for a ticket.
 *
 * Everything else here is about the surface never over-reaching: it does not
 * query for notices on an entity type that has no generators, and its scope
 * mapping never sends a hub to a subject that would come back empty.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ref, computed } from "vue";

let routePath: string;
let context: any;
let noticesRefreshCalls: any[];
let actionQueries: any[];
let planPosts: any[];
let planResponse: any;
let planThrows: any;

beforeEach(() => {
  vi.resetModules();
  routePath = "/acme/admin/requests";
  context = { route: routePath, scope: "requests", focus: "requests, tickets, and violations" };
  noticesRefreshCalls = [];
  actionQueries = [];
  planPosts = [];
  planThrows = null;
  planResponse = {
    planId: "plan-1",
    cacheKey: "org::requests::",
    cached: false,
    savedAt: null,
    subject: "requests",
    entityType: null,
    entityId: null,
    intro: "Two things are overdue.",
    points: ["Chase the roofer"],
    money: null,
    agenda: null,
    steps: [],
    stepCount: 2,
    credits: 12,
  };

  vi.stubGlobal("useRoute", () => ({ path: routePath, fullPath: routePath, params: {} }));
  vi.stubGlobal("useAiContext", () => ({ currentContext: computed(() => context) }));
  vi.stubGlobal("useAiAssistant", () => ({ open: vi.fn(), openWith: vi.fn() }));
  vi.stubGlobal("useAINotices", (_org: any, opts?: any) => ({
    notices: ref([]),
    loading: ref(false),
    dismiss: vi.fn(),
    hydrateDismissed: vi.fn(),
    refresh: async (o?: any) => {
      noticesRefreshCalls.push({ scope: o ?? null, stateKey: opts?.stateKey ?? null });
    },
  }));
  vi.stubGlobal("useAiActions", () => ({
    actions: ref([]),
    pending: computed(() => []),
    pendingCount: ref(0),
    loading: ref(false),
    busyId: ref(null),
    refreshPendingCount: vi.fn(),
    fetchActions: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    edit: vi.fn(),
    undo: vi.fn(),
  }));
  vi.stubGlobal("$fetch", async (url: string, opts: any) => {
    if (url === "/api/ai/director/plan") {
      planPosts.push(opts?.body);
      if (planThrows) throw planThrows;
      return planResponse;
    }
    actionQueries.push(opts?.query);
    return { actions: [] };
  });
});

const load = async () =>
  (await import("#core/app/composables/useDirectorLayer")).useDirectorLayer;

/** Point the shared selected-org state at a community. */
function selectOrg(id: string) {
  (globalThis as any).useState("selectedOrgId", () => null).value = id;
}

describe("the vocabulary boundary", () => {
  it("asks the notices engine about a REQUEST when the page says violation", async () => {
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer(() => ({ entityType: "violation", entityId: "v9", label: "Fence" }));

    expect(d.groundedType.value).toBe("request");
    expect(d.hasNotices.value).toBe(true);

    await d.refreshNotices();
    expect(noticesRefreshCalls).toEqual([
      { scope: { entityType: "request", entityId: "v9" }, stateKey: "entity:request:v9" },
    ]);
  });

  it("does the same for a ticket", async () => {
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer(() => ({ entityType: "ticket", entityId: "t3", label: "Gate" }));
    expect(d.groundedType.value).toBe("request");
  });

  it("leaves a type that already agrees with itself alone", async () => {
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer(() => ({ entityType: "project", entityId: "p1", label: "Roof" }));
    expect(d.groundedType.value).toBe("project");
    expect(d.hasNotices.value).toBe(true);
  });

  it("scopes the pending-proposal query with the grounded type too", async () => {
    // ai_actions.entity_type is stamped by entityRefFor(), which also says
    // `request` — so a violation's queue is only found under that word.
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer(() => ({ entityType: "violation", entityId: "v9", label: "Fence" }));
    await d.refreshEntityPending();
    expect(actionQueries[0]).toEqual({
      orgId: "org-1",
      entityType: "request",
      entityId: "v9",
      status: "pending",
    });
  });

  it("does not ask about an entity type no generator covers", async () => {
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer(() => ({ entityType: "document", entityId: "d1", label: "CC&Rs" }));
    expect(d.hasNotices.value).toBe(false);
    await d.refreshNotices();
    expect(noticesRefreshCalls).toEqual([]);
  });
});

describe("following the page", () => {
  it("falls back to the page's own AI context when given no scope", async () => {
    context = { ...context, entityType: "member", entityId: "m4", label: "Unit 12" };
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer();
    expect(d.hasEntity.value).toBe(true);
    expect(d.groundedType.value).toBe("member");
    expect(d.subjectName.value).toBe("Unit 12");
  });

  it("lets an explicit scope win over the page context", async () => {
    context = { ...context, entityType: "member", entityId: "m4", label: "Unit 12" };
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer(() => ({ entityType: "project", entityId: "p1", label: "Roof" }));
    expect(d.groundedType.value).toBe("project");
  });

  it("is in scope mode with no entity anywhere", async () => {
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer();
    expect(d.hasEntity.value).toBe(false);
    expect(d.scopeName.value).toBe("Requests");
    expect(d.scopeSubject.value).toBe("requests");
  });
});

describe("the scope → subject map", () => {
  const cases: Array<[string, string, string, string]> = [
    // route path, context scope, expected name, expected subject
    ["/acme/admin/requests", "requests", "Requests", "requests"],
    ["/acme/admin/payments", "money", "Money", "money"],
    ["/acme/admin/projects", "work", "Projects", "projects"],
    ["/acme/admin/meetings", "governance", "Meetings", "meetings"],
    ["/acme/admin/members", "people", "People", "money"],
    ["/acme/admin/vendors", "people", "Vendors", "vendors"],
  ];

  for (const [path, scope, name, subject] of cases) {
    it(`maps ${path} to ${name} / ${subject}`, async () => {
      routePath = path;
      context = { route: path, scope };
      const useDirectorLayer = await load();
      selectOrg("org-1");
      const d = useDirectorLayer();
      expect(d.scopeName.value).toBe(name);
      expect(d.scopeSubject.value).toBe(subject);
    });
  }

  it("separates Vendors from the rest of People, which the route scope alone cannot", async () => {
    // deriveRouteFocus files /vendors under `people` alongside the member
    // roster. Without the path check both hubs would plan the same subject.
    routePath = "/acme/admin/vendors";
    context = { route: routePath, scope: "people" };
    const useDirectorLayer = await load();
    selectOrg("org-1");
    expect(useDirectorLayer().scopeSubject.value).toBe("vendors");
  });

  it("plans org-wide from the dashboard rather than guessing a subject", async () => {
    routePath = "/acme";
    context = { route: routePath, scope: "dashboard" };
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer();
    expect(d.scopeSubject.value).toBeNull();
    expect(d.scopeName.value).toBe("your association");
  });
});

describe("it does nothing without a community", () => {
  it("skips every fetch when no org is selected", async () => {
    const useDirectorLayer = await load();
    selectOrg("");
    const d = useDirectorLayer(() => ({ entityType: "request", entityId: "r1", label: "Leak" }));
    await d.refreshNotices();
    await d.refreshEntityPending();
    expect(noticesRefreshCalls).toEqual([]);
    expect(actionQueries).toEqual([]);
    expect(await d.proposeFromNotice("request-aged-r1")).toBeNull();
  });
});

/**
 * planThis is the single handler that reaches the Board Room. Phase 5 shipped it
 * opening the assistant panel because the endpoint did not exist; Phase 6 points
 * it at the real one. Two things must stay true through that swap:
 *
 *   · it still drafts NOTHING until someone clicks — the pill is ambient, and a
 *     surface that spends credits on mount is a surface nobody trusts;
 *   · it asks about the thing the page is actually about, in the vocabulary the
 *     server understands (`request`, never `violation`).
 */
describe("planThis — the one handler that reaches the Board Room", () => {
  it("drafts nothing on its own — only a call reaches the endpoint", async () => {
    const useDirectorLayer = await load();
    selectOrg("org-1");
    useDirectorLayer();
    await Promise.resolve();
    expect(planPosts).toEqual([]);
  });

  it("plans the hub's own subject when nothing is in focus", async () => {
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer();
    const plan = await d.planThis();
    expect(planPosts).toEqual([{ orgId: "org-1", subject: "requests" }]);
    expect(plan?.intro).toBe("Two things are overdue.");
    expect(d.plan.value?.planId).toBe("plan-1");
  });

  it("pins to the record in view, translated into the server's vocabulary", async () => {
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer(() => ({ entityType: "violation", entityId: "r1", label: "Fence" }));
    await d.planThis();
    expect(planPosts).toEqual([
      { orgId: "org-1", entityType: "request", entityId: "r1" },
    ]);
  });

  it("refreshes the approvals queue, because the steps ARE the queue", async () => {
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer();
    await d.planThis();
    expect(d.actions.refreshPendingCount).toHaveBeenCalled();
    expect(d.actions.fetchActions).toHaveBeenCalled();
  });

  it("holds the button while the model works, and lets it go afterwards", async () => {
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer();
    const inFlight = d.planThis();
    expect(d.planning.value).toBe(true);
    await inFlight;
    expect(d.planning.value).toBe(false);
  });

  it("refuses to start a second draft over the first", async () => {
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer();
    const first = d.planThis();
    const second = await d.planThis();
    await first;
    expect(second).toBeNull();
    expect(planPosts).toHaveLength(1);
  });

  it("says so plainly when the community is out of credits", async () => {
    planResponse = { error: "insufficient_credits", balanceCredits: 0 };
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer();
    expect(await d.planThis()).toBeNull();
    expect(d.planError.value).toMatch(/credits/i);
    expect(d.plan.value).toBeNull();
  });

  it("surfaces the server's own message when the draft fails", async () => {
    planThrows = { data: { message: "Admin or board access required" } };
    const useDirectorLayer = await load();
    selectOrg("org-1");
    const d = useDirectorLayer();
    expect(await d.planThis()).toBeNull();
    expect(d.planError.value).toBe("Admin or board access required");
    expect(d.planning.value).toBe(false);
  });

  it("does nothing at all without a community", async () => {
    const useDirectorLayer = await load();
    selectOrg("");
    const d = useDirectorLayer();
    expect(await d.planThis()).toBeNull();
    expect(planPosts).toEqual([]);
  });
});

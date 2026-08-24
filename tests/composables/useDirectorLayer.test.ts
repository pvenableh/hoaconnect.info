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

beforeEach(() => {
  vi.resetModules();
  routePath = "/acme/admin/requests";
  context = { route: routePath, scope: "requests", focus: "requests, tickets, and violations" };
  noticesRefreshCalls = [];
  actionQueries = [];

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
  vi.stubGlobal("$fetch", async (_url: string, opts: any) => {
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

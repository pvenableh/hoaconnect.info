import { describe, it, expect, vi, beforeEach } from "vitest";
import { reactive, ref, nextTick } from "vue";

const confirmAnswer = { value: true };
const confirmCalls: unknown[] = [];
vi.mock("#core/app/composables/useConfirm", () => ({
  useConfirm: () => ({
    confirm: async (o: unknown) => {
      confirmCalls.push(o);
      return confirmAnswer.value;
    },
  }),
}));
const toasts: string[] = [];
vi.mock("vue-sonner", () => ({
  toast: { success: (m: string) => toasts.push(`ok:${m}`), error: (m: string) => toasts.push(`err:${m}`) },
}));

import { applyResourceView, countByStatus, foldText, groupRows, useResource, type ResourceDefinition } from "#core/app/composables/useResource";
import { useAppSlideOverStackUrlSync } from "#core/app/composables/useAppSlideOverStack";

interface Charge {
  id: string;
  title: string;
  member: string;
  status: "active" | "paid" | "canceled";
  type: "dues" | "fee";
}

const ROWS: Charge[] = [
  { id: "c1", title: "October dues", member: "José Ortiz", status: "active", type: "dues" },
  { id: "c2", title: "Late fee", member: "Ann Lee", status: "active", type: "fee" },
  { id: "c3", title: "September dues", member: "Ann Lee", status: "paid", type: "dues" },
  { id: "c4", title: "Old fee", member: "Bo Chan", status: "canceled", type: "fee" },
];

const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
};

let route: { query: Record<string, unknown> };
let loads: string[];
let rowsByOrg: Record<string, Charge[]>;

function def(over: Partial<ResourceDefinition<Charge>> = {}): ResourceDefinition<Charge> {
  return {
    key: "charges",
    panel: "charge",
    load: async (orgId) => {
      loads.push(orgId);
      return rowsByOrg[orgId] ?? [];
    },
    search: (r) => [r.title, r.member],
    statuses: [
      { value: "outstanding", label: "Outstanding", match: (r) => r.status === "active" },
      { value: "paid", label: "Paid", match: (r) => r.status === "paid" },
      { value: "all", label: "All" },
    ],
    filters: { type: { initial: "all", match: (r, v) => r.type === v } },
    ...over,
  };
}

beforeEach(() => {
  loads = [];
  rowsByOrg = { org1: [...ROWS], org2: [{ id: "x1", title: "Dues", member: "Z", status: "active", type: "dues" }] };
  confirmAnswer.value = true;
  confirmCalls.length = 0;
  toasts.length = 0;
  route = reactive({ query: {} as Record<string, unknown> });
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useRouter", () => ({
    push: async (to: { query: Record<string, unknown> }) => {
      route.query = to.query;
    },
    replace: async (to: { query: Record<string, unknown> }) => {
      route.query = to.query;
    },
    back: () => {},
  }));
});

describe("countByStatus", () => {
  it("counts each status's rows, and every row for a status without match", () => {
    const counts = countByStatus(ROWS, def().statuses!);
    const statuses = def().statuses!;
    for (const st of statuses) expect(counts[st.value]).toBe(st.match ? ROWS.filter(st.match).length : ROWS.length);
    expect(Object.keys(counts)).toEqual(statuses.map((st) => st.value));
  });
  it("is zero for an empty list", () => expect(Object.values(countByStatus([], def().statuses!)).every((n) => n === 0)).toBe(true));
});

describe("applyResourceView", () => {
  const d = def();
  const view = (o: Partial<{ query: string; status: string; filters: Record<string, string> }> = {}) =>
    applyResourceView(ROWS, d, { query: "", status: "outstanding", filters: { type: "all" }, ...o }).map((r) => r.id);

  it("the default status shows only its rows", () => expect(view()).toEqual(["c1", "c2"]));
  it("a status without match shows every row", () => expect(view({ status: "all" })).toEqual(["c1", "c2", "c3", "c4"]));
  it("an unknown status filters nothing", () => expect(view({ status: "nope" })).toHaveLength(4));
  it("a filter at its initial value is off", () => expect(view({ status: "all", filters: { type: "all" } })).toHaveLength(4));
  it("a filter narrows", () => expect(view({ status: "all", filters: { type: "fee" } })).toEqual(["c2", "c4"]));
  it("search folds case and accents", () => expect(view({ query: "jose" })).toEqual(["c1"]));
  it("every search term must match", () => {
    expect(view({ status: "all", query: "ann dues" })).toEqual(["c3"]);
    expect(view({ status: "all", query: "ann october" })).toEqual([]);
  });
  it("blank search matches all", () => expect(view({ query: "   " })).toEqual(["c1", "c2"]));
  it("foldText strips marks", () => expect(foldText("Ñandú ÉTÉ")).toBe("nandu ete"));
});

describe("groupRows", () => {
  const rows = [
    { id: 1, cat: "b" },
    { id: 2, cat: "a" },
    { id: 3, cat: "b" },
    { id: 4, cat: "zz" },
    { id: 5, cat: null as string | null },
  ];
  const groups = [
    { key: "a", label: "Alpha" },
    { key: "b", label: "Bravo" },
    { key: "c", label: "Charlie" },
  ];
  const run = () => groupRows(rows, (r) => r.cat, groups);

  it("sections follow the order given, not the order the rows came in", () =>
    expect(run().map((g) => g.key)).toEqual(["a", "b", "zz", ""]));
  it("rows keep their order inside a section", () => expect(run()[1]!.rows.map((r) => r.id)).toEqual([1, 3]));
  it("a section with no rows is left out", () => expect(run().some((g) => g.key === "c")).toBe(false));
  it("a listed section reads its label; an unlisted one reads its key; none reads Other", () =>
    expect(run().map((g) => g.label)).toEqual(["Alpha", "Bravo", "zz", "Other"]));
  it("no groups listed: sections in the order first seen", () =>
    expect(groupRows(rows, (r) => r.cat).map((g) => g.key)).toEqual(["b", "a", "zz", ""]));
  it("no rows, no sections", () => expect(groupRows([], () => "a", groups)).toEqual([]));
});

describe("loading", () => {
  it("loads for the org, then shows the default status", async () => {
    const orgId = ref<string | null>("org1");
    const r = useResource(def(), { orgId });
    expect(r.pending).toBe(true);
    await flush();
    expect(loads).toEqual(["org1"]);
    expect(r.pending).toBe(false);
    expect(r.total).toBe(4);
    expect(r.visible.map((x) => x.id)).toEqual(["c1", "c2"]);
    expect(r.count).toBe(2);
  });

  it("does not load without an org", async () => {
    const r = useResource(def(), { orgId: ref(null) });
    await flush();
    expect(loads).toEqual([]);
    expect(r.rows).toEqual([]);
  });

  it("a panel with reuse shares the index's rows and makes no second request", async () => {
    const orgId = ref("org1");
    const index = useResource(def(), { orgId });
    await flush();
    const panel = useResource(def(), { orgId, reuse: true });
    await flush();
    expect(loads).toEqual(["org1"]);
    expect(panel.find("c3")?.title).toBe("September dues");
    expect(index.find("missing")).toBeNull();
  });

  it("an index and a panel mounting together fetch once", async () => {
    const orgId = ref("org1");
    useResource(def(), { orgId });
    const panel = useResource(def(), { orgId, reuse: true });
    await flush();
    expect(loads).toEqual(["org1"]);
    expect(panel.find("c1")).not.toBeNull();
  });

  it("an org switch hides the old rows and loads the new org", async () => {
    const orgId = ref("org1");
    const r = useResource(def(), { orgId });
    await flush();
    orgId.value = "org2";
    // Before the watcher has even run, org1's rows are not shown for org2.
    expect(r.rows).toEqual([]);
    expect(r.pending).toBe(true);
    await flush();
    expect(loads).toEqual(["org1", "org2"]);
    expect(r.rows.map((x) => x.id)).toEqual(["x1"]);
  });

  it("a response that lands after the org changed is dropped", async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    const orgId = ref("org1");
    const r = useResource(
      def({
        load: async (id) => {
          loads.push(id);
          if (id === "org1") await gate;
          return rowsByOrg[id] ?? [];
        },
      }),
      { orgId },
    );
    await nextTick();
    orgId.value = "org2";
    await flush();
    release();
    await flush();
    expect(r.rows.map((x) => x.id)).toEqual(["x1"]);
  });

  it("a failed load sets error and stops pending", async () => {
    const r = useResource(
      def({
        load: async () => {
          throw new Error("403 money:read required");
        },
      }),
      { orgId: ref("org1") },
    );
    await flush();
    expect(r.error).toBe("403 money:read required");
    expect(r.pending).toBe(false);
    expect(r.rows).toEqual([]);
  });
});

describe("filters", () => {
  it("binds query, status and filters; reset clears search and filters but keeps the status", async () => {
    const r = useResource(def(), { orgId: ref("org1") });
    await flush();
    r.status = "all";
    r.filters.type = "fee";
    expect(r.visible.map((x) => x.id)).toEqual(["c2", "c4"]);
    expect(r.isFiltered).toBe(true);
    r.query = "bo";
    expect(r.visible.map((x) => x.id)).toEqual(["c4"]);
    r.reset();
    expect(r.status).toBe("all");
    expect(r.filters.type).toBe("all");
    expect(r.query).toBe("");
    expect(r.isFiltered).toBe(false);
  });

  it("statusItems carry value and label for AppSegmentedControl, and a count for the summary strip", () => {
    const r = useResource(def(), { orgId: ref(null) });
    expect(r.statusItems).toEqual([
      { value: "outstanding", label: "Outstanding", count: 0 },
      { value: "paid", label: "Paid", count: 0 },
      { value: "all", label: "All", count: 0 },
    ]);
  });
});

describe("selection", () => {
  it("toggles, selects the visible rows, and clears", async () => {
    const r = useResource(def(), { orgId: ref("org1") });
    await flush();
    r.toggle(r.find("c1")!);
    expect(r.selected).toEqual(["c1"]);
    expect(r.isSelected(r.find("c1")!)).toBe(true);
    r.toggle(r.find("c1")!);
    expect(r.selected).toEqual([]);
    r.selectAll();
    expect(r.selected).toEqual(["c1", "c2"]);
    expect(r.selectedRows.map((x) => x.id)).toEqual(["c1", "c2"]);
    r.clear();
    expect(r.selected).toEqual([]);
  });

  it("drops ids that leave the rows", async () => {
    const r = useResource(def(), { orgId: ref("org1") });
    await flush();
    r.selectAll();
    rowsByOrg.org1 = ROWS.filter((x) => x.id !== "c2");
    await r.refresh();
    await flush();
    expect(r.selected).toEqual(["c1"]);
  });

  it("clears on an org switch", async () => {
    const orgId = ref("org1");
    const r = useResource(def(), { orgId });
    await flush();
    r.selectAll();
    orgId.value = "org2";
    await flush();
    expect(r.selected).toEqual([]);
  });
});

describe("open panel", () => {
  it("opens the row on ?slide and reports its id", async () => {
    useAppSlideOverStackUrlSync();
    const r = useResource(def(), { orgId: ref("org1") });
    await flush();
    await r.open(r.find("c2")!);
    await nextTick();
    expect(route.query.slide).toBe("charge:c2");
    expect(r.openId).toBe("c2");
  });

  it("a resource without a panel opens nothing", async () => {
    const r = useResource(def({ panel: undefined }), { orgId: ref("org1") });
    await flush();
    await r.open(r.find("c1")!);
    expect(route.query.slide).toBeUndefined();
    expect(r.openId).toBeNull();
  });
});

describe("remove", () => {
  const removeDef = (run: (r: Charge) => Promise<unknown>) =>
    def({
      remove: {
        label: "Cancel Charge",
        confirm: (r) => ({ title: `Cancel ${r.title} for ${r.member}?`, destructive: true }),
        run,
        done: "Charge canceled",
      },
    });

  it("asks, naming the record, and does nothing on No", async () => {
    confirmAnswer.value = false;
    const run = vi.fn(async () => {});
    const r = useResource(removeDef(run), { orgId: ref("org1") });
    await flush();
    expect(await r.remove(r.find("c1")!)).toBe(false);
    expect(confirmCalls).toEqual([{ title: "Cancel October dues for José Ortiz?", destructive: true }]);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs, toasts and reloads on Yes", async () => {
    const run = vi.fn(async (c: Charge) => {
      rowsByOrg.org1 = rowsByOrg.org1!.map((x) => (x.id === c.id ? { ...x, status: "canceled" as const } : x));
    });
    const r = useResource(removeDef(run), { orgId: ref("org1") });
    await flush();
    expect(r.canRemove).toBe(true);
    expect(r.removeLabel).toBe("Cancel Charge");
    expect(await r.remove(r.find("c1")!)).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(toasts).toEqual(["ok:Charge canceled"]);
    expect(loads).toEqual(["org1", "org1"]);
    expect(r.visible.map((x) => x.id)).toEqual(["c2"]);
  });

  it("toasts the error and keeps the rows when run fails", async () => {
    const r = useResource(
      removeDef(async () => {
        throw new Error("Forbidden");
      }),
      { orgId: ref("org1") },
    );
    await flush();
    expect(await r.remove(r.find("c1")!)).toBe(false);
    expect(toasts).toEqual(["err:Forbidden"]);
    expect(loads).toEqual(["org1"]);
  });

  it("is a no-op without a remove definition", async () => {
    const r = useResource(def(), { orgId: ref("org1") });
    await flush();
    expect(r.canRemove).toBe(false);
    expect(await r.remove(r.find("c1")!)).toBe(false);
    expect(confirmCalls).toEqual([]);
  });
});

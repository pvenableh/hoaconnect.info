/**
 * Charges on the scaffold (docs/spec-resource-scaffold.md). The read goes
 * through GET /api/org/money/charges (useMoneyReads, gated by money:read) and
 * never through Directus, so the scaffold widens neither read. The default
 * view, the type filter, search, Ask to waive and Mark paid are the page's
 * behaviour, now owned by the resource. Nothing cancels a charge directly:
 * Ask to waive sends it to the board (docs/spec-money-approvals.md).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { reactive, ref, nextTick } from "vue";

const promptCalls: Array<{ title: string; body?: string; required?: boolean }> = [];
let promptAnswer: string | null = "Storm damage";
vi.mock("#core/app/composables/useConfirm", () => ({
  useConfirm: () => ({
    confirm: async () => true,
    prompt: async (o: { title: string }) => {
      promptCalls.push(o);
      return promptAnswer;
    },
  }),
}));
vi.mock("vue-sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

import { useChargesResource, isOpenCharge, canAskToWaive, chargeMemberName } from "#core/app/composables/useChargesResource";

const CHARGES = [
  { id: "c1", title: "October Dues", status: "active", request_type: "monthly_dues", amount: 300, amount_remaining: 300, member: { id: "m1", first_name: "José", last_name: "Ortiz" } },
  { id: "c2", title: "Roof", status: "overdue", request_type: "assessment", amount: 900, amount_remaining: 450, member: { id: "m2", first_name: "Ann", last_name: "Lee" } },
  { id: "c3", title: "September Dues", status: "paid", request_type: "monthly_dues", amount: 300, amount_remaining: 0, member: { id: "m2", first_name: "Ann", last_name: "Lee" } },
  { id: "c4", title: "Late fee", status: "canceled", request_type: "late_fee", amount: 25, member: null },
  { id: "c5", title: "Fine", status: "active", request_type: "other", amount: 50, amount_remaining: 50, member: null, waiver_pending: true },
];

let listCharges: ReturnType<typeof vi.fn>;
let canEnter = true;
let directusList: ReturnType<typeof vi.fn>;
let directusUpdate: ReturnType<typeof vi.fn>;
let fetches: Array<{ url: string; opts: unknown }>;

const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  promptCalls.length = 0;
  promptAnswer = "Storm damage";
  canEnter = true;
  fetches = [];
  listCharges = vi.fn(async () => CHARGES.map((c) => ({ ...c })));
  directusList = vi.fn();
  directusUpdate = vi.fn(async () => ({}));
  vi.stubGlobal("useMoneyReads", () => ({
    listChargesWithViewer: async (orgId: string, opts: unknown) => ({ charges: await listCharges(orgId, opts), canEnter }),
  }));
  vi.stubGlobal("useDirectusItems", () => ({ list: directusList, update: directusUpdate }));
  vi.stubGlobal("$fetch", async (url: string, opts: unknown) => {
    fetches.push({ url, opts });
    return {};
  });
  const route = reactive({ query: {} as Record<string, unknown> });
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useRouter", () => ({
    push: async (to: { query: Record<string, unknown> }) => {
      route.query = to.query;
    },
    replace: async () => {},
    back: () => {},
  }));
});

describe("Charges resource", () => {
  it("reads through the money route, 200 rows, and never lists from Directus", async () => {
    const { resource } = useChargesResource(ref("org1"));
    await flush();
    expect(listCharges).toHaveBeenCalledWith("org1", { limit: 200 });
    expect(directusList).not.toHaveBeenCalled();
    expect(resource.total).toBe(5);
  });

  it("opens on Outstanding: neither paid nor canceled", async () => {
    const { resource } = useChargesResource(ref("org1"));
    await flush();
    expect(resource.status).toBe("outstanding");
    expect(resource.visible.map((c) => c.id)).toEqual(["c1", "c2", "c5"]);
    resource.status = "paid";
    expect(resource.visible.map((c) => c.id)).toEqual(["c3"]);
    resource.status = "all";
    expect(resource.count).toBe(5);
  });

  it("filters by type and searches member, title and type label", async () => {
    const { resource } = useChargesResource(ref("org1"));
    await flush();
    resource.status = "all";
    resource.filters.type = "monthly_dues";
    expect(resource.visible.map((c) => c.id)).toEqual(["c1", "c3"]);
    resource.filters.type = "all";
    resource.query = "jose";
    expect(resource.visible.map((c) => c.id)).toEqual(["c1"]);
    resource.query = "assessment";
    expect(resource.visible.map((c) => c.id)).toEqual(["c2"]);
  });

  it("the panel shares the index's rows with no second request", async () => {
    const orgId = ref("org1");
    useChargesResource(orgId);
    const { resource: panel } = useChargesResource(orgId, { reuse: true });
    await flush();
    expect(listCharges).toHaveBeenCalledTimes(1);
    expect(panel.find("c2")?.title).toBe("Roof");
    expect(panel.panel).toBe("charge");
  });

  it("has no direct cancel: nothing removes a charge or writes it through Directus", async () => {
    const { resource } = useChargesResource(ref("org1"));
    await flush();
    expect(resource.canRemove).toBe(false);
    expect(resource.removeLabel).toBeNull();
    expect(directusUpdate).not.toHaveBeenCalled();
  });

  it("Ask to waive asks why, naming the charge, the member and what they owe, then sends it to the board", async () => {
    const { resource, askWaive, canEnter: viewerCanEnter } = useChargesResource(ref("org1"));
    await flush();
    expect(viewerCanEnter.value).toBe(true);
    await askWaive(resource.find("c2")!);
    expect(promptCalls[0]).toMatchObject({
      title: "Ask to waive “Roof”?",
      body: expect.stringContaining("Ann Lee would no longer owe $450.00."),
      required: true,
    });
    expect(fetches).toEqual([{ url: "/api/org/money/charges/c2/waive", opts: { method: "POST", body: { orgId: "org1", reason: "Storm damage" } } }]);
    expect(directusUpdate).not.toHaveBeenCalled();
    expect(listCharges).toHaveBeenCalledTimes(2);
  });

  it("sends nothing when the reason is dismissed, for a waiver already waiting, or without money:enter", async () => {
    promptAnswer = null;
    const { resource, askWaive } = useChargesResource(ref("org1"));
    await flush();
    await askWaive(resource.find("c1")!);
    promptAnswer = "x";
    await askWaive(resource.find("c5")!);
    await askWaive(resource.find("c3")!);
    expect(fetches).toEqual([]);
  });

  it("offers Ask to waive only to money:enter holders, on an open charge with no waiver waiting", () => {
    const open = CHARGES[0]!;
    expect(canAskToWaive(open, true)).toBe(true);
    expect(canAskToWaive(open, false)).toBe(false);
    expect(canAskToWaive(CHARGES[2]!, true)).toBe(false);
    expect(canAskToWaive(CHARGES[4]!, true)).toBe(false);
  });

  it("Mark paid records through the server once, then reloads", async () => {
    const { resource, markPaid, markingId } = useChargesResource(ref("org1"));
    await flush();
    const c1 = resource.find("c1")!;
    const first = markPaid(c1);
    expect(markingId.value).toBe("c1");
    await markPaid(c1); // a second click while the first is in flight
    await first;
    expect(fetches).toEqual([
      { url: "/api/org/payments/record", opts: { method: "POST", body: { orgId: "org1", paymentRequestId: "c1" } } },
    ]);
    expect(markingId.value).toBeNull();
    expect(listCharges).toHaveBeenCalledTimes(2);
  });
});

describe("charge helpers", () => {
  it("isOpenCharge", () => {
    expect(["active", "overdue", "partially_paid", "draft"].every((s) => isOpenCharge({ status: s as never }))).toBe(true);
    expect(isOpenCharge({ status: "paid" })).toBe(false);
    expect(isOpenCharge({ status: "canceled" })).toBe(false);
  });
  it("chargeMemberName", () => {
    expect(chargeMemberName({ first_name: "Ann", last_name: "Lee" })).toBe("Ann Lee");
    expect(chargeMemberName({ email: "a@b.c" })).toBe("a@b.c");
    expect(chargeMemberName("m1")).toBe("—");
    expect(chargeMemberName(null)).toBe("—");
  });
});

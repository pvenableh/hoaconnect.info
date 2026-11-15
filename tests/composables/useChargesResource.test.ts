/**
 * Charges on the scaffold (docs/spec-resource-scaffold.md). The read goes
 * through GET /api/org/money/charges (useMoneyReads, gated by money:read) and
 * never through Directus, so the scaffold widens neither read. The default
 * view, the type filter, search, the cancel confirm and Mark paid are the
 * page's behaviour, now owned by the resource.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { reactive, ref, nextTick } from "vue";

const confirmCalls: Array<{ title: string; body?: string; destructive?: boolean }> = [];
vi.mock("#core/app/composables/useConfirm", () => ({
  useConfirm: () => ({
    confirm: async (o: { title: string }) => {
      confirmCalls.push(o);
      return true;
    },
  }),
}));
vi.mock("vue-sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

import { useChargesResource, isOpenCharge, chargeMemberName } from "#core/app/composables/useChargesResource";

const CHARGES = [
  { id: "c1", title: "October Dues", status: "active", request_type: "monthly_dues", amount: 300, amount_remaining: 300, member: { id: "m1", first_name: "José", last_name: "Ortiz" } },
  { id: "c2", title: "Roof", status: "overdue", request_type: "assessment", amount: 900, amount_remaining: 450, member: { id: "m2", first_name: "Ann", last_name: "Lee" } },
  { id: "c3", title: "September Dues", status: "paid", request_type: "monthly_dues", amount: 300, amount_remaining: 0, member: { id: "m2", first_name: "Ann", last_name: "Lee" } },
  { id: "c4", title: "Late fee", status: "canceled", request_type: "late_fee", amount: 25, member: null },
];

let listCharges: ReturnType<typeof vi.fn>;
let directusList: ReturnType<typeof vi.fn>;
let directusUpdate: ReturnType<typeof vi.fn>;
let fetches: Array<{ url: string; opts: unknown }>;

const flush = async () => {
  for (let i = 0; i < 4; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  confirmCalls.length = 0;
  fetches = [];
  listCharges = vi.fn(async () => CHARGES.map((c) => ({ ...c })));
  directusList = vi.fn();
  directusUpdate = vi.fn(async () => ({}));
  vi.stubGlobal("useMoneyReads", () => ({ listCharges }));
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
    expect(resource.total).toBe(4);
  });

  it("opens on Outstanding: neither paid nor canceled", async () => {
    const { resource } = useChargesResource(ref("org1"));
    await flush();
    expect(resource.status).toBe("outstanding");
    expect(resource.visible.map((c) => c.id)).toEqual(["c1", "c2"]);
    resource.status = "paid";
    expect(resource.visible.map((c) => c.id)).toEqual(["c3"]);
    resource.status = "all";
    expect(resource.count).toBe(4);
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

  it("cancel asks, naming the charge, the member and what they owe, then marks it canceled", async () => {
    const { resource } = useChargesResource(ref("org1"));
    await flush();
    expect(resource.removeLabel).toBe("Cancel Charge");
    await resource.remove(resource.find("c2")!);
    expect(confirmCalls[0]).toMatchObject({
      title: "Cancel “Roof”?",
      body: "Ann Lee will no longer owe $450.00. The charge stays on record as canceled.",
      destructive: true,
    });
    expect(directusUpdate).toHaveBeenCalledWith("c2", { status: "canceled" });
    expect(listCharges).toHaveBeenCalledTimes(2);
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

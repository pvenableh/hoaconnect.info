/**
 * Charges on the scaffold (docs/spec-resource-scaffold.md). The read goes
 * through GET /api/org/money/charges (useMoneyReads, gated by money:read) and
 * never through Directus, so the scaffold widens neither read. The default
 * view, the type filter, search, Ask to waive and Mark paid are the page's
 * behaviour, now owned by the resource. Nothing cancels a charge directly:
 * Ask to waive sends it to the board (docs/spec-money-approvals.md). The
 * corrections (docs/spec-charge-corrections.md) show only where the row and
 * the viewer allow: Edit and Withdraw for admins, Waive and Move for
 * money:enter holders.
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

import {
  useChargesResource,
  isOpenCharge,
  canAskToWaive,
  canEditCharge,
  canMoveCharge,
  canWithdrawCharge,
  chargeMemberName,
  chargeStatusOf,
  hasChargeMenu,
  pendingLabel,
} from "#core/app/composables/useChargesResource";

const CHARGES = [
  { id: "c1", title: "October Dues", status: "active", request_type: "monthly_dues", amount: 300, amount_remaining: 300, member: { id: "m1", first_name: "José", last_name: "Ortiz" } },
  { id: "c2", title: "Roof", status: "overdue", request_type: "assessment", amount: 900, amount_remaining: 450, member: { id: "m2", first_name: "Ann", last_name: "Lee" } },
  { id: "c3", title: "September Dues", status: "paid", request_type: "monthly_dues", amount: 300, amount_remaining: 0, member: { id: "m2", first_name: "Ann", last_name: "Lee" } },
  { id: "c4", title: "Late fee", status: "canceled", request_type: "late_fee", amount: 25, member: null },
  { id: "c5", title: "Fine", status: "active", request_type: "other", amount: 50, amount_remaining: 50, member: null, waiver_pending: true, approval_pending: { kind: "waive", amount: null } },
  { id: "c6", title: "Gate fob", status: "active", request_type: "other", amount: 40, amount_remaining: 40, member: { id: "m1", first_name: "José", last_name: "Ortiz" }, withdrawable: true, movable: true },
  { id: "c7", title: "Pool key", status: "active", request_type: "other", amount: 20, amount_remaining: 20, member: null, approval_pending: { kind: "move", amount: null } },
  { id: "c8", title: "Dock", status: "active", request_type: "other", amount: 90, amount_remaining: 90, member: null, approval_pending: { kind: "waive", amount: 30 } },
];

let listCharges: ReturnType<typeof vi.fn>;
let canEnter = true;
let canCorrect = false;
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
  canCorrect = false;
  fetches = [];
  listCharges = vi.fn(async () => CHARGES.map((c) => ({ ...c })));
  directusList = vi.fn();
  directusUpdate = vi.fn(async () => ({}));
  vi.stubGlobal("useMoneyReads", () => ({
    listChargesWithViewer: async (orgId: string, opts: unknown) => ({ charges: await listCharges(orgId, opts), canEnter, canCorrect }),
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
    expect(resource.total).toBe(CHARGES.length);
  });

  it("opens on Outstanding: neither paid nor canceled", async () => {
    const { resource } = useChargesResource(ref("org1"));
    await flush();
    expect(resource.status).toBe("outstanding");
    expect(resource.visible.map((c) => c.id)).toEqual(["c1", "c2", "c5", "c6", "c7", "c8"]);
    resource.status = "paid";
    expect(resource.visible.map((c) => c.id)).toEqual(["c3"]);
    resource.status = "all";
    expect(resource.count).toBe(CHARGES.length);
  });

  it("filters by type and searches member, title and type label", async () => {
    const { resource } = useChargesResource(ref("org1"));
    await flush();
    resource.status = "all";
    resource.filters.type = "monthly_dues";
    expect(resource.visible.map((c) => c.id)).toEqual(["c1", "c3"]);
    resource.filters.type = "all";
    resource.query = "jose";
    expect(resource.visible.map((c) => c.id)).toEqual(["c1", "c6"]);
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

  it("Ask to waive sends the reason, and a partial waiver's amount, to the board", async () => {
    const { resource, askWaive, canEnter: viewerCanEnter } = useChargesResource(ref("org1"));
    await flush();
    expect(viewerCanEnter.value).toBe(true);
    expect(await askWaive(resource.find("c2")!, { reason: " Storm damage " })).toBe(true);
    await askWaive(resource.find("c1")!, { reason: "Pool closed", amount: 50 });
    expect(fetches).toEqual([
      { url: "/api/org/money/charges/c2/waive", opts: { method: "POST", body: { orgId: "org1", reason: "Storm damage" } } },
      { url: "/api/org/money/charges/c1/waive", opts: { method: "POST", body: { orgId: "org1", reason: "Pool closed", amount: 50 } } },
    ]);
    expect(directusUpdate).not.toHaveBeenCalled();
    expect(listCharges).toHaveBeenCalledTimes(3);
  });

  it("sends nothing without a reason, for a charge with anything waiting, settled, or without money:enter", async () => {
    const { resource, askWaive, askMove } = useChargesResource(ref("org1"));
    await flush();
    await askWaive(resource.find("c1")!, { reason: "  " });
    await askWaive(resource.find("c5")!, { reason: "x" });
    await askWaive(resource.find("c7")!, { reason: "x" });
    await askWaive(resource.find("c3")!, { reason: "x" });
    await askMove(resource.find("c1")!, { member: "m2", reason: "x" }); // not movable
    expect(fetches).toEqual([]);
  });

  it("Move asks the board, with the household and the reason", async () => {
    const { resource, askMove } = useChargesResource(ref("org1"));
    await flush();
    await askMove(resource.find("c6")!, { member: "m2", reason: "Wrong unit" });
    expect(fetches).toEqual([{ url: "/api/org/money/charges/c6/move", opts: { method: "POST", body: { orgId: "org1", member: "m2", reason: "Wrong unit" } } }]);
  });

  it("an admin's Edit patches the charge, and Withdraw asks why first", async () => {
    canCorrect = true;
    const { resource, saveCorrection, withdraw, canCorrect: viewerCanCorrect } = useChargesResource(ref("org1"));
    await flush();
    expect(viewerCanCorrect.value).toBe(true);
    await saveCorrection(resource.find("c1")!, { title: "October Dues 2026", amount: 320 });
    promptAnswer = "Entered twice";
    await withdraw(resource.find("c6")!);
    expect(promptCalls[0]).toMatchObject({ title: "Withdraw “Gate fob”?", body: expect.stringContaining("José Ortiz will no longer owe $40.00."), required: true });
    await withdraw(resource.find("c1")!); // outside the window: no prompt, nothing sent
    expect(promptCalls).toHaveLength(1);
    expect(fetches).toEqual([
      { url: "/api/org/money/charges/c1", opts: { method: "PATCH", body: { orgId: "org1", title: "October Dues 2026", amount: 320 } } },
      { url: "/api/org/money/charges/c6/withdraw", opts: { method: "POST", body: { orgId: "org1", reason: "Entered twice" } } },
    ]);
  });

  it("without the admin's flag, Edit and Withdraw send nothing", async () => {
    const { resource, saveCorrection, withdraw } = useChargesResource(ref("org1"));
    await flush();
    await saveCorrection(resource.find("c1")!, { title: "x" });
    await withdraw(resource.find("c6")!);
    expect(fetches).toEqual([]);
    expect(promptCalls).toHaveLength(0);
  });

  it("offers each control only where the row and the viewer allow", () => {
    const [open, , paid, , waiting, fresh, moving] = CHARGES as any[];
    expect(canAskToWaive(open, true)).toBe(true);
    expect(canAskToWaive(open, false)).toBe(false);
    expect(canAskToWaive(paid, true)).toBe(false);
    expect(canAskToWaive(waiting, true)).toBe(false);
    expect(canAskToWaive(moving, true)).toBe(false);
    expect(canMoveCharge(fresh, true)).toBe(true);
    expect(canMoveCharge(fresh, false)).toBe(false);
    expect(canMoveCharge(open, true)).toBe(false);
    expect(canEditCharge(open, true)).toBe(true);
    expect(canEditCharge(open, false)).toBe(false);
    expect(canEditCharge(paid, true)).toBe(false);
    expect(canWithdrawCharge(fresh, true)).toBe(true);
    expect(canWithdrawCharge(fresh, false)).toBe(false);
    expect(canWithdrawCharge(open, true)).toBe(false);
    expect(hasChargeMenu(paid, true, true)).toBe(false);
    expect(hasChargeMenu(waiting, false, true)).toBe(true); // an admin may still edit its words
    expect(hasChargeMenu(waiting, true, false)).toBe(false);
  });

  it("says what is waiting, and shows a withdrawn charge as withdrawn", () => {
    expect(pendingLabel(CHARGES[4] as any)).toBe("Waiver awaiting approval");
    expect(pendingLabel(CHARGES[6] as any)).toBe("Move awaiting approval");
    expect(pendingLabel(CHARGES[7] as any)).toBe("Waiver of $30.00 awaiting approval");
    expect(pendingLabel(CHARGES[0] as any)).toBeNull();
    expect(chargeStatusOf({ status: "canceled", withdrawn_at: "2026-11-18T10:00:00Z" } as any)).toBe("withdrawn");
    expect(chargeStatusOf({ status: "canceled" } as any)).toBe("canceled");
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

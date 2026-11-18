/**
 * Waivers of owner charges through the routes (docs/spec-money-approvals.md,
 * the `waive` rows):
 *
 *   POST /api/org/money/charges/[id]/waive         opens a waive approval (money:enter)
 *   POST /api/org/money/approvals/[id]/decide      approve or reject it; met, the charge is canceled
 *   GET  /api/org/money/approvals                  the charge as the subject (money:read)
 *
 * The board of ORG: Ann (Treasurer), Pat (President), Sam (Secretary), Dee
 * (Director). Ada is an admin with no seat; Max a property manager with the
 * projects grant. Bob owns the household the charges are to.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";
import { ROLE, stubMoney, type MoneyCapture } from "./__fixtures__/money-env";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const U = { pat: uuid(301), sam: uuid(302), dee: uuid(303) };
const M = { pat: uuid(311), sam: uuid(312), dee: uuid(313) };
const WHO = {
  admin: PERSONAS.admin,
  ann: { ...PERSONAS.board, office: "treasurer" } as Who,
  pat: { userId: U.pat, memberId: M.pat, office: "president" } as Who,
  sam: { userId: U.sam, memberId: M.sam, office: "secretary" } as Who,
  dee: { userId: U.dee, memberId: M.dee, office: "director" } as Who,
  bob: PERSONAS.owner,
  max: PERSONAS.manager,
  editor: PERSONAS.editor,
  nobody: PERSONAS.nobody,
};

const C = {
  open: uuid(801),
  paid: uuid(802),
  canceled: uuid(803),
  partly: uuid(804),
  other: uuid(805),
};

function db(): Db {
  const base = seed();
  return {
    ...base,
    hoa_members: [
      ...base.hoa_members!.map((m) => (m.id === ID.memberAdmin ? { ...m, role: ROLE.admin } : m)),
      { id: M.pat, organization: ORG, user: U.pat, first_name: "Pat", last_name: "Park", status: "active" },
      { id: M.sam, organization: ORG, user: U.sam, first_name: "Sam", last_name: "Lee", status: "active" },
      { id: M.dee, organization: ORG, user: U.dee, first_name: "Dee", last_name: "Diaz", status: "active" },
      { id: PERSONAS.manager.memberId, organization: ORG, user: PERSONAS.manager.userId, first_name: "Max", last_name: "Manager", status: "active", role: ROLE.pm, manager_permissions: { projects: true } },
    ],
    hoa_board_members: [
      ...base.hoa_board_members!,
      { id: uuid(321), hoa_member: M.pat, title: "president", status: "published", term_start: "2026-01-01", term_end: null },
      { id: uuid(322), hoa_member: M.sam, title: "secretary", status: "published", term_start: "2026-01-01", term_end: null },
      { id: uuid(323), hoa_member: M.dee, title: "director", status: "published", term_start: "2026-01-01", term_end: null },
    ],
    payment_requests: [
      { id: C.open, organization: ORG, member: ID.memberBob, title: "March dues", request_type: "monthly_dues", status: "overdue", amount: 300, amount_paid: 0, amount_remaining: 300, waiver: null },
      { id: C.paid, organization: ORG, member: ID.memberBob, title: "February dues", request_type: "monthly_dues", status: "paid", amount: 300, amount_paid: 300, amount_remaining: 0, waiver: null },
      { id: C.canceled, organization: ORG, member: ID.memberBob, title: "January dues", request_type: "monthly_dues", status: "canceled", amount: 300, amount_paid: 0, amount_remaining: 300, waiver: null },
      { id: C.partly, organization: ORG, member: ID.memberBob, title: "Roof assessment", request_type: "assessment", status: "partially_paid", amount: 300, amount_paid: 100, amount_remaining: 200, waiver: null },
      { id: C.other, organization: OTHER, member: ID.memberOther, title: "Theirs", request_type: "other", status: "active", amount: 10, amount_remaining: 10, waiver: null },
    ],
    payment_expenses: [],
    money_approvals: [],
    money_approval_decisions: [],
  };
}

const state: { who: Who; db: Db } = { who: WHO.admin, db: db() };
let fake: ReturnType<typeof stubGlobals>;
let cap: MoneyCapture;
const h: Record<string, (e: any) => Promise<any>> = {};

const ROUTES = {
  waive: "#core/server/api/org/money/charges/[id]/waive.post",
  approvals: "#core/server/api/org/money/approvals/index.get",
  decide: "#core/server/api/org/money/approvals/[id]/decide.post",
};

const as = (who: Who) => (state.who = who);
const charge = (id: string) => state.db.payment_requests!.find((c) => c.id === id)!;
const approvalOf = (id: string) => state.db.money_approvals!.find((a) => a.id === id);
const writes = () => fake.calls.filter((c) => !c.op.startsWith("read"));

const waive = (id = C.open, reason: unknown = "Storm damage to the unit") => h.waive!(ev({ params: { id }, body: { orgId: ORG, reason } }));
const decide = (approvalId: string, decision: "approve" | "reject", extra: Record<string, unknown> = {}) =>
  h.decide!(ev({ params: { id: approvalId }, body: { orgId: ORG, decision, ...extra } }));

beforeAll(async () => {
  fake = stubGlobals(state);
  cap = await stubMoney(state);
  for (const [k, path] of Object.entries(ROUTES)) h[k] = (await import(/* @vite-ignore */ path)).default;
});

beforeEach(() => {
  state.db = db();
  as(WHO.admin);
  fake.reset();
  cap.notices.length = 0;
  cap.ledger.length = 0;
});

describe("asking to waive: the gate and the community", () => {
  it("401 signed out", async () => {
    as(WHO.nobody);
    await expect(waive()).rejects.toMatchObject({ statusCode: 401 });
  });

  it("403 for an owner with no seat and a manager without the projects grant", async () => {
    for (const who of [WHO.bob, WHO.editor]) {
      as(who);
      await expect(waive()).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(writes()).toHaveLength(0);
  });

  it("lets every board seat, an admin and a manager with the projects grant ask", async () => {
    for (const who of [WHO.dee, WHO.admin, WHO.max]) {
      state.db = db();
      as(who);
      const res = await waive();
      expect(approvalOf(res.approval.id)).toMatchObject({ kind: "waive", charge: C.open, requested_by: who.userId });
    }
  });

  it("keeps to the community: another community's charge is 404, and another community's admin is 403", async () => {
    as(WHO.ann);
    await expect(waive(C.other)).rejects.toMatchObject({ statusCode: 404 });
    as(WHO.admin);
    await expect(h.waive!(ev({ params: { id: C.other }, body: { orgId: OTHER, reason: "x" } }))).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toHaveLength(0);
  });

  it("needs a reason", async () => {
    as(WHO.ann);
    await expect(waive(C.open, "  ")).rejects.toMatchObject({ statusCode: 400 });
    await expect(h.waive!(ev({ params: { id: C.open }, body: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 400 });
    expect(writes()).toHaveLength(0);
  });

  it("refuses a charge already paid or canceled, or one with a waiver open", async () => {
    as(WHO.ann);
    await expect(waive(C.paid)).rejects.toMatchObject({ statusCode: 409 });
    await expect(waive(C.canceled)).rejects.toMatchObject({ statusCode: 409 });
    await waive();
    as(WHO.dee);
    await expect(waive()).rejects.toMatchObject({ statusCode: 409 });
    expect(state.db.money_approvals).toHaveLength(1);
  });
});

describe("a waiver opens", () => {
  it("as a committee approval its requester cannot decide, linked to the charge, which is unchanged; the approvers are told", async () => {
    as(WHO.dee);
    const res = await waive();
    const a = approvalOf(res.approval.id)!;
    expect(a).toMatchObject({ kind: "waive", charge: C.open, round: 1, state: "pending", mode: "committee", needed: 2, requested_by: U.dee, excluded: [U.dee], reason: "Storm damage to the unit" });
    expect(charge(C.open)).toMatchObject({ waiver: a.id, status: "overdue" });
    const notice = cap.notices.find((n) => n.collection === "money_approvals")!;
    expect(notice).toMatchObject({ essential: true, subject: "Waiving a charge needs your approval", message: "Waiving a $300.00 charge to Bob Diaz for March dues needs your approval." });
    expect(notice.recipientUserIds.sort()).toEqual([WHO.ann.userId, U.pat, U.sam].sort());
  });

  it("shows on the Approvals page with its charge, and canDecide only for those it waits on", async () => {
    as(WHO.ann);
    await waive();
    as(WHO.pat);
    const { approvals } = await h.approvals!(ev({ query: { orgId: ORG } }));
    expect(approvals[0]).toMatchObject({
      kind: "waive",
      canDecide: true,
      subject: { type: "charge", id: C.open, title: "March dues", amount: 300, amount_remaining: 300, status: "overdue", household: "Bob Diaz" },
    });
    as(WHO.ann);
    expect((await h.approvals!(ev({ query: { orgId: ORG } }))).approvals[0].canDecide).toBe(false);
    as(WHO.bob);
    await expect(h.approvals!(ev({ query: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("deciding a waiver", () => {
  it("never lets the requester or a seatless admin decide, whatever the client says", async () => {
    as(WHO.ann);
    const { approval } = await waive();
    await expect(decide(approval.id, "approve", { canDecide: true })).rejects.toMatchObject({ statusCode: 403 });
    as(WHO.admin);
    await expect(decide(approval.id, "approve", { canDecide: true })).rejects.toMatchObject({ statusCode: 403 });
    expect(state.db.money_approval_decisions).toHaveLength(0);
    expect(charge(C.open).status).toBe("overdue");
  });

  it("cancels the charge when the rule is met, and writes charge_waived for the board", async () => {
    as(WHO.ann);
    const { approval } = await waive();
    as(WHO.pat);
    expect(await decide(approval.id, "approve")).toMatchObject({ state: "pending", approvals: 1, needed: 2 });
    expect(charge(C.open).status).toBe("overdue");
    as(WHO.sam);
    expect(await decide(approval.id, "approve")).toMatchObject({ state: "approved" });

    expect(charge(C.open)).toMatchObject({ status: "canceled", waiver: approval.id });
    expect(approvalOf(approval.id)).toMatchObject({ state: "approved" });
    expect(cap.ledger.filter((e) => e.event_type === "money_decision").map((e) => [e.visibility, e.summary])).toEqual([
      ["board", "Pat Park (President) approved waiving a $300.00 charge to Bob Diaz for March dues."],
      ["board", "Sam Lee (Secretary) approved waiving a $300.00 charge to Bob Diaz for March dues."],
    ]);
    expect(cap.ledger.at(-1)).toMatchObject({
      event_type: "charge_waived",
      visibility: "board",
      summary: "A $300.00 charge to Bob Diaz for March dues was waived, approved by Pat Park (President) and Sam Lee (Secretary): Storm damage to the unit.",
      payload: { charge_id: C.open, member_id: ID.memberBob, member_name: "Bob Diaz", amount: 300, reason: "Storm damage to the unit" },
    });
    expect(cap.notices.find((n) => n.subject === "Waiver approved")).toMatchObject({ recipientUserIds: [WHO.ann.userId] });
  });

  it("says what was given up when part was paid", async () => {
    as(WHO.ann);
    const { approval } = await waive(C.partly, "Settled the rest");
    as(WHO.pat);
    await decide(approval.id, "approve");
    as(WHO.sam);
    await decide(approval.id, "approve");
    expect(charge(C.partly).status).toBe("canceled");
    expect(cap.ledger.at(-1)).toMatchObject({
      event_type: "charge_waived",
      summary: "The remaining $200.00 of a $300.00 charge to Bob Diaz for Roof assessment was waived, approved by Pat Park (President) and Sam Lee (Secretary): Settled the rest.",
      payload: { amount: 200, charge_amount: 300 },
    });
  });

  it("leaves the charge as it was when rejected, and a new waiver can be asked", async () => {
    as(WHO.ann);
    const { approval } = await waive();
    as(WHO.pat);
    // Ann asked: Pat and Sam are the committee, so one rejection settles it.
    expect(await decide(approval.id, "reject", { note: "They can pay" })).toMatchObject({ state: "rejected" });
    expect(charge(C.open)).toMatchObject({ status: "overdue", waiver: approval.id });
    expect(cap.ledger.some((e) => e.event_type === "charge_waived")).toBe(false);
    expect(cap.notices.find((n) => n.subject === "Waiver rejected")).toMatchObject({ recipientUserIds: [WHO.ann.userId] });
    as(WHO.dee);
    const again = await waive();
    expect(charge(C.open).waiver).toBe(again.approval.id);
  });

  it("closes a waiver whose charge was paid meanwhile, deciding nothing", async () => {
    as(WHO.ann);
    const { approval } = await waive();
    charge(C.open).status = "paid";
    as(WHO.pat);
    await expect(decide(approval.id, "approve")).rejects.toMatchObject({ statusCode: 409 });
    expect(approvalOf(approval.id)!.state).toBe("superseded");
    expect(state.db.money_approval_decisions).toHaveLength(0);
    expect(charge(C.open).status).toBe("paid");
  });

  it("is settled by a board change like any approval (resettleCommunity)", async () => {
    as(WHO.ann);
    const { approval } = await waive();
    as(WHO.pat);
    await decide(approval.id, "approve");
    // Sam and Dee leave: Ann and Pat remain, and with Ann excluded, Pat's approval is the majority.
    for (const m of [M.sam, M.dee]) state.db.hoa_board_members!.find((b) => b.hoa_member === m)!.term_end = "2020-01-01";
    const res = await (globalThis as any).resettleCommunity(ORG, { userId: WHO.admin.userId, name: "Ada Min", email: null });
    expect(res).toMatchObject({ settled: 1 });
    expect(charge(C.open).status).toBe("canceled");
    expect(cap.ledger.at(-1)).toMatchObject({ event_type: "charge_waived", actor_name: "Ada Min" });
  });
});

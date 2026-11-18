/**
 * Correcting an owner charge through the routes
 * (docs/spec-charge-corrections.md):
 *
 *   PATCH /api/org/money/charges/[id]              title, words, amount up, due date (admins)
 *   POST  /api/org/money/charges/[id]/withdraw     a fresh mistake, within 24 hours (admins)
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
  nobody: PERSONAS.nobody,
};

const C = {
  open: uuid(801),
  paid: uuid(802),
  overdue: uuid(803),
  fresh: uuid(804),
  other: uuid(805),
  fee: uuid(806),
};
const FUTURE = "2099-06-01";
const PAST = "2000-01-01";
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

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
      { id: C.open, organization: ORG, member: ID.memberBob, title: "March dues", request_type: "monthly_dues", source: "schedule", status: "active", amount: "300.00", amount_paid: "0.00", amount_remaining: "300.00", due_date: FUTURE, date_created: hoursAgo(72), waiver: null },
      { id: C.paid, organization: ORG, member: ID.memberBob, title: "February dues", request_type: "monthly_dues", status: "paid", amount: "300.00", amount_paid: "300.00", amount_remaining: "0.00", due_date: PAST, waiver: null },
      { id: C.overdue, organization: ORG, member: ID.memberBob, title: "Roof assessment", request_type: "assessment", status: "overdue", amount: "500.00", amount_paid: "100.00", amount_remaining: "400.00", due_date: PAST, waiver: null },
      { id: C.fresh, organization: ORG, member: ID.memberBob, title: "Gate fob", request_type: "other", source: null, status: "active", amount: "40.00", amount_paid: "0.00", amount_remaining: "40.00", due_date: FUTURE, date_created: hoursAgo(2), reminder_sent: false, metadata: null, waiver: null },
      { id: C.other, organization: OTHER, member: ID.memberOther, title: "Theirs", request_type: "other", status: "active", amount: "10.00", amount_remaining: "10.00", due_date: FUTURE, waiver: null },
      { id: C.fee, organization: ORG, member: ID.memberBob, title: "Late fee", request_type: "late_fee", source: "late_fee", source_id: C.overdue, status: "active", amount: "25.00", amount_paid: "0.00", amount_remaining: "25.00", due_date: PAST, waiver: null },
    ],
    payment_transactions: [],
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
  patch: "#core/server/api/org/money/charges/[id].patch",
  withdraw: "#core/server/api/org/money/charges/[id]/withdraw.post",
};

const as = (who: Who) => (state.who = who);
const charge = (id: string) => state.db.payment_requests!.find((c) => c.id === id)!;
const writes = () => fake.calls.filter((c) => !c.op.startsWith("read"));
const openApproval = (chargeId: string, kind = "waive") =>
  state.db.money_approvals!.push({ id: uuid(901), organization: ORG, kind, charge: chargeId, round: 1, state: "pending", requested_by: U.dee, excluded: [U.dee] });

const withdraw = (id: string, reason: unknown = "Wrong month") => h.withdraw!(ev({ params: { id }, body: { orgId: ORG, reason } }));
const patch = (id: string, body: Record<string, unknown>) => h.patch!(ev({ params: { id }, body: { orgId: ORG, ...body } }));

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

describe("PATCH: who may correct", () => {
  it("401 signed out; 403 for a board seat, a manager with Projects and an owner", async () => {
    as(WHO.nobody);
    await expect(patch(C.open, { title: "x" })).rejects.toMatchObject({ statusCode: 401 });
    for (const who of [WHO.pat, WHO.ann, WHO.max, WHO.bob]) {
      as(who);
      await expect(patch(C.open, { title: "x" })).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(writes()).toHaveLength(0);
  });

  it("another community's charge is 404", async () => {
    await expect(patch(C.other, { title: "Mine now" })).rejects.toMatchObject({ statusCode: 404 });
    expect(writes()).toHaveLength(0);
  });

  it("a paid charge is 409", async () => {
    await expect(patch(C.paid, { title: "x" })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("PATCH: the words", () => {
  it("saves the title, description and notes; the board's Ledger says so; the owner is not told", async () => {
    const res = await patch(C.open, { title: "March dues 2027", description: "Quarterly", notes: "Typo fixed" });
    expect(res.changes.map((c: any) => c.field)).toEqual(["title", "description", "notes"]);
    expect(charge(C.open)).toMatchObject({ title: "March dues 2027", description: "Quarterly", notes: "Typo fixed", amount: "300.00" });
    expect(cap.ledger).toHaveLength(1);
    expect(cap.ledger[0]).toMatchObject({
      event_type: "charge_corrected",
      visibility: "board",
      summary: "Ada Min changed a $300.00 charge to Bob Diaz for March dues: edited the title, description and notes.",
    });
    expect(cap.ledger[0].payload.changes[0]).toEqual({ field: "title", from: "March dues", to: "March dues 2027" });
    expect(cap.notices).toHaveLength(0);
  });

  it("writes nothing when nothing differs", async () => {
    const res = await patch(C.open, { title: "March dues", amount: 300, due_date: FUTURE });
    expect(res.changes).toEqual([]);
    expect(writes()).toHaveLength(0);
    expect(cap.ledger).toHaveLength(0);
  });

  it("the words stay free while a waiver awaits approval", async () => {
    openApproval(C.open);
    await patch(C.open, { notes: "Asked to waive" });
    expect(charge(C.open).notes).toBe("Asked to waive");
  });
});

describe("PATCH: the amount", () => {
  it("raises it, and what is owed by the same difference; the owner is told", async () => {
    await patch(C.overdue, { amount: 550 });
    expect(charge(C.overdue)).toMatchObject({ amount: 550, amount_remaining: 450, status: "overdue" });
    expect(cap.ledger[0].summary).toBe("Ada Min changed a $500.00 charge to Bob Diaz for Roof assessment: amount $500.00 → $550.00.");
    expect(cap.notices).toHaveLength(1);
    expect(cap.notices[0]).toMatchObject({ recipientUserIds: [ID.userBob], category: "payment", path: "/payments" });
    expect(cap.notices[0].message).toBe("Your charge for Roof assessment is now $550.00 (was $500.00).");
    expect(cap.notices[0].essential).toBeUndefined();
  });

  it("refuses to lower it: that is a waiver (422)", async () => {
    await expect(patch(C.open, { amount: 250 })).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/Ask to Waive part/) });
    expect(writes()).toHaveLength(0);
  });

  it("is locked while a waiver or a move awaits approval (409)", async () => {
    for (const kind of ["waive", "move"]) {
      state.db = db();
      openApproval(C.open, kind);
      await expect(patch(C.open, { amount: 400 })).rejects.toMatchObject({ statusCode: 409 });
    }
  });
});

describe("PATCH: the due date", () => {
  it("moves it before it is due; the owner is told", async () => {
    await patch(C.open, { due_date: "2099-06-15" });
    expect(charge(C.open).due_date).toBe("2099-06-15");
    expect(cap.ledger[0].summary).toBe("Ada Min changed a $300.00 charge to Bob Diaz for March dues: due date Jun 1, 2099 → Jun 15, 2099.");
    expect(cap.notices[0].message).toBe("Your charge for March dues is now due Jun 15, 2099 (was Jun 1, 2099).");
  });

  it("tells the owner of both changes in one notice", async () => {
    await patch(C.open, { amount: 320, due_date: "2099-07-01" });
    expect(cap.notices).toHaveLength(1);
    expect(cap.notices[0].message).toBe("Your charge for March dues is now $320.00 (was $300.00) and is now due Jul 1, 2099 (was Jun 1, 2099).");
  });

  it("never to a past date, and never once overdue or charged late (422)", async () => {
    await expect(patch(C.open, { due_date: PAST })).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/past/) });
    await expect(patch(C.overdue, { due_date: FUTURE })).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/overdue/) });
    state.db.payment_requests!.push({ id: uuid(807), organization: ORG, member: ID.memberBob, request_type: "late_fee", source_id: C.open, status: "active", amount: "5.00", amount_remaining: "5.00" });
    await expect(patch(C.open, { due_date: "2099-07-01" })).rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/late fee/) });
    expect(writes()).toHaveLength(0);
  });
});

describe("withdraw", () => {
  it("403 for anyone but an admin, a board seat and a manager included", async () => {
    for (const who of [WHO.pat, WHO.max, WHO.bob]) {
      as(who);
      await expect(withdraw(C.fresh)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(writes()).toHaveLength(0);
  });

  it("needs a reason (400), and another community's charge is 404", async () => {
    await expect(withdraw(C.fresh, " ")).rejects.toMatchObject({ statusCode: 400 });
    await expect(withdraw(C.other)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("cancels a fresh mistake and keeps it on record; the board's Ledger and the owner hear of it", async () => {
    const res = await withdraw(C.fresh);
    expect(res.charge.status).toBe("canceled");
    expect(charge(C.fresh)).toMatchObject({ status: "canceled", withdrawn_by: ID.userAdmin, withdrawn_reason: "Wrong month", amount: "40.00" });
    expect(charge(C.fresh).withdrawn_at).toBeTruthy();
    expect(fake.calls.some((c) => c.op === "deleteItem")).toBe(false);
    expect(cap.ledger).toHaveLength(1);
    expect(cap.ledger[0]).toMatchObject({
      event_type: "charge_withdrawn",
      visibility: "board",
      summary: "Ada Min withdrew a $40.00 charge to Bob Diaz for Gate fob, entered in error: Wrong month.",
    });
    expect(cap.notices).toHaveLength(1);
    expect(cap.notices[0]).toMatchObject({ recipientUserIds: [ID.userBob], path: "/payments" });
    expect(cap.notices[0].message).toBe("Your $40.00 charge for Gate fob was withdrawn: it was entered in error.");
  });

  it("refuses (409) after 24 hours, for a schedule's charge, once paid, reminded or charged late, or with a waiver open", async () => {
    const cases: Array<[string, (c: any) => void, RegExp]> = [
      ["old", (c) => (c.date_created = hoursAgo(25)), /24 hours/],
      ["schedule", (c) => (c.source = "schedule"), /entered by hand/],
      ["paid", (c) => Object.assign(c, { amount_paid: "10.00", amount_remaining: "30.00", status: "partially_paid" }), /payment/],
      ["reminded", (c) => (c.metadata = { reminders: { due_soon: "2026-11-18T00:00:00Z" } }), /reminder/],
      ["late fee", () => state.db.payment_requests!.push({ id: uuid(808), organization: ORG, member: ID.memberBob, request_type: "late_fee", source_id: C.fresh, status: "active", amount: "5.00", amount_remaining: "5.00" }), /late fee/],
      ["transaction", () => state.db.payment_transactions!.push({ id: uuid(809), payment_request: C.fresh, status: "succeeded", amount: 40 }), /payment/],
      ["waiver", () => openApproval(C.fresh), /awaiting approval/],
    ];
    for (const [name, set, message] of cases) {
      state.db = db();
      set(charge(C.fresh));
      await expect(withdraw(C.fresh), name).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(message) });
      expect(charge(C.fresh).status, name).not.toBe("canceled");
    }
    expect(cap.ledger).toHaveLength(0);
  });
});

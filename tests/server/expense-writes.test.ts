/**
 * Entering and changing an expense, moved off the admin's own Directus token
 * (core/shared/expenses/expense-writes.ts): the HOA Admin rules checked only
 * the row's own `organization`, so through the API an admin could name
 * another community's project, or another community's file as the receipt,
 * which the asset proxy then served to them as theirs.
 *
 *   POST  /api/org/expenses        money:enter: an admin, every board seat, a
 *                                  manager with the projects grant
 *   PATCH /api/org/expenses/[id]   the same (docs/spec-money-approvals.md)
 *
 * The admin persona is an admin of ORG only; OTHER is a community they are
 * not an admin of. `filesOutsideOrg` passes ID.fileOk only (the fixture).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";
import { editPlan, expenseActions, expenseCommunity, voidsAtOnce } from "#core/shared/expenses/expense-writes";
import { stubMoney } from "./__fixtures__/money-env";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const X = {
  projectOther: uuid(801),
  expense: uuid(811),
  expensePaid: uuid(812),
  expenseOther: uuid(813),
  expenseStraddle: uuid(814),
  myUpload: uuid(821),
  myFiled: uuid(822),
  theirUpload: uuid(823),
  managerUpload: uuid(824),
  colleagueReceipt: uuid(825),
};

function db(): Db {
  const base = seed();
  return {
    ...base,
    hoa_projects: [...base.hoa_projects!, { id: X.projectOther, organization: OTHER, title: "Their pool" }],
    directus_files: [
      ...base.directus_files!,
      // Where POST /api/org/expenses/receipt puts a receipt: the caller's, in no folder.
      { id: X.myUpload, uploaded_by: ID.userAdmin, folder: null, type: "application/pdf" },
      { id: X.myFiled, uploaded_by: ID.userAdmin, folder: uuid(830), type: "application/pdf" },
      { id: X.theirUpload, uploaded_by: ID.userBob, folder: null, type: "application/pdf" },
      { id: X.managerUpload, uploaded_by: PERSONAS.manager.userId, folder: null, type: "image/jpeg" },
      { id: X.colleagueReceipt, uploaded_by: uuid(8), folder: null, type: "application/pdf" },
    ],
    payment_expenses: [
      { id: X.expense, organization: ORG, title: "Gutters", amount: 400, status: "draft", project: ID.project, receipt: X.colleagueReceipt },
      { id: X.expensePaid, organization: ORG, title: "Insurance", amount: 9000, status: "paid", paid_date: "2026-10-01", project: null, receipt: null },
      { id: X.expenseOther, organization: OTHER, title: "Theirs", amount: 10, status: "draft", project: X.projectOther, receipt: ID.fileElsewhere },
      // Its own organization says ORG, its project is OTHER's: no one's to edit here.
      { id: X.expenseStraddle, organization: ORG, title: "Odd", amount: 5, status: "draft", project: X.projectOther, receipt: null },
    ],
  };
}

const state: { who: Who; db: Db } = { who: PERSONAS.admin, db: db() };
let fake: ReturnType<typeof stubGlobals>;
let post: (e: any) => Promise<any>;
let patch: (e: any) => Promise<any>;

const as = (who: Who) => (state.who = who);
const writes = () => fake.calls.filter((c) => !c.op.startsWith("read"));
const expenses = () => state.db.payment_expenses!;
const row = (id: string) => expenses().find((e) => e.id === id);

const NEW = { title: "Landscaping — November", vendor: "GreenCo", category: "landscaping", amount: 1250.5, expense_date: "2026-11-14" };
const CREATE = { orgId: ORG, expense: NEW };
const PATCH = { orgId: ORG, patch: { amount: 425 } };
const patchOf = (id: string, body: Record<string, unknown> = PATCH) => ev({ params: { id }, body });

beforeAll(async () => {
  fake = stubGlobals(state);
  // An admin of ORG only; a manager whose projects grant is for ORG only.
  // An admin of ORG only; a manager whose projects grant is for ORG only; a seat's office in ORG.
  await stubMoney(state);
  post = (await import("#core/server/api/org/expenses/index.post")).default;
  patch = (await import("#core/server/api/org/expenses/[id].patch")).default;
});

beforeEach(() => {
  state.db = db();
  as(PERSONAS.admin);
  fake.reset();
});

describe("who may call", () => {
  it("401 signed out; 403 for a resident, a manager without the projects grant, and another community's admin", async () => {
    as(PERSONAS.nobody);
    await expect(post(ev({ body: CREATE }))).rejects.toMatchObject({ statusCode: 401 });
    await expect(patch(patchOf(X.expense))).rejects.toMatchObject({ statusCode: 401 });
    for (const who of [PERSONAS.owner, PERSONAS.editor]) {
      as(who);
      await expect(post(ev({ body: CREATE }))).rejects.toMatchObject({ statusCode: 403 });
      await expect(patch(patchOf(X.expense))).rejects.toMatchObject({ statusCode: 403 });
    }
    as(PERSONAS.admin);
    await expect(post(ev({ body: { ...CREATE, orgId: OTHER } }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(patch(patchOf(X.expenseOther, { ...PATCH, orgId: OTHER }))).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toHaveLength(0);
  });

  it("lets a board seat enter and change an expense (money:enter, docs/spec-money-approvals.md)", async () => {
    as(PERSONAS.board);
    const made = await post(ev({ body: CREATE }));
    expect(row(made.id)).toMatchObject({ organization: ORG, status: "draft", entered_by: PERSONAS.board.userId });
    await patch(patchOf(made.id));
    expect(row(made.id)).toMatchObject({ amount: 425 });
  });

  it("lets a manager with the projects grant enter and change an expense, with their own receipt", async () => {
    as(PERSONAS.manager);
    const made = await post(ev({ body: { ...CREATE, expense: { ...NEW, receipt: X.managerUpload } } }));
    expect(row(made.id)).toMatchObject({ organization: ORG, receipt: X.managerUpload });
    await patch(patchOf(X.expense));
    expect(row(X.expense)).toMatchObject({ amount: 425 });
  });
});

describe("POST /api/org/expenses", () => {
  it("enters an expense in the community as a draft, by whoever entered it, and returns it with its id", async () => {
    const made = await post(ev({ body: CREATE }));
    expect(made).toMatchObject({ id: expect.any(String), amount: 1250.5 });
    expect(row(made.id)).toMatchObject({ ...NEW, organization: ORG, status: "draft", entered_by: ID.userAdmin });
  });

  it("takes a project of the community's, and a receipt of its own or one the admin uploaded and filed nowhere", async () => {
    for (const receipt of [ID.fileOk, X.myUpload]) {
      const made = await post(ev({ body: { ...CREATE, expense: { ...NEW, project: ID.project, receipt } } }));
      expect(row(made.id)).toMatchObject({ project: ID.project, receipt });
    }
  });

  it("refuses another community's project or file, a filed upload, and someone else's loose upload", async () => {
    await expect(post(ev({ body: { ...CREATE, expense: { ...NEW, project: X.projectOther } } }))).rejects.toMatchObject({
      statusCode: 400,
      message: "That project isn't in this community.",
    });
    await expect(post(ev({ body: { ...CREATE, expense: { ...NEW, project: uuid(899) } } }))).rejects.toMatchObject({ statusCode: 400 });
    for (const receipt of [ID.fileElsewhere, X.myFiled, X.theirUpload, X.managerUpload]) {
      await expect(post(ev({ body: { ...CREATE, expense: { ...NEW, receipt } } }))).rejects.toMatchObject({
        statusCode: 403,
        message: "That receipt isn't one of this community's files.",
      });
    }
    expect(writes()).toHaveLength(0);
  });

  it("takes no status, community, field or value of the caller's choosing", async () => {
    for (const expense of [
      { ...NEW, status: "paid" },
      { ...NEW, status: "approved" },
      { ...NEW, paid_date: "2026-11-01" },
      { ...NEW, entered_by: ID.userBob },
      { ...NEW, organization: OTHER },
      { ...NEW, id: uuid(898) },
      { ...NEW, project: { id: X.projectOther } },
      { ...NEW, receipt: { id: ID.fileElsewhere } },
      { ...NEW, receipt: "not-a-file" },
      { ...NEW, amount: -5 },
      { ...NEW, amount: 0 },
      { ...NEW, amount: "1250.50" },
      { ...NEW, category: "bribes" },
      { ...NEW, expense_date: "last Tuesday" },
      { ...NEW, title: "  " },
      { vendor: "GreenCo", amount: 10 },
    ]) {
      await expect(post(ev({ body: { ...CREATE, expense } }))).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(post(ev({ body: { ...CREATE, organization: OTHER } }))).rejects.toMatchObject({ statusCode: 400 });
    expect(writes()).toHaveLength(0);
  });
});

describe("PATCH /api/org/expenses/[id]", () => {
  it("changes a draft, its project and its receipt", async () => {
    const res = await patch(patchOf(X.expense, { ...PATCH, patch: { amount: 425, title: "Gutters (east)", project: null, receipt: X.myUpload } }));
    expect(res).toMatchObject({ id: X.expense, amount: 425 });
    expect(row(X.expense)).toMatchObject({ organization: ORG, amount: 425, title: "Gutters (east)", project: null, receipt: X.myUpload, status: "draft" });
  });

  it("keeps the receipt the expense already has, whoever uploaded it", async () => {
    // The form sends the receipt back on every save; a colleague's upload stays the expense's own.
    await patch(patchOf(X.expense, { ...PATCH, patch: { amount: 430, receipt: X.colleagueReceipt } }));
    expect(row(X.expense)).toMatchObject({ amount: 430, receipt: X.colleagueReceipt });
  });

  it("refuses another community's expense, one that straddles two, and one that doesn't exist", async () => {
    for (const id of [X.expenseOther, X.expenseStraddle, uuid(897)]) {
      await expect(patch(patchOf(id))).rejects.toMatchObject({ statusCode: 404, message: "No such expense in this community." });
    }
    expect(writes()).toHaveLength(0);
  });

  it("refuses another community's project or file, and someone else's loose upload", async () => {
    await expect(patch(patchOf(X.expense, { ...PATCH, patch: { project: X.projectOther } }))).rejects.toMatchObject({ statusCode: 400 });
    for (const receipt of [ID.fileElsewhere, X.myFiled, X.theirUpload]) {
      await expect(patch(patchOf(X.expense, { ...PATCH, patch: { receipt } }))).rejects.toMatchObject({
        statusCode: 403,
        message: "That receipt isn't one of this community's files.",
      });
    }
    expect(writes()).toHaveLength(0);
  });

  it("never takes a status, and changes only the notes and receipt of one already paid", async () => {
    await expect(patch(patchOf(X.expense, { ...PATCH, patch: { status: "paid" } }))).rejects.toMatchObject({ statusCode: 400 });
    expect(row(X.expense)!.status).toBe("draft");
    await patch(patchOf(X.expensePaid, { orgId: ORG, patch: { notes: "Policy #4471" } }));
    expect(row(X.expensePaid)).toMatchObject({ status: "paid", notes: "Policy #4471", paid_date: "2026-10-01" });
    await expect(patch(patchOf(X.expensePaid, { orgId: ORG, patch: { amount: 9100 } }))).rejects.toMatchObject({ statusCode: 400 });
  });

  it("will not move an expense to another community, and needs something to change", async () => {
    for (const p of [{ organization: OTHER }, { id: uuid(896) }, { project: { id: X.projectOther } }, {}]) {
      await expect(patch(patchOf(X.expense, { ...PATCH, patch: p }))).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(writes()).toHaveLength(0);
  });
});

describe("the pure checks", () => {
  it("expenseCommunity: its own community, and its project's when it names one, must agree", () => {
    expect(expenseCommunity({ organization: ORG, project: null })).toBe(ORG);
    expect(expenseCommunity({ organization: { id: ORG }, project: { organization: ORG } })).toBe(ORG);
    expect(expenseCommunity({ organization: ORG, project: { organization: OTHER } })).toBeNull();
    expect(expenseCommunity({ organization: null, project: { organization: ORG } })).toBeNull();
  });

  it("editPlan: amount, vendor and title reshape once decided, amend before; a paid one keeps all but notes and receipt", () => {
    const current = { amount: "400.00", vendor: "Acme", title: "Gutters", notes: null, project: { id: "p1" }, expense_date: "2026-11-01T00:00:00" };
    expect(editPlan("draft", current, { amount: 500 })).toEqual({ changed: ["amount"], refusal: null, newRound: false, amendsRound: false });
    expect(editPlan("submitted", current, { amount: 400, notes: "n" })).toEqual({ changed: ["notes"], refusal: null, newRound: false, amendsRound: false });
    expect(editPlan("submitted", current, { title: "Gutters (east)" })).toMatchObject({ newRound: false, amendsRound: true });
    expect(editPlan("submitted", current, { title: "Gutters (east)" }, 1)).toMatchObject({ newRound: true, amendsRound: false });
    for (const k of ["amount", "vendor", "title"]) {
      expect(editPlan("approved", current, { [k]: k === "amount" ? 401 : "Other" }).newRound, k).toBe(true);
    }
    expect(editPlan("submitted", current, { project: "p1", expense_date: "2026-11-01" }).changed).toEqual([]);
    expect(editPlan("paid", current, { notes: "n" }).refusal).toBeNull();
    expect(editPlan("paid", current, { amount: 1 }).refusal).toMatch(/void it and enter it again/);
    expect(editPlan("void", current, { notes: "n" }).refusal).toMatch(/voided/);
  });

  it("expenseActions: nothing without money:enter; delete and void-at-once only for the enterer or an admin", () => {
    const seat = { userId: "u-seat", isAdmin: false, canEnter: true };
    const facts = (status: string, over: Record<string, unknown> = {}) => ({ status, enteredBy: "u-dee", decisions: 0, voidPending: false, ...over });
    expect(expenseActions(facts("draft"), { ...seat, canEnter: false })).toEqual([]);
    expect(expenseActions(facts("draft"), seat)).toEqual(["edit", "submit"]);
    expect(expenseActions(facts("draft"), { ...seat, userId: "u-dee" })).toEqual(["edit", "submit", "delete"]);
    expect(expenseActions(facts("submitted"), { ...seat, isAdmin: true })).toEqual(["edit", "pay", "void"]);
    expect(expenseActions(facts("submitted", { decisions: 1 }), seat)).toEqual(["edit", "pay", "ask_void"]);
    expect(expenseActions(facts("approved", { voidPending: true }), seat)).toEqual(["edit", "pay"]);
    expect(expenseActions(facts("paid"), seat)).toEqual(["edit", "ask_void"]);
    expect(expenseActions(facts("void"), seat)).toEqual([]);
    expect(voidsAtOnce("submitted", 0)).toBe(true);
    expect(voidsAtOnce("submitted", 1)).toBe(false);
    expect(voidsAtOnce("paid", 0)).toBe(false);
  });
});

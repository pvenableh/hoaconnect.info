/**
 * Entering and changing an expense, moved off the admin's own Directus token
 * (core/shared/expenses/expense-writes.ts): the HOA Admin rules checked only
 * the row's own `organization`, so through the API an admin could name
 * another community's project, or another community's file as the receipt,
 * which the asset proxy then served to them as theirs.
 *
 *   POST  /api/org/expenses   an admin, or a manager with the projects grant
 *   PATCH /api/org/expenses   the same
 *
 * The admin persona is an admin of ORG only; OTHER is a community they are
 * not an admin of. `filesOutsideOrg` passes ID.fileOk only (the fixture).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";
import { expenseCommunity, statusRefusal } from "#core/shared/expenses/expense-writes";

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
      { id: X.expense, organization: ORG, title: "Gutters", amount: 400, status: "approved", project: ID.project, receipt: X.colleagueReceipt },
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
const PATCH = { orgId: ORG, id: X.expense, patch: { amount: 425 } };

beforeAll(async () => {
  fake = stubGlobals(state);
  // An admin of ORG only; a manager whose projects grant is for ORG only.
  vi.stubGlobal("checkAdminAccess", async (_e: unknown, org: string) => ({ isAdmin: !!state.who.admin && org === ORG }));
  vi.stubGlobal("requireAdminOrManagerGrant", async (_e: unknown, org: string, key: string) => {
    if (state.who.admin && org === ORG) return { via: "admin" };
    if (state.who.grants?.[key] && org === ORG) return { via: "manager" };
    throw Object.assign(new Error(`Not authorized for this action (${key})`), { statusCode: 403 });
  });
  vi.stubGlobal("numericMoney", (await import("#core/server/utils/money-access")).numericMoney);
  post = (await import("#core/server/api/org/expenses/index.post")).default;
  patch = (await import("#core/server/api/org/expenses/index.patch")).default;
});

beforeEach(() => {
  state.db = db();
  as(PERSONAS.admin);
  fake.reset();
});

describe("who may call", () => {
  it("401 signed out; 403 for a resident, a board seat, a manager without the projects grant, and another community's admin", async () => {
    as(PERSONAS.nobody);
    await expect(post(ev({ body: CREATE }))).rejects.toMatchObject({ statusCode: 401 });
    await expect(patch(ev({ body: PATCH }))).rejects.toMatchObject({ statusCode: 401 });
    for (const who of [PERSONAS.owner, PERSONAS.board, PERSONAS.editor]) {
      as(who);
      await expect(post(ev({ body: CREATE }))).rejects.toMatchObject({ statusCode: 403 });
      await expect(patch(ev({ body: PATCH }))).rejects.toMatchObject({ statusCode: 403 });
    }
    as(PERSONAS.admin);
    await expect(post(ev({ body: { ...CREATE, orgId: OTHER } }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(patch(ev({ body: { ...PATCH, orgId: OTHER, id: X.expenseOther } }))).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toHaveLength(0);
  });

  it("lets a manager with the projects grant enter and change an expense, with their own receipt", async () => {
    as(PERSONAS.manager);
    const made = await post(ev({ body: { ...CREATE, expense: { ...NEW, receipt: X.managerUpload } } }));
    expect(row(made.id)).toMatchObject({ organization: ORG, receipt: X.managerUpload });
    await patch(ev({ body: PATCH }));
    expect(row(X.expense)).toMatchObject({ amount: 425 });
  });
});

describe("POST /api/org/expenses", () => {
  it("enters an expense in the community, as a draft unless approved, and returns it with its id", async () => {
    const made = await post(ev({ body: CREATE }));
    expect(made).toMatchObject({ id: expect.any(String), amount: 1250.5 });
    expect(row(made.id)).toMatchObject({ ...NEW, organization: ORG, status: "draft" });
    const approved = await post(ev({ body: { ...CREATE, expense: { ...NEW, status: "approved" } } }));
    expect(row(approved.id)).toMatchObject({ status: "approved" });
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

  it("is never paid here, and takes no community, field or value of the caller's choosing", async () => {
    await expect(post(ev({ body: { ...CREATE, expense: { ...NEW, status: "paid" } } }))).rejects.toMatchObject({
      statusCode: 400,
      message: "An expense becomes paid when its payment is recorded, not here.",
    });
    for (const expense of [
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

describe("PATCH /api/org/expenses", () => {
  it("changes an expense, its project and its receipt", async () => {
    const res = await patch(ev({ body: { ...PATCH, patch: { amount: 425, title: "Gutters (east)", project: null, receipt: X.myUpload } } }));
    expect(res).toMatchObject({ id: X.expense, amount: 425 });
    expect(row(X.expense)).toMatchObject({ organization: ORG, amount: 425, title: "Gutters (east)", project: null, receipt: X.myUpload, status: "approved" });
  });

  it("keeps the receipt the expense already has, whoever uploaded it", async () => {
    // The form sends the receipt back on every save; a colleague's upload stays the expense's own.
    await patch(ev({ body: { ...PATCH, patch: { amount: 430, receipt: X.colleagueReceipt } } }));
    expect(row(X.expense)).toMatchObject({ amount: 430, receipt: X.colleagueReceipt });
  });

  it("refuses another community's expense, one that straddles two, and one that doesn't exist", async () => {
    for (const id of [X.expenseOther, X.expenseStraddle, uuid(897)]) {
      await expect(patch(ev({ body: { ...PATCH, id } }))).rejects.toMatchObject({ statusCode: 404, message: "No such expense in this community." });
    }
    expect(writes()).toHaveLength(0);
  });

  it("refuses another community's project or file, and someone else's loose upload", async () => {
    await expect(patch(ev({ body: { ...PATCH, patch: { project: X.projectOther } } }))).rejects.toMatchObject({ statusCode: 400 });
    for (const receipt of [ID.fileElsewhere, X.myFiled, X.theirUpload]) {
      await expect(patch(ev({ body: { ...PATCH, patch: { receipt } } }))).rejects.toMatchObject({
        statusCode: 403,
        message: "That receipt isn't one of this community's files.",
      });
    }
    expect(writes()).toHaveLength(0);
  });

  it("never makes an expense paid, but takes `paid` back on one already paid", async () => {
    await expect(patch(ev({ body: { ...PATCH, patch: { status: "paid" } } }))).rejects.toMatchObject({
      statusCode: 400,
      message: "An expense becomes paid when its payment is recorded, not here.",
    });
    expect(row(X.expense)!.status).toBe("approved");
    await patch(ev({ body: { orgId: ORG, id: X.expensePaid, patch: { status: "paid", notes: "Policy #4471" } } }));
    expect(row(X.expensePaid)).toMatchObject({ status: "paid", notes: "Policy #4471", paid_date: "2026-10-01" });
  });

  it("will not move an expense to another community, and needs something to change", async () => {
    for (const p of [{ organization: OTHER }, { id: uuid(896) }, { project: { id: X.projectOther } }, {}]) {
      await expect(patch(ev({ body: { ...PATCH, patch: p } }))).rejects.toMatchObject({ statusCode: 400 });
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

  it("statusRefusal: `paid` only on a row that is paid already", () => {
    expect(statusRefusal("approved", "paid")).toMatch(/recorded/);
    expect(statusRefusal(null, "paid")).toMatch(/recorded/);
    expect(statusRefusal("paid", "paid")).toBeNull();
    expect(statusRefusal("paid", "draft")).toBeNull();
    expect(statusRefusal("draft", undefined)).toBeNull();
  });
});

/**
 * An expense's receipt through the server (docs/spec-money-approvals.md):
 *
 *   GET  /api/org/expenses/[id]/receipt   streams it to money:read holders
 *                                         (every board seat, admins)
 *   POST /api/org/expenses/[id]/receipt   attaches one to a saved expense
 *                                         (money:enter)
 *
 * Both reach the file by the expense, through the community filter: the
 * caller never names a file.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";
import { ROLE, stubMoney } from "./__fixtures__/money-env";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const F = { receipt: uuid(751), theirs: uuid(752) };
const X = { withReceipt: uuid(761), without: uuid(762), voided: uuid(763), theirs: uuid(764), draft: uuid(765) };
const WHO = {
  admin: PERSONAS.admin,
  ann: PERSONAS.board,
  bob: PERSONAS.owner,
  max: PERSONAS.manager,
  editor: PERSONAS.editor,
  nobody: PERSONAS.nobody,
};

function db(): Db {
  const base = seed();
  return {
    ...base,
    hoa_members: [
      ...base.hoa_members!.map((m) => (m.id === ID.memberAdmin ? { ...m, role: ROLE.admin } : m)),
      { id: PERSONAS.manager.memberId, organization: ORG, user: PERSONAS.manager.userId, first_name: "Max", last_name: "Manager", status: "active", role: ROLE.pm, manager_permissions: { projects: true } },
    ],
    directus_files: [
      ...base.directus_files!,
      { id: F.receipt, folder: null, type: "application/pdf", filename_download: "acme-114.pdf" },
      { id: F.theirs, folder: null, type: "application/pdf", filename_download: "theirs.pdf" },
    ],
    payment_expenses: [
      { id: X.withReceipt, organization: ORG, title: "Pest control", vendor: "Acme", amount: 120, status: "paid", entered_by: ID.userAnn, receipt: F.receipt, project: null },
      { id: X.without, organization: ORG, title: "Paint", vendor: "Hue", amount: 50, status: "approved", entered_by: ID.userAnn, receipt: null, project: null },
      { id: X.voided, organization: ORG, title: "Twice", vendor: "Hue", amount: 50, status: "void", entered_by: ID.userAnn, receipt: null, project: null },
      { id: X.draft, organization: ORG, title: "Draft", vendor: "Hue", amount: 5, status: "draft", entered_by: ID.userAnn, receipt: F.receipt, project: null },
      { id: X.theirs, organization: OTHER, title: "Theirs", vendor: "Them", amount: 10, status: "paid", receipt: F.theirs, project: null },
    ],
    money_approvals: [],
    money_approval_decisions: [],
  };
}

const state: { who: Who; db: Db } = { who: WHO.admin, db: db() };
let fake: ReturnType<typeof stubGlobals>;
const streamed: string[] = [];
let get: (e: any) => Promise<any>;
let post: (e: any) => Promise<any>;

const PDF = Buffer.from("%PDF-1.7\n%%EOF\n");
const as = (who: Who) => (state.who = who);
const expense = (id: string) => state.db.payment_expenses!.find((e) => e.id === id)!;
const open = (id: string, orgId = ORG) => get(ev({ params: { id }, query: { orgId } }));
const attach = (id: string, orgId = ORG) =>
  post({
    ...ev({ params: { id } }),
    __multipart: [
      { name: "orgId", data: Buffer.from(orgId) },
      { name: "file", filename: "bill.pdf", type: "application/pdf", data: PDF },
    ],
  });

beforeAll(async () => {
  fake = stubGlobals(state);
  await stubMoney(state);
  vi.stubGlobal("readMultipartFormData", async (e: any) => e.__multipart);
  vi.stubGlobal("enforceStorageLimit", async () => undefined);
  vi.stubGlobal("streamDirectusFile", async (_e: unknown, file: { id: string }, opts: { transforms?: boolean }) => {
    streamed.push(file.id);
    return { streamed: file.id, transforms: opts?.transforms };
  });
  get = (await import("#core/server/api/org/expenses/[id]/receipt.get")).default;
  post = (await import("#core/server/api/org/expenses/[id]/receipt.post")).default;
});

beforeEach(() => {
  state.db = db();
  as(WHO.admin);
  fake.reset();
  streamed.length = 0;
});

describe("GET: opening a receipt", () => {
  it("streams it, untransformed, to an admin and to a board seat", async () => {
    for (const who of [WHO.admin, WHO.ann]) {
      as(who);
      expect(await open(X.withReceipt)).toEqual({ streamed: F.receipt, transforms: false });
    }
  });

  it("refuses anyone who does not read the books: an owner, and a manager with only the projects grant", async () => {
    for (const who of [WHO.bob, WHO.max]) {
      as(who);
      await expect(open(X.withReceipt)).rejects.toMatchObject({ statusCode: 403 });
    }
    as(WHO.nobody);
    await expect(open(X.withReceipt)).rejects.toMatchObject({ statusCode: 401 });
    expect(streamed).toEqual([]);
  });

  it("keeps to the community: another community's expense is 404, and another community's books 403", async () => {
    await expect(open(X.theirs)).rejects.toMatchObject({ statusCode: 404 });
    await expect(open(X.theirs, OTHER)).rejects.toMatchObject({ statusCode: 403 });
    expect(streamed).toEqual([]);
  });

  it("is 404 for an expense with no receipt", async () => {
    await expect(open(X.without)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("opens a draft's receipt to those who can enter expenses", async () => {
    as(WHO.ann);
    expect(await open(X.draft)).toMatchObject({ streamed: F.receipt });
  });
});

describe("POST: attaching a receipt to a saved expense", () => {
  it("files it in the community's receipts and points the expense at it, for a board seat and a manager with projects", async () => {
    for (const who of [WHO.ann, WHO.max]) {
      state.db = db();
      as(who);
      const res = await attach(X.without);
      expect(res).toMatchObject({ id: expect.any(String), type: "application/pdf" });
      expect(expense(X.without).receipt).toBe(res.id);
      expect(state.db.directus_files!.find((f) => f.id === res.id)).toMatchObject({ folder: `receipts-${ORG}`, uploaded_by: who.userId });
    }
  });

  it("replaces a paid expense's receipt", async () => {
    const res = await attach(X.withReceipt);
    expect(expense(X.withReceipt).receipt).toBe(res.id);
  });

  it("refuses an owner and a manager without the projects grant", async () => {
    for (const who of [WHO.bob, WHO.editor]) {
      as(who);
      await expect(attach(X.without)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(expense(X.without).receipt).toBeNull();
  });

  it("keeps to the community, and leaves a void expense closed", async () => {
    await expect(attach(X.theirs)).rejects.toMatchObject({ statusCode: 404 });
    await expect(attach(X.theirs, OTHER)).rejects.toMatchObject({ statusCode: 403 });
    await expect(attach(X.voided)).rejects.toMatchObject({ statusCode: 409 });
    expect(expense(X.theirs).receipt).toBe(F.theirs);
    expect(expense(X.voided).receipt).toBeNull();
  });
});

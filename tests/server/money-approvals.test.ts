/**
 * Money approvals through the routes (docs/spec-money-approvals.md):
 *
 *   POST   /api/org/expenses                    create a draft, or submit
 *   PATCH  /api/org/expenses/[id]               edit; amount, vendor or title opens a new round
 *   DELETE /api/org/expenses/[id]               drafts only
 *   POST   /api/org/expenses/[id]/submit        opens the spend approval
 *   POST   /api/org/expenses/[id]/pay           record paid; before approval it is flagged
 *   POST   /api/org/expenses/[id]/void          at once, or a void approval
 *   GET    /api/org/expenses                    rows with their approval and the caller's actions
 *   GET    /api/org/money/approvals             open, awaiting-me, all
 *   GET    /api/org/money/approvals/[id]
 *   POST   /api/org/money/approvals/[id]/decide approve or reject
 *
 * The board of ORG: Ann (Treasurer), Pat (President), Sam (Secretary), Dee
 * (Director). Bob's Secretary term ended in 2019. Ada is an admin with no
 * seat; Max a property manager with the projects grant.
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

const X = {
  draft: uuid(901),
  otherExpense: uuid(902),
  otherApproval: uuid(903),
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
    payment_expenses: [
      { id: X.draft, organization: ORG, title: "Gutter repair", vendor: "Acme Roofing", amount: 2400, category: "maintenance", status: "draft", entered_by: U.dee, approval: null, project: null, receipt: null },
      { id: X.otherExpense, organization: OTHER, title: "Theirs", vendor: "Them", amount: 10, status: "submitted", entered_by: uuid(9), approval: X.otherApproval, project: null, receipt: null },
    ],
    money_approvals: [
      { id: X.otherApproval, organization: OTHER, kind: "spend", expense: X.otherExpense, round: 1, state: "pending", requested_by: uuid(9), excluded: [uuid(9)] },
    ],
    money_approval_decisions: [],
    payment_requests: [],
  };
}

const state: { who: Who; db: Db } = { who: WHO.admin, db: db() };
let fake: ReturnType<typeof stubGlobals>;
let cap: MoneyCapture;
const h: Record<string, (e: any) => Promise<any>> = {};

const ROUTES = {
  create: "#core/server/api/org/expenses/index.post",
  list: "#core/server/api/org/expenses/index.get",
  patch: "#core/server/api/org/expenses/[id].patch",
  del: "#core/server/api/org/expenses/[id].delete",
  submit: "#core/server/api/org/expenses/[id]/submit.post",
  pay: "#core/server/api/org/expenses/[id]/pay.post",
  void: "#core/server/api/org/expenses/[id]/void.post",
  approvals: "#core/server/api/org/money/approvals/index.get",
  approval: "#core/server/api/org/money/approvals/[id].get",
  decide: "#core/server/api/org/money/approvals/[id]/decide.post",
};

const as = (who: Who) => (state.who = who);
const expense = (id: string) => state.db.payment_expenses!.find((e) => e.id === id);
const approvalOf = (id: string) => state.db.money_approvals!.find((a) => a.id === id);
const approvalsFor = (expenseId: string) => state.db.money_approvals!.filter((a) => a.expense === expenseId);
const writes = () => fake.calls.filter((c) => !c.op.startsWith("read"));

const submit = (id = X.draft) => h.submit!(ev({ params: { id }, body: { orgId: ORG } }));
const decide = (approvalId: string, decision: "approve" | "reject", extra: Record<string, unknown> = {}) =>
  h.decide!(ev({ params: { id: approvalId }, body: { orgId: ORG, decision, ...extra } }));
const currentApproval = (id = X.draft) => expense(id)!.approval as string;

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

describe("every route's gate", () => {
  it("401 signed out", async () => {
    as(WHO.nobody);
    await expect(h.create!(ev({ body: { orgId: ORG, expense: { title: "X", amount: 1 } } }))).rejects.toMatchObject({ statusCode: 401 });
    await expect(submit()).rejects.toMatchObject({ statusCode: 401 });
    await expect(h.list!(ev({ query: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 401 });
    await expect(h.approvals!(ev({ query: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 401 });
    await expect(decide(X.otherApproval, "approve")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("403 for an owner with no seat and a manager without the projects grant, on every write", async () => {
    for (const who of [WHO.bob, WHO.editor]) {
      as(who);
      await expect(h.create!(ev({ body: { orgId: ORG, expense: { title: "X", amount: 1 } } }))).rejects.toMatchObject({ statusCode: 403 });
      await expect(h.patch!(ev({ params: { id: X.draft }, body: { orgId: ORG, patch: { notes: "x" } } }))).rejects.toMatchObject({ statusCode: 403 });
      await expect(h.del!(ev({ params: { id: X.draft }, query: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 403 });
      await expect(submit()).rejects.toMatchObject({ statusCode: 403 });
      await expect(h.pay!(ev({ params: { id: X.draft }, body: { orgId: ORG, paidDate: "2026-11-17", reference: "1001" } }))).rejects.toMatchObject({ statusCode: 403 });
      await expect(h.void!(ev({ params: { id: X.draft }, body: { orgId: ORG, reason: "Duplicate" } }))).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(writes()).toHaveLength(0);
  });

  it("403 on the reads for anyone without money:read, the manager included", async () => {
    for (const who of [WHO.bob, WHO.max]) {
      as(who);
      await expect(h.list!(ev({ query: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 403 });
      await expect(h.approvals!(ev({ query: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it("lets every board seat and a manager with the projects grant enter", async () => {
    for (const who of [WHO.ann, WHO.dee, WHO.max]) {
      as(who);
      const made = await h.create!(ev({ body: { orgId: ORG, expense: { title: "Paint", vendor: "Hue", amount: 50 } } }));
      expect(expense(made.id)).toMatchObject({ status: "draft", entered_by: who.userId, organization: ORG });
    }
  });

  it("keeps to the community: another community's expense and approval are 404, and another community's admin is 403", async () => {
    as(WHO.ann);
    for (const run of [
      () => h.patch!(ev({ params: { id: X.otherExpense }, body: { orgId: ORG, patch: { notes: "x" } } })),
      () => h.submit!(ev({ params: { id: X.otherExpense }, body: { orgId: ORG } })),
      () => h.pay!(ev({ params: { id: X.otherExpense }, body: { orgId: ORG, paidDate: "2026-11-17", reference: "1" } })),
      () => h.void!(ev({ params: { id: X.otherExpense }, body: { orgId: ORG, reason: "Nope" } })),
      () => h.del!(ev({ params: { id: X.otherExpense }, query: { orgId: ORG } })),
      () => h.approval!(ev({ params: { id: X.otherApproval }, query: { orgId: ORG } })),
      () => decide(X.otherApproval, "approve"),
    ]) {
      await expect(run()).rejects.toMatchObject({ statusCode: 404 });
    }
    as(WHO.admin);
    await expect(h.create!(ev({ body: { orgId: OTHER, expense: { title: "X", amount: 1 } } }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(h.approvals!(ev({ query: { orgId: OTHER } }))).rejects.toMatchObject({ statusCode: 403 });
    expect(writes()).toHaveLength(0);
    const { approvals } = await h.approvals!(ev({ query: { orgId: ORG, view: "all" } }));
    expect(approvals).toHaveLength(0);
  });
});

describe("submitting", () => {
  it("opens a committee approval that the enterer and submitter cannot decide, and tells the approvers", async () => {
    as(WHO.ann);
    await submit();
    const a = approvalOf(currentApproval())!;
    expect(expense(X.draft)!.status).toBe("submitted");
    expect(a).toMatchObject({ kind: "spend", round: 1, state: "pending", mode: "committee", needed: 2, requested_by: WHO.ann.userId });
    expect(a.excluded.sort()).toEqual([U.dee, WHO.ann.userId].sort());
    const notice = cap.notices.find((n) => n.collection === "money_approvals")!;
    expect(notice.essential).toBe(true);
    expect(notice.recipientUserIds.sort()).toEqual([U.pat, U.sam].sort());
    expect(notice.message).toBe("$2,400.00 to Acme Roofing for Gutter repair needs your approval.");
  });

  it("can submit straight from create", async () => {
    as(WHO.dee);
    const made = await h.create!(ev({ body: { orgId: ORG, expense: { title: "Pump", vendor: "AquaCo", amount: 900 }, submit: true } }));
    expect(made.status).toBe("submitted");
    expect(approvalOf(expense(made.id)!.approval)).toMatchObject({ state: "pending", requested_by: U.dee });
  });

  it("refuses to submit what is not a draft or a rejection", async () => {
    await submit();
    await expect(submit()).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("deciding", () => {
  it("never lets the requester, the enterer or an admin with no seat decide, whatever the client says", async () => {
    as(WHO.ann);
    await submit();
    const id = currentApproval();
    for (const who of [WHO.ann, WHO.dee, WHO.admin]) {
      as(who);
      await expect(decide(id, "approve", { canDecide: true })).rejects.toMatchObject({ statusCode: 403 });
    }
    // The director is a seat but not the committee's.
    as(WHO.dee);
    await expect(decide(id, "approve")).rejects.toMatchObject({ statusCode: 403 });
    expect(state.db.money_approval_decisions).toHaveLength(0);
  });

  it("shows canDecide only to the people it waits on", async () => {
    as(WHO.ann);
    await submit();
    const seen: Record<string, boolean> = {};
    for (const [k, who] of Object.entries({ ann: WHO.ann, pat: WHO.pat, sam: WHO.sam, dee: WHO.dee, admin: WHO.admin })) {
      as(who);
      const { approvals } = await h.approvals!(ev({ query: { orgId: ORG } }));
      seen[k] = approvals[0].canDecide;
    }
    expect(seen).toEqual({ ann: false, pat: true, sam: true, dee: false, admin: false });
    as(WHO.pat);
    const mine = await h.approvals!(ev({ query: { orgId: ORG, view: "awaiting-me" } }));
    expect(mine.approvals).toHaveLength(1);
    expect(mine.approvals[0]).toMatchObject({ progress: "0 of 2 approvals", subject: { title: "Gutter repair" } });
    expect(mine.approvals[0].waiting_on.map((p: any) => p.name).sort()).toEqual(["Pat Park", "Sam Lee"]);
  });

  it("approves on two committee approvals: the expense is approved, and each step is in the Ledger", async () => {
    as(WHO.ann);
    await submit();
    const id = currentApproval();
    as(WHO.pat);
    expect(await decide(id, "approve", { note: "Needed before winter" })).toMatchObject({ state: "pending", approvals: 1, needed: 2 });
    expect(cap.notices.at(-1)).toMatchObject({ recipientUserIds: [WHO.ann.userId] });
    await expect(decide(id, "approve")).rejects.toMatchObject({ statusCode: 403 });
    as(WHO.sam);
    expect(await decide(id, "approve")).toMatchObject({ state: "approved" });

    expect(expense(X.draft)!.status).toBe("approved");
    expect(approvalOf(id)).toMatchObject({ state: "approved", decided_at: expect.any(String) });
    const decisions = cap.ledger.filter((e) => e.event_type === "money_decision");
    expect(decisions.map((e) => e.summary)).toEqual([
      "Pat Park (President) approved $2,400.00 to Acme Roofing for Gutter repair.",
      "Sam Lee (Secretary) approved $2,400.00 to Acme Roofing for Gutter repair.",
    ]);
    expect(decisions.every((e) => e.visibility === "board")).toBe(true);
    const approved = cap.ledger.find((e) => e.event_type === "expense_approved")!;
    expect(approved).toMatchObject({
      visibility: "owners",
      summary: "$2,400.00 to Acme Roofing for Gutter repair was approved by Pat Park (President) and Sam Lee (Secretary).",
    });
    // Whoever asked, and everyone who can record it paid: admins, seats, the manager with projects.
    const outcome = cap.notices.find((n) => n.subject === "Spending approved")!;
    expect(outcome.recipientUserIds).toEqual(expect.arrayContaining([WHO.ann.userId, U.pat, U.dee, WHO.admin.userId, WHO.max.userId]));
    await expect(decide(id, "approve")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects once approval can no longer be reached, and a rejected expense can be submitted again", async () => {
    as(WHO.ann);
    await submit();
    const id = currentApproval();
    // Ann asked and Dee entered it, so Pat and Sam are the two eligible officers: one rejection settles it.
    as(WHO.pat);
    expect(await decide(id, "reject")).toMatchObject({ state: "rejected" });
    expect(expense(X.draft)!.status).toBe("rejected");
    as(WHO.sam);
    await expect(decide(id, "approve")).rejects.toMatchObject({ statusCode: 409 });
    as(WHO.dee);
    await submit();
    expect(approvalOf(currentApproval())).toMatchObject({ round: 2, state: "pending" });
  });
});

describe("a new round when the amount changes", () => {
  it("supersedes the approved round, reopens it as submitted, and excludes the editor", async () => {
    as(WHO.ann);
    await submit();
    const first = currentApproval();
    as(WHO.pat);
    await decide(first, "approve");
    as(WHO.sam);
    await decide(first, "approve");
    expect(expense(X.draft)!.status).toBe("approved");

    as(WHO.pat);
    const res = await h.patch!(ev({ params: { id: X.draft }, body: { orgId: ORG, patch: { amount: 2600 } } }));
    expect(res.status).toBe("submitted");
    expect(approvalOf(first)!.state).toBe("approved");
    const second = approvalOf(currentApproval())!;
    expect(second).toMatchObject({ round: 2, requested_by: WHO.ann.userId });
    expect(second.excluded).toEqual(expect.arrayContaining([U.dee, WHO.ann.userId, U.pat]));
    expect(expense(X.draft)!.status).toBe("submitted");
    // Pat reshaped it: with Ann, Pat and Dee excluded, Sam is the only officer left, so it falls to a
    // majority of the four seats (3), and only Sam may vote. The board cannot approve this round.
    expect(second).toMatchObject({ mode: "majority", needed: 3, state: "cannot_approve" });
  });

  it("before anyone decides, changes the open round in place and bars the editor", async () => {
    as(WHO.ann);
    await submit();
    const first = currentApproval();
    as(WHO.sam);
    const res = await h.patch!(ev({ params: { id: X.draft }, body: { orgId: ORG, patch: { title: "Gutter repair (east side)" } } }));
    expect(res.status).toBe("submitted");
    expect(currentApproval()).toBe(first);
    // Ann asked, Dee entered, Sam edited: Pat is the only officer left, so a majority of four (3) can't be reached.
    expect(approvalOf(first)).toMatchObject({ round: 1, state: "cannot_approve", mode: "majority", needed: 3 });
    expect(approvalOf(first)!.excluded).toEqual(expect.arrayContaining([WHO.ann.userId, U.dee, U.sam]));
    as(WHO.sam);
    await expect(decide(first, "approve")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("after a decision, supersedes the open round", async () => {
    as(WHO.ann);
    await submit();
    const first = currentApproval();
    as(WHO.pat);
    await decide(first, "approve");
    as(WHO.sam);
    await h.patch!(ev({ params: { id: X.draft }, body: { orgId: ORG, patch: { vendor: "Better Roofing" } } }));
    expect(approvalOf(first)!.state).toBe("superseded");
    expect(approvalOf(currentApproval())!.round).toBe(2);
  });

  it("lets notes, category and the receipt change without a new round", async () => {
    as(WHO.ann);
    await submit();
    const first = currentApproval();
    await h.patch!(ev({ params: { id: X.draft }, body: { orgId: ORG, patch: { notes: "Invoice 33", category: "other", amount: 2400 } } }));
    expect(currentApproval()).toBe(first);
    expect(expense(X.draft)).toMatchObject({ notes: "Invoice 33", category: "other", status: "submitted" });
  });
});

describe("paying", () => {
  it("before approval: flags it for good, tells every board seat (essential), and keeps the approval open to ratify", async () => {
    as(WHO.ann);
    await submit();
    const id = currentApproval();
    const res = await h.pay!(ev({ params: { id: X.draft }, body: { orgId: ORG, paidDate: "2026-11-16", reference: "Check 1042" } }));
    expect(res).toMatchObject({ paid: true, paidWithoutApproval: true, recorded: true });
    expect(expense(X.draft)).toMatchObject({ status: "paid", paid_without_approval: true, paid_reference: "Check 1042", paid_by: WHO.ann.userId, paid_date: "2026-11-16" });

    const notice = cap.notices.find((n) => n.subject === "Paid before approval")!;
    expect(notice.essential).toBe(true);
    expect(notice.recipientUserIds.sort()).toEqual([WHO.ann.userId, U.pat, U.sam, U.dee].sort());
    const recorded = cap.ledger.find((e) => e.event_type === "expense_recorded")!;
    expect(recorded.summary).toBe("Acme Roofing was paid $2,400.00 for Gutter repair (Maintenance) before it was approved.");
    expect(recorded.payload).toMatchObject({ paid_without_approval: true, paid_reference: "Check 1042", paid_by: "Ann Lee", approved_by: [] });

    expect(approvalOf(id)!.state).toBe("pending");
    as(WHO.pat);
    await decide(id, "approve");
    as(WHO.sam);
    await decide(id, "approve");
    expect(expense(X.draft)).toMatchObject({ status: "paid", paid_without_approval: true });
    expect(cap.ledger.find((e) => e.event_type === "expense_approved")!.summary).toBe(
      "$2,400.00 to Acme Roofing for Gutter repair was approved by Pat Park (President) and Sam Lee (Secretary), after it was paid."
    );
  });

  it("after approval: not flagged, names who approved, and tells nobody it was early", async () => {
    as(WHO.ann);
    await submit();
    const id = currentApproval();
    as(WHO.pat);
    await decide(id, "approve");
    as(WHO.sam);
    await decide(id, "approve");
    as(WHO.max);
    const res = await h.pay!(ev({ params: { id: X.draft }, body: { orgId: ORG, paidDate: "2026-11-17", reference: "ACH 77" } }));
    expect(res.paidWithoutApproval).toBe(false);
    expect(expense(X.draft)!.paid_without_approval).toBe(false);
    expect(cap.notices.some((n) => n.subject === "Paid before approval")).toBe(false);
    const recorded = cap.ledger.find((e) => e.event_type === "expense_recorded")!;
    expect(recorded.summary).toBe("Acme Roofing was paid $2,400.00 for Gutter repair (Maintenance).");
    expect(recorded.payload.approved_by).toEqual(["Pat Park (President)", "Sam Lee (Secretary)"]);
  });

  it("needs a date and a reference, and refuses a draft or a paid expense", async () => {
    await expect(h.pay!(ev({ params: { id: X.draft }, body: { orgId: ORG, paidDate: "2026-11-17", reference: " " } }))).rejects.toMatchObject({ statusCode: 400 });
    await expect(h.pay!(ev({ params: { id: X.draft }, body: { orgId: ORG, paidDate: "2026-11-17", reference: "1" } }))).rejects.toMatchObject({ statusCode: 409 });
    await submit();
    await h.pay!(ev({ params: { id: X.draft }, body: { orgId: ORG, paidDate: "2026-11-17", reference: "1" } }));
    await expect(h.pay!(ev({ params: { id: X.draft }, body: { orgId: ORG, paidDate: "2026-11-17", reference: "2" } }))).rejects.toMatchObject({ statusCode: 409 });
    await expect(h.patch!(ev({ params: { id: X.draft }, body: { orgId: ORG, patch: { amount: 1 } } }))).rejects.toMatchObject({ statusCode: 400 });
    await h.patch!(ev({ params: { id: X.draft }, body: { orgId: ORG, patch: { notes: "Cleared 11/18" } } }));
    expect(expense(X.draft)!.notes).toBe("Cleared 11/18");
  });
});

describe("voiding and deleting", () => {
  it("deletes a draft for its enterer or an admin only", async () => {
    as(WHO.ann);
    await expect(h.del!(ev({ params: { id: X.draft }, query: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 403 });
    as(WHO.dee);
    await h.del!(ev({ params: { id: X.draft }, query: { orgId: ORG } }));
    expect(expense(X.draft)).toBeUndefined();
  });

  it("never deletes past draft", async () => {
    await submit();
    await expect(h.del!(ev({ params: { id: X.draft }, query: { orgId: ORG } }))).rejects.toMatchObject({ statusCode: 403 });
    expect(expense(X.draft)).toBeDefined();
  });

  it("voids an undecided submission at once, for its enterer or an admin, board-only in the Ledger", async () => {
    as(WHO.ann);
    await submit();
    const id = currentApproval();
    await expect(h.void!(ev({ params: { id: X.draft }, body: { orgId: ORG, reason: "Entered twice" } }))).rejects.toMatchObject({ statusCode: 403 });
    as(WHO.dee);
    expect(await h.void!(ev({ params: { id: X.draft }, body: { orgId: ORG, reason: "Entered twice" } }))).toMatchObject({ voided: true });
    expect(expense(X.draft)).toMatchObject({ status: "void", void_reason: "Entered twice" });
    expect(approvalOf(id)!.state).toBe("superseded");
    expect(cap.ledger.at(-1)).toMatchObject({ event_type: "expense_voided", visibility: "board", summary: "$2,400.00 to Acme Roofing for Gutter repair was voided: Entered twice." });
  });

  it("asks for a void approval on a paid expense; approved, it voids it, owner-visible", async () => {
    as(WHO.ann);
    await submit();
    await h.pay!(ev({ params: { id: X.draft }, body: { orgId: ORG, paidDate: "2026-11-16", reference: "Check 1042" } }));
    as(WHO.dee);
    const res = await h.void!(ev({ params: { id: X.draft }, body: { orgId: ORG, reason: "The bank returned the check" } }));
    expect(res).toMatchObject({ voided: false, approval: { state: "pending", needed: 2 } });
    expect(expense(X.draft)!.status).toBe("paid");
    const v = approvalOf(res.approval.id)!;
    expect(v).toMatchObject({ kind: "void", requested_by: U.dee, excluded: [U.dee] });
    await expect(h.void!(ev({ params: { id: X.draft }, body: { orgId: ORG, reason: "Again" } }))).rejects.toMatchObject({ statusCode: 409 });

    as(WHO.ann);
    await decide(v.id, "approve");
    as(WHO.pat);
    expect(await decide(v.id, "approve")).toMatchObject({ state: "approved" });
    expect(expense(X.draft)).toMatchObject({ status: "void", void_reason: "The bank returned the check", paid_without_approval: true });
    expect(approvalsFor(X.draft).find((a) => a.kind === "spend")!.state).toBe("superseded");
    expect(cap.ledger.at(-1)).toMatchObject({
      event_type: "expense_voided",
      visibility: "owners",
      summary: "$2,400.00 to Acme Roofing for Gutter repair was voided: The bank returned the check.",
    });
    expect(cap.ledger.filter((e) => e.event_type === "money_decision").at(-1)!.summary).toBe(
      "Pat Park (President) approved voiding $2,400.00 to Acme Roofing for Gutter repair."
    );
  });
});

describe("GET /api/org/expenses", () => {
  it("adds each row's approval progress and the caller's actions", async () => {
    as(WHO.ann);
    await submit();
    as(WHO.pat);
    await decide(currentApproval(), "approve");
    const { expenses, viewer } = await h.list!(ev({ query: { orgId: ORG } }));
    expect(viewer).toEqual({ canEnter: true });
    expect(expenses[0]).toMatchObject({
      status: "submitted",
      approval_summary: { state: "pending", needed: 2, approvals: 1, progress: "1 of 2 approvals", mode: "committee" },
      actions: ["edit", "pay", "ask_void"],
      entered_by_name: "Dee Diaz",
    });
  });

  it("offers delete of a draft only to its enterer or an admin", async () => {
    const { expenses } = await h.list!(ev({ query: { orgId: ORG } }));
    expect(expenses[0].actions).toEqual(["edit", "submit", "delete"]);
    as(WHO.ann);
    const seat = await h.list!(ev({ query: { orgId: ORG } }));
    expect(seat.expenses[0].actions).toEqual(["edit", "submit"]);
  });
});

describe("when the board changes (resettleCommunity)", () => {
  const endTerm = (memberId: string) => {
    const t = state.db.hoa_board_members!.find((b) => b.hoa_member === memberId)!;
    t.term_end = "2020-01-01";
  };
  const resettle = () => (globalThis as any).resettleCommunity(ORG, { userId: WHO.admin.userId, name: "Ada Min", email: null });

  it("settles an approval the change decided, and reads never do", async () => {
    // The admin entered and submitted it: the committee (Pat, Ann, Sam) decides, and Pat approves.
    const made = await h.create!(ev({ body: { orgId: ORG, expense: { title: "Pump", vendor: "AquaCo", amount: 900 }, submit: true } }));
    const id = expense(made.id)!.approval;
    as(WHO.pat);
    await decide(id, "approve");
    // Ann, Sam and Dee leave: Pat is the board, and one seat's majority is one.
    for (const m of [ID.memberAnn, M.sam, M.dee]) endTerm(m);
    as(WHO.pat);
    const before = await h.approvals!(ev({ query: { orgId: ORG } }));
    expect(before.approvals[0]).toMatchObject({ state: "pending", canDecide: false, waiting_on: [] });
    expect(approvalOf(id)!.state).toBe("pending");

    expect(await resettle()).toMatchObject({ checked: 1, settled: 1 });
    expect(approvalOf(id)!.state).toBe("approved");
    expect(expense(made.id)!.status).toBe("approved");
    expect(cap.ledger.at(-1)).toMatchObject({ event_type: "expense_approved", actor_name: "Ada Min" });
  });

  it("tells the people it now waits on when a seated board can approve what it could not", async () => {
    for (const m of [M.pat, M.sam]) endTerm(m);
    as(WHO.ann);
    await submit();
    const id = currentApproval();
    // Ann asked and Dee entered it: of two seats, nobody may vote.
    expect(approvalOf(id)).toMatchObject({ state: "cannot_approve" });
    for (const m of [M.pat, M.sam]) state.db.hoa_board_members!.find((b) => b.hoa_member === m)!.term_end = null;
    cap.notices.length = 0;

    expect(await resettle()).toMatchObject({ reopened: 1 });
    expect(approvalOf(id)).toMatchObject({ state: "pending", mode: "committee", needed: 2 });
    const notice = cap.notices.find((n) => n.collection === "money_approvals")!;
    expect(notice.recipientUserIds.sort()).toEqual([U.pat, U.sam].sort());
  });

  it("lets the other seat of a two-seat board approve what the first entered", async () => {
    for (const m of [M.pat, M.sam]) endTerm(m);
    // Dee entered it; the admin submits. Seats: Ann and Dee, and Ann may vote.
    await submit();
    const id = currentApproval();
    expect(approvalOf(id)).toMatchObject({ state: "pending", mode: "majority", needed: 1 });
    as(WHO.ann);
    expect(await decide(id, "approve")).toMatchObject({ state: "approved" });
  });
});

/**
 * GET /api/org/expenses?orgId=&limit= — the community's expenses, for admins
 * and every board seat (requireMoneyRead, plan decision 16). The only way the
 * app reads them: members have no Directus access to `payment_expenses`, and
 * the board's oversight must not depend on it.
 *
 * Each row carries its current spend approval as the rule sees it now
 * (state, needed, approvals so far, "1 of 2 approvals"), whether a void is
 * waiting, and `actions`: what the caller may do to it, which the write
 * routes check again (docs/spec-money-approvals.md). `viewer.canEnter` says
 * whether the caller may enter expenses at all.
 *
 * One Directus request (readItemsBatch): the expenses, the community's expense
 * approvals and their decisions, and its memberships, which give the seats,
 * the names and who may read and enter money (moneyAccessFrom). Directus
 * serves requests in turn, so the reads this route used to make one after
 * another (~1.3s) cost one request's time. Nothing is described or returned
 * until money:read passes.
 */
import { normaliseApproval } from "#core/server/utils/money-approvals";
import { namesByUser } from "#core/shared/members/display-name";

const FIELDS = [
  "id", "status", "category", "title", "vendor", "amount",
  "expense_date", "paid_date", "description", "notes",
  "receipt", "organization", "project", "date_created",
  "entered_by", "approval", "paid_by", "paid_reference", "paid_without_approval", "void_reason",
];

export default defineEventHandler(async (event) => {
  const orgId = String(getQuery(event).orgId ?? "");
  if (!orgId) await requireMoneyRead(event); // 401, then 400
  await requireUserSession(event);
  const expenseApprovals = { expense: { _nnull: true } };

  const read = await readItemsBatch({
    expenses: {
      collection: "payment_expenses",
      fields: FIELDS,
      filter: { organization: { _eq: orgId } },
      sort: ["-expense_date", "-date_created"],
      limit: moneyLimit(event, 500),
    },
    approvals: {
      collection: "money_approvals",
      fields: APPROVAL_FIELDS,
      filter: { organization: { _eq: orgId }, ...expenseApprovals },
      sort: ["-date_created"],
      limit: -1,
    },
    decisions: {
      collection: "money_approval_decisions",
      fields: DECISION_FIELDS,
      filter: orgDecisionsFilter(orgId, expenseApprovals),
      sort: ["date_created"],
      limit: -1,
    },
    members: orgMembersSpec(orgId),
  });
  const seats = seatsOfMembers(read.members, orgId);
  const { userId, isAdmin, canEnter } = await requireMoneyReadFrom(event, read.members, seats);

  const rows = read.expenses;
  // A draft is someone's work in progress: only people who can enter expenses see them.
  const visible = canEnter ? rows : rows.filter((r) => r.status !== "draft");
  const extras = await describeExpenses(orgId, visible, { userId, isAdmin, canEnter }, seats, {
    approvals: read.approvals.map(normaliseApproval).filter((a) => a.organization === orgId),
    decisions: decisionsByApproval(read.decisions),
    names: namesByUser(read.members.filter((m) => !!m.user)),
  });
  const expenses = numericMoney(visible, ["amount"]).map((r, i) => ({ ...r, ...extras[i] }));
  return { expenses, viewer: { canEnter } };
});

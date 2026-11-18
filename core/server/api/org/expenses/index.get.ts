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
 */
import { readItems } from "@directus/sdk";

const FIELDS = [
  "id", "status", "category", "title", "vendor", "amount",
  "expense_date", "paid_date", "description", "notes",
  "receipt", "organization", "project", "date_created",
  "entered_by", "approval", "paid_by", "paid_reference", "paid_without_approval", "void_reason",
];

export default defineEventHandler(async (event) => {
  const orgId = await requireMoneyRead(event);
  const session = await getUserSession(event);
  const userId = session?.user?.id ? String(session.user.id) : null;
  const [admin, canEnter] = await Promise.all([checkAdminAccess(event, orgId), canEnterMoney(event, orgId)]);

  const rows = (await getTypedDirectus().request(
    readItems("payment_expenses", {
      fields: FIELDS as any,
      filter: { organization: { _eq: orgId } } as any,
      sort: ["-expense_date", "-date_created"] as any,
      limit: moneyLimit(event, 500),
    })
  )) as any[];
  // A draft is someone's work in progress: only people who can enter expenses see them.
  const visible = canEnter ? rows : rows.filter((r) => r.status !== "draft");
  const extras = await describeExpenses(orgId, visible, { userId, isAdmin: !!admin.isAdmin, canEnter });
  const expenses = numericMoney(visible, ["amount"]).map((r, i) => ({ ...r, ...extras[i] }));
  return { expenses, viewer: { canEnter } };
});

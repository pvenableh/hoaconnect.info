/**
 * DELETE /api/org/expenses/[id]?orgId= — a draft only, by the person who
 * entered it or an admin (docs/spec-money-approvals.md). Nothing past draft
 * is deleted: it is voided, and stays on record.
 */
import { deleteItem } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = String(getRouterParam(event, "id") || "");
  const orgId = String(getQuery(event).orgId || "");
  const viewer = await requireMoneyEnter(event, orgId);
  const row = await loadExpense(orgId, id);
  await requireExpenseAction(orgId, row, viewer, "delete");
  await getTypedDirectus().request(deleteItem("payment_expenses", id));
  return { deleted: true };
});
